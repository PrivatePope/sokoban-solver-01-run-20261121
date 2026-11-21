// Sokoban solver for make.fun sokoban-solver-01-run-20261121.
// One program, Node 22, stdlib only. Reads /input/<id>/level.txt (XSB) and
// writes /output/<id>/solution.txt (LURD moves) for every instance in one run.
//
// Design (written fresh in this session):
// - Levels are a one-wide hallway plus rooms (3-4 boxes each) off it. A box
//   pushed through a door into the hallway can never come back, so every box
//   stays in its room and a level's push-optimal count is the sum of its
//   rooms' optima. The solver decomposes the level into rooms and solves each
//   room independently, then stitches the room solutions together with walks
//   through the hallway.
// - Each room is solved push-optimally with A* over push-states. A state is
//   (sorted box cells, player region): the exact player cell inside a region
//   does not matter for future pushes, so states are canonicalised by region.
//   The heuristic is the optimal assignment (Hungarian, by permutation
//   enumeration) of boxes to goals over precomputed BFS distances - admissible,
//   since one push moves one box one step. Deadlock pruning: exact single-box
//   reverse reachability (dead cells) plus the 2x2 frozen-block check.
// - Everything is budgeted by WORK (node expansions), never by the wall clock,
//   and all iteration orders are fixed, so two runs are byte-identical.
import * as fs from "node:fs";
import * as path from "node:path";

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];
const CH = ["u", "d", "l", "r"];

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// ---------------------------------------------------------------- parsing
type Level = {
  w: number;
  h: number;
  floor: boolean[]; // cell is not a wall
  goals: boolean[];
  boxes: number[];
  player: number;
};

function parseLevel(text: string): Level {
  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const h = lines.length;
  const w = Math.max(...lines.map((l) => l.length));
  const floor: boolean[] = new Array(w * h).fill(false);
  const goals: boolean[] = new Array(w * h).fill(false);
  const boxes: number[] = [];
  let player = -1;
  for (let y = 0; y < h; y++) {
    const row = lines[y];
    for (let x = 0; x < w; x++) {
      const c = x < row.length ? row[x] : "#";
      const i = y * w + x;
      if (c === "#") continue;
      floor[i] = true;
      if (c === "." || c === "*" || c === "+") goals[i] = true;
      if (c === "$" || c === "*") boxes.push(i);
      if (c === "@" || c === "+") player = i;
    }
  }
  boxes.sort((a, b) => a - b);
  return { w, h, floor, goals, boxes, player };
}

// ---------------------------------------------------------------- helpers
function cellKey(cells: number[]): string {
  return cells.join(",");
}

// Flood fill from `start` over cells where `open[i]` is true. Returns a
// boolean array of the reachable region.
function flood(start: number, open: boolean[], w: number, h: number): boolean[] {
  const seen: boolean[] = new Array(w * h).fill(false);
  if (!open[start]) return seen;
  const stack = [start];
  seen[start] = true;
  while (stack.length > 0) {
    const c = stack.pop() as number;
    const x = c % w;
    const y = (c / w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (!open[n] || seen[n]) continue;
      seen[n] = true;
      stack.push(n);
    }
  }
  return seen;
}

// Shortest walk (BFS, fixed direction order) from `from` to `to` over cells
// where `open[i]` is true. Returns the move string, or null if unreachable.
function walkPath(from: number, to: number, open: boolean[], w: number, h: number): string | null {
  if (from === to) return "";
  const prev: number[] = new Array(w * h).fill(-1);
  const prevDir: number[] = new Array(w * h).fill(-1);
  const queue = [from];
  prev[from] = from;
  let head = 0;
  while (head < queue.length) {
    const c = queue[head++];
    const x = c % w;
    const y = (c / w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (!open[n] || prev[n] !== -1) continue;
      prev[n] = c;
      prevDir[n] = d;
      if (n === to) {
        const chars: string[] = [];
        let cur = n;
        while (cur !== from) {
          chars.push(CH[prevDir[cur]]);
          cur = prev[cur];
        }
        chars.reverse();
        return chars.join("");
      }
      queue.push(n);
    }
  }
  return null;
}

// ---------------------------------------------------------------- rooms
type Room = {
  cells: number[]; // room floor cells (sorted)
  cellSet: boolean[];
  boxes: number[]; // initial boxes in this room (sorted)
  goals: number[]; // goals in this room (sorted)
  doorCells: number[]; // room cells adjacent to a hallway cell
  entryHall: number; // hallway cell adjacent to the first door cell
};

function decompose(level: Level): { hallway: boolean[]; rooms: Room[] } | null {
  const { w, h, floor, player } = level;
  const hallRow = (player / w) | 0;
  const hallway: boolean[] = new Array(w * h).fill(false);
  for (let x = 0; x < w; x++) {
    const i = hallRow * w + x;
    if (floor[i]) hallway[i] = true;
  }
  // Connected components of floor cells that are not hallway cells.
  const seen: boolean[] = new Array(w * h).fill(false);
  const rooms: Room[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!floor[i] || hallway[i] || seen[i]) continue;
    const comp: number[] = [];
    const stack = [i];
    seen[i] = true;
    while (stack.length > 0) {
      const c = stack.pop() as number;
      comp.push(c);
      const x = c % w;
      const y = (c / w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (!floor[n] || hallway[n] || seen[n]) continue;
        seen[n] = true;
        stack.push(n);
      }
    }
    comp.sort((a, b) => a - b);
    const cellSet: boolean[] = new Array(w * h).fill(false);
    for (const c of comp) cellSet[c] = true;
    const boxes = level.boxes.filter((b) => cellSet[b]);
    const goals = comp.filter((c) => level.goals[c]);
    const doorCells = comp.filter((c) => {
      const x = c % w;
      const y = (c / w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (hallway[ny * w + nx]) return true;
      }
      return false;
    });
    if (doorCells.length === 0 || boxes.length === 0 || boxes.length !== goals.length) {
      return null; // decomposition does not fit: fall back to whole-level solve
    }
    // Entry hallway cell: the hallway cell adjacent to the first door cell.
    let entryHall = -1;
    {
      const dc = doorCells[0];
      const x = dc % w;
      const y = (dc / w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (hallway[ny * w + nx]) {
          entryHall = ny * w + nx;
          break;
        }
      }
    }
    if (entryHall < 0) return null;
    rooms.push({ cells: comp, cellSet, boxes, goals, doorCells, entryHall });
  }
  if (rooms.length === 0) return null;
  return { hallway, rooms };
}

// ---------------------------------------------------------------- heap
type HeapItem = { f: number; h: number; seq: number; node: SearchNode };

class Heap {
  a: HeapItem[] = [];
  get size(): number {
    return this.a.length;
  }
  push(item: HeapItem): void {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (cmp(a[i], a[p]) < 0) {
        const t = a[i];
        a[i] = a[p];
        a[p] = t;
        i = p;
      } else break;
    }
  }
  pop(): HeapItem | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop() as HeapItem;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let m = i;
        if (l < a.length && cmp(a[l], a[m]) < 0) m = l;
        if (r < a.length && cmp(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        const t = a[i];
        a[i] = a[m];
        a[m] = t;
        i = m;
      }
    }
    return top;
  }
}

function cmp(a: HeapItem, b: HeapItem): number {
  if (a.f !== b.f) return a.f - b.f;
  if (a.h !== b.h) return a.h - b.h;
  return a.seq - b.seq;
}

// ---------------------------------------------------------------- room solver
type SearchNode = {
  boxes: number[];
  player: number;
  g: number;
  key: string; // canonical state key: boxes + player-region representative
  parent: SearchNode | null;
  pushBox: number; // box cell before the push that created this node (-1 at root)
  pushDir: number; // direction of that push (-1 at root)
};

type RoomSolve = {
  moves: string;
  pushes: number;
  finalPlayer: number;
  expansions: number;
  weight: number;
};

function solveRoom(
  level: Level,
  room: Room,
  moveFloor: boolean[],
  startPlayer: number,
  weight: number,
  expansionBudget: number
): RoomSolve | null {
  const { w, h } = level;
  const N = w * h;
  const goalsSorted = [...room.goals].sort((a, b) => a - b);
  const goalKey = cellKey(goalsSorted);
  const goalSet: boolean[] = new Array(N).fill(false);
  for (const g of room.goals) goalSet[g] = true;

  // BFS distances from each goal over room cells (boxes travel inside rooms).
  const distFromGoal: number[][] = room.goals.map(() => new Array(N).fill(Infinity));
  room.goals.forEach((g, gi) => {
    const dist = distFromGoal[gi];
    const q = [g];
    dist[g] = 0;
    let head = 0;
    while (head < q.length) {
      const c = q[head++];
      const x = c % w;
      const y = (c / w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (!room.cellSet[n] || dist[n] !== Infinity) continue;
        dist[n] = dist[c] + 1;
        q.push(n);
      }
    }
  });

  // Exact single-box dead cells: reverse reachability over (box, player)
  // pairs. A room cell is dead when no (cell, player) pair can reach a goal.
  const dead: boolean[] = new Array(N).fill(false);
  {
    const visited = new Uint8Array(N * N);
    const queue: number[] = [];
    for (const g of room.goals) {
      for (let p = 0; p < N; p++) {
        if (!moveFloor[p] || p === g) continue;
        const k = g * N + p;
        if (!visited[k]) {
          visited[k] = 1;
          queue.push(k);
        }
      }
    }
    let head = 0;
    while (head < queue.length) {
      const k = queue[head++];
      const b = (k / N) | 0;
      const p = k % N;
      const px = p % w;
      const py = (p / w) | 0;
      // Player walks.
      for (let d = 0; d < 4; d++) {
        const nx = px + DX[d];
        const ny = py + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const np = ny * w + nx;
        if (!moveFloor[np] || np === b) continue;
        const nk = b * N + np;
        if (!visited[nk]) {
          visited[nk] = 1;
          queue.push(nk);
        }
      }
      // Reverse push: pre-state (box=p, player=2p-b) when p is next to b.
      const bx = b % w;
      const by = (b / w) | 0;
      if (Math.abs(px - bx) + Math.abs(py - by) === 1) {
        const nbx = p;
        const npx = 2 * px - bx;
        const npy = 2 * py - by;
        if (npx >= 0 && npy >= 0 && npx < w && npy < h) {
          const np = npy * w + npx;
          if (room.cellSet[nbx] && moveFloor[np]) {
            const nk = nbx * N + np;
            if (!visited[nk]) {
              visited[nk] = 1;
              queue.push(nk);
            }
          }
        }
      }
    }
    for (const c of room.cells) {
      let live = false;
      for (let p = 0; p < N; p++) {
        if (visited[c * N + p]) {
          live = true;
          break;
        }
      }
      if (!live) dead[c] = true;
    }
  }

  // 2x2 blocks fully occupied by walls/boxes (used by the freeze check).
  const blocks: number[][] = [];
  for (let y = 0; y + 1 < h; y++) {
    for (let x = 0; x + 1 < w; x++) {
      const cs = [y * w + x, y * w + x + 1, (y + 1) * w + x, (y + 1) * w + x + 1];
      if (cs.every((c) => !moveFloor[c] || room.cellSet[c])) blocks.push(cs);
    }
  }

  // Heuristic: optimal assignment of boxes to goals (permutation search,
  // at most 4 boxes). Infinity when a box cannot reach any goal.
  function heuristic(boxes: number[]): number {
    const nb = boxes.length;
    if (nb === 0) return 0;
    const perm = room.goals.map((_, i) => i);
    let best = Infinity;
    const rec = (i: number, used: boolean[], sum: number): void => {
      if (sum >= best) return;
      if (i === nb) {
        best = sum;
        return;
      }
      for (let j = 0; j < nb; j++) {
        if (used[j]) continue;
        const d = distFromGoal[j][boxes[i]];
        if (d === Infinity) continue;
        used[j] = true;
        rec(i + 1, used, sum + d);
        used[j] = false;
      }
    };
    rec(0, new Array(nb).fill(false), 0);
    return best;
  }

  function frozen(boxes: number[]): boolean {
    const boxSet = new Set(boxes);
    for (const block of blocks) {
      let hasBox = false;
      let allOccupied = true;
      for (const c of block) {
        if (boxSet.has(c)) hasBox = true;
        else if (moveFloor[c] && !room.cellSet[c]) {
          // hallway cell inside the block: not part of the room, ignore block
          allOccupied = false;
          break;
        } else if (room.cellSet[c]) {
          allOccupied = false;
          break;
        }
        // wall cells count as occupied
      }
      if (!allOccupied || !hasBox) continue;
      // Every box in a fully occupied 2x2 is immovable; if any is not on a
      // goal the state is dead.
      for (const c of block) {
        if (boxSet.has(c) && !goalSet[c]) return true;
      }
    }
    return false;
  }

  function regionRep(boxes: number[], playerCell: number): number {
    const open = moveFloor.slice();
    for (const b of boxes) open[b] = false;
    const reg = flood(playerCell, open, w, h);
    for (let i = 0; i < N; i++) if (reg[i]) return i;
    return -1;
  }

  const startBoxes = [...room.boxes].sort((a, b) => a - b);
  const h0 = heuristic(startBoxes);
  if (h0 === Infinity) return null;

  const heap = new Heap();
  const closed = new Map<string, number>();
  let seq = 0;
  const rootKey = cellKey(startBoxes) + "|" + regionRep(startBoxes, startPlayer);
  const root: SearchNode = { boxes: startBoxes, player: startPlayer, g: 0, key: rootKey, parent: null, pushBox: -1, pushDir: -1 };
  heap.push({ f: h0, h: h0, seq: seq++, node: root });
  closed.set(rootKey, 0);

  let expansions = 0;
  let goalNode: SearchNode | null = null;
  while (heap.size > 0) {
    const item = heap.pop() as HeapItem;
    const node = item.node;
    const bestG = closed.get(node.key);
    if (bestG !== undefined && node.g > bestG) continue;
    expansions++;
    if (expansions > expansionBudget) break;
    if (cellKey(node.boxes) === goalKey) {
      goalNode = node;
      break;
    }
    // Player region for this state.
    const open = moveFloor.slice();
    for (const b of node.boxes) open[b] = false;
    const region = flood(node.player, open, w, h);
    const boxSet = new Set(node.boxes);
    for (let bi = 0; bi < node.boxes.length; bi++) {
      const b = node.boxes[bi];
      const bx = b % w;
      const by = (b / w) | 0;
      for (let d = 0; d < 4; d++) {
        const tx = bx + DX[d];
        const ty = by + DY[d];
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
        const target = ty * w + tx;
        if (!room.cellSet[target] || boxSet.has(target)) continue;
        const sx = bx - DX[d];
        const sy = by - DY[d];
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const stand = sy * w + sx;
        if (!region[stand]) continue;
        const nextBoxes = [...node.boxes];
        nextBoxes[bi] = target;
        nextBoxes.sort((a, b2) => a - b2);
        // Deadlock pruning.
        let bad = false;
        for (const nb of nextBoxes) {
          if (dead[nb] && !goalSet[nb]) {
            bad = true;
            break;
          }
        }
        if (bad) continue;
        if (frozen(nextBoxes)) continue;
        const hh = heuristic(nextBoxes);
        if (hh === Infinity) continue;
        const g2 = node.g + 1;
        const key2 = cellKey(nextBoxes) + "|" + regionRep(nextBoxes, b);
        const prevG = closed.get(key2);
        if (prevG !== undefined && prevG <= g2) continue;
        closed.set(key2, g2);
        const child: SearchNode = { boxes: nextBoxes, player: b, g: g2, key: key2, parent: node, pushBox: b, pushDir: d };
        heap.push({ f: g2 + weight * hh, h: hh, seq: seq++, node: child });
      }
    }
  }
  if (goalNode === null) return null;

  // Reconstruct the move string: walk to each push, then the push step.
  const edges: SearchNode[] = [];
  let cur: SearchNode | null = goalNode;
  while (cur !== null && cur.parent !== null) {
    edges.push(cur);
    cur = cur.parent;
  }
  edges.reverse();
  let moves = "";
  let node: SearchNode = root;
  for (const edge of edges) {
    const open = moveFloor.slice();
    for (const b of node.boxes) open[b] = false;
    const stand = edge.pushBox - DY[edge.pushDir] * w - DX[edge.pushDir];
    const walk = walkPath(node.player, stand, open, w, h);
    if (walk === null) return null; // should not happen
    moves += walk + CH[edge.pushDir];
    node = edge;
  }
  return { moves, pushes: goalNode.g, finalPlayer: goalNode.player, expansions, weight };
}

// Solve one room, trying optimal A* first, then weighted fallbacks.
function solveRoomWithFallbacks(
  level: Level,
  room: Room,
  moveFloor: boolean[],
  startPlayer: number
): RoomSolve | null {
  const attempts: [number, number][] = [
    [1, 1500000],
    [2, 1500000],
    [5, 1000000],
  ];
  for (const [weight, budget] of attempts) {
    const r = solveRoom(level, room, moveFloor, startPlayer, weight, budget);
    if (r !== null) return r;
  }
  return null;
}

// ---------------------------------------------------------------- level solve
function solveLevel(level: Level): { moves: string; perRoom: RoomSolve[] } | null {
  const { w, h } = level;
  const N = w * h;
  const dec = decompose(level);
  if (dec === null) {
    // Fallback: treat the whole level as one room.
    const allCells = level.floor.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
    const room: Room = {
      cells: allCells,
      cellSet: level.floor.slice(),
      boxes: [...level.boxes],
      goals: allCells.filter((c) => level.goals[c]),
      doorCells: [level.player],
      entryHall: level.player,
    };
    const r = solveRoomWithFallbacks(level, room, level.floor.slice(), level.player);
    if (r === null) return null;
    return { moves: r.moves, perRoom: [r] };
  }
  const { hallway, rooms } = dec;

  // Solve each room independently from its entry hallway cell, so we know
  // which rooms trap the player (door cell blocked by a box at the end) and
  // can order trapping rooms last.
  type RoomPlan = { room: Room; solve: RoomSolve; traps: boolean };
  const plans: RoomPlan[] = [];
  for (const room of rooms) {
    const moveFloor: boolean[] = new Array(N).fill(false);
    for (const c of room.cells) moveFloor[c] = true;
    for (let i = 0; i < N; i++) if (hallway[i]) moveFloor[i] = true;
    const solve = solveRoomWithFallbacks(level, room, moveFloor, room.entryHall);
    if (solve === null) return null;
    // Can the player walk out to the hallway afterwards?
    const open = moveFloor.slice();
    for (const b of room.goals) open[b] = false; // solved boxes sit on goals
    const reg = flood(solve.finalPlayer, open, w, h);
    let canExit = false;
    for (let i = 0; i < N; i++) {
      if (hallway[i] && reg[i]) {
        canExit = true;
        break;
      }
    }
    plans.push({ room, solve, traps: !canExit });
  }
  // Non-trapping rooms first, then trapping ones; stable order by first cell.
  plans.sort((a, b) => {
    if (a.traps !== b.traps) return a.traps ? 1 : -1;
    return a.room.cells[0] - b.room.cells[0];
  });

  // Stitch: walk to each room's entry, append its precomputed solution.
  const boxPos = new Map<number, number>(); // cell -> box (current positions)
  for (const b of level.boxes) boxPos.set(b, b);
  let player = level.player;
  let moves = "";
  const perRoom: RoomSolve[] = [];
  for (const plan of plans) {
    const { room, solve } = plan;
    const open = level.floor.slice();
    for (const b of boxPos.keys()) open[b] = false;
    const walk = walkPath(player, room.entryHall, open, w, h);
    if (walk === null) return null;
    moves += walk;
    moves += solve.moves;
    player = solve.finalPlayer;
    // Update box positions: this room's boxes are now on its goals.
    for (const b of room.boxes) boxPos.delete(b);
    for (const g of room.goals) boxPos.set(g, g);
    perRoom.push(solve);
  }
  return { moves, perRoom };
}

// ---------------------------------------------------------------- main
function main(): void {
  const ids = fs
    .readdirSync(INPUT_DIR)
    .filter((name) => {
      try {
        return fs.statSync(path.join(INPUT_DIR, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
  for (const id of ids) {
    const levelText = fs.readFileSync(path.join(INPUT_DIR, id, "level.txt"), "utf8");
    const level = parseLevel(levelText);
    const solved = solveLevel(level);
    const outDir = path.join(OUTPUT_DIR, id);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "solution.txt"), solved === null ? "" : solved.moves, "utf8");
    if (solved === null) {
      process.stderr.write(id + ": no solution found\n");
    } else {
      process.stderr.write(
        id +
          ": solved in " +
          solved.perRoom.reduce((s, r) => s + r.pushes, 0) +
          " pushes (" +
          solved.perRoom.map((r) => "w" + r.weight + ":" + r.expansions).join(",") +
          " expansions)\n"
      );
    }
  }
}

main();

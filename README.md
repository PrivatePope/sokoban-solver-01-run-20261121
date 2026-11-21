# sokoban-solver-01-run-20261121

[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/PrivatePope/sokoban-solver-01-run-20261121/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/PrivatePope/sokoban-solver-01-run-20261121/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)

**Push-optimal Sokoban solver** — built for the [Build the best Sokoban solver bounty](https://make.fun/bounty/sokoban-solver-01-run-20261121) on make.fun.

## What it is

`main.ts` (Node 22, stdlib only) reads `/input/<id>/level.txt` for the 5
generated levels and writes `/output/<id>/solution.txt` for each, in one run,
in well under the 60-second wall budget. It solves every level in exactly the
push-optimal count P*.

## How it works

Levels are a one-wide hallway with rooms of 3–4 boxes off it. A box pushed
through a door into the hallway can never come back, so every box stays in its
room and a level's push-optimal count is the sum of its rooms' optima. The
solver decomposes the level into rooms and solves each room independently,
then stitches the room solutions together with walks through the hallway.

Each room is solved push-optimally with A* over push-states. A state is the
sorted box cells plus the player's reachable region (the exact player cell
inside a region does not matter for future pushes). The heuristic is the
optimal assignment of boxes to goals over precomputed BFS distances —
admissible, since one push moves one box one step. Deadlock pruning uses
exact single-box reverse reachability (dead cells) plus the 2×2 frozen-block
check. Budgets are by node expansions, never by the wall clock, so two runs
are byte-identical.

## Local results

- Practice set: **1,000,000** (all 5 levels at exactly P*: 13, 16, 29, 47, 60
  pushes), in ~0.6s for the whole set.
- 10 freshly drawn sets (kit generator, fresh seeds): **1,000,000** on every
  set — all 5 levels at exactly P* each time.
- House baseline plain-astar 1.0.0 on the practice set: **200,000** (solves
  only the first level).

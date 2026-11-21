const fs=require('fs'),E=process.env,I=E.MAKEFUN_INPUT_DIR||'/input',O=E.MAKEFUN_OUTPUT_DIR||'/output',C='udlr';
let T,Q,W;
function bf(A,s,B){let m=new Map([[s,'']]),q=[s],h=0;while(h<q.length){let u=q[h++];
for(let k=4;k--;){let v=u+Q[k];if(A.has(v)&&!B.includes(v)&&!m.has(v))m.set(v,m.get(u)+C[k]),q.push(v)}}return m}
function rs(r){let{A,e,bx,gl}=r,S=new Set(A),P=new Set([...A,e]);
let q=[[bx,e,'',0]],v=new Set(),fb=null,h=0;
while(h<q.length){let a=q[h++],bs=a[0],pl=a[1],mv=a[2],pu=a[3],R=bf(P,pl,bs),rk=Math.min(...R.keys());
if(v.has(bs+':'+rk))continue;v.add(bs+':'+rk);
if(fb&&pu>fb.pu)return r.mv=fb.mv,r.pl=fb.pl,r.tr=1,r;
if(bs.every(c=>gl.has(c))){if(R.has(e))return r.mv=mv,r.pl=pl,r.tr=0,r;if(!fb)fb={mv,pl,pu};continue}
for(let bc of bs)for(let k=4;k--;){let tc=bc+Q[k];
if(!S.has(tc)||bs.includes(tc))continue;
let sc=bc-Q[k];
if(!R.has(sc))continue;
let nb=bs.filter(x=>x!=bc);nb.push(tc),nb.sort();
q.push([nb,bc,mv+R.get(sc)+C[k],pu+1]);}}
return r.mv=fb?fb.mv:'',r.pl=fb?fb.pl:e,r.tr=1,r}
function solve(t){let L=t.split('\n');W=Math.max(...L.map(s=>s.length));T=W+2;Q=[-T,T,-1,1];
let P='#'.repeat(T),G=P+L.map(s=>('#'+s.padEnd(W,'#')+'#')).join('')+P;
let b=new Set(),p=0,F=new Set();
[...G].forEach((c,i)=>{if(c!='#')F.add(i);if('$*'.includes(c))b.add(i);if('@+'.includes(c))p=i;});
let hr=p/T|0,rm=[...F].filter(i=>(i/T|0)==hr),cb=[...b];
let R=[];
for(let s of b){let c=new Set(bf(F,s,rm).keys()),a=[...c],bx=a.filter(i=>b.has(i)).sort();
for(let x of bx)b.delete(x);
let gl=a.filter(i=>'.*+'.includes(G[i]));if(!gl.length)continue;
let dr=a.find(i=>Math.abs((i/T|0)-hr)==1&&F.has(hr*T+i%T));if(dr==null)continue;
R.push({A:a,e:hr*T+dr%T,bx,gl:new Set(gl)});}
let S=R.map(rs);
S.sort((a,b)=>a.tr-b.tr);
let cur=p,mv='';
for(let s of S){let wk=bf(F,cur,cb).get(s.e);if(wk==null)return '';
mv+=wk;cur=s.e;mv+=s.mv;
cb=[...cb.filter(x=>!s.bx.includes(x)),...s.gl];cur=s.pl;}
return mv}
for(let k=1;k<6;k++){let d='i00'+k,o=O+'/'+d,mv=solve(fs.readFileSync(I+'/'+d+'/level.txt','utf8'));
fs.mkdirSync(o);fs.writeFileSync(o+'/solution.txt',mv);}

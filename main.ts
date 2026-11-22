import*as f from"fs"
const{MAKEFUN_INPUT_DIR:I="/input",MAKEFUN_OUTPUT_DIR:O="/output"}=process.env
const S=t=>{
const W=t.indexOf("\n"),G=t.replace(/\n/g,""),D=[1,-1,W,-W],Y="rldu"
const B=(a,o)=>{const p=[],q=[a];p[a]=4;let m=a;for(const x of q)for(let j=0;j<4;j++){const n=x+D[j];if(G[n]!="#"&&!o.includes(n)&&p[n]==null){p[n]=j;q.push(n);if(n<m)m=n}}return[p,m]}
const Q=c=>(c<8*W?0:2)+(c%W-1)/7|0
const Z={}
const E=q=>Z[q]||(Z[q]={b:[],g:[]})
let P=0
for(let i=0;i<G.length;i++){const c=G[i],r=i/W|0,q=Q(i)
if((r==7|r==9)&&c!="#")E(q).d=i
if(c=="$"||c=="*")E(q).b.push(i)
if(c=="."||c=="*")E(q).g.push(i)
if(c=="@"||c=="+")P=i}
const F=R=>{
const s=[[R.b,R.d,""]],K=new Set([R.b+"|"+B(R.d,R.b)[1]])
for(let h=0;h<s.length;h++){
const[v,p,m]=s[h]
if(v+""==R.g+""){
const[P2]=B(p,v)
let w="",c=R.d
while(c!=p){w=Y[P2[c]]+w;c-=D[P2[c]]}
return m+w}
const[P2]=B(p,v)
for(const x of v)for(let j=0;j<4;j++){
const y=x+D[j],z=x-D[j]
if(G[y]=="#"||v.includes(y)||P2[z]==null)continue
const n=v.slice();n[n.indexOf(x)]=y;n.sort((a,c)=>a-c)
const k=n+"|"+B(x,n)[1]
if(K.has(k))continue
let w="",c=z
while(c!=p){w=Y[P2[c]]+w;c-=D[P2[c]]}
K.add(k);s.push([n,x,m+w+Y[j]])
}
}
return null
}
let V="",C=P
for(const k in Z){
const R=Z[k],r=R.d/W|0,H2=R.d+(r<8?W:-W)
V+=(H2>C?"r":"l").repeat(Math.abs(H2-C));C=H2
V+=Y[2+(r<8)]+F(R)+Y[3-(r<8)]
C=H2
}
return V
}
for(let k=1;k<6;k++){const d="i00"+k;f.mkdirSync(O+"/"+d,{recursive:true});f.writeFileSync(O+"/"+d+"/solution.txt",S(f.readFileSync(I+"/"+d+"/level.txt")+"")+"\n")}

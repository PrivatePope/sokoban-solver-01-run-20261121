import fs from"node:fs";
let I=process.env.MAKEFUN_INPUT_DIR||"/input",O=process.env.MAKEFUN_OUTPUT_DIR||"/output",W,N,S,A,M="rldu",O4;
function Y(B0,G,e){
let Q=[[[B0,e,""]]],V=new Set([B0+":"+e]),g=-1;
for(let k=0;k<Q.length;k++){
if(g>=0&&k>g)break;
let b=Q[k];
for(let h=0;h<b.length;h++){
let[B,p,m]=b[h];
let isG=B+""==G+"";
if(isG){
if(g<0)g=k;
if(p==e)return m;
}else if(g>=0)continue;
for(let j=0;j<4;j++){
let o=O4[j],n=p+o;
if(!A[n])continue;
let i=B.indexOf(n);
if(i<0){
let y=B+":"+n;
if(V.has(y))continue;V.add(y);
b.push([B,n,m+M[j]]);
}else{
if(isG)continue;
let d=n+o;
if(!A[d]||B.includes(d))continue;
let C=B.slice();C[i]=d;C.sort((a,b)=>a-b);
let y=C+":"+n;
if(V.has(y))continue;V.add(y);
(Q[k+1]=Q[k+1]||[]).push([C,n,m+M[j]]);
}
}
}
}
return "";
}
function solve(L){
let r=L.split("\n");
W=r[0].length;S=r.join("");N=S.length;O4=[1,-1,W,-W];
let P=S.indexOf("@"),B=[],G=[];
for(let i=0;i<N;i++){let c=S[i];if(c=="$"||c=="*")B.push(i);if(c=="."||c=="*")G.push(i)}
let seen=new Uint8Array(N),cur=P,out="";
for(let i=0;i<N;i++){
if(S[i]=="#"||((i/W)|0)==8||seen[i])continue;
let q=[i],ent=-1;seen[i]=1;
for(let h=0;h<q.length;h++){let c=q[h];let k=(c/W)|0;if(k==7||k==9){let d=k<8?c+W:c-W;if(S[d]!="#")ent=d}for(let o of O4){let n=c+o;if(S[n]!="#"&&((n/W)|0)!=8&&!seen[n]){seen[n]=1;q.push(n)}}}
let RB=B.filter(b=>q.includes(b)),RG=G.filter(g=>q.includes(g));
A=seen;A[ent]=1;
let d=ent-cur;
out+=(d>0?"r":"l").repeat(d>0?d:-d);
out+=Y(RB,RG,ent);
A[ent]=0;
cur=ent;
}
return out;
}
for(let d of fs.readdirSync(I).sort()){
let m=solve(fs.readFileSync(I+"/"+d+"/level.txt","utf8"));
fs.mkdirSync(O+"/"+d,{recursive:true});
fs.writeFileSync(O+"/"+d+"/solution.txt",m+"\n");
}

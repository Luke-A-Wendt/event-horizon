// The geometry uses a bounding radius of 2,300 km. The deck is 720 km
// from the spin axis; the six independently sealed reaches are 720 km long.
export const CYLINDER_BOUND=2300000;
export const CYLINDER_DECK=720/2300;
export const CYLINDER_HALF=2160/2300;
export const CYLINDER_BAYS=6;
export const CYLINDER_OMEGA=Math.sqrt(9.80665/720000);
export const CYLINDER_EYE=[0,-.304,-.918];
export const CYLINDER_AIM=[.35,.068,1];
export const CYLINDER_DECK_FOCUS=6;
const T=2*Math.PI,R=CYLINDER_DECK,H=CYLINDER_HALF,N=CYLINDER_BAYS,clamp=x=>Math.max(0,Math.min(1,x)),frac=x=>x-Math.floor(x);
const mix=(a,b,w)=>a.map((v,i)=>v+(b[i]-v)*w),hex=c=>'#'+c.map(v=>Math.round(255*clamp(v)).toString(16).padStart(2,'0')).join('');
function hash(x,y,z){return frac(Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453);}
function noise(x,y,z){
 const a=Math.floor(x),b=Math.floor(y),c=Math.floor(z),ease=t=>t*t*(3-2*t);
 const u=ease(frac(x)),v=ease(frac(y)),w=ease(frac(z));let sum=0;
 for(let i=0;i<2;i++)for(let j=0;j<2;j++)for(let k=0;k<2;k++)sum+=(i?u:1-u)*(j?v:1-v)*(k?w:1-w)*hash(a+i,b+j,c+k);
 return sum;
}
// Small bounded Canvas fallback. All surfaces and openings occupy the same
// positions as the GPU geometry, including the two sides of the closed wall.
export function cylinderPixel(ro,rd,phase){
 let t=Infinity,mat=0,p,side=0,glass=Infinity,k=0;
 const hit=(d,m,s=0)=>{if(d>1e-6&&d<t){t=d;mat=m;side=s;}};
 const straight=(r,half,inside,outside)=>{
  const a=rd[0]*rd[0]+rd[1]*rd[1],b=rd[0]*ro[0]+rd[1]*ro[1],disc=b*b-a*(ro[0]*ro[0]+ro[1]*ro[1]-r*r);
  if(a<1e-12||disc<0)return;
  const q=Math.sqrt(disc);for(const [d,m]of [[(-b-q)/a,outside],[(-b+q)/a,inside]])if(Math.abs(ro[2]+rd[2]*d)<=half)hit(d,m);
 };
 straight(R,H,1,0); straight(R*1.035,H*1.01,2,2);straight(.012,H,3,3);
 if(Math.abs(rd[2])>.000001){for(let j=0;j<=N;j++){
  const d=(-H+2*H*j/N-ro[2])/rd[2];if(d<=1e-6||d>=t)continue;
  const x=ro[0]+rd[0]*d,y=ro[1]+rd[1]*d,r=Math.hypot(x,y)/R,a=Math.atan2(y,x)-phase;
  if(j===0||j===N){if(r<1.035)hit(d,5,j);continue;}
  if(r>1)continue;const f=Math.abs(Math.sin((a-.13*j)*6))*r;
  if(r>.953||r<.094||Math.abs(r-.59)<.004||f<.027||Math.abs(Math.sin((a-.13*j)*12))*r<.008){hit(d,4,j);}
  else glass=Math.min(glass,d);
 }}
 if(!mat)return null;
 p=ro.map((v,i)=>v+rd[i]*t);const a=Math.atan2(p[1],p[0])-phase,z=p[2],x=Math.cos(a),y=Math.sin(a);let col;
 if(mat===1){
  const e=noise(x*3.2,y*3.2,z*8)*.64+noise(x*8,y*8,z*20)*.26+noise(x*20,y*20,z*52)*.1;
  const f=noise(x*12,y*12,z*25);col=e<.445?mix([.08,.29,.38],[.2,.49,.54],clamp(e*4-1.2)):mix([.19,.35,.19],[.58,.59,.36],f);
  if(e>.64)col=mix(col,[.68,.63,.47],clamp((e-.64)*6));
  const rail=Math.min(Math.abs(frac(z/H*9+.5)-.5),Math.abs(frac(a*12/T+.5)-.5));
  if(rail<.012)col=[.57,.56,.43];
 }else if(mat===2){const band=Math.abs(frac((z/H+1)*3+.5)-.5);col=band<.04?[.38,.44,.46]:[.19,.25,.29];}
 else if(mat===3)col=Math.abs(frac(z*13+.5)-.5)<.13?[.23,.26,.27]:[1,.88,.59];
 else if(mat===4)col=Math.abs(frac(a*54/T)-.5)<.12?[.78,.67,.43]:[.35,.43,.47];
 else{const rr=Math.hypot(p[0],p[1])/R;col=rr<.1?[.96,.78,.48]:[.42,.48,.49];}
 if(mat!==2&&mat!==3)col=mix(col,[.53,.66,.69],.28*(1-Math.exp(-t*2)));
 if(glass<t)col=mix(col,[.49,.7,.73],.08);
 return hex(col);
}

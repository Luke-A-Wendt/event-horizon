// A turn is a rotation of a rigid hull. Interpolating its nose and up vectors
// separately can lose the roll axis at a half turn, then flip it in one frame.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const world=(basis,v)=>basis[0].map((_,i)=>basis[0][i]*v[0]+basis[1][i]*v[1]+basis[2][i]*v[2]);
export const TURN_SECONDS=3;
export const turnDuration=radians=>Math.abs(radians)<1e-6?0:Math.max(2.4,TURN_SECONDS*Math.min(1,Math.abs(radians)/Math.PI));
export const turnEase=u=>{u=Math.min(1,Math.max(0,u));return u*u*u*(10+u*(-15+6*u));};
// Return the unit quaternion rotating the reference triad to the goal,
// expressed in reference coordinates. Largest-diagonal branch is stable at π.
function rotation(a,b){
 const m=b.map(v=>a.map(axis=>dot(axis,v))),trace=m[0][0]+m[1][1]+m[2][2],q=[0,0,0,0];
 if(trace>0){
  const s=2*Math.sqrt(1+trace);q[3]=s/4;
  for(let i=0;i<3;i++){const j=(i+1)%3,k=(i+2)%3;q[i]=(m[j][k]-m[k][j])/s;}
 }else{
  const i=m[0][0]>=m[1][1]&&m[0][0]>=m[2][2]?0:m[1][1]>=m[2][2]?1:2,j=(i+1)%3,k=(i+2)%3;
  const s=2*Math.sqrt(Math.max(0,1+m[i][i]-m[j][j]-m[k][k]));q[i]=s/4;
  q[j]=(m[i][j]+m[j][i])/s;q[k]=(m[i][k]+m[k][i])/s;q[3]=(m[j][k]-m[k][j])/s;
 }
 const n=Math.hypot(...q)*(q[3]<-1e-12?-1:1);return q.map(x=>x/n);
}
export function attitudeAngle(a,b){const q=rotation(a,b);return 2*Math.atan2(Math.hypot(q[0],q[1],q[2]),Math.abs(q[3]));}
export function blendAttitude(a,b,u){
 if(u<=0)return a;if(u>=1)return b;
 const q=rotation(a,b),n=Math.hypot(q[0],q[1],q[2]);if(n<1e-13)return a;
 const axis=world(a,q.slice(0,3).map(x=>x/n)),angle=2*Math.atan2(n,Math.abs(q[3]))*u,c=Math.cos(angle),s=Math.sin(angle);
 return a.map(v=>{const k=cross(axis,v),d=dot(axis,v)*(1-c);return v.map((x,i)=>x*c+k[i]*s+axis[i]*d);});
}
// Carry the outgoing hull with the moving parking frame while it slews. The
// choice of which way to make a retrograde half-turn is fixed at contact.
export function handoffAttitude(handoff,goal){
 if(!handoff.attitudeOnly)return blendAttitude(handoff.basis,goal,turnEase(handoff.elapsed/TURN_SECONDS));
 const reference=handoff.referenceBasis??(handoff.referenceBasis=goal.map(v=>[...v]));
 const relative=blendAttitude(handoff.basis,reference,turnEase(handoff.elapsed/TURN_SECONDS));
 return relative.map(v=>world(goal,reference.map(axis=>dot(axis,v))));
}

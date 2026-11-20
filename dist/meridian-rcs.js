// Four pods on each passenger-deck rim. Directions are hull-fixed, +Z bow.
// Short visual pulses represent duty cycle, not a simulated valve frequency.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const clamp=x=>Math.max(0,Math.min(1,x));
const radial=[[1,0,0],[0,1,0],[-1,0,0],[0,-1,0]];
export function rimJets(force=[0,0,0],torque=[0,0,0]){
 const jets=[];
 for(const n of radial){
  const tangent=[-n[1],n[0],0],axial=.5*force[2]+torque[0]*n[1]-torque[1]*n[0];
  // Common scaling prevents saturation from steering a mixed translation/turn.
  const scale=Math.max(1,.5*Math.abs(force[2])+Math.max(Math.abs(torque[0]),Math.abs(torque[1])));
  for(const sign of [-1,1]){
   const z=sign<0?.350:.645;
   const add=(axis,length,duty)=>{
    if(duty<=0)return;
    const position=[n[0]*.473,n[1]*.473,z].map((v,k)=>v+axis[k]*length);
    jets.push({axis,position,duty});
   };
   add(n,.0205,clamp(-dot(n,force)/scale));
   add([0,0,sign],.016,clamp(-sign*axial/scale));
   // Counter-directed tangential exhaust at opposite sides makes a roll couple.
   add(tangent.map(v=>-Math.sign(torque[2])*v),.030,clamp(.25*Math.abs(torque[2])/scale));
  }
 }
 return jets;
}
// alpha = half the sum of e_i × d²e_i/dt² for an orthonormal triad.
// The centripetal parts cancel, so a constant-rate turn does not burn jets.
// Command is proportional to physical angular acceleration, not playback rate.
export function rimTurnCommand(before,at,after,h){
 if(!(h>0))return [0,0,0];
 const alpha=[0,0,0];
 for(let i=0;i<3;i++){
  const dd=at[i].map((v,k)=>(before[i][k]-v)+(after[i][k]-v));
  const a=cross(at[i],dd);for(let k=0;k<3;k++)alpha[k]+=a[k]/(2*h*h);
 }
 const body=at.map(axis=>dot(alpha,axis)),peak=Math.max(...body.map(Math.abs));
 if(peak<1e-10)return [0,0,0];
 return body.map(v=>v/Math.max(.004,peak));
}

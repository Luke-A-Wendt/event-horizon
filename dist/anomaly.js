// A smooth, compact optical disturbance for the fictional anomaly scene.
// It has no body, horizon, mass or singularity. This is not an Einstein solution.
export const MAX_ANOMALIES=4;
export function anomalyGradient(point,region,time=0){
 const r=Math.max(1e-20,region.radius),q=point.map((v,i)=>(v-region.position[i])/r),rr=q.reduce((n,v)=>n+v*v,0);
 if(rr>=9||!(region.anomalyStrength>0))return [0,0,0];
 const k=3.2*(region.anomalyScale??1),t=time*.35*(region.anomalyMotion??1),x=k*q[0]+t,z=k*q[2]-.7*t,y=k*q[1]+.4*t;
 const sx=Math.sin(x),sz=Math.sin(z),cy=Math.cos(y),wave=sx*sz+.55*cy+.3*Math.sin(x+z+y),co=.3*Math.cos(x+z+y),envelope=Math.exp(-rr*1.4);
 const fade=Math.max(0,1-rr/9),factor=region.anomalyStrength*.085*envelope*fade*fade;
 const gradient=[k*(Math.cos(x)*sz+co),k*(-.55*Math.sin(y)+co),k*(sx*Math.cos(z)+co)];
 return gradient.map((v,i)=>factor*(v-wave*q[i]*(2.8+4/(9-rr))));
}
export function anomalyGridOffset(point,regions,time=0){
 const delta=[0,0,0];for(const region of regions.slice(0,MAX_ANOMALIES)){const g=anomalyGradient(point,region,time);for(let i=0;i<3;i++)delta[i]+=g[i]*region.radius*.7;}return delta;
}
export function anomalySkyDirection(direction,observer,regions,time=0){
 const bent=direction.slice(0,3);for(const region of regions.slice(0,MAX_ANOMALIES)){
  const v=region.position.map((x,i)=>x-observer[i]),distance=Math.max(0,v.reduce((n,x,i)=>n+x*direction[i],0));
  const closest=observer.map((x,i)=>x+direction[i]*distance),g=anomalyGradient(closest,region,time),along=g.reduce((n,x,i)=>n+x*direction[i],0);
  for(let i=0;i<3;i++)bent[i]-=(g[i]-direction[i]*along)*1.5;
 }const length=Math.hypot(...bent)||1;return bent.map(v=>v/length);
}

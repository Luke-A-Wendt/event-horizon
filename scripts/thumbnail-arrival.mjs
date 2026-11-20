// Capture actual arrivals, with the destination limb below the ship in the frame.
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),unit=a=>a.map(x=>x/Math.hypot(...a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((v,i)=>v-b[i]),mix=(a,b,x,y)=>a.map((v,i)=>x*v+y*b[i]);
export function advanceToDestination(r,name){
 const ship=r.objects.find(o=>o.type==='shuttle'||o.type==='enterprise'),body=r.objects.find(o=>o.name===name);
 if(!ship||!body)throw Error('Missing subjects for '+name+' arrival');
 r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
 for(let i=1;i<=2400;i++){
  r.advanceSimulation(1000+i*100);
  if(ship.parentId!==body.id||r.transfer)continue;
  r.fillObjects();
  const target=r.getFocusFrame(body.id),parent=r.getFocusFrame(target.parentId),star=parent.type==='star'?parent:r.getFocusFrame(parent.parentId);
  const localNoon=dot(unit(sub(r.getFocusFrame(ship.id).position,target.position)),unit(sub(star.position,target.position)));
  // The short Mars parking arc skims the terminator; capture its lit end.
  if(localNoon>(name==='Mars'?.045:.82))return body.id;
 }
 throw Error('No completed arrival at '+name);
}
export function arrivalView(r,bodyId){
 const ship=r.getFocusFrame(),body=r.getFocusFrame(bodyId),toward=unit(sub(body.position,ship.position));
 const parent=r.getFocusFrame(body.parentId),star=parent.type==='star'?parent:r.getFocusFrame(parent.parentId),sun=unit(sub(star.position,body.position));
 // Pick a broadside near the illuminated limb instead of looking straight down at the surface.
 const horizon=Math.asin(Math.min(.9999,body.radius/Math.hypot(...sub(ship.position,body.position))))-.075;
 const p=unit(cross(toward,Math.abs(toward[1])<.8?[0,1,0]:[1,0,0])),q=cross(toward,p);
 let best=-Infinity,forward;
 for(let i=0;i<64;i++){
  const u=i*Math.PI/32,along=mix(p,q,Math.cos(u),Math.sin(u)),f=mix(toward,along,Math.cos(horizon),Math.sin(horizon));
  const lengthwise=dot(f,ship.frame[2]),above=dot(f,ship.frame[1]),horizontal=dot(unit(cross(toward,f)),ship.frame[2]);
  const score=(body.name==='Mars'?2:.65)*dot(along,sun)-1.3*Math.abs(Math.abs(lengthwise)-.22)-1.4*Math.abs(above+.55)+1.2*Math.abs(horizontal);
  if(score>best){best=score;forward=f;}
 }
 const across=unit(cross(toward,forward)),sky=cross(across,forward);
 const roll=-.12,right=mix(across,sky,Math.cos(roll),Math.sin(roll)),up=cross(right,forward);
 const off=forward.map((v,i)=>ship.radius*(-3.45*v+.085*right[i]+.15*up[i])),local=v=>ship.frame.map(axis=>dot(axis,v));
 return {...r.cameraFrame,eyeOrigin:[...ship.position],eyeOffset:off,observer:ship.position.map((v,i)=>v+off[i]),forward,right,up,
 inspectCamera:local(off.map(x=>x/ship.radius)),inspectForward:local(forward),inspectRight:local(right),inspectUp:local(up),inspectIndex:ship.index,hideIndex:-1};
}

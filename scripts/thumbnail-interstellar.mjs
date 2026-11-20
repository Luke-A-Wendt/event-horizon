// Photograph a live Auto flight. Preserve the split position: on a galactic
// baseline a ship-scale camera translation cannot be added to a float origin.
const dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0),unit=v=>v.map(x=>x/Math.hypot(...v)),mul=(v,k)=>v.map(x=>x*k);
const sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function advanceToWarpShot(r,galactic=false){
 const craft=r.objects.find(o=>o.type==='enterprise');
 r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
 for(let i=1;i<2400;i++){
  r.advanceSimulation(1000+100*i);r.fillObjects();r.updateCameraFrame();
  if(galactic?craft.parentId==='primary'&&!r.transfer:r.transfer&&r.transfer.currentDistanceFraction>.30&&r.transfer.currentDistanceFraction<.70&&r.state.warpFactor>3.8)return;
 }
 throw Error('Warp photograph did not reach its '+(galactic?'Sagittarius A* orbit':'interstellar cruise'));
}
export function warpShotView(r,galactic=false){
 const craft=r.getFocusFrame(),basis=craft.frame;
 let f,referenceUp,distance,shiftX,shiftY;
 if(galactic){
  const axis=r.configCache.primaryDiscAxis,toward=unit(sub(r.getFocusFrame('primary').position,craft.position)),east=unit(cross(toward,axis));
  f=unit(add(add(toward,mul(east,.26)),mul(axis,.035)));referenceUp=axis;
  distance=3.9;shiftX=-.85;shiftY=.28;
 }else{
  f=unit(add(add(mul(basis[0],-.86),mul(basis[1],-.36)),mul(basis[2],.28)));referenceUp=basis[1];
  distance=1.35*(r.warpEnvelope(craft,r.state)?.radius??3)/.395;shiftX=0;shiftY=.06;
 }
 const right=unit(cross(f,referenceUp)),up=unit(cross(right,f)),off=mul(add(add(mul(f,-distance),mul(right,shiftX)),mul(up,shiftY)),craft.radius);
 const local=v=>basis.map(axis=>dot(axis,v));
 return {...r.cameraFrame,eyeOrigin:[...craft.position],eyeOffset:off,observer:add(craft.position,off),forward:f,right,up,inspectCamera:local(mul(off,1/craft.radius)),inspectForward:local(f),inspectRight:local(right),inspectUp:local(up),inspectIndex:craft.index,hideIndex:-1};
}

// Catch Proxima just above d's real limb. The camera looks across the ship
// toward the local sunset; both the star and planet retain their angular sizes.
function proximaDirections(r,ship,planet){
 const toward=sub(planet.position,ship.position),star=unit(sub(r.getFocusFrame(planet.parentId).position,ship.position));
 return {down:unit(toward),star,limb:Math.asin(Math.min(1,planet.radius/Math.hypot(...toward)))};
}
export function reachProximaSunset(r){
 const ship=r.objects.find(o=>o.type==='enterprise'),planet=r.objects.find(o=>o.name==='Proxima Centauri d');
 r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
 for(let i=1;i<2400;i++){
  r.advanceSimulation(1000+i*100);
  if(ship.parentId!==planet.id||r.transfer)continue;
  r.fillObjects();const {down,star,limb}=proximaDirections(r,r.getFocusFrame(ship.id),r.getFocusFrame(planet.id)),height=Math.acos(dot(down,star))-limb;
  if(height>.12&&height<.21)return planet.id;
 }
 throw Error('Did not reach sunset near Proxima d');
}
export function proximaSunsetView(r,planetId){
 const ship=r.getFocusFrame(),{down,star}=proximaDirections(r,ship,r.getFocusFrame(planetId)),east=unit(cross(down,star)),north=unit(cross(east,star));
 const f=unit(add(add(star,mul(east,.245)),mul(north,-.095))),right=unit(cross(f,north)),up=unit(cross(right,f));
 const off=mul(add(add(mul(f,-3.95),mul(right,-.45)),mul(up,.085)),ship.radius),local=v=>ship.frame.map(axis=>dot(axis,v));
 return {...r.cameraFrame,eyeOrigin:[...ship.position],eyeOffset:off,observer:add(ship.position,off),forward:f,right,up,inspectCamera:local(mul(off,1/ship.radius)),inspectForward:local(f),inspectRight:local(right),inspectUp:local(up),inspectIndex:ship.index,hideIndex:-1};
}

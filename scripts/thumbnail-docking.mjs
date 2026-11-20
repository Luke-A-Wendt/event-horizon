// Photograph the repeating ferry at a sunlit Neptune capture. The camera can be
// placed freely; the ship, station, illumination and dock extension are live.
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(v,k)=>v.map(x=>x*k);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),unit=v=>mul(v,1/Math.hypot(...v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function advanceToNeptuneCapture(r,view='card'){
 const ship=r.objects.find(o=>o.type==='shuttle'),neptune=r.objects.find(o=>o.catalogId==='neptune-station');
 const star=r.objects.find(o=>o.type==='star'),gap=view==='command'?33:1.45;
 r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
 for(let tick=1;tick<=30000;tick++){
  r.advanceSimulation(1000+100*tick);
  const d=r.getDockingState(ship.id);
  if(!d||d.stationId!==neptune?.id||d.port!=='south'||d.phase!==(view==='latched'?'docked':'approach')||d.gapMeters>gap||(view!=='command'&&d.extension<.99))continue;
  // A real daylight arrival, with Neptune behind the port. The first arrival
  // can be eclipsed, so allow the normal playlist to continue to later legs.
  const h=r.getFocusFrame(neptune.id),p=r.getFocusFrame(h.parentId),sun=r.getFocusFrame(star.id);
  if(dot(unit(sub(sun.position,h.position)),unit(sub(p.position,h.position)))<-.65)return;
 }
 throw Error('Ferry did not reach the sunlit lower hub at Neptune.');
}
export function ferryThumbnailView(r,view='card'){
 const craft=r.getFocusFrame(),d=r.getDockingState(craft.id),hub=r.getFocusFrame(d.stationId),planet=r.getFocusFrame(hub.parentId);
 const axis=mul(hub.habitatHubFrame[1],d.port==='south'?-1:1),p=unit(sub(planet.position,hub.position));
 const radial=unit(sub(p,mul(axis,dot(p,axis)))),across=unit(cross(axis,radial));
 const command=view==='command';
 const [range,bearing,pitch,aim,roll]=command?[42,-1.18,-.67,7,.71]:view==='latched'?[66,-1.16,.025,5,.65]:[71,-1.22,.10,5,.66];
 const away=unit(add(mul(add(mul(radial,-Math.cos(bearing)),mul(across,Math.sin(bearing))),Math.cos(pitch)),mul(axis,Math.sin(pitch))));
 const forward=mul(away,-1),rawRight=unit(cross(forward,axis)),rawUp=unit(cross(rawRight,forward));
 const right=add(mul(rawRight,Math.cos(roll)),mul(rawUp,Math.sin(roll))),up=add(mul(rawUp,Math.cos(roll)),mul(rawRight,-Math.sin(roll)));
 // Offset the aim toward the mating faces so they sit below the ship, with
 // the Garden Station rim and the natural limb of Neptune in the same frame.
 const off=mul(add(mul(axis,-aim),mul(away,range)),1/RG);
 const local=v=>craft.frame.map(e=>dot(e,v));
 return {...r.cameraFrame,eyeOrigin:[...craft.position],eyeOffset:off,observer:add(craft.position,off),forward,right,up,
  inspectCamera:local(mul(off,1/craft.radius)),inspectForward:local(forward),inspectRight:local(right),inspectUp:local(up),inspectIndex:craft.index,hideIndex:-1};
}

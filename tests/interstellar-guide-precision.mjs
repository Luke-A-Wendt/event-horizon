import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {captureTransferPath,renderTransferPath} from '../dist/transfer-path.js';
import {createOpticalContext} from '../dist/optical-projection.js';
import {parkedOrbitGeometry} from '../dist/orbit-path.js';
import {routePathSamples} from '../dist/travel-routes.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';

const sub=(a,b)=>a.map((v,i)=>v-b[i]), dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);

/* Measure perpendicular error at a cross-section near the shuttle. The
   reference is the pinhole image of a displacement *in the shuttle's local
   frame*: it never adds a meter to an absolute interstellar coordinate. */
// Read the actual clipped SVG stroke, including its cubic control points. A
// cubic lies inside the convex hull of its control points; on a straight leg,
// their largest perpendicular deviation bounds the entire visible stroke.
function curves(guide,o){
 const svg=renderTransferPath(guide,o.width,o.height,o.aspect),out=[];
 for(const d of new Set([...svg.matchAll(/<path d="([^"]+)"/g)].map(m=>m[1]))){
  const [move,...commands]=d.slice(1).split('C');
  let a=move.split(' ').map(Number);
  for(const c of commands){
   const [bx,by,cx,cy,dx,dy]=c.split(' ').map(Number),b=[bx,by],c1=[cx,cy],end=[dx,dy];
   out.push([a,b,c1,end]);a=end;
  }
 }
 return out;
}
// Rebuild and project the same active guide after moving its entire inertial
// chart by the Earth–Galactic-center separation. The optics already store
// bodies and the observer as displacements from the chart origin. Reuse those
// local quantities; only the absolute anchor and sampling center are shifted.
function compareGalacticTranslation(r,o,craft){
 const shift=8277*3.085677581491367e16,translate=(p,units)=>[p[0]+shift/units,p[1],p[2]];
 // The live guide was sampled before this frame's camera update. Rebuild
 // both controls at the same zoom so their sample density is identical.
 const t=r.transfer,baseline=Object.create(r);baseline.transfer={...t};
 baseline.transfer.pathPoints=routePathSamples(baseline.transfer,r);
 const guide=captureTransferPath(baseline,o);
 const other={...t,tangentLeg:{...t.tangentLeg,orbitCenter:translate(t.tangentLeg.orbitCenter,1)}};
 other.pathPoints=routePathSamples(other,r);
 const shifted=Object.create(r);
 shifted.transfer=other;
 shifted.cameraFrame={...r.cameraFrame,eyeOrigin:translate(r.cameraFrame.eyeOrigin,RG),observer:translate(r.cameraFrame.observer,RG)};
 shifted.getFocusFrame=id=>!id||id===craft.id?{...craft,position:translate(craft.position,RG)}:r.getFocusFrame(id);
 const opt={...o,origin:translate(o.origin,RG)},comparison=captureTransferPath(shifted,opt);
 assert(comparison,'Translated spiral must remain visible');
 assert.deepEqual(curves(comparison,opt),curves(guide,o),'The spiral stroke must not move when its chart is translated 8.277 kpc');
}
function measurements(r,nearHole=false){
 const route=r.transfer;
 const f=r.cameraFrame,craft=r.getFocusFrame(),o=createOpticalContext(r),guide=captureTransferPath(r,o);
 if(!guide)return null;
 if(route?.radiusChange)compareGalacticTranslation(r,o,craft);
 const q=f.eyeOrigin?sub(sub(craft.position,f.eyeOrigin),f.eyeOffset):sub(craft.position,f.observer);
 const t=r.transfer;
 // The tangent follows the changing radius as well as the azimuth. Thrust
 // and the shuttle's nose may point elsewhere during the maneuver.
 let tangent=t?.tangentLeg?.tangent||parkedOrbitGeometry(r,craft.id).tangent;
 if(t?.radiusChange){
  const {normal}=t.tangentLeg,radial=t.orbitRadial;
  const prograde=[normal[1]*radial[2]-normal[2]*radial[1],normal[2]*radial[0]-normal[0]*radial[2],normal[0]*radial[1]-normal[1]*radial[0]];
  const s=t.sample,velocity=prograde.map((x,j)=>x*s.tangentialVelocity+radial[j]*s.radialVelocity);
  tangent=velocity.map(x=>x/Math.hypot(...velocity));
 }
 const image=v=>[dot(v,f.right),dot(v,f.up)].map(x=>x/dot(v,f.forward)/o.fov*o.height);
 const center=image(q),ref=image(q.map((x,j)=>x+craft.radius*tangent[j])),delta=sub(ref,center),d=Math.hypot(...delta),direction=delta.map(x=>x/d),normal=[-direction[1],direction[0]];
 const sections=nearHole?[-100,-10,0,10,100]:[-10,0,10],errors=sections.map(()=>Infinity);
 let wide=0,reach=0;
 const measure=p=>{
  const offset=sub([p[0]-o.width/2,o.height/2-p[1]],center);
  return [dot(offset,direction),dot(offset,normal)];
 };
 for(const curve of curves(guide,o)){
  const pts=curve.map(measure);
  for(const [s,e] of pts){wide=Math.max(wide,Math.abs(e));reach=Math.max(reach,Math.abs(s));}
  // Sample each finished cubic to locate its intersections with local
  // transverse sections; compare to the analytic tangent at that pixel.
  let [x0,y0]=pts[0];
  for(let step=1;step<=6;step++){
   const t=step/6,u=1-t,w=[u**3,3*u*u*t,3*u*t*t,t**3];
   const x1=pts.reduce((n,p,i)=>n+p[0]*w[i],0),y1=pts.reduce((n,p,i)=>n+p[1]*w[i],0);
   if(x0!==x1)for(let k=0;k<sections.length;k++){const f=(sections[k]-x0)/(x1-x0);if(f>=0&&f<=1){const y=y0+f*(y1-y0);if(Math.abs(y)<Math.abs(errors[k]))errors[k]=y;}}
   x0=x1;y0=y1;
  }
 }
 return {errors,wide,reach,lensed:o.lensing&&o.holes.some(h=>h.mass>0)};
}
function run(id,near=false,sideView=false){
 const scene=SCENE_PRESETS.find(s=>s.id===id),objects=scene.objects,origin=objects.find(b=>b.key==='proxima')?.x||0;
 if(near)scene.objects=objects.map(b=>b.parentKey?b:{...b,x:(b.x||0)-origin});
 const fixtureGL=fixture(sideView?{width:390,height:700}:{width:900,height:650}),r=new BlackHoleRenderer(fixtureGL.canvas,{autoStart:false,bindControls:false});
 const collected={};
 try{
  let now=0;r.now=()=>now;r.loadScene(id);r.sceneLoad=null;r.state.paused=false;
  scene.objects=objects;
  const names=new Map(r.objects.map(b=>[b.id,b.name]));let arrivals=0,turned=false;
  for(let n=1;n<=2000;n++){
   now=n*1000/30;const was=!!r.transfer;r.advanceChartStages(1/30);
   if(was&&!r.transfer)arrivals++;
   // Rotate and zoom the production tracking camera once, before measuring
   // the far system's local leg on a portrait viewport.
   if(sideView&&arrivals===1&&r.transfer?.progress>.1&&!turned){
    r.camera.yaw=r.target.yaw+=.65;r.camera.pitch=r.target.pitch=.42;
    r.camera.focusDistance=r.target.focusDistance*=1.8;turned=true;
   }
   fixtureGL.control.now=now;
   if(!r.render(now))continue;
   const t=r.transfer;
   let stage=t?t.targetName+' straight':(names.get(r.getFocusFrame().parentId)||r.getFocusFrame(r.getFocusFrame().parentId)?.label)+' arc';
   if(id==='shuttle-sgra-direct'){
    if(t){
     if(arrivals===0&&t.progress>.85)stage='Sgr approach';
     if(arrivals===1)stage=t.progress<.15?'Sgr depart inner':t.progress>.85?'Sgr arrive outer':'Sgr recovery';
     if(arrivals===2&&t.progress<.15)stage='Sgr depart outer';
    }else if(arrivals===1)stage='Sgr inner arc';else if(arrivals===2)stage='Sgr outer arc';
   }
   if(!stage.startsWith('Sgr ')&&t&&(t.progress<.15||t.progress>.85))continue;
   if(id==='shuttle-proxima-direct'&&arrivals>=2)break;
   if(sideView&&(!turned||!t))continue;
   if(id==='shuttle-sgra-direct'&&arrivals>=3)break;
   const e=measurements(r,stage.startsWith('Sgr '));(collected[stage]??=[]).push(e);
  }
 }finally{scene.objects=objects;r.dispose()}
 return collected;
}
function verify(id,matrix,control,sideView){
 const expected=sideView?['Proxima Centauri b straight']:id==='shuttle-proxima-direct'?['Earth arc','Proxima Centauri d straight','Proxima Centauri d arc','Proxima Centauri b straight']:['Earth arc','Sagittarius A* straight','Sgr approach','Sgr inner arc','Sgr depart inner','Sgr recovery','Sgr arrive outer','Sgr outer arc','Sgr depart outer','Earth straight'];
 assert.deepEqual(Object.keys(matrix),expected);
 for(const [stage,rows] of Object.entries(matrix)){
  const label=id+(control?' (translated) ':sideView?' (portrait oblique) ':' ')+stage,straight=stage.endsWith('straight');
  let previous=null,covered=0,peakError=0,peakJump=0,peakWide=0,reach=0;
  for(const row of rows){
   const e=row?.errors;
   if(e?.every(Number.isFinite)){
    covered++;peakError=Math.max(peakError,...e.map(Math.abs));
    if(previous)peakJump=Math.max(peakJump,...e.map((x,i)=>Math.abs(x-previous[i])));
    previous=e;
   }else previous=null;
   if(row){peakWide=Math.max(peakWide,row.wide);reach=Math.max(reach,row.reach);}
  }
  // At the instant of arrival the new arc starts at the craft and may not
  // extend behind it for that one frame. Never accept a missing straight.
  const nearHole=stage.startsWith('Sgr '),contact=stage.startsWith('Sgr depart')||stage==='Sgr approach'||stage==='Sgr arrive outer';
  assert(rows.length>=(contact?35:100),label+': playback must exercise a sustained leg');
  if(nearHole)assert(rows.every(r=>r?.lensed),label+': optical guide must use the actual compact lens');
  if(stage==='Sgr recovery')assert(reach>100,label+': spiral must extend beyond the visible shuttle');
  assert(covered>=rows.length-(straight?0:1),label+`: guide followed the ship in only ${covered}/${rows.length} frames`);
  assert(peakError<.5,label+`: guide missed ship-local analytic tangent by ${peakError} px`);
  assert(peakJump<.5,label+`: frame-to-frame lateral jitter of ${peakJump} px`);
  if(straight){
   assert(reach>100,label+': projected straight must continue well outside the hull');
   assert(peakWide<.5,label+`: visible straight deviates from its analytic line by up to ${peakWide} px`);
  }
  console.log(label+`: ${covered}/${rows.length} frames; near ${peakError.toFixed(3)} px, jump ${peakJump.toFixed(3)} px`+(straight?`, entire straight ≤ ${peakWide.toFixed(3)} px`:''));
 }
}
for(const [id,control,sideView] of [['shuttle-proxima-direct',false],['shuttle-proxima-direct',true],['shuttle-sgra-direct',false],['shuttle-proxima-direct',false,true]]){
 verify(id,run(id,control,sideView),control,sideView);
}

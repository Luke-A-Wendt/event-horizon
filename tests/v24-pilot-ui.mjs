import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {warpSideFraming} from '../dist/camera-framing.js';
import {formatFlightDilation,installPilotControls} from '../dist/pilot-ui.js';
assert.equal(formatFlightDilation(0),'0 ns');
assert.equal(formatFlightDilation(1e-9),'1.0 ns');
assert.equal(formatFlightDilation(.123456789),'120 ms');
assert.equal(formatFlightDilation(Infinity),'—');
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
for(const [width,height] of [[1440,806],[900,556],[360,520],[667,281]]){
 const f=fixture({width,height}),document=uiDomFixture(html);globalThis.document=document;globalThis.window=document.createElement('window');
 const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
 const $=id=>document.getElementById(id);
 const pilot=installPilotControls({mount:$('pilotControls'),renderer:()=>r,state:()=>r.state,setPaused:paused=>r.update({paused}),refresh(){}});
 const centered=()=>{
  r.fillObjects();r.updateCameraFrame();const view=r.cameraFrame,q=view.inspectCamera.map(x=>-x),depth=q.reduce((s,v,i)=>s+v*view.inspectForward[i],0);
  assert(depth>0);for(const axis of [view.inspectRight,view.inspectUp])assert(Math.abs(q.reduce((s,v,i)=>s+v*axis[i],0)/depth)<1e-12,'Tracked vehicle stays at the projection center');
 };
 for(const scene of ['nasa-shuttle','warp-cruise']){
  r.loadScene(scene);const craft=r.objects.find(o=>['shuttle','enterprise'].includes(o.type));
  r.focusTarget(craft.id,'chase');r.look('above');assert(pilot.start(craft.id));
  assert.equal(r.focusMode,'track');assert.equal(r.state.viewMode,'orbit');assert.equal(r.camera.lookPitch,0);assert.equal(r.camera.lookYaw,0);assert(Math.abs(r.camera.yaw-(craft.type==='enterprise'?-Math.PI/2:Math.PI))<1e-12);centered();
  assert(!$('pilotClocks'));assert(!$('pilotNominal'));assert(!$('pilotControls').contains($('pilotDilation')),'Time dilation stays with speed and angular velocity');
  if(craft.type==='shuttle'){
   assert.equal($('pilotDilation').textContent,'0 ns');assert(!$('pilotDilationRow').hidden);assert.equal($('pilotPower').max,'10');
   $('pilotPower').value='10';$('pilotPower').dispatch('input');assert.equal(r.getFlightState().thrustSetting,10);assert($('pilotControls').classList.contains('pilot-shuttle'));assert.match($('pilotPower').title,/not a survival limit/);
   r.lastTime=1000;for(let i=1;i<=1000;i++)r.advanceSimulation(1000+i*100);pilot.update();
   assert.notEqual($('pilotDilation').textContent,'0 ns','SR lag becomes visible in nanoseconds');
  }else assert($('pilotDilationRow').hidden);
  r.rotate(.3,.1);r.camera={...r.target};const angle=r.camera.yaw,dist=r.camera.focusDistance;
  $('pilotStop').click();assert.equal(r.driveId,null);assert.equal(r.focusId,craft.id);assert.equal(r.focusMode,'track');assert.equal(r.camera.yaw,angle);
  if(craft.type==='shuttle')assert.equal(r.camera.focusDistance,dist);
  else{
   // Leaving Drive restores viewport controls. Keep the same centered orbit,
   // but allow a zoom out when the bubble needs room around those controls.
   const fit=warpSideFraming(width,height,r.state.warpFactor,{enabled:r.state.warp,yaw:r.target.yaw,pitch:r.target.pitch,driving:false});
   assert(Math.abs(r.camera.focusDistance-Math.max(dist,fit.distance))<1e-8);
  }
  centered();
  for(let i=1;i<=50;i++){r.advanceSimulation((r.lastTime||1000)+100);centered();}
  const lifetimeLag=r.getObjectClock(craft.id)?.lagSeconds;assert(pilot.start(craft.id));if(craft.type==='shuttle')assert.equal($('pilotDilation').textContent,formatFlightDilation(lifetimeLag));$('pilotStop').click();
 }
 pilot.dispose();r.dispose();
}
const css=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');assert.match(css,/\.pilot-shuttle .*linear-gradient\(to right,#78b9df 0%,#78b9df 40%,#a74b59 40%,#a74b59 100%\)/);assert.match(css,/::\-moz-range-progress\{height:5px;background:transparent\}/);assert.match(css,/\.site-header #mathNav\{font-size:17px;font-weight:800/);
console.log('PASS: Drive centered behind Shuttle / beside Enterprise across desktop/mobile aspect ratios, centered orbit return throughout blend, nanosecond cumulative dilation/reset, Enterprise lag hidden, 10g control and sustained-load indicator. Projection/DOM contracts; browser layout not emulated.');

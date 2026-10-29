import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
const sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),unit=a=>a.map(x=>x/Math.hypot(...a));
const preset=SCENE_PRESETS.find(p=>p.id==='solar-system');assert.equal(preset.objects[preset.camera.focusIndex].type,'shuttle');
for(const Class of [BlackHoleRenderer,CpuRenderer])for(const [width,height] of [[1280,800],[390,720]]){
 const f=fixture({width,height}),canvas=Class===CpuRenderer?new CpuCommandCanvas():f.canvas;if(Class===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Class(canvas,{autoStart:false,bindControls:false});r.loadScene('solar-system');
 const byName=n=>r.objects.find(o=>o.name===n),earth=byName('Earth'),moon=byName('Moon'),shuttle=byName('NASA Shuttle'),ship=byName('Starship Enterprise'),iss=byName('ISS');
 assert.equal(r.objects.length,518);assert.equal(r.selectedId,shuttle.id);assert.equal(r.focusId,shuttle.id);assert.equal(r.focusMode,'track');assert.equal(shuttle.parentId,earth.id);assert.equal(iss.parentId,earth.id);assert.equal(ship.parentId,moon.id);assert(!r.state.warp);assert(!ship.warpEnabled);
 const frame=o=>r.getFocusFrame(o.id),ef=frame(earth),mf=frame(moon),sf=frame(ship),shf=frame(shuttle),earthToMoon=sub(mf.position,ef.position),moonToShip=sub(sf.position,mf.position);
 assert(dot(unit(earthToMoon),unit(moonToShip))>.999999,'Enterprise begins beyond lunar far side relative to Earth');
 assert(Math.abs(Math.hypot(...moonToShip)*REFERENCE_RG_METERS-3600000)<.01);assert(Math.hypot(...moonToShip)>2*mf.radius,'Ship parks outside twice the lunar radius');
 assert(Math.abs(Math.hypot(...sub(shf.position,ef.position))*REFERENCE_RG_METERS-6751000)<.01);
 assert(dot(unit(sub(shf.position,ef.position)),unit(sub(frame(byName('Sun')).position,ef.position)))>.7,'Opening Shuttle orbit is on the daylit side of Earth');
 const sight=sub(ef.position,r.cameraFrame.observer),earthAngle=Math.acos(Math.max(-1,Math.min(1,dot(unit(sight),r.cameraFrame.forward)))),earthRadius=Math.asin(ef.radius/Math.hypot(...sight));
 assert(earthAngle-earthRadius<.2,'Earth limb appears behind the physically sized shuttle');assert(r.validateFrameGeometry());
 const initial=[...sf.position];r.time+=100;r.fillObjects();assert(Math.hypot(...sub(frame(ship).position,initial))>0,'Enterprise uses a real prescribed lunar orbit, not a detached static point');r.dispose();
}
console.log('PASS: selected Shuttle in Earth orbit with Earth backdrop, lunar far-side Enterprise parking orbit and warp off, all518bodies retained in desktop/mobile GPU/CPU geometry.');

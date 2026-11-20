import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {janusAperture} from '../dist/janus-aperture.js';
import {createOpticalContext} from '../dist/optical-projection.js';

for(const Renderer of [BlackHoleRenderer,CpuRenderer])for(const scene of ['binary','solar-system']){
 const view=fixture(),r=new Renderer(view.canvas,{autoStart:false,bindControls:false});
 try{
  r.loadScene(scene);r.sceneLoad=null;r.state.paused=false;r.update({nebula:true,annotations:true});
  const earth=r.objects.find(o=>o.name==='Earth');
  const p=r.addChildObject(earth?.id||'space','janusPod',earth?{orbitMeters:13e6}:{x:1e12});
  r.focusTarget(p.id,'track');r.setNavigationMode(p.id,'manual');r.setPodPropulsion(p.id,'impulse');r.lastTime=1000; // Sample local gravity outside the protective parking field.
  const tick=()=>{for(let i=0;i<65;i++)r.advanceSimulation(r.lastTime+100);r.fillHoles();r.fillObjects();r.updateCameraFrame();};
  const sky=()=>janusAperture(r,r.cameraFrame,960,632).side;
  const clock=()=>r.getObjectClock(p.id);
  const oldSky=sky();assert.equal(oldSky,0);assert(clock().gravityExcess>0);assert(r.clockSources().length);
  assert(r.startJanusExchange(p.id,{addressLy:[120,400,250],label:'Survey coordinate'}));tick();
  assert.equal(r.lastJanusView,'deep');assert.notEqual(sky(),oldSky);assert.deepEqual(r.objectFrames.map(b=>b.id),[p.id]);
  const display=r.displayState();assert(!display.nebula&&!display.blackHole&&!display.binary&&!display.disk);
  if(Renderer===BlackHoleRenderer){r.setDrawUniforms();const holes=view.uniforms.get('uHoles[0]').args[0];assert.equal(holes[3],0);assert.equal(holes[7],0);assert.equal(view.uniforms.get('uFlags2').args[1],0);}
  assert.equal(createOpticalContext(r).holes.length,0);assert.equal(r.clockSources().length,0);
  assert.equal(clock().gravityExcess,0);assert.equal(clock().horizonGapMeters,null);assert.equal(r.getHorizonProximity(p.id),null);
  assert.deepEqual(r.getFlightState().position,[0,0,0]);assert.equal(r.getFlightState().speed,0);
  assert(r.startJanusExchange(p.id,earth?.id||'janus-departure'));tick();
  if(Renderer===BlackHoleRenderer)r.setDrawUniforms();
  assert.equal(sky(),oldSky);assert(r.displayState().nebula&&r.clockSources().length);assert(clock().gravityExcess>0);
  if(scene==='binary'){assert.equal(createOpticalContext(r).holes.length,2);assert(r.displayState().disk);assert(r.getHorizonProximity(p.id));}
  else assert(r.objectFrames.find(o=>o.id===earth.id));
 }finally{r.dispose();}
}
console.log('PASS: manual deep-space exchanges from binary and planetary scenes isolate proper time, geometry, lenses, and nebulae, then restore the original sky and gravity on GPU and CPU.');

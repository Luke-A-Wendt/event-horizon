// Cross-feature regression checks. These exercise the real renderer state and
// recorded GPU uniforms, not a browser or GPU implementation.
import assert from 'node:assert/strict';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { DEFAULTS } from '../dist/config.js';
import { REFERENCE_RG_METERS } from '../dist/objects.js';
import { fixture } from './render-fixture.mjs';

const f=fixture(),errors=[];
const renderer=new BlackHoleRenderer(f.canvas,{onError:error=>{if(error)errors.push(error);}});
const close=(a,b,tolerance=1e-8)=>assert(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);
const renderAt=time=>{renderer.time=time;renderer.render();return renderer.getState();};
const uniform=name=>f.uniforms.get(name)?.args;
const entry=id=>renderer.getObjects().find(object=>object.id===id);
const angle=object=>Math.atan2(object.position[2],object.position[0]);

// Editing one body preserves its current orbital phase and its neighbor;
// deleting a neighbor must not interrupt the selected body's tracking camera.
renderer.update({...DEFAULTS,objectScaleMode:'physical'});
const first=renderer.addObject('shuttle',12,.4,1),second=renderer.addObject('astronaut',15,1.8,1);
renderAt(7);
const secondBefore=entry(second.id),firstPhase=entry(first.id).phase;
assert(renderer.focusObject(first.id,'track'));
renderer.updateObject(first.id,{radius:18,height:2.5,scale:2});
renderAt(7);
close(entry(first.id).phase,firstPhase);
assert.equal(entry(first.id).radius,18);assert.equal(entry(first.id).height,2.5);assert.equal(entry(first.id).scale,2);
assert.deepEqual(entry(second.id).position,secondBefore.position);
assert(renderer.removeObject(second.id));
assert.equal(renderer.getState().focusId,first.id);
assert.equal(renderer.getObjects().length,1);
assert.equal(renderer.updateObject('missing',{scale:3}),false);
assert.equal(renderer.removeObject('missing'),false);

// Physical sizes remain in meters when the central mass changes; the camera
// follows the body's new orbital position without converting it into a giant.
const physicalRadius=renderer.objectFrames.find(object=>object.id===first.id).radius;
renderer.update({mass:8.6});renderer.render();
close(renderer.objectFrames.find(object=>object.id===first.id).radius,physicalRadius,1e-16);
close(entry(first.id).lengthMeters,74.48);
close(entry(first.id).renderRadiusMeters,physicalRadius*REFERENCE_RG_METERS,1e-6);
assert.equal(uniform('uInspectIndex')[0],renderer.objectFrames.find(object=>object.id===first.id).index);
renderer.focusObject(first.id,'onboard');renderer.render();
assert.equal(uniform('uInspectIndex')[0],-1);
assert.equal(uniform('uHideObjectIndex')[0],renderer.objectFrames.find(object=>object.id===first.id).index);
const observer=uniform('uObserver')[0].slice();
renderer.look('outward');renderer.render();assert.deepEqual(uniform('uObserver')[0],observer);
renderer.removeObject(first.id);renderer.render();assert.equal(renderer.getState().focusId,null);
assert.equal(uniform('uHideObjectIndex')[0],-1);

for(const scaleMode of ['illustrative','physical']){
 renderer.update({objectScaleMode:scaleMode});
 for(const scenario of ['isolated','orbit','excursion']){
  renderer.loadWarpScenario(scenario);let state=renderAt(0);
  assert.equal(state.objects.length,1);assert.equal(state.objects[0].type,'enterprise');
  assert.equal(state.warpObjectId,state.objects[0].id);assert.equal(state.selectedId,state.warpObjectId);
  assert.equal(state.objectScaleMode,'physical','Legacy inflated-scale requests must normalize to physical dimensions');
  const id=state.warpObjectId,initial=entry(id).position.slice();
  if(scenario==='isolated'){
   assert.equal(state.blackHole,false);assert.equal(state.disk,false);assert.equal(state.binary,false);
   const beforePhase=entry(id).phase;
   renderAt(15);assert.notDeepEqual(entry(id).position,initial,'Isolated warp ship must travel forward');close(entry(id).phase,beforePhase);
  }else if(scenario==='orbit'){
   assert.equal(state.blackHole,true);renderAt(3);assert.notDeepEqual(entry(id).position,initial);
  }else{
   let minimum=Infinity;
   for(let i=0;i<=40;i++){
    renderAt((2*Math.PI/.16)*i/40);
    const centerDistance=Math.hypot(...entry(id).position),bubbleRadius=uniform('uWarpRadius')[0];
    assert(centerDistance-bubbleRadius>renderer.configCache.horizon[0],'Complete excursion bubble must remain outside the horizon');
    minimum=Math.min(minimum,centerDistance);
   }
   close(Math.hypot(...entry(id).position),Math.hypot(...initial),1e-6);
   assert(minimum<Math.hypot(...initial)-1,'Excursion must actually approach and return');
   renderAt(8);const beforeAngle=angle(entry(id));
   renderer.updateObject(id,{scale:1.5});renderer.render();close(angle(entry(id)),beforeAngle,1e-7);
  }
  renderer.update({warpFactor:10});renderer.render();
  assert.equal(uniform('uWarpFlags')[0],1);assert(uniform('uWarpStrength')[0]<=3);
  for(const record of f.uniforms.values())assert(record.args.flat(3).filter(value=>typeof value==='number').every(Number.isFinite),'Warp10 must not put infinities into GPU uniforms');
  renderer.update({warpFactor:0});renderer.render();assert.equal(uniform('uWarpStrength')[0],0);assert.equal(renderer.getObjects().length,1);
  renderer.clearObjects();renderer.update({starDensity:1.2});renderer.render();
  assert.equal(renderer.getObjects().length,0,'Changing the environment must not respawn a cleared warp ship');
  assert.equal(renderer.state.warp,false);
 }
}
assert.equal(errors.length,0);renderer.dispose();
console.log('PASS: individual edits and deletion while tracking, physical size under mass changes, onboard gaze isolation, all three warp scenario transitions, outside-horizon excursion, finite Warp10, and stable clear-all behavior.');

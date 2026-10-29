import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS,OBJECT_DIMENSIONS} from '../dist/objects.js';

const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});
r.loadScene('solar-system');
const earth=r.objects.find(o=>o.name==='Earth');
r.focusTarget(earth.id,'track');r.selectObject(earth.id);
for(const time of [0,10,10000]){
 r.time=time;r.fillHoles();r.fillObjects();r.updateCameraFrame();
 const objects=r.getObjects(),targets=r.getSceneTargets(objects);
 assert.equal(objects.length,518);assert.equal(targets.length,518);
 for(let i=0;i<objects.length;i++){
  const raw=r.objects[i],object=objects[i],target=targets[i],frame=r.frameById.get(raw.id);
  assert.equal(object.id,raw.id);assert.equal(object.label,raw.name);
  assert.deepEqual(object.position,frame.position);
  assert.equal(object.renderRadiusMeters,r.objectRadius(raw)*REFERENCE_RG_METERS);
  assert.equal(object.lengthMeters,raw.radiusMeters?object.renderRadiusMeters*OBJECT_DIMENSIONS[raw.type].normalizedExtent:OBJECT_DIMENSIONS[raw.type].lengthMeters*raw.scale);
  assert.equal(object.headingDegrees,object.phase*180/Math.PI);
  assert.equal(object.selected,raw.id===earth.id);assert.equal(object.focused,raw.id===earth.id);
  assert.equal(target.kind,raw.type);assert.equal(target.id,object.id);assert.equal(target.enabled,true);
  // UI decoration and mutations must not leak into the simulation catalog.
  assert(!Object.hasOwn(raw,'screenRadius'));assert(!Object.hasOwn(raw,'canTrack'));
  object.position[0]=NaN;assert(Number.isFinite(frame.position[0]));
 }
}
r.dispose();
console.log('PASS: all 518 UI catalog entries preserve physical sizes, names, phases, live positions, selection, camera targets, and snapshot isolation across three epochs.');

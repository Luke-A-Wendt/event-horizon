import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {fixture} from './render-fixture.mjs';
const f=fixture({width:390,height:720}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.loadScene('solar-system');r.sceneLoad?.complete(r.sceneLoad.revision);r.lastTime=1000;
const ship=r.objects.find(o=>o.type==='shuttle'),moon=r.objects.find(o=>o.name==='Moon');
r.setFreeDrive(ship.id,true);assert(r.startTravel(moon.id));
function advance(ms){r.advanceSimulation(r.lastTime+ms);r.fillHoles();r.fillObjects();r.updateCameraFrame();}
advance(2400);
const saved=snapshotRenderer(r),frame=structuredClone(r.focusReferenceFrame),observer=[...r.cameraFrame.observer];
assert.equal(frame.id,ship.id);r.focusReferenceFrame=null;restoreRenderer(r,saved);assert.deepEqual(r.focusReferenceFrame,frame);assert.deepEqual(r.cameraFrame.observer,observer);
for(const value of [parseScene(serializeScene(r))]){assert.deepEqual(value.focusReferenceFrame,frame);assert.equal(value.transfer,null,'Saved scenes stop automatic guidance while retaining the view');}
advance(7600);assert.equal(r.getTravelState().phase,'Arrived');const arrived=parseScene(serializeScene(r));assert.deepEqual(arrived.focusReferenceFrame,r.focusReferenceFrame);
const text=serializeScene(r);assert.throws(()=>parseScene(text.replace(/(focusReferenceFrame:\n\s+id: )[^\n]+/, '$1"space"')),/stabilized camera/);
r.focusTarget(ship.id,'onboard');assert.equal(r.focusReferenceFrame,null);assert.doesNotThrow(()=>serializeScene(r));
restoreRenderer(r,arrived);r.setViewMode('free');assert.equal(r.focusReferenceFrame,null);assert.doesNotThrow(()=>serializeScene(r));
r.loadScene('disk');assert.equal(r.focusReferenceFrame,null);assert.doesNotThrow(()=>serializeScene(r));r.dispose();
console.log('PASS: stabilized travel camera survives render-worker and YAML round trips, malformed references fail validation, explicit view/scene changes clear it.');

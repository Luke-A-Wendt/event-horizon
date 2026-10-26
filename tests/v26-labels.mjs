import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {captureAnnotationFrame} from '../dist/annotations.js';
import {holeDisplayName} from '../dist/config.js';
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});
for(const scene of ['mixed-merger','mixed-pair-geometry','white-hole','grid-binary']){
 r.loadScene(scene);r.render();
 for(const id of r.state.binary?['primary','secondary']:['primary']){
  const index=id==='secondary'?1:0,expected=holeDisplayName(r.state,index);
  assert.equal(r.getObjectTree().find(o=>o.id===id).label,expected);
  assert.equal(r.getSceneTargets().find(o=>o.id===id).label,expected);
  assert.equal(r.getFocusFrame(id).label,expected);
 }
 const frame=captureAnnotationFrame(r);
 assert(frame,'label frame exists');
 const json=JSON.stringify(frame);
 if(r.state.secondaryWhiteHole)assert(json.includes('White hole B'));
 if(r.state.whiteHole)assert(json.includes('White hole A'));
}
r.loadScene('mixed-pair-geometry');r.update({secondaryName:'Janus'});
assert.equal(r.getObjectTree().find(o=>o.id==='secondary').label,'Janus');
assert.equal(r.getFocusFrame('secondary').label,'Janus');
r.loadScene('sagittarius-a');assert.match(r.getFocusFrame('primary').label,/Sagittarius/);
r.dispose();
console.log('PASS: white-hole identity is consistent in tree, map/camera targets, focus and projected labels; custom and astronomical names remain intact.');

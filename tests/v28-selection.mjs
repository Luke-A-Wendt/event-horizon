import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {captureAnnotationFrame} from '../dist/annotations.js';
import {mapModel,renderOrbitMap} from '../dist/orbit-map.js';

const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
for(const ratio of [1,.5,2]){
 r.loadScene('mixed-merger');r.update({binaryRatio:ratio});r.time=r.state.mergerDuration;r.fillHoles();r.fillObjects();r.updateCameraFrame();r.render();
 const payload=captureAnnotationFrame(r);
 assert.deepEqual(payload.holes.map(b=>b.id),ratio===1?[]:[ratio<1?'primary':'secondary']);
 if(ratio!==1){const id=ratio<1?'primary':'secondary',model=mapModel(r,id);assert(Math.abs(model.host.massSolar-r.massScale*Math.abs(1-ratio)*4.3e6)<1,'Map shows the remaining field mass, not its initial value');}
}
r.loadScene('dyson-garden');
const star=r.objects.find(o=>o.type==='star'),shell=r.objects.find(o=>o.type==='dyson');assert(star&&shell);
const model=mapModel(r,star.id);assert(model.attachments.some(b=>b.id===shell.id));assert(!model.children.some(b=>b.id===shell.id));
for(const viewportWidth of [360,900]){
 const map=renderOrbitMap(model,{viewportWidth,annotations:true,selectedId:shell.id});
 assert(map.svg.includes('class="map-body map-shell"'));assert(map.svg.includes(`data-map-object="${shell.id}"`));assert(map.svg.includes('pointer-events="stroke"'));assert(map.svg.includes(shell.name));
 assert.equal(map.selected.id,shell.id);assert.equal(map.selected.distanceMeters,0,'Map retains the concentric attachment relationship');
}
r.dispose();
console.log('PASS: vanished compact bodies have no locator/pick, either unequal residual stays selectable with its remaining mass; Dyson shell has an accessible labeled thin-radius map outline on desktop/mobile.');

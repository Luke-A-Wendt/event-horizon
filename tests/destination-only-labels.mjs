import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {captureAnnotationFrame,installAnnotations} from '../dist/annotations.js';
import {makePreset} from '../dist/config.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';

const f=fixture(),r=new BlackHoleRenderer(f.canvas,{bindControls:false,autoStart:false,deferProgram:true});
let layer;
document.createElementNS=()=>layer={style:{},setAttribute(){},remove(){}};
const ui=installAnnotations({append(){},getBoundingClientRect:()=>({width:390,height:780})},()=>r);
const renderedLabels=()=>[...layer.innerHTML.matchAll(/data-object-id="([^"]+)"/g)].map(m=>m[1]);
try{
 const stops={'solar-system':'Sun','enterprise-solar-tour':'Sun','janus-solar-tour':'Earth','shuttle-earth-moon-loop':'Earth','shuttle-earth-mars-loop':'Earth','earth-mars-station-ferry':'Earth Station'};
 for(const [id,name] of Object.entries(stops)){
  r.loadScene(id);r.fillObjects();r.updateCameraFrame();
  assert(r.state.destinationOnlyLabels&&r.state.annotations,id);
  const frame=captureAnnotationFrame(r);ui.update(frame);assert.equal(frame.destinationBearing.name,name,id);
  assert.deepEqual(renderedLabels(),[frame.destinationId],id+' opening orbit');
 }
 assert.equal(makePreset('solar-system-natural').destinationOnlyLabels,false);
 const file=serializeScene(r);assert.equal(parseScene(file).state.destinationOnlyLabels,true);
 const legacy=file.replace(/^  destinationOnlyLabels: true\n/m,'');assert.equal(parseScene(legacy).state.destinationOnlyLabels,false);

 // A projected neighbor remains pickable while an off-screen destination gets
 // the sole visible label. Disabling the filter restores the neighbor label.
 const frame={kind:'annotation-frame',sceneRevision:10,annotations:true,destinationOnlyLabels:true,destinationId:'moon',
  destinationBearing:{id:'moon',type:'moon',name:'Moon',position:[0,0,-1]},localWorldBearing:{id:'earth',name:'Earth',position:[1,1,-1]},
  cameraFrame:{observer:[0,0,0],forward:[0,0,1],right:[1,0,0],up:[0,1,0]},
  objectFrames:[{id:'earth',type:'planet',name:'Earth',radius:.02,anchor:{x:0,y:0,z:1}}]};
 ui.update(frame);assert.deepEqual(renderedLabels(),['moon']);assert.equal(ui.pick(195,390).id,'earth');
 frame.destinationOnlyLabels=false;ui.update(frame);assert.deepEqual(new Set(renderedLabels()),new Set(['earth','moon']));
}finally{ui.dispose();r.dispose();}
console.log('PASS: destination-only labels, solar tour defaults, off-screen targets, object picking and saved display preferences.');

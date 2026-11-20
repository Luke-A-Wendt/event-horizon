import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
try{
 r.loadScene('empty-space');r.setViewMode('free');r.freePosition=[3,4,0];r.updateCameraFrame();assert.equal(r.getState().cameraDistanceMeters,5*RG);
 r.loadScene('bridge');r.focusTarget('bridge','track',true);r.updateCameraFrame();
 const f=r.getFocusFrame(),d=Math.hypot(...r.cameraFrame.observer.map((x,i)=>x-f.position[i]))*RG;
 assert(d>0&&Math.abs(r.getState().cameraDistanceMeters-d)<d*1e-12);
}finally{r.dispose();}
console.log('PASS: free camera reports its actual origin distance; tracked throat reports its coordinate offset.');

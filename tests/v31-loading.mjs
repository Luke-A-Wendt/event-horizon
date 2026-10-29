import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {installRenderWorker} from '../dist/render-worker.js';
import {snapshotRenderer} from '../dist/render-state.js';

const f=fixture({parallelCompile:true,compileComplete:false}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
const old=r.pendingProgram;r.loadScene('bridge');r.render(1);
assert.notEqual(r.pendingProgram,old,'A new scene does not await an abandoned compile');
assert(r.pendingProgram.features.bridge);assert.equal(r.pendingProgram.features.objectSlots,2);
f.control.compileComplete=true;r.render(20);r.render(40);assert(r.activeProgram.features.bridge);
assert.equal(f.uniforms.get('uObjects[0]').args[0].length,8,'Uploads match the specialized array capacity');
r.loadScene('solar-system');assert.equal(r.shaderFeatures().objectSlots,12);r.render(60);r.render(80);assert.equal(r.objects.length,518);
assert(r.objectCount<=12);assert.equal(f.uniforms.get('uObjects[0]').args[0].length,48);
// Small presets do not compile twelve copies of body/craft intersections.
for(const scene of ['disk','warp-lab','bridge','gravity-anomaly']){r.loadScene(scene);assert.equal(r.shaderFeatures().objectSlots,2);}
const snapshot=snapshotRenderer(r);r.dispose();
const wf=fixture(),messages=[];const worker=installRenderWorker({postMessage:m=>messages.push(m),addEventListener(){},close(){}});
await worker.handle({type:'init',canvas:wf.canvas,viewport:{width:640,height:400,dpr:1},snapshot,presentationPaused:true});
assert(worker.renderer.presentationPaused);assert.equal(wf.sources.length,0);
assert.equal(worker.renderer.render(100),false,'Initial gallery does not compile/draw behind its overlay');
await worker.handle({type:'state',serial:1,snapshot,signature:'ready',presentationPaused:false});worker.renderer.render(200);assert(wf.sources.length>0);
await worker.handle({type:'dispose'});
console.log('PASS: abandoned compile replacement, 2/12-slot packing/uploads, all 518 catalog objects retained, initial gallery prevents shader work.');

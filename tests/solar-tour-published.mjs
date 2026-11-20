import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fixture} from './render-fixture.mjs';
import {publishedWorker} from './published-worker-fixture.mjs';

// Exercise the *packaged* foreground simulation as well as the worker. Stop
// just before the DOM entrypoint: all dependencies and their exports have
// exactly the scope/values they have in the hosted page.
const path=new URL('../dist/',import.meta.url);
const read=file=>readFileSync(new URL(file,path),'utf8');
const entry=JSON.parse(read('assets/entry-manifest.json')).current.find(n=>n.startsWith('entry-app-'));
assert(read('index.html').includes(entry),'The entry under test must be served.');
const web=read('assets/'+entry),end=web.lastIndexOf('// Module: app.js\n');
assert(end>0);
const f=fixture({width:900,height:660}),scope={window:globalThis.window,document:globalThis.document,ResizeObserver:globalThis.ResizeObserver,requestAnimationFrame:()=>1,cancelAnimationFrame(){},performance,structuredClone,AbortController,setTimeout,clearTimeout,console};
vm.runInNewContext(web.slice(0,end)+'globalThis.release={R:__modules["renderer.js"].BlackHoleRenderer,snapshot:__modules["render-state.js"].snapshotRenderer,presets:__modules["config.js"].SCENE_PRESETS};})();',scope,{filename:entry});
const {R,snapshot,presets}=scope.release;
assert(!presets.some(p=>p.id==='kardashev-2'),'The public scene catalog must no longer list Type II.');
assert(presets.some(p=>p.id==='kardashev-1'));assert(presets.some(p=>p.id==='janus-solar-tour'));
const r=new R(f.canvas,{bindControls:false,autoStart:false,deferProgram:true});
const gpu=publishedWorker(false,900,660),cpu=publishedWorker(true,390,700);
function present(label){r.fillHoles();r.fillObjects();r.updateCameraFrame();assert(r.validateFrameGeometry(),r.geometryError);const s=snapshot(r);gpu.present(s,label);cpu.present(s,label);}
try{
 r.loadScene('kardashev-1');present('Type I Earth');
 r.loadScene('janus-solar-tour');assert(r.objects.length>=500,'Full Solar System hierarchy was not initialized.');
 const pod=r.objects.find(o=>o.hullModel==='janusPod'),get=()=>r.getJanusBridge(pod.id),byId=id=>r.objectById.get(id).name;
 assert.equal(r.focusId,pod.id);assert.equal(get().currentLabel,'Earth');assert.deepEqual(Array.from(r.getFlightSequence(pod.id).nodes.slice(0,2),n=>byId(n.targetId)),['Earth','Moon']);
 assert(r.state.paused&&r.state.warp&&r.state.warpFactor>0);present('Janus parked above Earth');
 r.sceneLoad=null;r.update({paused:false});r.lastTime=1000;
 let swept=0,prev=r.currentPhase(pod),seen=new Set(),arrival=false;
 for(let i=1;i<=350;i++){
  r.advanceSimulation(1000+100*i);r.fillObjects();
  const s=get(),phase=r.currentPhase(pod);
  if(s.currentLabel==='Earth'){
   const step=(phase-prev+3*Math.PI)%(2*Math.PI)-Math.PI;
   swept+=Math.abs(step);
  }
  prev=phase;
  if(s.stage==='charge'&&!seen.has('charge')){
   assert(Math.abs(swept-2*Math.PI)<.12,'Charging began before/after one complete Earth parking orbit: '+swept);
   present('Earth to Moon aperture');seen.add('charge');
  }
  if(s.stage==='settle'&&!seen.has('settle')){assert.equal(s.currentLabel,'Moon');present('Moon arrival');seen.add('settle');}
  if(s.exchanges===1&&s.stage==='orbit'){
   assert.equal(s.currentLabel,'Moon');assert.equal(pod.parentId,r.objects.find(o=>o.name==='Moon').id);
   assert(r.state.warp&&r.state.warpFactor>0);assert(r.getObjectClock(pod.id).properSeconds>0);
   present('Moon parking orbit');arrival=true;break;
  }
 }
 assert.deepEqual([...seen],['charge','settle']);assert(arrival,'Automatic player never arrived.');
}finally{gpu.dispose();cpu.dispose();r.dispose();}
console.log('PASS: shipped Type I and catalog, full Janus system, one Earth warp orbit, bridge, Moon warp orbit and matching finite desktop/mobile frames.');

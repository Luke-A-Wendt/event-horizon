import assert from 'node:assert/strict';
import {Worker as ThreadWorker} from 'node:worker_threads';
import {SCENE_FILE_WORKER_SOURCE} from '../dist/scene-file-worker-bundle.js';
import {createSceneFileService} from '../dist/scene-file-service.js';
import {serializeScene,parseScene,prepareSceneFile,SCENE_FILE_VERSION} from '../dist/scene-file.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene('solar-system');const large=prepareSceneFile(r);
const code=`const {parentPort,workerData}=require('node:worker_threads');globalThis.addEventListener=(name,handler)=>parentPort.on('message',data=>handler({data}));globalThis.postMessage=value=>parentPort.postMessage(value);eval(workerData);parentPort.postMessage({ready:true});`;
const thread=new ThreadWorker(code,{eval:true,workerData:SCENE_FILE_WORKER_SOURCE});
const wait=predicate=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{thread.off('message',receive);reject(new Error('Scene file worker timed out'));},5000),receive=message=>{if(predicate(message)){clearTimeout(timeout);thread.off('message',receive);resolve(message);}};thread.on('message',receive);});
await wait(m=>m.ready);let ticks=0,timer=setInterval(()=>ticks++,5);let response=wait(m=>m.id===1);thread.postMessage({id:1,operation:'serialize',...large});const saved=await response;clearInterval(timer);assert(saved.ok);assert(saved.value.length>64000);assert(ticks>=2,'Page tasks remain available during large scene serialization');
ticks=0;timer=setInterval(()=>ticks++,5);response=wait(m=>m.id===2);thread.postMessage({id:2,operation:'parse',text:saved.value});const parsed=await response;clearInterval(timer);assert(parsed.ok);assert.equal(parsed.value.objects.length,517);assert(ticks>=2,'Page tasks remain available during large scene parsing');
response=wait(m=>m.id===3);thread.postMessage({id:3,operation:'parse',text:saved.value.replace(`version: "${SCENE_FILE_VERSION}"`,'version: "wrong"')});const invalid=await response;assert(!invalid.ok);assert.match(invalid.error.message,/Cannot load: Scene version/);await thread.terminate();
// Service cleanup and one-job-at-a-time behavior use a recording Worker double.
const previousWorker=globalThis.Worker,created=[];
class BrowserWorker{constructor(url){assert(url.startsWith('blob:'));this.listeners={};created.push(this);}addEventListener(name,fn){this.listeners[name]=fn;}postMessage(value){this.message=value;}terminate(){this.terminated=true;}reply(value){this.listeners.message?.({data:{id:this.message.id,...value}});}}
globalThis.Worker=BrowserWorker;const service=createSceneFileService();let promise=service.parse(saved.value),worker=created.at(-1);assert.equal(worker.message.operation,'parse');worker.reply({ok:true,value:parsed.value});assert.equal((await promise).objects.length,517);assert(worker.terminated);
promise=service.serialize(r);worker=created.at(-1);assert.equal(worker.message.snapshot.objects.length,517);assert(!JSON.stringify(worker.message).includes('data:image'));worker.reply({ok:true,value:saved.value});assert.equal(await promise,saved.value);assert(worker.terminated);
const old=service.parse(saved.value),rejected=assert.rejects(old,{name:'AbortError'}),oldWorker=created.at(-1),newer=service.parse(saved.value);await rejected;assert(oldWorker.terminated);worker=created.at(-1);oldWorker.reply({ok:true,value:{bad:true}});worker.reply({ok:true,value:parsed.value});assert.equal((await newer).objects.length,517);
promise=service.parse(saved.value);const closed=assert.rejects(promise,{name:'AbortError'});worker=created.at(-1);service.dispose();await closed;assert(worker.terminated);await assert.rejects(service.parse(saved.value),{name:'AbortError'});
// A browser without Worker support is allowed only tightly bounded files/scenes.
globalThis.Worker=undefined;const fallback=createSceneFileService();await assert.rejects(fallback.parse(saved.value),/Web Workers enabled/);await assert.rejects(fallback.serialize(r),/Web Workers enabled/);r.loadScene('disk');const small=await fallback.serialize(r);assert.deepEqual(await fallback.parse(small),parseScene(small));fallback.dispose();
globalThis.Worker=class{constructor(){throw Error('Blocked');}};const blocked=createSceneFileService();assert.equal((await blocked.parse(small)).sceneId,'disk');await assert.rejects(blocked.parse(saved.value),/Web Workers enabled/);blocked.dispose();
globalThis.Worker=previousWorker;r.dispose();console.log('PASS: separate real-thread YAML serialization/parsing, responsive main loop, structured version failures, service cancellation/disposal, one-job resource bounds and small-only no-worker fallback.');

import { MAX_SCENE_FILE_BYTES, parseScene, prepareSceneFile, serializeSceneData } from './scene-file.js';
import { SCENE_FILE_WORKER_SOURCE } from './scene-file-worker-bundle.js';
const SMALL_FILE_BYTES=64*1024,SMALL_SCENE_OBJECTS=32,DEADLINE_MS=20000;
const abortError=()=>Object.assign(new Error('Scene file operation cancelled.'),{name:'AbortError'});
export function createSceneFileService(){
 let active=null,serial=0,disposed=false;
 const cancel=()=>{if(active){const task=active;active=null;task.finish(abortError());}};
 const run=(operation,payload)=>new Promise((resolve,reject)=>{
  if(disposed){reject(abortError());return;}cancel();
  if(operation==='parse'&&(typeof payload.text!=='string'||payload.text.length>MAX_SCENE_FILE_BYTES)){reject(new Error('Cannot load: Choose a YAML scene file smaller than 4 MB.'));return;}
  let worker=null,url=null,timeout=null,settled=false;const task={id:++serial,finish(error,value){if(settled)return;settled=true;clearTimeout(timeout);worker?.terminate();if(url)URL.revokeObjectURL(url);if(active===task)active=null;error?reject(error):resolve(value);}};active=task;
  const fallback=()=>{
   const large=operation==='parse'?payload.text.length>SMALL_FILE_BYTES||new TextEncoder().encode(payload.text).length>SMALL_FILE_BYTES:payload.snapshot.objects.length>SMALL_SCENE_OBJECTS;
   if(large){task.finish(new Error('Cannot '+(operation==='parse'?'load':'save')+': This larger scene needs a browser with Web Workers enabled.'));return;}
   // The small fallback yields a paint before its tightly bounded work.
   timeout=setTimeout(()=>{try{task.finish(null,operation==='parse'?parseScene(payload.text):serializeSceneData(payload.snapshot,payload.nodes));}catch(error){task.finish(error);}},0);
  };
  if(typeof Worker!=='function'||typeof Blob!=='function'||typeof URL?.createObjectURL!=='function'){fallback();return;}
  try{
   url=URL.createObjectURL(new Blob([SCENE_FILE_WORKER_SOURCE],{type:'text/javascript'}));worker=new Worker(url,{name:'event-horizon-scene-file'});URL.revokeObjectURL(url);url=null;
   worker.addEventListener('message',event=>{const reply=event.data;if(reply?.id!==task.id)return;if(reply.ok)task.finish(null,reply.value);else task.finish(Object.assign(new Error(reply.error?.message||'Cannot load: Invalid scene file.'),{name:reply.error?.name||'SceneFileError'}));});
   worker.addEventListener('error',()=>task.finish(new Error('The scene-file worker stopped. Your current scene is unchanged; please retry.')));
   timeout=setTimeout(()=>task.finish(new Error('Scene file processing timed out. Your current scene is unchanged.')),DEADLINE_MS);
   worker.postMessage({id:task.id,operation,...payload});
  }catch(error){worker?.terminate();worker=null;if(url){URL.revokeObjectURL(url);url=null;}clearTimeout(timeout);fallback();}
 });
 return{serialize(renderer){let payload;try{payload=prepareSceneFile(renderer);}catch(error){return Promise.reject(error);}return run('serialize',payload);},parse(text){return run('parse',{text});},cancel,dispose(){disposed=true;cancel();}};
}

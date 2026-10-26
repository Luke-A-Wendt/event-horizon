// Separate from the renderer: a slow GPU driver cannot delay file validation.
import { parseScene, serializeSceneData } from './scene-file.js';
export function installSceneFileWorker(scope){
 scope.addEventListener('message',event=>{
  const message=event.data;if(!message||!Number.isSafeInteger(message.id))return;
  try{let value;if(message.operation==='parse')value=parseScene(message.text);else if(message.operation==='serialize')value=serializeSceneData(message.snapshot,message.nodes);else throw new Error('Unsupported scene file operation.');scope.postMessage({id:message.id,ok:true,value});}
  catch(error){scope.postMessage({id:message.id,ok:false,error:{name:error?.name||'SceneFileError',message:String(error?.message||'Cannot load: Invalid scene file.').slice(0,1000)}});}
 });
}

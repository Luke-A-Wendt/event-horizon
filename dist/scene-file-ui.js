import { MAX_SCENE_FILE_BYTES } from './scene-file.js';
import { createSceneFileService } from './scene-file-service.js';

const paint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
export function readSceneFile(file){
 if(typeof file.text==='function')return file.text();
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Cannot load: the file could not be read.'));reader.onabort=()=>reject(new Error('Cannot load: reading was cancelled.'));reader.readAsText(file);});
}

// Downloads and file reads stay on this device. Invalid files never reach load().
export function installSceneFiles(api){
 const {saveButton,loadButton,fileInput,status}=api,service=api.service||createSceneFileService();
 let serial=0,disposed=false;
 const message=(text,error=false)=>{if(disposed)return;status.textContent=text;status.dataset.error=String(error);api.onMessage?.(text);};
 const busy=value=>{saveButton.disabled=loadButton.disabled=value;status.setAttribute('aria-busy',String(value));};
 const afterPaint=api.afterPaint||paint;
 async function save(){
  if(disposed)return;const token=++serial;busy(true);message('Preparing scene file…');
  try{
   await afterPaint();if(disposed||token!==serial)return;
   const renderer=api.renderer();if(!renderer)throw new Error('Start a scene before saving.');
   const name=String(renderer.sceneId||'custom').replace(/[^a-z0-9_-]/gi,'-');
   const text=await service.serialize(renderer);if(disposed||token!==serial)return;
   const blob=new Blob([text],{type:'application/yaml;charset=utf-8'}),url=URL.createObjectURL(blob),link=(api.document||document).createElement('a');
   link.href=url;link.download=`event-horizon-${name}.yaml`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
   message('Scene saved as YAML.');
  }catch(error){message(error?.message||'The scene could not be saved.',true);}
  finally{if(token===serial&&!disposed)busy(false);}
 }
 function choose(){fileInput.click();}
 async function load(){
  const file=fileInput.files?.[0];fileInput.value='';if(!file||disposed)return;
  const token=++serial,context=api.context?.();busy(true);message('Reading scene file…');
  try{
   if(file.size>MAX_SCENE_FILE_BYTES)throw new Error('Cannot load: this scene file is too large.');
   if(!/\.ya?ml$/i.test(file.name||''))throw new Error('Cannot load: choose a .yaml or .yml scene file.');
   await afterPaint();const text=await readSceneFile(file);
   if(disposed||token!==serial)return;
   if(api.context&&context!==api.context()){message('Loading cancelled because the scene changed.');return;}
   message('Checking scene compatibility…');const snapshot=await service.parse(text);
   if(disposed||token!==serial)return;
   if(api.context&&context!==api.context()){message('Loading cancelled because the scene changed.');return;}
   const accepted=await api.load(snapshot,file.name);
   if(token===serial&&!disposed)message(accepted===false?'Loading cancelled because the scene changed.':'Scene file accepted. The view will open paused.');
  }catch(error){if(token===serial&&!disposed)message(error?.message?.startsWith('Cannot load')?error.message:'Cannot load: '+(error?.message||'invalid scene file.'),true);}
  finally{if(token===serial&&!disposed)busy(false);}
 }
 saveButton.addEventListener('click',save);loadButton.addEventListener('click',choose);fileInput.addEventListener('change',load);
 return{save,load,dispose(){disposed=true;serial++;service.dispose();saveButton.removeEventListener('click',save);loadButton.removeEventListener('click',choose);fileInput.removeEventListener('change',load);}};
}

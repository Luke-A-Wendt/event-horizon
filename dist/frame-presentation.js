// Only diagnostic frames use this explicit presentation path. Transferred
// ImageBitmaps move GPU-backed storage; there is no readPixels / CPU pixel copy.
// The scene bitmap and its SVG diagnostics are installed in one main-thread task.
export class DiagnosticFramePresenter {
 constructor(canvas){this.canvas=canvas;this.surface=null;this.context=null;this.kind=null;this.serial=0;this.active=false;}
 ensure(){
  if(this.surface)return;
  const surface=document.createElement('canvas');surface.setAttribute('aria-hidden','true');surface.className='scene-presented-frame';surface.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;display:none';
  let context;try{context=surface.getContext('bitmaprenderer');}catch{}
  this.kind=context?'bitmaprenderer':'2d';this.context=context||surface.getContext('2d',{alpha:false});if(!this.context)throw Error('Diagnostic frame presentation is unavailable.');
  this.canvas.after(surface);this.surface=surface;
 }
 present(bitmap,serial,update){
  if(!bitmap)return false;
  if(serial<=this.serial){bitmap.close?.();return false;}
  try{this.ensure();const s=this.surface;if(s.width!==bitmap.width)s.width=bitmap.width;if(s.height!==bitmap.height)s.height=bitmap.height;
   if(this.kind==='bitmaprenderer')this.context.transferFromImageBitmap(bitmap);else this.context.drawImage(bitmap,0,0);
   // No animation-frame callback or throttled telemetry can split this pair.
   update?.();s.style.display='block';this.active=true;this.serial=serial;return true;
  }finally{bitmap.close?.();}
 }
 hide(){if(this.surface)this.surface.style.display='none';this.active=false;}
 dispose(){this.surface?.remove();this.surface=null;this.context=null;this.active=false;}
 async capture(overlay=null,{signal,timeoutMs=8000,onProgress=()=>{}}={}){
  const cancelled=()=>Object.assign(Error('Picture capture cancelled.'),{name:'AbortError'});
  if(signal?.aborted)throw cancelled();
  if(!this.active||!this.surface?.toBlob||!(this.surface.width>0&&this.surface.height>0))throw Error('No presented diagnostic frame is available.');
  const started=performance.now(),deadline=started+Math.max(1,Number.isFinite(timeoutMs)?timeoutMs:8000);
  let warning=null;
  const report=phase=>onProgress({phase,indeterminate:true,elapsedMs:performance.now()-started,...(warning?{warning}:{})});
  // Keep the deadline active through asynchronous SVG loading and PNG encoding.
  // A browser may never invoke either callback; cancellation still owns cleanup.
  const bounded=(start,message,stageDeadline=deadline)=>new Promise((resolve,reject)=>{
   let settled=false,timer;
   const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
   const abort=()=>finish(cancelled());
   if(signal?.aborted){abort();return;}
   signal?.addEventListener('abort',abort,{once:true});
   const remaining=Math.min(deadline,stageDeadline)-performance.now();if(remaining<=0){finish(Error(message));return;}
   timer=setTimeout(()=>finish(Error(message)),remaining);
   try{start(value=>finish(null,value),error=>finish(error));}catch(error){finish(error);}
  });
  const canvas=document.createElement('canvas');canvas.width=this.surface.width;canvas.height=this.surface.height;
  let image=null,url=null;
  try{
   const context=canvas.getContext('2d');if(!context)throw Error('The browser could not allocate a picture canvas.');
   report('Copying the displayed frame…');context.drawImage(this.surface,0,0);
   // Snapshot both layers before yielding, so moving cameras cannot mix frames.
   if(overlay&&overlay.style.display!=='none'&&typeof XMLSerializer==='function'){
    // Labels are optional. Keep most of the total deadline available for the
    // complete base image instead of losing it to an unsupported SVG decoder.
    try{
     const svg=overlay.cloneNode(true);svg.setAttribute('width',String(canvas.width));svg.setAttribute('height',String(canvas.height));svg.removeAttribute('style');
     const text=new XMLSerializer().serializeToString(svg);url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'}));image=new Image();
     report('Preparing the displayed labels…');
     const overlayDeadline=performance.now()+Math.min(1500,(deadline-started)/4);
     await bounded((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('The diagnostic overlay could not be saved.'));image.src=url;},'The browser timed out preparing the displayed labels.',overlayDeadline);
     context.drawImage(image,0,0,canvas.width,canvas.height);
    }catch(error){if(error?.name==='AbortError')throw error;warning='Labels could not be included; saved the rendered scene.';report('Saving the frame without labels…');}
    if(image){image.onload=null;image.onerror=null;image.src='';}
    if(url){URL.revokeObjectURL(url);url=null;}
   }
   if(signal?.aborted)throw cancelled();report('Encoding the picture…');
   return await bounded((resolve,reject)=>canvas.toBlob(blob=>blob?.size?resolve(blob):reject(Error('The browser returned an empty picture.')),'image/png'),'The browser timed out encoding the picture. Try again or choose a smaller live quality.');
  }finally{
   if(image){image.onload=null;image.onerror=null;image.src='';}
   if(url)URL.revokeObjectURL(url);
   canvas.width=1;canvas.height=1;
  }
 }
}

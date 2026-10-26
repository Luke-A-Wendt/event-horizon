import { PLANET_TEXTURE_DATA } from './planet-texture-data.js';
// Two bounded GPU textures: a 1024-square overview atlas and one focused map.
// All compressed bytes ship inside this module; there are no resource requests.
function dataBlob(uri){
 const comma=uri.indexOf(','),raw=atob(uri.slice(comma+1)),bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return new Blob([bytes],{type:'image/jpeg'});
}
async function decode(uri,maxSize){
 if(typeof createImageBitmap==='function'){
  const original=await createImageBitmap(dataBlob(uri));
  if(original.width<=maxSize)return original;
  try{return await createImageBitmap(original,{resizeWidth:maxSize,resizeHeight:Math.max(1,Math.round(original.height*maxSize/original.width)),resizeQuality:'high'});}finally{original.close?.();}
 }
 if(typeof Image!=='undefined')return new Promise((resolve,reject)=>{
  const image=new Image();image.onload=()=>{try{
   const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
   if(width<=maxSize){resolve(image);return;}
   const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(maxSize,Math.max(1,Math.round(height*maxSize/width))):typeof document!=='undefined'?document.createElement('canvas'):null;
   if(!canvas)throw new Error('This browser cannot resize its included planetary map safely.');
   canvas.width=maxSize;canvas.height=Math.max(1,Math.round(height*maxSize/width));const context=canvas.getContext('2d');if(!context)throw new Error('A planetary map resize canvas could not start.');context.drawImage(image,0,0,canvas.width,canvas.height);resolve(canvas);
  }catch(error){reject(error);}};image.onerror=()=>reject(new Error('An included planetary surface could not be decoded.'));image.src=uri;
 });
 return null;
}
export class PlanetTextureCache{
 constructor(gl){
  this.gl=gl;this.atlas=null;this.focus=null;this.atlasReady=false;this.focusId=0;this.targetId=0;this.focusSize=0;this.pending=false;this.error=null;this.disposed=false;this.epoch=0;this.atlasPromise=null;this.focusPromise=null;
  this.unsupported=typeof createImageBitmap!=='function'&&typeof Image==='undefined';
  this.atlas=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.atlas);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,1,1,0,gl.RGB,gl.UNSIGNED_BYTE,new Uint8Array([127,127,127]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 }
 ready(id=0){return this.unsupported||(this.atlasReady&&(!PLANET_TEXTURE_DATA.maps[id]||this.focusId===Number(id)));}
 upload(image,old){
  const g=this.gl,t=old||g.createTexture();
  try{
   g.bindTexture(g.TEXTURE_2D,t);g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,false);g.pixelStorei(g.UNPACK_ALIGNMENT,1);
   // Browser GL errors are numeric flags, not JavaScript exceptions.
   for(let i=0;i<4;i++){const error=g.getError?.();if(typeof error!=='number'||error===0)break;}
   g.texImage2D(g.TEXTURE_2D,0,g.RGB,g.RGB,g.UNSIGNED_BYTE,image);
   const error=g.getError?.();if(typeof error==='number'&&error!==0)throw new Error('The GPU could not upload an included planetary map (graphics error '+error+').');
   g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
   const power=n=>n>0&&(n&(n-1))===0,pot=power(image.width)&&power(image.height);
   g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,pot?g.LINEAR_MIPMAP_LINEAR:g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);if(pot){g.generateMipmap(g.TEXTURE_2D);const mipError=g.getError?.();if(typeof mipError==='number'&&mipError!==0)g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);}
   return t;
  }catch(error){if(!old)g.deleteTexture(t);throw error;}finally{image.close?.();}
 }

 ensure(id=0,options={}){
  id=PLANET_TEXTURE_DATA.maps[id]?Number(id):0;if(this.disposed)return Promise.reject(new Error('Planet textures were disposed.'));if(this.unsupported)return Promise.resolve();
  const size=Math.min(options.high?4096:2048,Number(this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE))||2048);
  if(this.ready(id)&&(!id||this.focusSize>=size))return Promise.resolve();
  if(!this.atlasPromise)this.atlasPromise=(async()=>{const bitmap=await decode(PLANET_TEXTURE_DATA.atlas,Math.min(1024,size));if(this.disposed){bitmap?.close?.();return;}if(bitmap){this.atlas=this.upload(bitmap,this.atlas);this.atlasReady=true;}})();
  if(this.targetId===id&&this.focusPromise){const active=this.epoch;return this.focusPromise.then(()=>{if(this.targetId===id&&this.epoch===active)return this.ensure(id,options);});}
  this.targetId=id;const epoch=++this.epoch;this.pending=true;this.error=null;
  this.focusPromise=(async()=>{
   await this.atlasPromise;
   if(id){const bitmap=await decode(PLANET_TEXTURE_DATA.maps[id],size);if(this.disposed||epoch!==this.epoch){bitmap?.close?.();return;}if(bitmap){this.focus=this.upload(bitmap,this.focus);this.focusId=id;this.focusSize=size;}}
   else if(epoch===this.epoch){this.focusId=0;}
  })().catch(error=>{if(epoch===this.epoch)this.error=error;throw error;}).finally(()=>{if(epoch===this.epoch){this.pending=false;this.focusPromise=null;}});
  return this.focusPromise;
 }
 bind(uniforms){
  const g=this.gl;g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.atlas);g.uniform1i(uniforms.uPlanetAtlas,0);
  g.activeTexture(g.TEXTURE0+1);g.bindTexture(g.TEXTURE_2D,this.focus||this.atlas);g.uniform1i(uniforms.uPlanetFocus,1);
  g.uniform1f(uniforms.uPlanetAtlasReady,this.atlasReady?1:0);g.uniform1f(uniforms.uPlanetFocusId,this.focusId||0);g.activeTexture(g.TEXTURE0);
 }
 dispose(){this.disposed=true;this.epoch++;if(this.atlas)this.gl.deleteTexture(this.atlas);if(this.focus)this.gl.deleteTexture(this.focus);this.atlas=this.focus=null;}
}

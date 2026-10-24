import { VERTEX, createFragment } from './shaders.js';

// Picture mode resolves procedural structure unavailable to live variants,
// with progressively finer ray integration and genuinely distinct subpixel rays.
// It does not wait out a timer or change the interactive quality preset.
export const PHOTO_PRESETS = Object.freeze([
 Object.freeze({id:'standard',label:'1920 px · Fine',width:1920,samples:4,steps:1024,detail:1}),
 Object.freeze({id:'fine',label:'4K · Finer',width:3840,samples:8,steps:1536,detail:2}),
 Object.freeze({id:'maximum',label:'4K · Maximum',width:3840,samples:16,steps:3072,detail:3})
]);
const MAX_PIXELS=3840*2160;
export const PHOTO_TILE_SIZE=64;
const TILE_SIZE=PHOTO_TILE_SIZE;
// Keep even Maximum below 26 million maximum ray iterations in flight. The
// actual shader may terminate much sooner. This is a work bound, not a time
// guarantee; weak GPUs are still free to cancel between tiny fenced batches.
const MAX_BATCH_ITERATIONS=26*1024*1024;
export function photoBatchSize(preset){return Math.max(1,Math.min(4,Math.floor(MAX_BATCH_ITERATIONS/(TILE_SIZE*TILE_SIZE*preset.steps))));}
const LINEAR=Float32Array.from({length:256},(_,i)=>{const v=i/255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);});
const now=()=>typeof performance!=='undefined'?performance.now():Date.now();
const yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0));
const pollTask=()=>new Promise(resolve=>setTimeout(resolve,8));
const abortError=message=>Object.assign(new Error(message||'Picture rendering cancelled.'),{name:'AbortError'});

export function photoDimensions(viewWidth,viewHeight,longEdge=1920){
 const aspect=Number(viewWidth)/Number(viewHeight);
 if(!Number.isFinite(aspect)||aspect<=0||Number(viewWidth)<=0||Number(viewHeight)<=0)throw new Error('The view needs a nonzero size before rendering a picture.');
 const edge=Math.max(64,Math.min(3840,Math.round(Number(longEdge)||1920)));
 let width=aspect>=1?edge:edge*aspect,height=aspect>=1?edge/aspect:edge;
 const scale=Math.min(1,Math.sqrt(MAX_PIXELS/(width*height)));
 return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}

export function photoSampleOffset(index,samples){
 if(![4,8,16].includes(samples)||index<0||index>=samples||!Number.isInteger(index))throw new Error('Invalid photo sample.');
 const columns=samples===4?2:4,rows=samples/columns;
 return [(index%columns+.5)/columns-.5,(Math.floor(index/columns)+.5)/rows-.5];
}

export function photoTilePlan(width,height,size=TILE_SIZE){
 if(![width,height,size].every(x=>Number.isInteger(x)&&x>0))throw new Error('Picture tile dimensions must be positive integers.');
 const result=[];
 for(let y=0;y<height;y+=size)for(let x=0;x<width;x+=size)result.push({x,y,width:Math.min(size,width-x),height:Math.min(size,height-y)});
 return result;
}

export function accumulatePhotoSample(sum,pixels,pixelCount){
 for(let i=0;i<pixelCount;i++){const p=i*4,q=i*3;sum[q]+=LINEAR[pixels[p]];sum[q+1]+=LINEAR[pixels[p+1]];sum[q+2]+=LINEAR[pixels[p+2]];}
}

export function resolvePhotoTile(sum,width,height,samples,destination){
 const encode=v=>Math.round(255*Math.min(1,Math.max(0,v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055)));
 // GL rows begin at the lower left; ImageData begins at the upper left.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const source=(y*width+x)*3,target=((height-1-y)*width+x)*4;
  destination[target]=encode(sum[source]/samples);destination[target+1]=encode(sum[source+1]/samples);destination[target+2]=encode(sum[source+2]/samples);destination[target+3]=255;
 }
 return destination;
}

function usable(renderer,signal){
 if(signal?.aborted)throw abortError();
 if(renderer.disposed||renderer.contextLost||!renderer.gl)throw new Error('The GPU became unavailable. Retry picture mode after it recovers.');
 if(typeof document!=='undefined'&&document.hidden)throw abortError('Picture rendering stopped while the page was hidden.');
}

async function waitForFence(gl,sync,renderer,signal){
 const started=now();
 // A zero timeout only polls; never block the browser with finish()/waitSync().
 for(;;){
  usable(renderer,signal);
  const status=gl.clientWaitSync(sync,0,0);
  if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)return;
  if(status===gl.WAIT_FAILED)throw new Error('The GPU could not finish this picture tile.');
  if(now()-started>30000)throw new Error('The GPU took too long to finish a picture tile. Try the smaller picture preset.');
  await pollTask();
 }
}

async function makeProgram(gl,features,webgl2,renderer,signal,resources){
 let vertex=VERTEX,fragment=createFragment({...features,ultra:true,photo:true});
 if(webgl2){vertex='#version 300 es\n'+vertex.replace('attribute','in');fragment='#version 300 es\n'+fragment.replace('precision highp float;','precision highp float;\nout vec4 outColor;').replaceAll('gl_FragColor','outColor');}
 const program=gl.createProgram();if(!program)throw new Error('Not enough GPU memory to start picture mode.');resources.program=program;
 for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
  const shader=gl.createShader(type);if(!shader)throw new Error('The GPU could not allocate the picture shader.');resources.shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);gl.attachShader(program,shader);
 }
 gl.linkProgram(program);
 const extension=gl.getExtension('KHR_parallel_shader_compile'),started=now();
 if(extension&&typeof extension.COMPLETION_STATUS_KHR==='number'){
  while(!gl.getProgramParameter(program,extension.COMPLETION_STATUS_KHR)){
   usable(renderer,signal);if(now()-started>120000)throw new Error('The picture shader took too long to prepare.');await pollTask();
  }
 }else await yieldTask();
 usable(renderer,signal);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('This GPU could not compile the picture renderer. '+(gl.getProgramInfoLog(program)||''));
 for(const shader of resources.shaders)gl.deleteShader(shader);resources.shaders=[];
 return program;
}

function encodeCanvas(canvas){
 if(typeof canvas.convertToBlob==='function')return canvas.convertToBlob({type:'image/png'});
 if(typeof canvas.toBlob==='function')return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('This browser could not encode the picture.')),'image/png'));
 return Promise.reject(new Error('This browser cannot save a rendered picture.'));
}

async function renderPicture(renderer,{presetId='standard',onProgress=()=>{},signal}={}){
 if(typeof renderer?.beginPhotoCapture!=='function'||renderer.cpuMode)throw new Error('Picture mode needs the GPU renderer.');
 const preset=PHOTO_PRESETS.find(p=>p.id===presetId);if(!preset)throw new Error('Choose a picture preset.');
 usable(renderer,signal);
 const started=now(),snapshot=renderer.beginPhotoCapture(),gl=renderer.gl;
 const resources={program:null,shaders:[],buffer:null,texture:null,framebuffer:null,pbo:null,sync:null};
 let output=null,completed=0,total=0,lastProgress=-Infinity;
 const report=(phase,force=false)=>{
  const elapsedMs=now()-started;if(!force&&elapsedMs-lastProgress<100)return;lastProgress=elapsedMs;
  const progress=total?completed/total:0;
  // Startup compilation is not multiplied into the estimate for every tile.
  const renderingMs=renderStarted?now()-renderStarted:0;
  const remainingMs=completed>=4?Math.max(0,renderingMs*(total-completed)/completed):null;
  onProgress({phase,progress,completed,total,elapsedMs,remainingMs});
 };
 let renderStarted=0;
 try{
  report('Preparing GPU renderer',true);usable(renderer,signal);
  const {width,height}=photoDimensions(snapshot.width,snapshot.height,preset.width),tiles=photoTilePlan(width,height);
  total=tiles.length*preset.samples;
  // The only full-size allocation is the export canvas (~33 MiB at 4K).
  // Scene rendering, sample accumulation, and GPU readback remain one tile.
  output=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):document.createElement('canvas');
  output.width=width;output.height=height;
  const context=output.getContext('2d',{alpha:false});if(!context)throw new Error('Not enough memory for the picture. Try the smaller preset.');
  if(renderer.gpuFence){await waitForFence(gl,renderer.gpuFence.sync,renderer,signal);renderer.releaseFence();}
  const program=await makeProgram(gl,{...snapshot.features,photoSteps:preset.steps},renderer.webgl2,renderer,signal,resources);
  gl.useProgram(program);
  const locations=new Map(),location=name=>{if(!locations.has(name))locations.set(name,gl.getUniformLocation(program,name));return locations.get(name);};
  for(const uniform of snapshot.uniforms){const address=location(uniform.name);if(address!==null)gl[uniform.method](address,...uniform.args);}
  gl.uniform2f(location('uResolution'),width,height);gl.uniform1i(location('uSteps'),preset.steps);gl.uniform1f(location('uDetail'),3);gl.uniform1f(location('uPhotoDetail'),preset.detail);
  gl.uniform1i(location('uProjectionMode'),0);gl.uniform4f(location('uRayViewport'),0,0,0,0);
  resources.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,resources.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const attribute=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
  resources.texture=gl.createTexture();resources.framebuffer=gl.createFramebuffer();
  if(!resources.texture||!resources.framebuffer)throw new Error('The GPU could not allocate the picture tile.');
  gl.bindTexture(gl.TEXTURE_2D,resources.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,TILE_SIZE,TILE_SIZE,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.bindFramebuffer(gl.FRAMEBUFFER,resources.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,resources.texture,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('This GPU cannot create a picture render target.');
  gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
  const asyncRead=renderer.webgl2&&typeof gl.fenceSync==='function'&&typeof gl.getBufferSubData==='function'&&typeof gl.PIXEL_PACK_BUFFER==='number';
  const tileBytes=TILE_SIZE*TILE_SIZE*4,readbackBatch=photoBatchSize(preset);
  if(asyncRead){resources.pbo=gl.createBuffer();if(!resources.pbo)throw new Error('The GPU could not allocate the picture transfer buffer.');gl.bindBuffer(gl.PIXEL_PACK_BUFFER,resources.pbo);gl.bufferData(gl.PIXEL_PACK_BUFFER,tileBytes*readbackBatch,gl.STREAM_READ);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);}
  const pixels=new Uint8Array(TILE_SIZE*TILE_SIZE*4),sum=new Float32Array(TILE_SIZE*TILE_SIZE*3);
  renderStarted=now();report('Resolving procedural detail',true);
  for(const tile of tiles){
   usable(renderer,signal);const count=tile.width*tile.height;sum.fill(0,0,count*3);gl.viewport(0,0,tile.width,tile.height);gl.uniform2f(location('uPhotoOffset'),tile.x,tile.y);
   const batchSize=asyncRead?readbackBatch:1;
   for(let firstSample=0;firstSample<preset.samples;firstSample+=batchSize){
    usable(renderer,signal);const batch=Math.min(batchSize,preset.samples-firstSample);
    if(asyncRead)gl.bindBuffer(gl.PIXEL_PACK_BUFFER,resources.pbo);
    for(let slot=0;slot<batch;slot++){
     usable(renderer,signal);gl.uniform2f(location('uPhotoJitter'),...photoSampleOffset(firstSample+slot,preset.samples));gl.drawArrays(gl.TRIANGLES,0,3);
     if(asyncRead)gl.readPixels(0,0,tile.width,tile.height,gl.RGBA,gl.UNSIGNED_BYTE,slot*tileBytes);
     else{
      // WebGL 1 has no nonblocking transfer. Keep each operation tiny and
      // yield before reading it, never queueing a full-resolution frame.
      await yieldTask();usable(renderer,signal);gl.readPixels(0,0,tile.width,tile.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels.subarray(0,count*4));
      accumulatePhotoSample(sum,pixels,count);completed++;
     }
    }
    if(asyncRead){
     // The batch shrinks as integration depth grows. Fence polling yields
     // to cancellation and UI messages; a full frame is never queued.
     resources.sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!resources.sync)throw new Error('The GPU could not schedule picture readback.');gl.flush();
     await waitForFence(gl,resources.sync,renderer,signal);gl.deleteSync(resources.sync);resources.sync=null;
     for(let slot=0;slot<batch;slot++){gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,slot*tileBytes,pixels,0,count*4);accumulatePhotoSample(sum,pixels,count);completed++;}
     gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
    }
    report('Resolving procedural detail');await yieldTask();
   }
   const image=context.createImageData(tile.width,tile.height);resolvePhotoTile(sum,tile.width,tile.height,preset.samples,image.data);context.putImageData(image,tile.x,height-tile.y-tile.height);
  }
  report('Encoding PNG',true);usable(renderer,signal);await yieldTask();
  const blob=await encodeCanvas(output);usable(renderer,signal);
  if(!blob||!blob.size)throw new Error('The picture was empty. Try a smaller preset.');
  report('Picture ready',true);
  return {blob,width,height,samples:preset.samples,steps:preset.steps,detail:preset.detail,elapsedMs:now()-started};
 }finally{
  if(!renderer.contextLost){
   if(resources.sync)gl.deleteSync(resources.sync);
   if(resources.pbo){gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);gl.deleteBuffer(resources.pbo);}
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null);
   if(resources.texture)gl.deleteTexture(resources.texture);if(resources.framebuffer)gl.deleteFramebuffer(resources.framebuffer);if(resources.buffer)gl.deleteBuffer(resources.buffer);
   for(const shader of resources.shaders)gl.deleteShader(shader);if(resources.program)gl.deleteProgram(resources.program);
  }
  // Releasing the export backing store does not affect its encoded Blob.
  if(output){output.width=1;output.height=1;}
  renderer.endPhotoCapture();
 }
}

export function createPhotoRender(renderer,options={}){return renderPicture(renderer,options);}

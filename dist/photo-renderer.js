import { VERTEX, createFragment } from './shaders.js';

// Picture mode resolves procedural structure unavailable to live variants,
// with progressively finer ray integration and genuinely distinct subpixel rays.
// It does not wait out a timer or change the interactive quality preset.
export const PHOTO_PRESETS = Object.freeze([
 Object.freeze({id:'quick',label:'Quick · Good screenshot',width:0,samples:1,steps:0,detail:0,budgetMs:0}),
 Object.freeze({id:'high',label:'Higher resolution · 10 seconds',width:2560,samples:4,steps:1024,detail:1,budgetMs:10000}),
 Object.freeze({id:'maximum',label:'Maximum · 2 minutes',width:3840,samples:16,steps:3072,detail:3,budgetMs:120000})
]);
const MAX_PIXELS=3840*2160;
export const PHOTO_TILE_SIZE=64;
const TILE_SIZE=PHOTO_TILE_SIZE;
// Keep even Maximum below 26 million maximum ray iterations in flight. The
// actual shader may terminate much sooner. This is a work bound, not a time
// guarantee; weak GPUs are still free to cancel between tiny fenced batches.
const MAX_BATCH_ITERATIONS=26*1024*1024;
export function photoBatchSize(preset){return preset.steps?Math.max(1,Math.min(4,Math.floor(MAX_BATCH_ITERATIONS/(TILE_SIZE*TILE_SIZE*preset.steps)))):1;}
const LINEAR=Float32Array.from({length:256},(_,i)=>{const v=i/255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);});
const now=()=>typeof performance!=='undefined'?performance.now():Date.now();
const yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0));
const pollTask=()=>new Promise(resolve=>setTimeout(resolve,8));
const abortError=message=>Object.assign(new Error(message||'Picture rendering cancelled.'),{name:'AbortError'});
const budgetError=()=>Object.assign(new Error('The picture work budget is complete.'),{name:'PhotoBudgetError'});
function checkBudget(deadline){if(now()>=deadline)throw budgetError();}
async function withinBudget(promise,deadline,signal){
 if(signal?.aborted)throw abortError();
 if(!Number.isFinite(deadline)&&!signal)return promise;
 checkBudget(deadline);let timer,stop;
 try{return await Promise.race([promise,new Promise((_,reject)=>{if(Number.isFinite(deadline))timer=setTimeout(()=>reject(budgetError()),Math.max(0,deadline-now()));stop=()=>reject(abortError());signal?.addEventListener('abort',stop,{once:true});})]);}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);}
}

export function photoDimensions(viewWidth,viewHeight,longEdge=1920){
 const aspect=Number(viewWidth)/Number(viewHeight);
 if(!Number.isFinite(aspect)||aspect<=0||Number(viewWidth)<=0||Number(viewHeight)<=0)throw new Error('The view needs a nonzero size before rendering a picture.');
 const edge=Math.max(64,Math.min(3840,Math.round(Number(longEdge)||1920)));
 let width=aspect>=1?edge:edge*aspect,height=aspect>=1?edge/aspect:edge;
 const scale=Math.min(1,Math.sqrt(MAX_PIXELS/(width*height)));
 return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}

export function photoSampleOffset(index,samples){
 if(![1,4,8,16].includes(samples)||index<0||index>=samples||!Number.isInteger(index))throw new Error('Invalid photo sample.');
 if(samples===1)return [0,0];
 const columns=samples===4?2:4,rows=samples/columns;
 return [(index%columns+.5)/columns-.5,(Math.floor(index/columns)+.5)/rows-.5];
}

// An extensible Halton sequence: the first ray is centered and subsequent
// rays fill the pixel footprint uniformly. No antithetic pairing is used: a
// mirrored Halton point can duplicate an earlier ray.
export function photoProgressiveSampleOffset(index){
 if(!Number.isSafeInteger(index)||index<0)throw new Error('Invalid progressive photo sample.');
 if(index===0)return [0,0];
 const inverse=(n,base)=>{let value=0,weight=1/base;while(n){value+=(n%base)*weight;n=Math.floor(n/base);weight/=base;}return value;};
 return [inverse(index,2)-.5,inverse(index,3)-.5];
}

// Bounded 16-bit linear-light means cost six bytes/pixel (under 50 MiB at
// 3840×2160), not a growing sample history or a full-image float accumulator.
// Each tile has its own sample count, so a deadline during another pass still
// leaves a completely initialized image; only its local noise level differs.
export function mergePhotoTile(mean,imageWidth,tile,sum,samples,previousSamples,destination){
 const encode=v=>Math.round(255*Math.min(1,Math.max(0,v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055)));
 const count=previousSamples+samples;
 for(let y=0;y<tile.height;y++)for(let x=0;x<tile.width;x++){
  const local=(y*tile.width+x)*3,global=((tile.y+y)*imageWidth+tile.x+x)*3,target=((tile.height-1-y)*tile.width+x)*4;
  for(let channel=0;channel<3;channel++){
   const value=(mean[global+channel]/65535*previousSamples+sum[local+channel])/count;
   mean[global+channel]=Math.round(Math.max(0,Math.min(1,value))*65535);destination[target+channel]=encode(value);
  }
  destination[target+3]=255;
 }
 return destination;
}

export function photoTilePlan(width,height,size=TILE_SIZE){
 if(![width,height,size].every(x=>Number.isInteger(x)&&x>0))throw new Error('Picture tile dimensions must be positive integers.');
 const result=[];
 for(let y=0;y<height;y+=size)for(let x=0;x<width;x+=size)result.push({x,y,width:Math.min(size,width-x),height:Math.min(size,height-y)});
 return result;
}

// Predict a COMPLETE image from measured tile throughput. Never enlarge a
// smaller image after rendering or export an unfinished collection of tiles.
export function photoAdaptivePlan(viewWidth,viewHeight,preset,tileSampleMs,availableMs,minEdge=64){
 const cost=Math.max(.05,Number(tileSampleMs)||.05)*preset.samples;
 const estimate=dimensions=>Math.ceil(dimensions.width/TILE_SIZE)*Math.ceil(dimensions.height/TILE_SIZE)*cost;
 const target=photoDimensions(viewWidth,viewHeight,preset.width),minimum=photoDimensions(viewWidth,viewHeight,Math.min(preset.width,Math.max(64,minEdge)));
 const allowance=Math.max(0,availableMs)*.72;
 if(estimate(minimum)>allowance)return null;
 if(estimate(target)<=allowance)return {...target,estimatedMs:estimate(target)};
 let low=Math.max(minimum.width,minimum.height),high=Math.max(target.width,target.height);
 while(high-low>1){const mid=Math.floor((low+high)/2);if(estimate(photoDimensions(viewWidth,viewHeight,mid))<=allowance)low=mid;else high=mid;}
 const dimensions=photoDimensions(viewWidth,viewHeight,low);
 return {...dimensions,estimatedMs:estimate(dimensions)};
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
async function waitForTextures(cache,id,renderer,signal,high=false,deadline=Infinity){
 if(!cache)return;
 let stop;const aborted=new Promise((_,reject)=>{stop=()=>reject(abortError());signal?.addEventListener('abort',stop,{once:true});});
 try{usable(renderer,signal);await withinBudget(Promise.race([cache.ensure(id||0,{high}),aborted]),deadline);usable(renderer,signal);}
 finally{signal?.removeEventListener('abort',stop);}
}

async function waitForFence(gl,sync,renderer,signal,deadline=Infinity,onWait=()=>{}){
 const started=now();
 // A zero timeout only polls; never block the browser with finish()/waitSync().
 for(;;){
  usable(renderer,signal);
  checkBudget(deadline);
  const status=gl.clientWaitSync(sync,0,0);
  if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)return;
  if(status===gl.WAIT_FAILED)throw new Error('The GPU could not finish this picture tile.');
  if(now()-started>30000)throw new Error('The GPU took too long to finish a picture tile. Try the smaller picture preset.');
  onWait();await pollTask();
 }
}

async function makeProgram(gl,features,webgl2,renderer,signal,resources,deadline=Infinity,onWait=()=>{}){
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
   usable(renderer,signal);checkBudget(deadline);if(now()-started>120000)throw new Error('The picture shader took too long to prepare.');onWait();await pollTask();
  }
 }else await yieldTask();
 usable(renderer,signal);
 checkBudget(deadline);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('This GPU could not compile the picture renderer. '+(gl.getProgramInfoLog(program)||''));
 for(const shader of resources.shaders)gl.deleteShader(shader);resources.shaders=[];
 return program;
}

function encodeCanvas(canvas){
 if(typeof canvas.convertToBlob==='function')return canvas.convertToBlob({type:'image/png'});
 if(typeof canvas.toBlob==='function')return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('This browser could not encode the picture.')),'image/png'));
 return Promise.reject(new Error('This browser cannot save a rendered picture.'));
}

async function renderPicture(renderer,{presetId='high',onProgress=()=>{},signal,baseline=null,budgetMs}={}){
 const requestedId=({standard:'high',fine:'maximum'})[presetId]||presetId;
 const preset=PHOTO_PRESETS.find(p=>p.id===requestedId);if(!preset)throw new Error('Choose a picture preset.');
 if(signal?.aborted)throw abortError();
 if(requestedId==='quick'){
  if(typeof renderer?.captureImage!=='function')throw new Error('The current frame cannot be captured yet.');
  const started=now(),blob=await renderer.captureImage({signal,onProgress});if(signal?.aborted)throw abortError();
  const state=renderer.getState?.()||renderer.canvas||{};
  return {blob,width:state.width,height:state.height,samples:1,steps:0,detail:0,presetId:requestedId,elapsedMs:now()-started,complete:true,fallback:false,budgetLimited:false};
 }
 if(typeof renderer?.beginPhotoCapture!=='function'||renderer.cpuMode)throw new Error('Picture mode needs the GPU renderer.');
 const started=now(),workBudgetMs=Math.min(preset.budgetMs,Number.isFinite(budgetMs)?Math.max(0,budgetMs):preset.budgetMs),deadline=started+workBudgetMs;
 // The host supplies a frozen, complete screenshot before this work begins.
 // It survives a slow shader compiler, timeout, or failed refinement pass.
 let best=baseline?.blob?.size&&baseline.width>0&&baseline.height>0?{...baseline,samples:baseline.samples||1,steps:baseline.steps||0,detail:baseline.detail||0,fallback:true}:null;
 let budgetLimited=false,completedPasses=0,output=null,completed=0,total=0,lastProgress=-Infinity,progressFloor=0,renderStarted=0,stageIndex=0;
 let accumulation=null,tileCounts=null,activeStage=null,activeTiles=null,activeWidth=0,activeHeight=0,completeImage=false,encodingMs=0;
 let renderDeadline=deadline;
 const stages=preset.id==='maximum'?[
  {width:1920,samples:1,steps:1536,detail:2,share:.18},
  {...preset,samples:1,share:.65}
 ]:[{width:1920,samples:1,steps:preset.steps,detail:preset.detail,share:.18},{...preset,samples:1,share:.65}];
 const report=(phase,force=false)=>{
  const elapsedMs=now()-started;if(!force&&elapsedMs-lastProgress<100)return;lastProgress=elapsedMs;
  const progress=phase==='Picture ready'?1:Math.max(progressFloor,Math.min(.99,workBudgetMs>0?elapsedMs/workBudgetMs:0));progressFloor=progress;
  const remainingBudgetMs=Math.max(0,deadline-now());
  const remainingMs=remainingBudgetMs;
  onProgress({phase,progress,indeterminate:phase!=='Picture ready'&&(!total||/Preparing|Measuring/.test(phase)),completed,total,elapsedMs,remainingMs,remainingBudgetMs,workBudgetMs,completedPasses});
 };
 usable(renderer,signal);
 const snapshot=renderer.beginPhotoCapture(),gl=renderer.gl;
 const resources={program:null,shaders:[],buffer:null,texture:null,framebuffer:null,pbo:null,sync:null,pendingGpuWork:false};
 try{
  report('Preparing GPU renderer',true);checkBudget(deadline);
  if(snapshot.features.planetary)await waitForTextures(renderer.planetTextures,snapshot.focusSurfaceId||0,renderer,signal,true,deadline);
  if(renderer.gpuFence){await waitForFence(gl,renderer.gpuFence.sync,renderer,signal,deadline);renderer.releaseFence();}
  const program=await makeProgram(gl,{...snapshot.features,photoSteps:preset.steps},renderer.webgl2,renderer,signal,resources,deadline,()=>report('Preparing GPU renderer'));
  gl.useProgram(program);
  const locations=new Map(),location=name=>{if(!locations.has(name))locations.set(name,gl.getUniformLocation(program,name));return locations.get(name);};
  for(const uniform of snapshot.uniforms){const address=location(uniform.name);if(address!==null)gl[uniform.method](address,...uniform.args);}
  gl.uniform1f(location('uDetail'),3);gl.uniform1i(location('uProjectionMode'),0);gl.uniform4f(location('uRayViewport'),0,0,0,0);
  resources.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,resources.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const attribute=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
  resources.texture=gl.createTexture();resources.framebuffer=gl.createFramebuffer();
  if(!resources.texture||!resources.framebuffer)throw new Error('The GPU could not allocate the picture tile.');
  if(snapshot.features.planetary&&typeof gl.activeTexture==='function')gl.activeTexture(gl.TEXTURE0+2);
  gl.bindTexture(gl.TEXTURE_2D,resources.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,TILE_SIZE,TILE_SIZE,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.bindFramebuffer(gl.FRAMEBUFFER,resources.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,resources.texture,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('This GPU cannot create a picture render target.');
  gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
  const asyncRead=renderer.webgl2&&typeof gl.fenceSync==='function'&&typeof gl.getBufferSubData==='function'&&typeof gl.PIXEL_PACK_BUFFER==='number';
  const tileBytes=TILE_SIZE*TILE_SIZE*4;
  if(asyncRead){resources.pbo=gl.createBuffer();if(!resources.pbo)throw new Error('The GPU could not allocate the picture transfer buffer.');gl.bindBuffer(gl.PIXEL_PACK_BUFFER,resources.pbo);gl.bufferData(gl.PIXEL_PACK_BUFFER,tileBytes*4,gl.STREAM_READ);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);}
  const pixels=new Uint8Array(tileBytes),sum=new Float32Array(TILE_SIZE*TILE_SIZE*3);
  if(snapshot.features.planetary)renderer.planetTextures?.bind({uPlanetAtlas:location('uPlanetAtlas'),uPlanetFocus:location('uPlanetFocus'),uPlanetAtlasReady:location('uPlanetAtlasReady'),uPlanetFocusId:location('uPlanetFocusId')});
  const setStage=(stage,width,height)=>{gl.uniform2f(location('uResolution'),width,height);gl.uniform1i(location('uSteps'),stage.steps);gl.uniform1f(location('uPhotoDetail'),stage.detail);};
  const renderTile=async(tile,stage,context,height,tileIndex=-1)=>{
   usable(renderer,signal);checkBudget(renderDeadline);
   const previousSamples=tileIndex>=0?tileCounts[tileIndex]:0;
   const count=tile.width*tile.height;sum.fill(0,0,count*3);gl.viewport(0,0,tile.width,tile.height);gl.uniform2f(location('uPhotoOffset'),tile.x,tile.y);
   const batchSize=asyncRead?photoBatchSize(stage):1;
   for(let firstSample=0;firstSample<stage.samples;firstSample+=batchSize){
    usable(renderer,signal);checkBudget(renderDeadline);const batch=Math.min(batchSize,stage.samples-firstSample);
    if(asyncRead)gl.bindBuffer(gl.PIXEL_PACK_BUFFER,resources.pbo);
    for(let slot=0;slot<batch;slot++){
     usable(renderer,signal);checkBudget(renderDeadline);gl.uniform2f(location('uPhotoJitter'),...photoProgressiveSampleOffset(previousSamples+firstSample+slot));gl.drawArrays(gl.TRIANGLES,0,3);resources.pendingGpuWork=true;
     if(asyncRead)gl.readPixels(0,0,tile.width,tile.height,gl.RGBA,gl.UNSIGNED_BYTE,slot*tileBytes);
     else{
      await yieldTask();usable(renderer,signal);checkBudget(renderDeadline);gl.readPixels(0,0,tile.width,tile.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels.subarray(0,count*4));
      resources.pendingGpuWork=false;accumulatePhotoSample(sum,pixels,count);completed++;
     }
    }
    if(asyncRead){
     // Each fenced batch is bounded independently of export resolution.
     resources.sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!resources.sync)throw new Error('The GPU could not schedule picture readback.');gl.flush();
     await waitForFence(gl,resources.sync,renderer,signal,renderDeadline,()=>report('Waiting for this GPU tile'));gl.deleteSync(resources.sync);resources.sync=null;resources.pendingGpuWork=false;
     for(let slot=0;slot<batch;slot++){gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,slot*tileBytes,pixels,0,count*4);accumulatePhotoSample(sum,pixels,count);completed++;}
     gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
    }
    report('Resolving procedural detail');await yieldTask();
   }
   if(context){const image=context.createImageData(tile.width,tile.height);if(tileIndex>=0){mergePhotoTile(accumulation,activeWidth,tile,sum,stage.samples,previousSamples,image.data);tileCounts[tileIndex]=previousSamples+stage.samples;}else resolvePhotoTile(sum,tile.width,tile.height,stage.samples,image.data);context.putImageData(image,tile.x,height-tile.y-tile.height);}
  };
  // A representative central tile gives this GPU/scene its own resolution plan.
  const probeDimensions=photoDimensions(snapshot.width,snapshot.height,preset.width),probeStage={...preset,samples:1};
  setStage(probeStage,probeDimensions.width,probeDimensions.height);report('Measuring scene detail',true);
  const measuredAt=now();
  await renderTile({x:Math.floor((probeDimensions.width-Math.min(TILE_SIZE,probeDimensions.width))/2),y:Math.floor((probeDimensions.height-Math.min(TILE_SIZE,probeDimensions.height))/2),width:Math.min(TILE_SIZE,probeDimensions.width),height:Math.min(TILE_SIZE,probeDimensions.height)},probeStage,null,probeDimensions.height);
  let tileSampleMs=Math.max(.05,now()-measuredAt);completed=0;
  for(stageIndex=0;stageIndex<stages.length;stageIndex++){
   usable(renderer,signal);checkBudget(deadline);
   const stage=stages[stageIndex],reserve=Math.min(500,Math.max(50,workBudgetMs*.015));
   const remaining=Math.max(0,deadline-now()-reserve),minimum=best&&!best.fallback?Math.max(best.width,best.height):Math.min(1280,Math.max(snapshot.width,snapshot.height),stage.width);
   // A Retina live frame can exceed the photo target while containing less
   // procedural detail. Do not let that baseline suppress all refinement.
   // Once a PHOTO pass is complete, later passes retain its resolution.
   if(minimum>stage.width)continue;
   const scaledCost=tileSampleMs*stage.steps/preset.steps;
   const plan=photoAdaptivePlan(snapshot.width,snapshot.height,stage,scaledCost,remaining*stage.share,minimum);
   if(!plan)continue;
   const {width,height}=plan,tiles=photoTilePlan(width,height);
   if(output){output.width=1;output.height=1;}accumulation=null;tileCounts=null;completeImage=false;
   activeStage=stage;activeTiles=tiles;activeWidth=width;activeHeight=height;accumulation=new Uint16Array(width*height*3);tileCounts=new Uint32Array(tiles.length);
   output=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):document.createElement('canvas');output.width=width;output.height=height;
   const context=output.getContext('2d',{alpha:false});if(!context)throw new Error('Not enough memory for the picture. Try Quick.');
   setStage(stage,width,height);completed=0;total=tiles.length*stage.samples;renderStarted=now();report('Rendering a complete image',true);
   for(let i=0;i<tiles.length;i++)await renderTile(tiles[i],stage,context,height,i);
   completeImage=true;
   usable(renderer,signal);checkBudget(deadline);report('Encoding complete image',true);
   const encodingAt=now(),blob=await withinBudget(encodeCanvas(output),deadline,signal);encodingMs=Math.max(encodingMs,now()-encodingAt);usable(renderer,signal);
   if(!blob?.size)throw new Error('The picture was empty. Try Quick.');
   tileSampleMs=Math.max(tileSampleMs,(now()-renderStarted)/total*preset.steps/stage.steps);
   best={blob,width,height,samples:stage.samples,steps:stage.steps,detail:stage.detail,fallback:false};completedPasses++;
     }
  // Spend the remaining budget on new samples at the best completed resolution.
  // No timer padding: every iteration traces additional subpixel rays, resolves
  // the procedural photo shader and updates the linear-light running mean.
  if(completeImage&&output&&activeStage){
   const context=output.getContext('2d',{alpha:false});
   const reserve=Math.max(40,Math.min(1500,encodingMs*1.7+30));
   renderDeadline=deadline-reserve;
   let pass=0,dirty=false,lastCheckpoint=now();
   try{
    while(now()<renderDeadline){
     usable(renderer,signal);const sampleMs=Math.max(.05,tileSampleMs*activeStage.steps/preset.steps),samples=Math.max(1,Math.min(16,Math.floor((renderDeadline-now())/(sampleMs*activeTiles.length*4))));const stage={...activeStage,samples};
     setStage(stage,activeWidth,activeHeight);completed=0;total=activeTiles.length*samples;renderStarted=now();
     for(let i=0;i<activeTiles.length;i++){await renderTile(activeTiles[i],stage,context,activeHeight,i);dirty=true;}
     tileSampleMs=Math.max(.05,(now()-renderStarted)/(activeTiles.length*samples)*preset.steps/activeStage.steps);completedPasses++;pass++;report('Refining light and procedural detail',true);
     // Keep a complete encoded fallback while spending most time on rendering.
     // Exponential checkpoints prevent fast tiny images spending the whole
     // budget repeatedly encoding PNGs instead of improving their samples.
     if((pass&(pass-1))===0&&now()-lastCheckpoint>Math.min(3000,workBudgetMs*.15)){
      report('Saving refinement checkpoint',true);const encodeAt=now();
      const blob=await withinBudget(encodeCanvas(output),deadline,signal);usable(renderer,signal);
      if(blob?.size){best={blob,width:activeWidth,height:activeHeight,samples:Math.min(...tileCounts),samplesMax:Math.max(...tileCounts),steps:activeStage.steps,detail:activeStage.detail,fallback:false};dirty=false;}
      encodingMs=Math.max(encodingMs,now()-encodeAt);renderDeadline=deadline-Math.max(40,Math.min(1500,encodingMs*1.7+30));lastCheckpoint=now();
     }
    }
   }catch(error){if(error?.name!=='PhotoBudgetError')throw error;budgetLimited=true;}
   if(dirty&&now()<deadline){
    report('Encoding refined image',true);const blob=await withinBudget(encodeCanvas(output),deadline,signal);usable(renderer,signal);
    if(blob?.size)best={blob,width:activeWidth,height:activeHeight,samples:Math.min(...tileCounts),samplesMax:Math.max(...tileCounts),steps:activeStage.steps,detail:activeStage.detail,fallback:false};
   }
  }
 }catch(error){
  if(error?.name==='AbortError'||!best)throw error;
  budgetLimited=true;
  // A timeout or unsupported photo shader must not replace a valid frozen
  // screenshot/finished pass with an error or a partly black tiled image.
  if(error?.name!=='PhotoBudgetError')best={...best,refinementError:error?.message||String(error)};
 }finally{
  if(!renderer.contextLost){
   // Keep a pending fence in the live renderer so resuming cannot submit
   // another frame behind an unfinished picture batch.
   if(resources.pendingGpuWork&&!resources.sync&&renderer.webgl2&&typeof gl.fenceSync==='function'){resources.sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();}
   if(resources.sync){renderer.gpuFence={sync:resources.sync,started:now(),ignoreLatency:true,polls:0};resources.sync=null;}
   if(resources.pbo){gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);gl.deleteBuffer(resources.pbo);}
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null);
   if(resources.texture)gl.deleteTexture(resources.texture);if(resources.framebuffer)gl.deleteFramebuffer(resources.framebuffer);if(resources.buffer)gl.deleteBuffer(resources.buffer);
   for(const shader of resources.shaders)gl.deleteShader(shader);if(resources.program)gl.deleteProgram(resources.program);
  }
  if(output){output.width=1;output.height=1;}accumulation=null;tileCounts=null;
  renderer.endPhotoCapture();
 }
 if(signal?.aborted)throw abortError();
 if(!best)throw new Error('No complete image fitted this work budget. Try Quick.');
 const target=photoDimensions(snapshot.width,snapshot.height,preset.width);
 budgetLimited=budgetLimited||best.fallback||best.width<target.width||best.height<target.height||best.samples<preset.samples||best.steps<preset.steps;
 report('Picture ready',true);
 return {...best,presetId:requestedId,elapsedMs:now()-started,workBudgetMs,budgetLimited,complete:true,completedPasses};
}

export function createPhotoRender(renderer,options={}){return renderPicture(renderer,options);}

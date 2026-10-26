// Logic and GPU-command-contract tests. These are not browser/GPU benchmarks.
import assert from 'node:assert/strict';
import { PHOTO_PRESETS,PHOTO_TILE_SIZE,photoBatchSize,photoDimensions,photoSampleOffset,photoProgressiveSampleOffset,mergePhotoTile,photoTilePlan,photoAdaptivePlan,accumulatePhotoSample,resolvePhotoTile,createPhotoRender } from '../dist/photo-renderer.js';

assert.deepEqual(PHOTO_PRESETS.map(p=>p.id),['quick','high','maximum']);
assert.deepEqual(PHOTO_PRESETS.map(p=>p.samples),[1,4,16]);
assert.deepEqual(PHOTO_PRESETS.map(p=>p.budgetMs),[0,10000,120000]);
assert.deepEqual(photoDimensions(1600,900,1920),{width:1920,height:1080});
assert.deepEqual(photoDimensions(900,1600,3840),{width:2160,height:3840});
assert(photoDimensions(1,1,3840).width**2<=3840*2160,'Square outputs must respect the same memory budget');
assert.throws(()=>photoDimensions(0,1));
for(const samples of [4,8,16]){
 const offsets=Array.from({length:samples},(_,i)=>photoSampleOffset(i,samples));
 assert.equal(new Set(offsets.map(v=>v.join(','))).size,samples,'Every additional sample must trace a new subpixel ray');
 assert(offsets.every(v=>v.every(x=>x>-.5&&x<.5)));
 assert(Math.abs(offsets.reduce((s,v)=>s+v[0],0))<1e-10&&Math.abs(offsets.reduce((s,v)=>s+v[1],0))<1e-10,'Sample footprints are centered');
}
for(const [width,height] of [[1920,1080],[3840,2160],[173,107],[1080,1920]]){
 const tiles=photoTilePlan(width,height),area=tiles.reduce((sum,t)=>sum+t.width*t.height,0);assert.equal(area,width*height);
 const hit=new Uint8Array(width*height);
 for(const t of tiles){assert(t.width<=PHOTO_TILE_SIZE&&t.height<=PHOTO_TILE_SIZE);for(let y=t.y;y<t.y+t.height;y++)for(let x=t.x;x<t.x+t.width;x++)hit[y*width+x]++;}
 assert(hit.every(x=>x===1),'Every output pixel is covered exactly once, including edge tiles');
}
{
 const high=PHOTO_PRESETS[1],fast=photoAdaptivePlan(1600,900,high,.1,9000,1280),slow=photoAdaptivePlan(1600,900,high,2,9000,1280);
 assert.equal(fast.width,2560);assert(slow.width<fast.width&&slow.width>=1280);
 assert.equal(photoAdaptivePlan(1600,900,high,100,9000,1280),null,'Do not start a pass predicted to miss the budget or reduce a completed image');
 assert(slow.estimatedMs<=9000*.72,'Resolution reserves time for variable scene cost and encoding');
}
{
 const sum=new Float32Array(6),first=new Uint8Array([0,0,0,255,255,0,0,255]),second=new Uint8Array([255,255,255,255,255,0,0,255]);
 accumulatePhotoSample(sum,first,2);accumulatePhotoSample(sum,second,2);
 const encoded=resolvePhotoTile(sum,1,2,2,new Uint8ClampedArray(8));
 assert.deepEqual(Array.from(encoded.slice(0,4)),[255,0,0,255],'Flip the GL bottom-up rows exactly once');
 assert(encoded[4]>=187&&encoded[4]<=188,'Average radiance in linear light, not encoded bytes (which would give128)');
}

function fixture({webgl2=true,compileFail=false,readFail=false,fencePending=false,onDraw=()=>{}}={}){
 const calls={draws:0,waits:0,readbacks:0,readPixels:0,finish:0,begin:0,end:0,deletePrograms:0,deleteBuffers:0,deleteTextures:0,deleteFramebuffers:0,deleteSyncs:0,offsets:[],samples:[],resolution:null};
 let activeTile=[0,0],jitter=[0,0],size=[96,96],bufferBytes=null;const output=[],packed=new Map();
 globalThis.document={hidden:false};
 globalThis.OffscreenCanvas=class{
  constructor(width,height){this.width=width;this.height=height;}
  getContext(){return {createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),putImageData:(image,x,y)=>output.push({image,x,y})};}
  async convertToBlob(){return new Blob(['picture-png'],{type:'image/png'});}
 };
 const gl={
  VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,LINK_STATUS:35714,ARRAY_BUFFER:34962,STATIC_DRAW:35044,FLOAT:5126,TRIANGLES:4,
  FRAMEBUFFER:36160,FRAMEBUFFER_COMPLETE:36053,COLOR_ATTACHMENT0:36064,TEXTURE_2D:3553,TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,NEAREST:9728,CLAMP_TO_EDGE:33071,RGBA:6408,UNSIGNED_BYTE:5121,
  PIXEL_PACK_BUFFER:35051,STREAM_READ:35041,SYNC_GPU_COMMANDS_COMPLETE:37143,ALREADY_SIGNALED:37146,TIMEOUT_EXPIRED:37147,CONDITION_SATISFIED:37148,WAIT_FAILED:37149,
  SCISSOR_TEST:3089,BLEND:3042,DEPTH_TEST:2929,
  createProgram:()=>({}),createShader:()=>({}),shaderSource(){},compileShader(){},attachShader(){},linkProgram(){},deleteShader(){},deleteProgram(){calls.deletePrograms++;},
  getExtension:()=>null,getProgramParameter:()=>!compileFail,getProgramInfoLog:()=>'test compile error',getUniformLocation:(_,name)=>name,
  uniform2f(name,a,b){if(name==='uPhotoOffset'){activeTile=[a,b];calls.offsets.push([a,b]);}else if(name==='uPhotoJitter'){jitter=[a,b];calls.samples.push([a,b]);}else if(name==='uResolution')calls.resolution=[a,b];},uniform1i(){},uniform1f(){},uniform4f(){},uniform3fv(){},
  createBuffer:()=>({}),bindBuffer(){},bufferData(){},deleteBuffer(){calls.deleteBuffers++;},getAttribLocation:()=>0,enableVertexAttribArray(){},vertexAttribPointer(){},useProgram(){},
  createTexture:()=>({}),createFramebuffer:()=>({}),bindTexture(){},texParameteri(){},texImage2D(){},bindFramebuffer(){},framebufferTexture2D(){},checkFramebufferStatus:()=>36053,deleteTexture(){calls.deleteTextures++;},deleteFramebuffer(){calls.deleteFramebuffers++;},disable(){},
  viewport(x,y,w,h){size=[w,h];},drawArrays(){calls.draws++;onDraw(calls);},
  readPixels(x,y,w,h,format,type,destination){
   calls.readPixels++;if(readFail)throw Error('readback failed');bufferBytes=new Uint8Array(w*h*4);
   for(let i=0;i<w*h;i++){bufferBytes[i*4]=(activeTile[0]+(i%w))%256;bufferBytes[i*4+1]=200;bufferBytes[i*4+2]=100;bufferBytes[i*4+3]=255;}
   if(typeof destination!=='number')destination.set(bufferBytes);else packed.set(destination,bufferBytes);
  },
  fenceSync:()=>({}),clientWaitSync(sync,flags,timeout){assert.equal(timeout,0,'Never block waiting for the GPU');calls.waits++;return fencePending?37147:37146;},deleteSync(){calls.deleteSyncs++;},flush(){},finish(){calls.finish++;throw Error('finish is forbidden');},
  getBufferSubData(target,offset,destination,start,length){calls.readbacks++;destination.set(packed.get(offset).subarray(0,length));}
 };
 const renderer={gl,webgl2,disposed:false,contextLost:false,quality:'adaptive',time:27,state:{paused:false},presentationPaused:true,
  beginPhotoCapture(){calls.begin++;return {width:1920,height:1,time:this.time,features:{craft:false,warp:false,grid:false},uniforms:[{name:'uTime',method:'uniform1f',args:[this.time]}]};},
  endPhotoCapture(){calls.end++;}
 };
 return {renderer,calls,output};
}

async function withClock(fn){const saved=globalThis.performance;let clock=0;Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}});try{return await fn(ms=>clock+=ms);}finally{Object.defineProperty(globalThis,'performance',{configurable:true,value:saved});}}
for(const webgl2 of [true,false])await withClock(async advance=>{
 const f=fixture({webgl2,onDraw:()=>advance(12)}),progress=[],result=await createPhotoRender(f.renderer,{budgetMs:999999,onProgress:p=>progress.push(p)});
 assert.equal(result.width,2560);assert.equal(result.height,1);assert(result.samples>4,'Remaining time improves beyond the old fixed four-sample ceiling');assert.equal(result.blob.type,'image/png');
 assert(f.calls.readPixels<=f.calls.draws&&f.calls.readPixels>=f.calls.draws-4);assert(webgl2?f.calls.readbacks<=f.calls.readPixels&&f.calls.readbacks>=f.calls.readPixels-4:f.calls.readbacks===0);
 assert.deepEqual(f.calls.resolution,[2560,1],'Every tile sees the full export dimensions');
 assert(result.elapsedMs>=9900&&result.elapsedMs<=10000,'Useful rendering spends the work budget without an idle timer');
 assert.equal(result.complete,true);assert(result.completedPasses>2);assert.equal(result.fallback,false);
 assert.equal(result.workBudgetMs,10000,'Callers cannot increase the Higher resolution budget');
 assert(progress.every((p,i)=>!i||p.progress>=progress[i-1].progress),'Progress never reverses between complete passes');
 assert.equal(progress.at(-1).progress,1);assert.equal(progress.at(-1).phase,'Picture ready');
 assert.equal(f.calls.finish,0);assert.equal(f.calls.begin,1);assert.equal(f.calls.end,1);assert.equal(f.calls.deletePrograms,1);assert.equal(f.calls.deleteTextures,1);assert.equal(f.calls.deleteFramebuffers,1);
 assert.equal(f.renderer.quality,'adaptive');assert.equal(f.renderer.time,27);assert.equal(f.renderer.state.paused,false);assert.equal(f.renderer.presentationPaused,true);
});
await withClock(async advance=>{
 const f=fixture({onDraw:()=>advance(40)}),result=await createPhotoRender(f.renderer,{presetId:'maximum'});
 assert.equal(result.width,3840);assert.equal(result.height,2);assert(result.samples>16,'Maximum continues with new rays beyond16samples');assert(result.samplesMax>=result.samples);
 assert(result.elapsedMs>=119900&&result.elapsedMs<=120000);assert(f.calls.draws>1000);
});
{
 const offsets=Array.from({length:4097},(_,i)=>photoProgressiveSampleOffset(i));
 assert.equal(new Set(offsets.map(v=>v.map(x=>x.toFixed(9)).join(','))).size,offsets.length,'Every progressive sample is physically distinct, not a floating-point near-duplicate');
 for(let j=0;j<2;j++)assert(Math.abs(offsets.reduce((s,v)=>s+v[j],0)/offsets.length)<.001,'Progressive samples converge to a centered footprint');
 const mean=new Uint16Array(6),tile={x:0,y:0,width:1,height:2};
 const image=new Uint8ClampedArray(8);mergePhotoTile(mean,1,tile,new Float32Array([0,0,0,1,0,0]),1,0,image);
 mergePhotoTile(mean,1,tile,new Float32Array([1,1,1,1,0,0]),1,1,image);
 assert.deepEqual(Array.from(image.slice(0,4)),[255,0,0,255]);assert(image[4]>=187&&image[4]<=188,'Progressive means retain linear-light averaging');
}
await withClock(async advance=>{
 const f=fixture({onDraw:()=>advance(12)}),baseline={blob:new Blob(['retina baseline']),width:3840,height:2};
 const result=await createPhotoRender(f.renderer,{presetId:'high',baseline});
 assert(result.elapsedMs>=9900);assert(!result.fallback,'A large live screenshot must not suppress procedural photo refinement');assert.equal(result.width,2560);assert(result.samples>4);
});
{
 const controller=new AbortController(),f=fixture({onDraw:()=>controller.abort()});
 await assert.rejects(createPhotoRender(f.renderer,{signal:controller.signal}),{name:'AbortError'});
 assert.equal(f.calls.draws,1);assert.equal(f.calls.end,1,'Cancelling always returns ownership to the interactive renderer');assert.equal(f.calls.deletePrograms,1);
}
{
 const controller=new AbortController(),f=fixture({fencePending:true,onDraw:calls=>{if(calls.draws===1)setTimeout(()=>controller.abort(),0);}});
 await assert.rejects(createPhotoRender(f.renderer,{signal:controller.signal}),{name:'AbortError'});
 assert.equal(f.calls.draws,1,'Never queue past the small in-flight batch');assert(f.renderer.gpuFence?.sync,'The pending fence returns to live rendering before it can submit more work');assert.equal(f.calls.deleteSyncs,0);assert.equal(f.calls.end,1);
}
for(const failure of ['compileFail','readFail']){
 const f=fixture({[failure]:true});await assert.rejects(createPhotoRender(f.renderer));assert.equal(f.calls.end,1);assert.equal(f.calls.deletePrograms,1);
}
{
 const controller=new AbortController();controller.abort();const f=fixture();await assert.rejects(createPhotoRender(f.renderer,{signal:controller.signal}),{name:'AbortError'});assert.equal(f.calls.begin,0);
 await assert.rejects(createPhotoRender({cpuMode:true}),/GPU/);
}
{
 const controller=new AbortController(),f=fixture();
 OffscreenCanvas.prototype.convertToBlob=()=>{queueMicrotask(()=>controller.abort());return new Promise(()=>{});};
 await assert.rejects(createPhotoRender(f.renderer,{signal:controller.signal,baseline:{blob:new Blob(['baseline']),width:64,height:1}}),{name:'AbortError'},'Cancelling a stalled refinement encoder must not wait for its two-minute work budget');
 assert.equal(f.calls.end,1);
}
{
 const baseline={blob:new Blob(['frozen screenshot'],{type:'image/png'}),width:1280,height:1};
 const f=fixture(),result=await createPhotoRender(f.renderer,{baseline,budgetMs:0});
 assert.equal(result.blob,baseline.blob);assert.equal(result.complete,true);assert.equal(result.fallback,true);assert.equal(result.budgetLimited,true);
 assert.equal(f.calls.draws,0);assert.equal(f.calls.end,1,'Exhausted startup budget still restores the captured scene');
 const failed=fixture({compileFail:true}),recovered=await createPhotoRender(failed.renderer,{baseline});
 assert.equal(recovered.blob,baseline.blob);assert.match(recovered.refinementError,/compile/);assert.equal(failed.calls.end,1);
 const controller=new AbortController(),cancelled=fixture({onDraw:()=>controller.abort()});
 await assert.rejects(createPhotoRender(cancelled.renderer,{baseline,signal:controller.signal}),{name:'AbortError'},'A baseline must never suppress explicit cancellation');
}
{
 const saved=globalThis.performance;let clock=0;
 Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}});
 try{
  const f=fixture({onDraw:calls=>{clock=calls.draws<40?calls.draws:600;}}),baseline={blob:new Blob(['baseline']),width:64,height:1};
  const result=await createPhotoRender(f.renderer,{baseline,budgetMs:500});
  assert.equal(result.complete,true);assert(result.completedPasses>=1);assert.equal(result.fallback,false);assert.equal(result.budgetLimited,true);
  assert(result.width>=1920);assert(result.samples>=1,'A completed image survives the refinement deadline');
  assert.equal(f.calls.draws,40,'No more GPU work is scheduled after the work deadline');
  assert(f.renderer.gpuFence?.sync,'An interrupted batch retains its fence when live rendering resumes');
  assert.equal(f.calls.end,1);
 }finally{Object.defineProperty(globalThis,'performance',{configurable:true,value:saved});}
}
{
 const blob=new Blob(['cpu screenshot'],{type:'image/png'}),renderer={cpuMode:true,captureImage:async()=>blob,getState:()=>({width:800,height:600})};
 const result=await createPhotoRender(renderer,{presetId:'quick'});
 assert.equal(result.blob,blob);assert.equal(result.complete,true);assert.equal(result.samples,1);assert.equal(result.steps,0);assert.equal(result.width,800);
}
assert.deepEqual(PHOTO_PRESETS.map(photoBatchSize),[1,4,2]);
assert.deepEqual(PHOTO_PRESETS.map(p=>p.steps),[0,1024,3072]);
console.log('PASS: bounded tiled high-resolution pictures, genuine extensible centered samples and full active time budgets, linear-light accumulation, correct row orientation and complete tile coverage, nonblocking WebGL2 readback, WebGL1 compatibility, cancellation/error cleanup, and unchanged live quality/time.');

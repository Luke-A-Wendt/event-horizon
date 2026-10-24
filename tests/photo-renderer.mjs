// Logic and GPU-command-contract tests. These are not browser/GPU benchmarks.
import assert from 'node:assert/strict';
import { PHOTO_PRESETS,PHOTO_TILE_SIZE,photoBatchSize,photoDimensions,photoSampleOffset,photoTilePlan,accumulatePhotoSample,resolvePhotoTile,createPhotoRender } from '../dist/photo-renderer.js';

assert.deepEqual(PHOTO_PRESETS.map(p=>p.samples),[4,8,16]);
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

for(const webgl2 of [true,false]){
 const f=fixture({webgl2}),progress=[],result=await createPhotoRender(f.renderer,{onProgress:p=>progress.push(p)});
 assert.equal(result.width,1920);assert.equal(result.height,1);assert.equal(result.samples,4);assert.equal(result.blob.type,'image/png');
 assert.equal(f.calls.draws,30*4);assert.equal(f.calls.readPixels,f.calls.draws);assert.equal(f.calls.readbacks,webgl2?f.calls.draws:0);
 assert.equal(f.calls.waits,webgl2?f.calls.draws/4:0,'WebGL2 batches at most four small samples per fence');
 assert.deepEqual(f.calls.resolution,[1920,1],'Every tile sees the full export dimensions');
 assert.equal(f.output.length,30);for(let tile=0;tile<30;tile++){assert.equal(f.output[tile].x,tile*64);assert.equal(f.output[tile].y,0);assert.equal(f.output[tile].image.data[0],tile*64%256);}
 assert.equal(progress.at(-1).progress,1);assert.equal(progress.at(-1).phase,'Picture ready');
 assert.equal(f.calls.finish,0);assert.equal(f.calls.begin,1);assert.equal(f.calls.end,1);assert.equal(f.calls.deletePrograms,1);assert.equal(f.calls.deleteTextures,1);assert.equal(f.calls.deleteFramebuffers,1);
 assert.equal(f.renderer.quality,'adaptive');assert.equal(f.renderer.time,27);assert.equal(f.renderer.state.paused,false);assert.equal(f.renderer.presentationPaused,true);
}
{
 const f=fixture(),result=await createPhotoRender(f.renderer,{presetId:'maximum'});
 assert.equal(result.width,3840);assert.equal(result.height,2);assert.equal(result.samples,16);assert.equal(f.calls.draws,60*16);assert.equal(f.calls.waits,60*8);
}
{
 const controller=new AbortController(),f=fixture({onDraw:()=>controller.abort()});
 await assert.rejects(createPhotoRender(f.renderer,{signal:controller.signal}),{name:'AbortError'});
 assert.equal(f.calls.draws,1);assert.equal(f.calls.end,1,'Cancelling always returns ownership to the interactive renderer');assert.equal(f.calls.deletePrograms,1);
}
{
 const controller=new AbortController(),f=fixture({fencePending:true,onDraw:calls=>{if(calls.draws===4)setTimeout(()=>controller.abort(),0);}});
 await assert.rejects(createPhotoRender(f.renderer,{signal:controller.signal}),{name:'AbortError'});
 assert.equal(f.calls.draws,4,'Never queue past the small in-flight batch');assert.equal(f.calls.deleteSyncs,1);assert.equal(f.calls.end,1);
}
for(const failure of ['compileFail','readFail']){
 const f=fixture({[failure]:true});await assert.rejects(createPhotoRender(f.renderer));assert.equal(f.calls.end,1);assert.equal(f.calls.deletePrograms,1);
}
{
 const controller=new AbortController();controller.abort();const f=fixture();await assert.rejects(createPhotoRender(f.renderer,{signal:controller.signal}),{name:'AbortError'});assert.equal(f.calls.begin,0);
 await assert.rejects(createPhotoRender({cpuMode:true}),/GPU/);
}
assert.deepEqual(PHOTO_PRESETS.map(photoBatchSize),[4,4,2]);
assert.deepEqual(PHOTO_PRESETS.map(p=>p.steps),[1024,1536,3072]);
console.log('PASS: bounded tiled high-resolution pictures, genuine4/8/16 centered samples, linear-light accumulation, correct row orientation and complete tile coverage, nonblocking WebGL2 readback, WebGL1 compatibility, cancellation/error cleanup, and unchanged live quality/time.');

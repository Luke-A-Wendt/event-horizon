// A recording GL stub for logic tests and feeding the real shader to native EGL.
// It does not emulate a browser or claim to validate browser behavior.
export function fixture({width=900,height=650,dpr=1,maxSize=8192,webgl2=true,parallelCompile=false,compileComplete=true,gpuComplete=true,gpuLatencyMs=null,completionQuery=false}={}) {
 const uniforms=new Map(),sources=[],programs=[];
 let draws=0,disposed=0,activeProgram=null,nextId=1;
 const calls={shaderStatus:0,linkStatus:0,completionStatus:0,fence:0,wait:0,deleteSync:0,finish:0,flush:0,capture:0};
 const assertQueryAvailability=key=>{if(key!==34919)throw Error('Completion polling must not synchronously read GPU timing results');};
 const control={compileComplete,gpuComplete,waitStatus:null,now:0,gpuLatencyMs,lastDrawTime:null,lastCapture:null,linkSuccess:true};
 const target=()=>({listeners:new Map(),addEventListener(name,fn){this.listeners.set(name,fn);},removeEventListener(name){this.listeners.delete(name);},emit(name,event={}){this.listeners.get(name)?.({preventDefault(){},...event});}});
 const base={
  VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,MAX_RENDERBUFFER_SIZE:34024,MAX_TEXTURE_SIZE:3379,MAX_FRAGMENT_UNIFORM_VECTORS:36349,
  COMPILE_STATUS:35713,LINK_STATUS:35714,ARRAY_BUFFER:34962,STATIC_DRAW:35044,FLOAT:5126,TRIANGLES:4,
  SYNC_GPU_COMMANDS_COMPLETE:37143,ALREADY_SIGNALED:37146,TIMEOUT_EXPIRED:37147,CONDITION_SATISFIED:37148,WAIT_FAILED:37149,SYNC_FLUSH_COMMANDS_BIT:1,
  createShader:type=>({id:nextId++,type,source:''}),
  shaderSource:(shader,source)=>{shader.source=source;sources.push({type:shader.type,source});},
  createProgram:()=>{const p={id:nextId++,shaders:[]};programs.push(p);return p;},
  attachShader:(program,shader)=>program.shaders.push(shader),useProgram:program=>{activeProgram=program;},
  getExtension:name=>name==='KHR_parallel_shader_compile'&&parallelCompile?{COMPLETION_STATUS_KHR:37297}:name==='EXT_disjoint_timer_query'&&completionQuery?{
   TIME_ELAPSED_EXT:35007,QUERY_RESULT_AVAILABLE_EXT:34919,
   createQueryEXT:()=>({id:nextId++}),beginQueryEXT:(_,query)=>{control.activeQuery=query;},
   endQueryEXT:()=>{const query=control.activeQuery,latency=typeof control.gpuLatencyMs==='function'?control.gpuLatencyMs(uniforms):control.gpuLatencyMs;query.readyAt=latency===null?null:control.now+latency;control.activeQuery=null;},
   getQueryObjectEXT:(query,key)=>{assertQueryAvailability(key);return query.readyAt===null?control.gpuComplete:control.now>=query.readyAt;},deleteQueryEXT:()=>{calls.deleteQuery=(calls.deleteQuery||0)+1;}
  }:null,
  getParameter:k=>k===36349?512:maxSize,
  getShaderParameter:()=>{calls.shaderStatus++;return true;},
  getProgramParameter:(program,key)=>{if(key===37297){calls.completionStatus++;return control.compileComplete;}calls.linkStatus++;return control.linkSuccess;},
  getShaderInfoLog:()=>'',getProgramInfoLog:()=>control.linkSuccess?'':'Recorded link failure',getAttribLocation:()=>0,getUniformLocation:(_,name)=>name,
  fenceSync:()=>{calls.fence++;const latency=typeof control.gpuLatencyMs==='function'?control.gpuLatencyMs(uniforms):control.gpuLatencyMs;return {id:nextId++,readyAt:latency===null?null:control.now+latency};},
  clientWaitSync:(sync,flags,timeout)=>{calls.wait++;if(timeout!==0)throw Error('GPU fence waits must never block');return control.waitStatus??((sync.readyAt===null?control.gpuComplete:control.now>=sync.readyAt)?37146:37147);},
  deleteSync:()=>{calls.deleteSync++;},finish:()=>{calls.finish++;throw Error('gl.finish() blocks the UI thread');},flush:()=>{calls.flush++;},
  drawArrays:()=>{draws++;control.lastDrawTime=control.now;},deleteBuffer:()=>disposed++,deleteProgram:()=>disposed++
 };
 for(const fn of ['uniform1f','uniform1i','uniform2f','uniform3f','uniform4f','uniform1fv','uniform2fv','uniform3fv','uniform4fv','uniformMatrix3fv','uniformMatrix4fv'])
  base[fn]=(name,...args)=>uniforms.set(name,{method:fn,args:args.map(x=>ArrayBuffer.isView(x)?Array.from(x):x)});
 const gl=new Proxy(base,{get:(obj,key)=>key in obj?obj[key]:(...args)=>({})});
 globalThis.window={...target(),devicePixelRatio:dpr};globalThis.document={...target(),hidden:false};
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 const canvas={...target(),style:{},getContext:kind=>kind==='webgl2'&&!webgl2?null:gl,getBoundingClientRect:()=>({width,height}),setPointerCapture(){},releasePointerCapture(){},focus(){},toBlob(callback,type='image/png'){calls.capture++;control.lastCapture={time:control.now,drawTime:control.lastDrawTime,draws,steps:uniforms.get('uSteps')?.args[0]};queueMicrotask(()=>callback(new Blob(['recorded-png'],{type})));}};
 return {canvas,gl,uniforms,sources,programs,calls,control,step(renderer,now){control.now=now;renderer.now=()=>control.now;renderer.frame(now);},get draws(){return draws},get disposed(){return disposed},get activeProgram(){return activeProgram},get activeSources(){return activeProgram?.shaders.map(({type,source})=>({type,source}))||[]}};
}

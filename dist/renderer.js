/* All geometry is in fixed GM_ref/c² units, M_ref=4.3 million solar masses.
 * Holding observer position fixed while changing M therefore changes apparent
 * scale. Curved rays, plasma, binary lens fields, and debris are approximations. */
import { DEFAULTS, SCENE_PRESETS, REFERENCE_MASS, horizonRg, iscoRg, makePreset } from './config.js';
import { VERTEX, createFragment } from './shaders.js';
import { OBJECT_KIND, OBJECT_TYPES, OBJECT_DIMENSIONS, REFERENCE_RG_METERS, objectRadiusMeters } from './objects.js';
import { RenderBudget, QUALITY_PROFILES } from './performance-controller.js';
import { XRViewController } from './xr-view.js';
import { bridgePath, bridgeConformal } from './bridge-math.js';
const UNIFORM_NAMES=['uResolution','uTime','uExposure','uDistance','uYaw','uPitch','uLookYaw','uLookPitch','uMass','uBounds','uStars','uPrimaryAxis','uSecondaryAxis','uSpin','uHorizon','uIsco','uDiskOuter','uHoles[0]','uFlags','uFlags2','uDiskParams','uDiskColor','uNebulaParams','uNebulaColor','uJets','uJetColor','uSpectrum','uBinary','uSteps','uObjectCount','uObjects[0]','uColors[0]','uTidal','uStarColor','uObserver','uForward','uRight','uUp','uInspectIndex','uHideObjectIndex','uInspectCamera','uInspectForward','uInspectRight','uInspectUp','uHeadings[0]','uWarpCenter','uWarpAxis','uWarpRadius','uWarpStrength','uWarpThickness','uWarpFlags','uWarpObserver','uWarpObjectIndex','uWarpGridOffset','uWarpGridRotation','uDetail','uRayViewport','uInverseProjection','uProjectionMode','uBridge','uWhiteHole','uBridgeSkyColor','uBridgeSkyParams','uBridgeOtherNebula','uLuminosities[0]','uCockpitMode'];
const LIMITS={mass:[.1,100],spin:[0,.998],secondarySpin:[0,.998],speed:[0,10],exposure:[.1,5],starDensity:[0,3],diskOuter:[6.1,60],diskThickness:[.15,6],diskDensity:[0,4],nebulaScale:[.2,4],nebulaIntensity:[0,4],nebulaRotation:[-360,360],planetMass:[.01,10000],planetRadius:[.1,15],planetDistance:[4,100],starRadius:[.1,5],disruptionStrength:[.1,3],starDistance:[5,40],binaryRatio:[.1,4],binarySeparation:[12,100],primaryTilt:[0,180],primaryAzimuth:[-360,360],secondaryTilt:[0,180],secondaryAzimuth:[-360,360],jetSpread:[.15,5],jetLength:[.2,3],jetIntensity:[0,4],warpFactor:[0,10],warpRadius:[1.3,8],warpThickness:[1,20],bridgeRadius:[3,30],bridgeOtherScale:[.2,4],bridgeOtherIntensity:[0,4],bridgeOtherRotation:[-360,360]};
const ENUMS={bridgeTravelerType:['enterprise','shuttle','astronaut'],bridgeOtherShape:['cloud','shell','filaments','spiral'],objectScaleMode:['physical'],warpScenario:['isolated','orbit','excursion'],spectrum:['visible','infrared','xray','radio','gamma'],viewMode:['orbit','look','free'],diskStyle:['thermal','hydrogen','helium','dust','nebula','radiant','ribbons'],nebulaShape:['cloud','shell','filaments','spiral']};
const NUMERIC_STATE_KEYS=Object.keys(DEFAULTS).filter(key=>typeof DEFAULTS[key]==='number');
const CAMERA_KEYS=['yaw','pitch','distance','lookYaw','lookPitch','focusDistance'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const radians=d=>d*Math.PI/180;
function color(hex,fallback='#ffffff'){
 const h=/^#[0-9a-f]{6}$/i.test(hex)?hex:fallback;
 return [parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255];
}
function axis(tilt,azimuth){const t=radians(tilt),a=radians(azimuth);return [Math.sin(t)*Math.cos(a),Math.cos(t),Math.sin(t)*Math.sin(a)];}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function basis(up){const ref=Math.abs(up[2])>.9?[1,0,0]:[0,0,1];const x=cross(up,ref),length=Math.hypot(...x);for(let i=0;i<3;i++)x[i]/=length;return [x,up,cross(x,up)];}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const mul=(a,s)=>a.map(x=>x*s);
const transform=(frame,v)=>[0,1,2].map(i=>frame[0][i]*v[0]+frame[1][i]*v[1]+frame[2][i]*v[2]);
const inverse=(frame,v)=>frame.map(axis=>dot(axis,v));
const TAU=2*Math.PI;
const wrap=a=>((a%TAU)+TAU)%TAU;
function finiteVector(vector,length=vector?.length){if(!vector||vector.length!==length)return false;for(let i=0;i<length;i++)if(!Number.isFinite(vector[i]))return false;return true;}
function validBasis(right,up,forward){if(!finiteVector(right,3)||!finiteVector(up,3)||!finiteVector(forward,3))return false;return Math.abs(dot(right,right)-1)<.002&&Math.abs(dot(up,up)-1)<.002&&Math.abs(dot(forward,forward)-1)<.002&&Math.abs(dot(right,up))<.002&&Math.abs(dot(right,forward))<.002&&Math.abs(dot(up,forward))<.002;}
function rocheFraction(q){const x=Math.cbrt(q);return .49*x*x/(.6*x*x+Math.log1p(x));}

export class BlackHoleRenderer {
 constructor(canvas,{onStats=()=>{},onError=()=>{},bindControls=true,autoStart=true}={}){
  this.canvas=canvas;this.onStats=onStats;this.onError=onError;
  this.state={...DEFAULTS,objectScaleMode:'physical'};this.camera={yaw:.25,pitch:.19,distance:32,lookYaw:0,lookPitch:0,focusDistance:6};this.target={...this.camera};
  this.sceneId='disk';this.sceneFocusId=null;this.bridgeObjectId=null;this.bridgeTime=0;this.bridgeTravelTime=0;this.freePosition=null;this.freeTarget=null;this.freeBasis=null;this.photoActive=false;this.xr=null;this.nextObjectId=1;this.selectedId=null;this.focusId=null;this.focusMode=null;this.warpObjectId=null;this.savedOverview=null;this.warpTravelWorld=0;this.warpTravelPosition=[0,0,0];this.warpTravelTime=0;this.objectFrames=[];this.cameraFrame=null;
  this.quality='adaptive';this.budget=new RenderBudget();this.adaptiveScale=this.budget.profile.scale;this.steps=this.budget.profile.steps;this.objects=[];this.time=0;
  this.lastTime=0;this.statsStart=0;this.frames=0;this.fps=0;this.lastSubmit=0;this.nextSubmit=0;this.gpuFence=null;this.resizePending=false;this.resizeMeasurePending=false;this.presentationPaused=false;this.captureRequest=null;this.warmupFrames=0;this.frame=this.frame.bind(this);
  this.listeners=[];this.pointers=new Map();this.disposed=false;this.travel=false;this.navigationUntil=0;this.pinchOwned=false;
  this.luminosityData=new Float32Array(12);this.luminosityData.fill(1);this.headingData=new Float32Array(24);this.objectData=new Float32Array(48);this.colorData=new Float32Array(48);this.holeData=new Float32Array(8);this.tidalData=new Float32Array(4);
  this.configCache={};this.refreshConfiguration();this.initGL();if(bindControls)this.bindControls();this.resize();
  this.raf=autoStart?requestAnimationFrame(this.frame):0;
 }
 initGL(){
  this.ready=false;this.contextLost=false;this.gl=null;this.program=null;this.activeProgram=null;this.pendingProgram=null;this.programs=new Map();this.failedPrograms=new Set();this.gpuFence=null;this.budget.setContext(true,this.now());
  const options={alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'high-performance',preserveDrawingBuffer:false};
  let gl=this.canvas.getContext('webgl2',options);this.webgl2=!!gl;if(!gl)gl=this.canvas.getContext('webgl',options);
  if(!gl){this.onError('WebGL is unavailable. Enable hardware acceleration or try a current browser.');return;}
  this.gl=gl;this.budget.setContext(this.webgl2,this.now());
  const extension=gl.getExtension('KHR_parallel_shader_compile');this.parallelCompile=extension&&typeof extension.COMPLETION_STATUS_KHR==='number'?extension:null;
  this.canFence=this.webgl2&&typeof gl.fenceSync==='function'&&typeof gl.clientWaitSync==='function'&&typeof gl.SYNC_GPU_COMMANDS_COMPLETE==='number'&&typeof gl.TIMEOUT_EXPIRED==='number';
  this.maxSize=Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),gl.getParameter(gl.MAX_TEXTURE_SIZE),8192);
  this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  // A cold start never compiles the craft, warp or Ultra branches unnecessarily.
  this.requestProgram(this.shaderFeatures());
 }
 shaderFeatures(){
  const warp=!!this.state.warp&&!!this.warpObjectId;let craftMask=warp?8:0;
  for(const object of this.objects){const kind=OBJECT_KIND[object.type];if(kind>=3&&kind<=6)craftMask|=1<<(kind-3);}
  return {ultra:this.quality==='ultra',craft:craftMask!==0,craftMask,warp,grid:!!this.state.grid,bridge:!!this.state.bridge,probe:this.objects.some(object=>object.type==='probe')};
 }
 programKey(features){return `${features.ultra?1:0}${features.warp?1:0}${features.grid?1:0}${features.bridge?1:0}${features.probe?1:0}:${features.craftMask??(features.craft?15:0)}`;}
 programSupports(features,active=this.activeProgram){const mask=features.craftMask??(features.craft?15:0);return !!active&&((active.features.craftMask??(active.features.craft?15:0))&mask)===mask&&(!features.warp||active.features.warp)&&(!features.grid||active.features.grid)&&(!features.bridge||active.features.bridge)&&(!features.probe||active.features.probe);}
 requestProgram(features=this.shaderFeatures()){
  if(!this.gl||this.contextLost||this.disposed)return;
  const key=this.programKey(features),cached=this.programs.get(key);
  if(cached){this.activateProgram(cached);return;}
  if(this.pendingProgram||this.failedPrograms.has(key))return;
  const gl=this.gl,shaders=[];let program;
  try{
   let vs=VERTEX,fs=createFragment(features);
   if(this.webgl2){vs='#version 300 es\n'+vs.replace('attribute','in');fs='#version 300 es\n'+fs.replace('precision highp float;','precision highp float;\nout vec4 outColor;').replaceAll('gl_FragColor','outColor');}
   for(const [type,source] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);}
   program=gl.createProgram();for(const shader of shaders)gl.attachShader(program,shader);gl.linkProgram(program);
   this.pendingProgram={key,features:{...features},program,shaders};
   // LINK_STATUS / shader logs can synchronize. With KHR, only ask after its
   // completion bit becomes true in a later animation frame.
   if(!this.parallelCompile)this.pollProgram();
  }catch(error){for(const shader of shaders)gl.deleteShader(shader);if(program)gl.deleteProgram(program);this.pendingProgram=null;this.failedPrograms.add(key);this.cancelCapture('The selected graphics could not compile.');this.onError('This graphics mode could not start. '+error.message);}
 }
 pollProgram(){
  const pending=this.pendingProgram;if(!pending||this.contextLost)return;
  const gl=this.gl;if(this.parallelCompile&&!gl.getProgramParameter(pending.program,this.parallelCompile.COMPLETION_STATUS_KHR))return;
  this.pendingProgram=null;
  if(!gl.getProgramParameter(pending.program,gl.LINK_STATUS)){
   const message=gl.getProgramInfoLog(pending.program)||pending.shaders.map(shader=>gl.getShaderInfoLog(shader)).join('\n');
   pending.shaders.forEach(shader=>gl.deleteShader(shader));gl.deleteProgram(pending.program);this.failedPrograms.add(pending.key);this.cancelCapture('The selected graphics could not compile.');this.onError('This graphics mode could not start. '+message);return;
  }
  pending.shaders.forEach(shader=>gl.deleteShader(shader));delete pending.shaders;
  pending.uniforms={};for(const name of UNIFORM_NAMES)pending.uniforms[name]=gl.getUniformLocation(pending.program,name);
  pending.attribute=gl.getAttribLocation(pending.program,'aPosition');this.programs.set(pending.key,pending);
  const desired=this.shaderFeatures();
  if(pending.key===this.programKey(desired)||!this.activeProgram||(!this.programSupports(desired)&&this.programSupports(desired,pending)))this.activateProgram(pending);
  while(this.programs.size>4){const obsolete=[...this.programs.values()].find(p=>p!==this.activeProgram);if(!obsolete)break;gl.deleteProgram(obsolete.program);this.programs.delete(obsolete.key);}
 }
 activateProgram(entry){
  if(this.activeProgram===entry)return;
  const gl=this.gl;this.activeProgram=entry;this.program=entry.program;this.uniforms=entry.uniforms;this.ready=true;
  this.programs.delete(entry.key);this.programs.set(entry.key,entry);gl.useProgram(entry.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(entry.attribute);gl.vertexAttribPointer(entry.attribute,2,gl.FLOAT,false,0,0);
  this.resizePending=true;this.warmupFrames=1;this.budget.resetTiming(this.now(),'Preparing the selected graphics');this.onError('');
 }
 releaseFence(){if(this.gpuFence&&this.gl&&!this.contextLost)this.gl.deleteSync(this.gpuFence.sync);this.gpuFence=null;}
 gpuAvailable(now){
  if(!this.gpuFence)return true;
  const gl=this.gl,fence=this.gpuFence,status=gl.clientWaitSync(fence.sync,0,0),elapsed=Math.max(0,now-fence.started);
  const complete=status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED;
  fence.polls=(fence.polls||0)+1;
  const eligible=!fence.ignoreLatency&&!fence.warmup&&fence.generation===this.budget.generation;
  if(this.budget.noteGpu(now,elapsed,complete,{eligible,polls:fence.polls}))this.resizePending=true;
  if(status===gl.WAIT_FAILED){this.releaseFence();this.canFence=false;this.budget.resetTiming(now);return false;}
  if(!complete)return false;
  this.frames++;
  if(this.budget.noteCompletion(now,{eligible}))this.resizePending=true;
  this.releaseFence();return true;
 }
 setPresentationPaused(paused){
  const next=Boolean(paused);if(next===this.presentationPaused)return;
  this.presentationPaused=next;this.lastTime=0;this.lastSubmit=0;this.nextSubmit=0;this.statsStart=0;this.frames=0;this.budget.resetTiming(this.now());
  if(this.gpuFence)this.gpuFence.ignoreLatency=true;
  if(next){cancelAnimationFrame(this.raf);this.raf=0;this.cancelCapture('Image capture was cancelled while the view is covered.');}
  else if(!this.disposed&&!document.hidden&&!this.photoActive&&!this.xr?.active&&!this.raf)this.raf=requestAnimationFrame(this.frame);
 }
 cancelCapture(message){
  const request=this.captureRequest;if(!request)return;
  this.captureRequest=null;clearTimeout(request.timeout);request.reject(new Error(message));
 }
 captureImage(){
  if(this.disposed||this.contextLost||document.hidden||this.presentationPaused||this.photoActive||this.xr?.active)return Promise.reject(new Error('The view must be visible and the GPU available to save an image.'));
  if(!this.gl||(!this.ready&&!this.pendingProgram))return Promise.reject(new Error('Start the GPU renderer before saving an image.'));
  if(this.failedPrograms.has(this.programKey(this.shaderFeatures())))return Promise.reject(new Error('The selected graphics could not compile. Choose another quality or retry the renderer.'));
  if(typeof this.canvas.toBlob!=='function')return Promise.reject(new Error('This browser cannot save a canvas image.'));
  if(this.captureRequest)return this.captureRequest.promise;
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const request={promise,resolve,reject,quality:this.quality,timeout:null};this.captureRequest=request;
  request.timeout=setTimeout(()=>this.cancelCapture('Image capture timed out waiting for the selected graphics.'),45000);
  if(!this.raf)this.raf=requestAnimationFrame(this.frame);
  return promise;
 }
 captureFreshFrame(){
  const request=this.captureRequest;if(!request)return;
  // Ultra may temporarily show the compatible High program while compiling.
  // A saved Ultra image must wait for Ultra itself, never that preview.
  if(this.quality!==request.quality){this.cancelCapture('Render quality changed before the image was ready. Please save again.');return;}
  if((this.quality==='ultra')!==!!this.activeProgram?.features.ultra)return;
  this.captureRequest=null;clearTimeout(request.timeout);
  // preserveDrawingBuffer is false: snapshot in the SAME task as the new draw,
  // before the browser composites and is allowed to discard its drawing buffer.
  try{this.canvas.toBlob(blob=>blob?request.resolve(blob):request.reject(new Error('The browser could not save this image.')),'image/png');}
  catch(error){request.reject(error);}
 }
 listen(target,name,fn,options){target.addEventListener(name,fn,options);this.listeners.push(()=>target.removeEventListener(name,fn,options));}
 now(){return typeof performance!=='undefined'?performance.now():Date.now();}
 bindControls(){
  const canvas=this.canvas;canvas.style.touchAction='none';canvas.style.cursor='grab';
  this.listen(canvas,'pointerdown',e=>{
   const mouse=e.pointerType==='mouse';if(mouse&&e.button!==0&&e.button!==1)return;
   const mode=(e.button===1||this.state.viewMode==='look'||this.state.viewMode==='free'||this.focusMode==='onboard')?'look':'orbit';
   if(mouse&&this.pointers.size)return;
   if(mode==='look'&&this.now()<this.navigationUntil)return;
   e.preventDefault?.();this.travel=false;this.target.distance=this.camera.distance;
   this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,mode});canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';
   if(this.pointers.size>1){this.pinchOwned=true;if(this.state.viewMode!=='free')this.resetView();}else if(mode==='orbit')this.resetView();
  });
  this.listen(canvas,'pointermove',e=>{
   if(!this.pointers.has(e.pointerId))return;
   const previous=this.pointers.get(e.pointerId),dx=e.clientX-previous.x,dy=e.clientY-previous.y;
   if(this.pointers.size>1){
    const other=[...this.pointers.entries()].find(([id])=>id!==e.pointerId)?.[1];
    if(other){const before=Math.hypot(previous.x-other.x,previous.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);if(after>1)this.zoom(before/after);}
   }else if(!this.pinchOwned){
    if(previous.mode==='look'){this.target.lookYaw-=dx*.006;this.target.lookPitch=clamp(this.target.lookPitch+dy*.005,-1.5533,1.5533);}
    else this.rotate(-dx*.006,dy*.005);
   }
   this.pointers.set(e.pointerId,{...previous,x:e.clientX,y:e.clientY});
  });
  const end=e=>{this.pointers.delete(e.pointerId);if(!this.pointers.size){this.pinchOwned=false;canvas.style.cursor='grab';}};
  this.listen(canvas,'pointerup',end);this.listen(canvas,'pointercancel',end);this.listen(canvas,'lostpointercapture',end);
  this.listen(canvas,'auxclick',e=>{if(e.button===1)e.preventDefault();});
  this.listen(canvas,'wheel',e=>{e.preventDefault();if([...this.pointers.values()].some(p=>p.mode==='look'))return;this.zoom(Math.exp(clamp(e.deltaY,-180,180)*.0022));},{passive:false});
  this.listen(canvas,'keydown',e=>{
   const directional=(yaw,pitch)=>{if(this.state.viewMode==='look'||this.state.viewMode==='free'||this.focusMode==='onboard'||e.shiftKey){this.travel=false;this.target.lookYaw+=yaw;this.target.lookPitch=clamp(this.target.lookPitch+pitch,-1.5533,1.5533);}else this.rotate(yaw,pitch);};
   const actions={ArrowLeft:()=>directional(-.10,0),ArrowRight:()=>directional(.10,0),ArrowUp:()=>directional(0,.08),ArrowDown:()=>directional(0,-.08),'+':()=>this.zoom(.85),'=':()=>this.zoom(.85),'-':()=>this.zoom(1.18),Home:()=>this.resetCamera(),w:()=>this.zoom(.85),s:()=>this.zoom(1.18),W:()=>this.zoom(.85),S:()=>this.zoom(1.18)};
   if(actions[e.key]){e.preventDefault();actions[e.key]();}
  });
  this.listen(window,'resize',()=>this.resize(true));
  this.listen(document,'visibilitychange',()=>{this.lastTime=0;this.lastSubmit=0;this.nextSubmit=0;this.statsStart=0;this.frames=0;this.budget.resetTiming(this.now());if(this.gpuFence)this.gpuFence.ignoreLatency=true;this.pointers.clear();this.pinchOwned=false;if(document.hidden){cancelAnimationFrame(this.raf);this.raf=0;this.cancelCapture('Image capture was cancelled while the page was hidden.');}else if(!this.disposed&&!this.presentationPaused&&!this.photoActive&&!this.xr?.active&&!this.raf)this.raf=requestAnimationFrame(this.frame);});
  this.listen(canvas,'webglcontextlost',e=>{e.preventDefault();this.ready=false;this.contextLost=true;this.gpuFence=null;this.lastTime=0;this.cancelCapture('The graphics context was lost before the image was ready.');this.onError('Graphics paused while the GPU recovers.');});
  this.listen(canvas,'webglcontextrestored',()=>{this.initGL();this.resize();});
  if(typeof ResizeObserver!=='undefined'){this.observer=new ResizeObserver(()=>this.resize(true));this.observer.observe(canvas);}
 }
 get massScale(){return this.state.mass/REFERENCE_MASS;}
 get minDistance(){return this.massScale*horizonRg(this.state.spin)*1.012;}
 refreshConfiguration(){
  const s=this.state,c=this.configCache,m=this.massScale;
  const bridgeShip=this.objects.find(o=>o.id===this.bridgeObjectId)||this.objects.find(o=>['enterprise','shuttle','astronaut'].includes(o.type));c.bridgeRadius=(bridgeShip?this.objectRadius(bridgeShip):this.bodyRadius(s.bridgeTravelerType||'enterprise'))*(s.bridgeRadius||8);
  c.primaryAxis=axis(s.primaryTilt,s.primaryAzimuth);c.secondaryAxis=axis(s.secondaryTilt,s.secondaryAzimuth);c.primaryBasis=basis(c.primaryAxis);
  c.bridgeOtherColor=color(s.bridgeOtherColor,DEFAULTS.bridgeOtherColor);c.diskColor=color(s.diskColor,DEFAULTS.diskColor);c.nebulaColor=color(s.nebulaColor,DEFAULTS.nebulaColor);c.jetColor=color(s.jetColor,DEFAULTS.jetColor);c.starColor=color(s.starColor,DEFAULTS.starColor);c.planetColor=color(s.planetColor,DEFAULTS.planetColor);
  c.horizon=[m*horizonRg(s.spin),m*s.binaryRatio*horizonRg(s.secondarySpin)];c.isco=[iscoRg(s.spin),iscoRg(s.secondarySpin)];
  const separation=s.binarySeparation*m;
  c.diskOuter=s.binary?[Math.min(s.diskOuter*m,.65*separation*rocheFraction(1/s.binaryRatio)),Math.min(s.diskOuter*m*s.binaryRatio,.65*separation*rocheFraction(s.binaryRatio))]:[s.diskOuter*m,0];
  const holeOffset=s.binary?separation*Math.max(1,s.binaryRatio)/(1+s.binaryRatio):0;
  c.bounds=holeOffset+Math.max(26*m,s.disk?Math.max(...c.diskOuter)*1.25:0,s.jets?42*m*s.jetLength*Math.max(1,s.binary?s.binaryRatio:1):0,s.planet?s.planetDistance*m+this.bodyRadius('planet',s.planetRadius)+2*m:0,s.tidalStar?s.starDistance*m+this.bodyRadius('star',s.starRadius)+2*m:0,...this.objects.map(o=>(Math.hypot(o.radius,o.height||0)*m+this.objectRadius(o)*(s.warp&&o.id===this.warpObjectId?s.warpRadius*3:1)+2*m)));

 }
 update(partial={}){
  const wasBinary=this.state.binary,wasWarpScenario=this.state.warpScenario,wasViewMode=this.state.viewMode,wasBridge=this.state.bridge,wasBlackHole=this.state.blackHole,wasWarp=this.state.warp;
  this.fillHoles();this.fillObjects();const previousFrames=new Map(this.objectFrames.map(o=>[o.id,{position:[...o.position],heading:o.headingAngle}]));
  if(partial.warp===false&&this.warpObjectId)this.setObjectWarp(this.warpObjectId,false);
  if(Object.hasOwn(partial,'bridgeTravel')&&partial.bridgeTravel!==this.state.bridgeTravel)this.fillObjects();
  if(partial.scene)Object.assign(this.state,makePreset(partial.scene));
  for(const [key,value] of Object.entries(partial))if(key in DEFAULTS)this.state[key]=value;
  if(Object.hasOwn(partial,'grid')||Object.hasOwn(partial,'warpGrid')){const enabled=Object.hasOwn(partial,'grid')?Boolean(partial.grid):Boolean(partial.warpGrid);this.state.grid=enabled;this.state.warpGrid=enabled;}
  else if(partial.scene){this.state.grid=this.state.warpGrid=!!(this.state.grid||this.state.warpGrid);}
  for(const [key,[lo,hi]] of Object.entries(LIMITS)){const value=Number(this.state[key]);this.state[key]=Number.isFinite(value)?clamp(value,lo,hi):DEFAULTS[key];}
  for(const [key,values] of Object.entries(ENUMS))if(!values.includes(this.state[key]))this.state[key]=DEFAULTS[key];
  this.state.objectScaleMode='physical';
  for(const [key,value] of Object.entries(DEFAULTS))if(typeof value==='boolean')this.state[key]=Boolean(this.state[key]);
  // The Ellis bridge is a different spacetime, not a superposed black-hole or
  // Alcubierre metric. Switch these fields atomically and retain placed bodies.
  if(wasBridge&&partial.bridge!==true&&(partial.blackHole===true||partial.warp===true||partial.binary===true||partial.whiteHole===true))this.state.bridge=false;
  if(partial.whiteHole===true)this.state.blackHole=true;
  if(this.state.bridge){this.state.blackHole=false;this.state.whiteHole=false;this.state.warp=false;this.state.binary=false;}
  if(wasBridge&&!this.state.bridge&&partial.binary===true)this.state.blackHole=true;
  if(!this.state.blackHole){this.state.whiteHole=false;this.state.disk=false;this.state.jets=false;this.state.binary=false;this.state.planet=false;this.state.tidalStar=false;}
  const enteringBridge=!wasBridge&&this.state.bridge,leavingBridge=wasBridge&&!this.state.bridge;
  if(wasBlackHole!==this.state.blackHole){
   for(const object of this.objects){const previous=previousFrames.get(object.id);object.phase=this.currentPhase(object);object.epoch=this.time;
    if(this.state.blackHole){object.placement='orbit';object.referenceId=null;object.radius=clamp(previous?Math.hypot(...previous.position)/this.massScale:12,6,100);object.height=OBJECT_KIND[object.type]>=3?1.1:.1;}
    else{object.placement='local';object.referenceId=null;[object.x,object.y,object.z]=(previous?.position||[0,0,0]).map(v=>v*REFERENCE_RG_METERS);}
   }
   if(this.state.warp){this.state.warpScenario=this.state.blackHole?'orbit':'isolated';this.warpObjectId=null;}
  }
  if(enteringBridge){this.bridgeTime=0;this.bridgeTravelTime=this.time;const traveler=this.objects.find(o=>o.type===this.state.bridgeTravelerType)||this.objects.find(o=>['enterprise','shuttle','astronaut'].includes(o.type))||this.addObject(this.state.bridgeTravelerType,14,0,1);this.bridgeObjectId=traveler?.id||null;if(traveler)this.state.bridgeTravelerType=traveler.type;}
  if(!this.state.bridge)this.bridgeObjectId=null;
  if(this.state.bridge){this.warpObjectId=null;for(const object of this.objects)object.warpEnabled=false;}
  this.refreshConfiguration();
  if(this.state.bridge&&Object.hasOwn(partial,'bridgeTravelerType'))this.setBridgeTraveler(this.state.bridgeTravelerType);
  if(Number.isFinite(partial.distance))this.setDistanceRg(partial.distance);
  if(this.state.blackHole&&!this.state.binary&&!this.focusId&&this.state.viewMode!=='free'){this.target.distance=Math.max(this.minDistance,this.target.distance);this.camera.distance=Math.max(this.minDistance,this.camera.distance);}
  if(wasBinary!==this.state.binary)this.time=0;
  if(wasWarpScenario!==this.state.warpScenario)this.resetWarpTravel();
  if(this.state.warp&&(!wasWarp||!this.objects.some(o=>o.id===this.warpObjectId))){const ship=this.objects.find(o=>o.id===this.selectedId&&o.type==='enterprise')||this.objects.find(o=>o.type==='enterprise')||this.addObject('enterprise',14,1.3,1);if(ship)this.setObjectWarp(ship.id,true);else this.state.warp=false;}
  if(!this.state.warp){this.warpObjectId=null;for(const object of this.objects)object.warpEnabled=false;}
  if(this.state.viewMode!==wasViewMode){const mode=this.state.viewMode;this.state.viewMode=wasViewMode;this.setViewMode(mode);}
  if(enteringBridge)this.resetCamera();
  else if(leavingBridge){
   this.releaseFocus(false);this.target={yaw:.25,pitch:.19,distance:this.state.blackHole?(this.state.binary?48:32)*this.massScale:1000/REFERENCE_RG_METERS,lookYaw:0,lookPitch:0,focusDistance:6};this.camera={...this.target};this.fillHoles();this.fillObjects();this.updateCameraFrame();
   if(this.state.warp&&this.state.warpScenario==='isolated'&&this.warpObjectId){this.focusTarget(this.warpObjectId,'track');this.camera.focusDistance=this.target.focusDistance=10;this.updateCameraFrame();}this.xr?.recenter();
  }
  if((this.focusId==='primary'&&!this.state.blackHole)||(this.focusId==='secondary'&&(!this.state.blackHole||!this.state.binary))||(this.focusId==='planet'&&!this.state.planet)||(this.focusId==='tidalStar'&&!this.state.tidalStar))this.releaseFocus();
 }
 setQuality(quality){if(!this.budget.setQuality(quality,this.now()))return;if(this.captureRequest&&quality!==this.quality)this.cancelCapture('Render quality changed before the image was ready. Please save again.');this.quality=quality;this.requestProgram();this.resize();}
 profile(){const p=this.budget.profile;this.adaptiveScale=p.scale;return this.quality==='ultra'&&!this.activeProgram?.features.ultra?QUALITY_PROFILES.high:p;}
 resize(external=false){
  if(external)this.resizeMeasurePending=true;
  if(!this.gl||this.contextLost||this.photoActive||this.xr?.active)return;if(this.gpuFence){this.resizePending=true;return;}const p=this.profile(),r=this.canvas.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,p.dpr)*p.scale;
  let width=Math.max(2,Math.round(r.width*ratio)),height=Math.max(2,Math.round(r.height*ratio));
  const limit=Math.min(1,Math.sqrt(p.pixels/(width*height)),(this.maxSize||4096)/width,(this.maxSize||4096)/height);
  width=Math.max(2,Math.floor(width*limit));height=Math.max(2,Math.floor(height*limit));
  if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;if(this.resizeMeasurePending)this.budget.resetTiming(this.now(),'Measuring the resized view');}
  this.resizeMeasurePending=false;this.gl.viewport(0,0,width,height);this.steps=Math.min(p.steps,this.activeProgram?.features.ultra?768:288);this.detail=p.detail;this.renderScale=width/Math.max(1,r.width);this.resizePending=false;
 }
 resetCamera(){
  const preset=SCENE_PRESETS.find(p=>p.id===(this.state.bridge?'bridge':this.sceneId))||SCENE_PRESETS[0],view=preset.camera||{};
  this.releaseFocus(false);this.travel=false;this.freePosition=this.freeTarget=this.freeBasis=null;this.state.viewMode='orbit';
  this.target={yaw:Number.isFinite(view.yaw)?view.yaw:.25,pitch:Number.isFinite(view.pitch)?clamp(view.pitch,-1.48,1.48):.19,distance:Number.isFinite(view.distanceMeters)?view.distanceMeters/REFERENCE_RG_METERS:this.state.blackHole?(Number.isFinite(view.distanceRg)?view.distanceRg:(this.state.binary?48:32))*this.massScale:1000/REFERENCE_RG_METERS,lookYaw:0,lookPitch:0,focusDistance:6};
  if(this.state.bridge)this.target.distance=this.configCache.bridgeRadius*8;
  if(this.state.blackHole&&!this.state.binary)this.target.distance=Math.max(this.minDistance,this.target.distance);
  this.camera={...this.target};this.fillHoles();this.fillObjects();this.updateCameraFrame();
  const target=this.state.bridge?this.objects.find(o=>o.id===this.bridgeObjectId)||{id:'bridge'}:Number.isInteger(view.focusIndex)?this.objects.find(o=>o.id===this.sceneFocusId):this.state.warp&&this.state.warpScenario==='isolated'?this.objects.find(o=>o.id===this.warpObjectId):null;
  if(target){this.focusTarget(target.id,view.mode||'track');if(Number.isFinite(view.yaw))this.camera.yaw=this.target.yaw=view.yaw;if(Number.isFinite(view.pitch))this.camera.pitch=this.target.pitch=clamp(view.pitch,-1.48,1.48);this.camera.focusDistance=this.target.focusDistance=clamp(view.focusDistance||(this.state.warp?10:6),1.15,160);this.updateCameraFrame();}
  this.xr?.recenter();return this.getState();
 }
 resetView(){this.target.lookYaw=0;this.target.lookPitch=0;this.camera.lookYaw=0;this.camera.lookPitch=0;}
 setViewMode(mode){
  if(!ENUMS.viewMode.includes(mode))return;
  if(mode==='free'&&this.state.viewMode!=='free'){
   this.fillHoles();this.fillObjects();this.updateCameraFrame();const f=this.cameraFrame;
   this.freePosition=[...f.observer];this.freeTarget=[...f.observer];this.freeBasis={forward:[...f.forward],right:[...f.right],up:[...f.up]};
   this.focusId=null;this.focusMode=null;this.savedOverview=null;this.travel=false;this.resetView();
  }else if(mode!=='free'&&this.state.viewMode==='free'){
   const p=this.freePosition||this.cameraFrame.observer,distance=Math.max(1e-12,Math.hypot(...p));
   this.camera.distance=this.target.distance=distance;this.camera.yaw=this.target.yaw=Math.atan2(p[0],p[2]);this.camera.pitch=this.target.pitch=clamp(Math.asin(p[1]/distance),-1.48,1.48);this.resetView();
   this.freePosition=this.freeTarget=this.freeBasis=null;
  }
  this.state.viewMode=mode;this.pointers.clear();this.pinchOwned=false;this.updateCameraFrame();
 }
 moveForward(distance){
  if(!Number.isFinite(distance)||this.state.viewMode!=='free'||!this.freeTarget)return false;
  this.updateCameraFrame();const direction=this.cameraFrame.forward;
  this.freeTarget=this.freeTarget.map((v,i)=>v+direction[i]*distance);this.freeTarget=this.safeObserver(this.freeTarget);
  const extent=Math.hypot(...this.freeTarget),limit=5000*this.massScale;if(extent>limit)this.freeTarget=mul(this.freeTarget,limit/extent);
  this.travel=false;return true;
 }
 navigationStep(){
  let distance=Math.hypot(...(this.freePosition||this.cameraFrame?.observer||[0,0,this.camera.distance]));
  for(const object of this.objectFrames){const d=Math.hypot(...object.position.map((x,i)=>x-(this.freePosition||this.cameraFrame.observer)[i]));distance=Math.min(distance,Math.max(object.radius*2,d));}
  if(this.state.blackHole)for(let k=0;k<(this.state.binary?2:1);k++){const center=Array.from(this.holeData.slice(k*4,k*4+3)),d=Math.hypot(...center.map((x,i)=>x-(this.freePosition||this.cameraFrame.observer)[i]));distance=Math.min(distance,Math.max(this.massScale*.015,d-this.configCache.horizon[k]));}
  return Math.max(1e-11,distance*.65);
 }
 safeObserver(position){
  if(!this.state.blackHole)return [...position];let p=[...position];
  for(let k=0;k<(this.state.binary?2:1);k++){const center=Array.from(this.holeData.slice(k*4,k*4+3)),delta=p.map((x,i)=>x-center[i]),distance=Math.hypot(...delta),minimum=this.configCache.horizon[k]*1.013;if(distance<minimum)p=add(center,mul(distance>1e-15?unit(delta):[0,0,1],minimum));}
  return p;
 }
 look(direction){this.travel=false;this.target.lookYaw=direction==='outward'?Math.PI:direction==='tangent'?Math.PI/2:0;this.target.lookPitch=0;this.camera.lookYaw=this.target.lookYaw;this.camera.lookPitch=0;}
 rotate(yawDelta,pitchDelta){if(this.state.viewMode==='free'){this.target.lookYaw+=yawDelta;this.target.lookPitch=clamp(this.target.lookPitch+pitchDelta,-1.5533,1.5533);return;}this.travel=false;this.target.distance=this.camera.distance;if(this.focusMode!=='onboard')this.resetView();if(this.focusMode==='onboard'){this.target.lookYaw+=yawDelta;this.target.lookPitch=clamp(this.target.lookPitch+pitchDelta,-1.5533,1.5533);}else{this.target.yaw+=yawDelta;this.target.pitch=clamp(this.target.pitch+pitchDelta,-1.48,1.48);}this.navigationUntil=this.now()+100;}
 zoom(factor){if(this.state.viewMode==='free'){this.moveForward(-Math.log(clamp(factor,.01,100))*this.navigationStep());return;}this.travel=false;this.resetView();if(this.focusId){if(this.focusMode==='onboard'){this.focusMode='track';this.setViewMode('orbit');}this.target.focusDistance=clamp(this.target.focusDistance*factor,1.15,160);}else{const lower=this.state.blackHole?(this.state.binary?.05*this.massScale:this.minDistance):.1/REFERENCE_RG_METERS;this.target.distance=clamp(this.target.distance*factor,lower,5000*this.massScale);}this.navigationUntil=this.now()+180;}
 setDistanceRg(value){if(!Number.isFinite(Number(value)))return;this.releaseFocus(false);this.travel=false;this.resetView();const lower=this.state.blackHole?(this.state.binary?.05*this.massScale:this.minDistance):.1/REFERENCE_RG_METERS;this.target.distance=clamp(Number(value)*this.massScale,lower,5000*this.massScale);}
 setDistanceMeters(value){if(!Number.isFinite(Number(value)))return;this.releaseFocus(false);this.travel=false;this.resetView();this.target.distance=clamp(Number(value)/REFERENCE_RG_METERS,this.state.blackHole?this.minDistance:.1/REFERENCE_RG_METERS,5000*this.massScale);}
 approach(){if(this.travel){this.travel=false;this.target.distance=this.camera.distance;return false;}this.releaseFocus(false);this.resetView();this.travel=true;this.target.distance=(this.state.binary?Math.max(20,this.state.binarySeparation*1.6):12)*this.massScale;return true;}
 bodyRadius(type,scale=1){return objectRadiusMeters(type,scale)/REFERENCE_RG_METERS;}
 objectRadius(obj){return objectRadiusMeters(obj.type,obj.scale)/REFERENCE_RG_METERS;}
 orbitalOmega(obj){if(obj.placement==='local')return 0;const r=Math.max(.1,obj.radius)*this.massScale;return 18*Math.sqrt(this.massScale/(r*r*r));}
 currentPhase(obj){if(obj.placement==='local'||obj.motion==='horizon'||obj.motion==='infall'||this.state.bridge&&obj.id===this.bridgeObjectId)return obj.phase;if(this.state.warp&&obj.id===this.warpObjectId&&this.state.warpScenario!=='orbit')return obj.phase;return obj.phase-(this.time-(obj.epoch||0))*this.orbitalOmega(obj);}
 getObjectContext(){
  if(this.state.bridge)return {kind:'bridge',referenceId:this.bridgeObjectId,referenceLabel:'Bridge route',unit:'m',addMode:'traveler',allowedTypes:['enterprise','shuttle','astronaut']};
  if(this.state.blackHole)return {kind:'orbit',referenceId:'primary',referenceLabel:'Black hole',unit:'r_g',addMode:'object',allowedTypes:OBJECT_TYPES.map(o=>o.id)};
  const reference=this.objects.find(o=>o.id===this.warpObjectId)||this.objects.find(o=>o.id===this.focusId)||this.objects.find(o=>o.id===this.selectedId)||this.objects.find(o=>OBJECT_KIND[o.type]>=3)||this.objects[0];
  return {kind:'local',referenceId:reference?.id||null,referenceLabel:reference?OBJECT_TYPES.find(t=>t.id===reference.type)?.label||reference.type:'World origin',unit:'m',addMode:'object',allowedTypes:OBJECT_TYPES.map(o=>o.id)};
 }
 addObject(type='planet',radius=12,phase=0,scale=1){
  const kind=Object.hasOwn(OBJECT_KIND,type)?type:'planet',context=this.getObjectContext();
  if(context.kind==='bridge'){if(!context.allowedTypes.includes(kind))return false;if(this.objects.some(o=>o.id===this.bridgeObjectId))return this.setBridgeTraveler(kind);}
  if(this.objects.length>=10)return false;
  const obj={type:kind,radius:clamp(Number(radius)||12,2.2,100),phase:Number.isFinite(Number(phase))?Number(phase):0,height:OBJECT_KIND[kind]>=3?1.1:.1,scale:clamp(Number(scale)||1,.25,4),epoch:this.time,id:`body-${this.nextObjectId++}`,placement:context.kind==='orbit'?'orbit':'local',referenceId:null,x:0,y:0,z:0,warpEnabled:false,motion:'orbit',motionEpoch:this.time,logLuminosity:0};
  if(context.kind==='local'&&context.referenceId){const reference=this.objects.find(o=>o.id===context.referenceId);obj.referenceId=reference.id;obj.x=Math.max(50,(objectRadiusMeters(reference.type,reference.scale)+objectRadiusMeters(obj.type,obj.scale))*2.5);}
  this.objects.push(obj);if(this.state.bridge&&!this.bridgeObjectId&&['enterprise','shuttle','astronaut'].includes(obj.type))this.bridgeObjectId=obj.id;this.selectedId=obj.id;this.refreshConfiguration();return {...obj};
 }
 updateObject(id,patch={}){
  const obj=this.objects.find(o=>o.id===id);if(!obj)return false;const phase=this.currentPhase(obj);
  if(obj.placement!=='local'){
   if(Number.isFinite(Number(patch.radius)))obj.radius=clamp(Number(patch.radius),2.2,100);
   if(Number.isFinite(Number(patch.height)))obj.height=clamp(Number(patch.height),-30,30);
  }else{
   for(const key of ['x','y','z'])if(Number.isFinite(Number(patch[key])))obj[key]=clamp(Number(patch[key]),-1e12,1e12);
   if(Object.hasOwn(patch,'referenceId')){let target=this.objects.find(o=>o.id===patch.referenceId),ancestor=target,valid=true;for(let i=0;ancestor&&i<=this.objects.length;i++){if(ancestor.id===id){valid=false;break;}ancestor=this.objects.find(o=>o.id===ancestor.referenceId);}if(valid)obj.referenceId=target?.id||null;}
  }
  if(Number.isFinite(Number(patch.scale)))obj.scale=clamp(Number(patch.scale),.25,4);
  if(obj.type==='probe'&&Number.isFinite(Number(patch.logLuminosity)))obj.logLuminosity=clamp(Number(patch.logLuminosity),0,8);
  if(['orbit','infall','horizon'].includes(patch.motion)){if(obj.motion!==patch.motion)obj.motionEpoch=this.time;obj.motion=patch.motion;}
  if(obj.motion==='infall'&&['radius','height','phase'].some(key=>Object.hasOwn(patch,key)))obj.motionEpoch=this.time;
  obj.phase=Number.isFinite(Number(patch.phase))?Number(patch.phase):phase;obj.epoch=this.time;this.selectedId=obj.id;
  if(obj.id===this.warpObjectId&&this.state.warpScenario==='isolated'&&['x','y','z'].some(key=>Object.hasOwn(patch,key)))this.warpTravelPosition=[obj.x||0,obj.y||0,obj.z||0].map(v=>v/REFERENCE_RG_METERS);
  this.refreshConfiguration();this.fillObjects();this.updateCameraFrame();
  if(Object.hasOwn(patch,'warpEnabled'))this.setObjectWarp(id,!!patch.warpEnabled);
  return this.getObjects().find(o=>o.id===id);
 }
 setObjectWarp(id,enabled){
  const ship=this.objects.find(o=>o.id===id&&o.type==='enterprise');if(!ship||this.state.bridge)return false;
  this.fillHoles();this.fillObjects();const current=this.objectFrames.find(o=>o.id===id),position=current?[...current.position]:[0,0,0];
  if(enabled){
   if(this.state.warp&&this.warpObjectId===id){this.selectedId=id;return this.getObjects().find(o=>o.id===id);}
   const previous=this.objects.find(o=>o.id===this.warpObjectId),previousFrame=this.objectFrames.find(o=>o.id===this.warpObjectId);
   if(previous&&previousFrame&&previous.placement==='local'){previous.referenceId=null;[previous.x,previous.y,previous.z]=previousFrame.position.map(v=>v*REFERENCE_RG_METERS);}
   if(!this.state.blackHole){ship.placement='local';ship.referenceId=null;[ship.x,ship.y,ship.z]=position.map(v=>v*REFERENCE_RG_METERS);}
   for(const object of this.objects)object.warpEnabled=object.id===id;
   this.warpObjectId=id;this.state.warp=true;this.state.warpScenario=this.state.blackHole?(this.state.warpScenario==='excursion'?'excursion':'orbit'):'isolated';
   this.warpTravelWorld=0;this.warpTravelPosition=position;this.warpTravelTime=this.time;
  }else{
   ship.warpEnabled=false;
   if(this.warpObjectId===id){
    if(!this.state.blackHole){ship.placement='local';ship.referenceId=null;[ship.x,ship.y,ship.z]=position.map(v=>v*REFERENCE_RG_METERS);}
    this.state.warp=false;this.warpObjectId=null;
   }
  }
  this.selectedId=id;this.refreshConfiguration();this.fillObjects();this.updateCameraFrame();return this.getObjects().find(o=>o.id===id);
 }
 exploreWarp(){
  if(this.state.bridge)this.update({bridge:false});
  const ship=this.objects.find(o=>o.id===this.selectedId&&o.type==='enterprise')||this.objects.find(o=>o.type==='enterprise')||this.addObject('enterprise',14,1.3,1);
  if(!ship)return false;this.setObjectWarp(ship.id,true);this.focusTarget(ship.id,'track');this.camera.focusDistance=this.target.focusDistance=10;this.updateCameraFrame();return this.getObjects().find(o=>o.id===ship.id);
 }
 setBridgeTraveler(type){
  if(!this.state.bridge||!['enterprise','shuttle','astronaut'].includes(type))return false;
  let traveler=this.objects.find(o=>o.id===this.bridgeObjectId);
  if(!traveler){traveler=this.addObject(type,12,0,1);if(!traveler)return false;traveler=this.objects.find(o=>o.id===traveler.id);this.bridgeObjectId=traveler.id;}
  traveler.type=type;traveler.warpEnabled=false;if(this.warpObjectId===traveler.id)this.warpObjectId=null;traveler.placement='local';traveler.referenceId=null;this.state.bridgeTravelerType=type;
  this.refreshConfiguration();this.fillObjects();if(!this.focusId||this.focusId==='bridge')this.focusTarget(traveler.id,'track');else this.updateCameraFrame();
  return this.getObjects().find(o=>o.id===traveler.id);
 }
 removeObject(id){
  const index=this.objects.findIndex(o=>o.id===id);if(index<0)return false;
  this.fillObjects();for(const child of this.objects.filter(o=>o.referenceId===id)){const frame=this.objectFrames.find(o=>o.id===child.id);child.referenceId=null;if(frame){[child.x,child.y,child.z]=frame.position.map(v=>v*REFERENCE_RG_METERS);child.phase=frame.headingAngle;}}
  const bridgeShip=this.state.bridge&&this.bridgeObjectId===id,wasFocused=this.focusId===id;
  if(wasFocused)this.releaseFocus(!bridgeShip);this.objects.splice(index,1);if(this.selectedId===id)this.selectedId=this.objects[0]?.id||null;
  if(this.warpObjectId===id){this.warpObjectId=null;this.state.warp=false;}
  if(bridgeShip)this.bridgeObjectId=this.objects.find(o=>['enterprise','shuttle','astronaut'].includes(o.type))?.id||null;
  this.refreshConfiguration();if(bridgeShip&&(wasFocused||!this.focusId))this.resetCamera();return true;
 }
 selectObject(id){if(!this.objects.some(o=>o.id===id))return false;this.selectedId=id;return true;}
 clearObjects(){this.releaseFocus(false);this.objects=[];this.selectedId=null;this.warpObjectId=null;this.bridgeObjectId=null;this.state.warp=false;this.refreshConfiguration();if(this.state.bridge)this.resetCamera();}
 getFocusFrame(id=this.focusId){
  if(id==='bridge'&&this.state.bridge)return {id,type:'bridge',index:-1,position:[0,0,0],radius:this.configCache.bridgeRadius/2,physicalRadius:this.configCache.bridgeRadius,frame:[[1,0,0],[0,1,0],[0,0,1]],label:'Bridge throat'};
  if(id==='primary'||id==='secondary'){
   const k=id==='primary'?0:1;if(!this.state.blackHole||(k===1&&!this.state.binary))return null;
   return {id,type:'hole',index:-1,position:Array.from(this.holeData.slice(k*4,k*4+3)),radius:this.configCache.horizon[k],frame:[[1,0,0],[0,1,0],[0,0,1]],label:k?'Binary companion':this.state.whiteHole?'White hole':'Primary black hole'};
  }
  return this.objectFrames.find(o=>o.id===id)||null;
 }
 getSceneTargets(){
  const targets=[];
  if(this.state.bridge)targets.push({id:'bridge',label:'Bridge throat',kind:'bridge',canTrack:true,canBoard:false,enabled:true});
  if(this.state.blackHole){targets.push({id:'primary',label:this.state.whiteHole?'White hole':'Primary black hole',kind:'hole',canTrack:true,canBoard:true,enabled:true});if(this.state.binary)targets.push({id:'secondary',label:'Binary companion',kind:'hole',canTrack:true,canBoard:true,enabled:true});}
  if(this.state.planet)targets.push({id:'planet',label:'Environment planet',kind:'planet',canTrack:true,canBoard:true,enabled:true});
  if(this.state.tidalStar)targets.push({id:'tidalStar',label:'Disrupting star',kind:'star',canTrack:true,canBoard:true,enabled:true});
  for(const item of this.getObjects())targets.push({...item,kind:item.type,canTrack:true,canBoard:true,enabled:true});
  return targets;
 }
 focusObject(id,mode='track'){return this.objects.some(o=>o.id===id)?this.focusTarget(id,mode):false;}
 focusTarget(id,mode='track'){
  this.fillHoles();this.fillObjects();const obj=this.getFocusFrame(id);if(!obj||(id==='bridge'&&mode==='onboard'))return false;
  if(!this.focusId)this.savedOverview={camera:{...this.camera},target:{...this.target},viewMode:this.state.viewMode,travel:this.travel,freePosition:this.freePosition?[...this.freePosition]:null,freeTarget:this.freeTarget?[...this.freeTarget]:null,freeBasis:this.freeBasis?{forward:[...this.freeBasis.forward],right:[...this.freeBasis.right],up:[...this.freeBasis.up]}:null};
  // Set the navigation mode directly: changing from free flight must not replace
  // this target camera with a radius measured about the scene origin.
  this.state.viewMode=mode==='onboard'?'look':'orbit';this.freePosition=this.freeTarget=this.freeBasis=null;this.pointers.clear();this.pinchOwned=false;
  if(this.objects.some(o=>o.id===id))this.selectedId=id;this.focusId=id;this.focusMode=mode==='onboard'?'onboard':'track';this.travel=false;this.resetView();
  this.target.yaw=.7;this.target.pitch=.28;this.target.focusDistance=obj.type==='hole'?8:6;this.camera.yaw=this.target.yaw;this.camera.pitch=this.target.pitch;this.camera.focusDistance=this.target.focusDistance;this.updateCameraFrame();this.xr?.recenter();return true;
 }
 releaseFocus(restore=true){
  const saved=restore?this.savedOverview:null;this.focusId=null;this.focusMode=null;this.savedOverview=null;
  if(saved){this.camera={...saved.camera};this.target={...saved.target};this.travel=saved.travel;this.state.viewMode=saved.viewMode;this.freePosition=saved.freePosition;this.freeTarget=saved.freeTarget;this.freeBasis=saved.freeBasis;}
  else{this.state.viewMode='orbit';this.freePosition=this.freeTarget=this.freeBasis=null;this.resetView();}
  this.pointers.clear();this.pinchOwned=false;this.fillHoles();this.fillObjects();this.updateCameraFrame();this.xr?.recenter();return this.getState();
 }
 resetWarpTravel(){this.warpTravelWorld=0;this.warpTravelPosition=[0,0,0];this.warpTravelTime=this.time;}
 warpSpeedWorld(){const ship=this.objects.find(o=>o.id===this.warpObjectId);return this.state.warp&&this.state.warpScenario==='isolated'&&ship?this.objectRadius(ship)*this.state.warpRadius*.07*this.state.warpFactor:0;}
 loadScene(id='disk'){
  const preset=SCENE_PRESETS.find(p=>p.id===id)||SCENE_PRESETS[0],paused=this.state.paused;
  this.clearObjects();this.sceneId=preset.id;this.state={...makePreset(preset.id),paused,objectScaleMode:'physical'};this.time=0;this.bridgeTime=0;this.bridgeTravelTime=0;this.resetWarpTravel();
  this.state.grid=this.state.warpGrid=!!(this.state.grid||this.state.warpGrid);
  for(const entry of preset.objects||[]){const object=this.addObject(entry.type,entry.radius,entry.phase,entry.scale);if(object)this.updateObject(object.id,entry);}
  if(this.state.warp){const ship=this.objects.find(o=>o.type==='enterprise')||this.addObject('enterprise',14,1.3,1);if(ship){this.warpObjectId=ship.id;this.selectedId=ship.id;const raw=this.objects.find(o=>o.id===ship.id);raw.warpEnabled=true;}}
  this.bridgeObjectId=this.state.bridge?this.objects.find(o=>['enterprise','shuttle','astronaut'].includes(o.type))?.id||null:null;this.sceneFocusId=Number.isInteger(preset.camera?.focusIndex)?this.objects[preset.camera.focusIndex]?.id||null:this.state.warp&&this.state.warpScenario==='isolated'?this.warpObjectId:null;this.refreshConfiguration();this.resetCamera();
  return this.getState();
 }
 loadWarpScenario(mode='isolated'){return this.loadScene(mode==='orbit'?'warp-orbit':mode==='excursion'?'warp-excursion':'warp-lab');}
 getObjects(){const f=this.cameraFrame,rect=this.canvas.getBoundingClientRect(),aspect=rect.width/Math.max(1,rect.height),fov=.83*Math.max(1,1.35/aspect);return this.objects.map(obj=>{const entry=this.objectFrames.find(x=>x.id===obj.id),dimension=OBJECT_DIMENSIONS[obj.type];let screenX=.5,screenY=.5,visible=false,screenRadius=0;if(f&&entry){const q=entry.position.map((x,i)=>x-f.observer[i]),depth=dot(q,f.forward);screenX=.5+dot(q,f.right)/(depth*fov*aspect);screenY=.5-dot(q,f.up)/(depth*fov);screenRadius=entry.radius/Math.max(depth,1e-20)/fov;visible=depth>0&&screenX>-.05&&screenX<1.05&&screenY>-.05&&screenY<1.05;}return {...obj,motion:obj.motion||'orbit',motionDescription:obj.motion==='infall'?'Illustrative inward approach; slows to a stop outside the horizon.':obj.motion==='horizon'?'Fixed just outside the horizon, facing outward; not a freely falling observer.':'Prescribed circular orbit.',luminosity:Math.pow(10,clamp(Number(obj.logLuminosity)||0,0,8)),placement:this.state.bridge&&obj.id===this.bridgeObjectId?'bridge':obj.placement||'orbit',referenceLabel:obj.referenceId?(OBJECT_TYPES.find(t=>t.id===this.objects.find(o=>o.id===obj.referenceId)?.type)?.label||'World origin'):'World origin',headingDegrees:wrap(this.currentPhase(obj))*180/Math.PI,warpEnabled:obj.type==='enterprise'&&this.state.warp&&obj.id===this.warpObjectId,bridgeTraveler:this.state.bridge&&obj.id===this.bridgeObjectId,phase:wrap(this.currentPhase(obj)),label:OBJECT_TYPES.find(t=>t.id===obj.type)?.label||obj.type,lengthMeters:dimension.lengthMeters*obj.scale,renderRadiusMeters:this.objectRadius(obj)*REFERENCE_RG_METERS,physicalDescription:dimension.description,selected:obj.id===this.selectedId,focused:obj.id===this.focusId,screenX,screenY,visible,screenRadius,currentRadius:entry?Math.hypot(...entry.position.map((x,i)=>x-this.holeData[i]))/this.massScale:obj.radius,position:entry?[...entry.position]:null};});}
 getState(){const observerRadius=Math.hypot(...(this.cameraFrame?.observer||[0,0,this.camera.distance])),throat=(this.configCache.bridgeRadius||1)/2;return {...this.state,objectContext:this.getObjectContext(),bridgeRegion:observerRadius>throat*1.04?'near':observerRadius<throat*.96?'far':'throat',fps:Math.round(this.fps||0),scale:this.renderScale||0,steps:this.steps,width:this.canvas.width||0,height:this.canvas.height||0,webgl:this.webgl2?2:1,sceneId:this.sceneId,vrActive:!!this.xr?.active,vrError:this.xr?.lastError||'',photoActive:this.photoActive,camera:{...this.camera},distance:this.cameraFrame?Math.hypot(...this.cameraFrame.observer)/this.massScale:this.camera.distance/this.massScale,worldDistance:this.cameraFrame?Math.hypot(...this.cameraFrame.observer):this.camera.distance,horizonRg:horizonRg(this.state.spin),iscoRg:iscoRg(this.state.spin),quality:this.quality,effectiveQuality:this.budget.effectiveQuality,adaptiveLevel:this.budget.level,adaptiveStatus:this.budget.adaptiveStatus,adaptiveReason:this.budget.adaptiveReason,targetFps:30,probePending:this.budget.probing,qualityReduced:false,shaderCompiling:!!this.pendingProgram||this.warmupFrames>0||!!this.gpuFence?.warmup,presentationPaused:this.presentationPaused,gpuWaiting:!!this.gpuFence,frameBudgetMs:this.budget.frameMs,objectCount:this.objects.length,travel:this.travel,maxObjects:10,viewYaw:this.camera.lookYaw*180/Math.PI,viewPitch:this.camera.lookPitch*180/Math.PI,selectedId:this.selectedId,focusId:this.focusId,focusMode:this.focusMode,focusLabel:this.getSceneTargets().find(t=>t.id===this.focusId)?.label||null,warpObjectId:this.warpObjectId,bridgeObjectId:this.bridgeObjectId,cameraDistanceMeters:this.focusId?Math.hypot(...(this.cameraFrame?.inspectCamera||[0,0,this.camera.focusDistance]))*(this.getFocusFrame()?.physicalRadius||this.getFocusFrame()?.radius||0)*REFERENCE_RG_METERS:this.camera.distance*REFERENCE_RG_METERS,objects:this.getObjects(),sceneTargets:this.getSceneTargets(),warpTravelMeters:this.warpTravelWorld*REFERENCE_RG_METERS,warpSpeedMetersPerSecond:this.warpSpeedWorld()*REFERENCE_RG_METERS};}
 fillHoles(){
  const s=this.state,m=this.massScale,h=this.holeData;h.fill(0);h[3]=m;
  if(s.binary){const secondary=m*s.binaryRatio,d=s.binarySeparation*m,omega=15*Math.sqrt((m+secondary)/(d*d*d)),a=-this.time*omega;const r1=d*s.binaryRatio/(1+s.binaryRatio),r2=d/(1+s.binaryRatio);h[0]=Math.cos(a)*r1;h[2]=Math.sin(a)*r1;h[4]=-Math.cos(a)*r2;h[6]=-Math.sin(a)*r2;h[7]=secondary;}
 }
 protectObserver(){
  if(this.state.viewMode==='free'){if(this.freePosition)this.freePosition=this.safeObserver(this.freePosition);if(this.freeTarget)this.freeTarget=this.safeObserver(this.freeTarget);return;}if(!this.state.blackHole||this.focusId)return;
  if(!this.state.binary){this.camera.distance=Math.max(this.minDistance,this.camera.distance);return;}
  const c=this.camera,dir=[Math.cos(c.pitch)*Math.sin(c.yaw),Math.sin(c.pitch),Math.cos(c.pitch)*Math.cos(c.yaw)];
  for(let k=0;k<2;k++){const o=k*4,h=this.holeData,rr=this.configCache.horizon[k]*1.012,x=dir[0]*c.distance-h[o],y=dir[1]*c.distance-h[o+1],z=dir[2]*c.distance-h[o+2];if(x*x+y*y+z*z<rr*rr){const along=dir[0]*h[o]+dir[1]*h[o+1]+dir[2]*h[o+2],perp=h[o]*h[o]+h[o+1]*h[o+1]+h[o+2]*h[o+2]-along*along;c.distance=Math.max(.05*this.massScale,along+Math.sqrt(Math.max(0,rr*rr-perp))+.02*this.massScale);this.target.distance=c.distance;}}
 }
 fillObjects(){
  const s=this.state,m=this.massScale,b=this.configCache.primaryBasis,h=this.holeData;let count=0;
  const elapsed=this.time-this.warpTravelTime;
  if(elapsed<0){this.warpTravelWorld=0;this.warpTravelPosition=[0,0,0];}
  else if(elapsed>0){const travel=elapsed*this.warpSpeedWorld(),ship=this.objects.find(o=>o.id===this.warpObjectId);this.warpTravelWorld+=travel;if(travel&&ship){const sine=Math.sin(ship.phase),cosine=Math.cos(ship.phase);for(let i=0;i<3;i++)this.warpTravelPosition[i]+=travel*(b[0][i]*sine-b[2][i]*cosine);}}
  this.warpTravelTime=this.time;
  this.objectData.fill(0);this.colorData.fill(0);this.headingData.fill(0);this.luminosityData.fill(1);this.objectFrames=[];
  const put=(type,r,angle,size,baseColor,height=0,id=null,headingAngle=angle)=>{if(count>=12)return;const x=Math.cos(angle)*r,z=Math.sin(angle)*r,o=count*4,position=[0,1,2].map(i=>h[i]+b[0][i]*x+b[1][i]*height+b[2][i]*z);this.objectData.set([...position,Math.max(1e-14,size)],o);this.colorData.set([...baseColor,OBJECT_KIND[type]??0],o);this.headingData.set([Math.cos(headingAngle),Math.sin(headingAngle)],count*2);const frame=[add(mul(b[0],-Math.cos(headingAngle)),mul(b[2],-Math.sin(headingAngle))),b[1],add(mul(b[0],Math.sin(headingAngle)),mul(b[2],-Math.cos(headingAngle)))];this.objectFrames.push({id,type,index:count,position,radius:Math.max(1e-14,size),frame,angle,headingAngle});count++;};
  if(s.planet){const r=s.planetDistance*m,planetWorldMass=s.planetMass*3.00349e-6/(REFERENCE_MASS*1e6),omega=18*Math.sqrt((m+planetWorldMass)/(r*r*r));put('planet',r,1.15-this.time*omega,this.bodyRadius('planet',s.planetRadius),this.configCache.planetColor,.10*m,'planet');}
  const cycle=(this.time*.027*s.disruptionStrength)%1;
  const stop=Math.max(2.1,horizonRg(s.spin)+.4),r=(s.starDistance-cycle*(s.starDistance-stop))*m,phase=.4-this.time*.32-cycle*3;
  this.tidalData.set([r,phase,cycle,s.disruptionStrength]);
  if(s.tidalStar){const size=this.bodyRadius('star',s.starRadius)*Math.pow(Math.max(.002,1-cycle),.6*s.disruptionStrength);put('star',r,phase,size,this.configCache.starColor,0,'tidalStar');}
  for(const obj of this.objects){
   let radius=obj.placement==='local'?0:obj.radius*m,angle=this.currentPhase(obj),headingAngle=angle,height=obj.placement==='local'?0:obj.height*m;const size=this.objectRadius(obj);
   // These demonstration paths remain outside the capture surface. They are
   // prescribed geometric views, not an integrated relativistic worldline.
   if(s.blackHole&&(obj.motion==='infall'||obj.motion==='horizon')){
    const exterior=this.configCache.horizon[0]*1.035+size*2;
    const start=Math.max(exterior+.5*m,obj.radius*m);
    const progress=Math.exp(-Math.max(0,this.time-(obj.motionEpoch||0))/75);
    radius=obj.motion==='horizon'?exterior:exterior+(start-exterior)*progress;
    height=obj.motion==='horizon'?0:obj.height*m*(radius/start);
    headingAngle=angle+Math.PI/2;
   }
   if(s.warp&&obj.id===this.warpObjectId){if(s.warpScenario==='isolated'){radius=0;height=0;angle=obj.phase;}else if(s.warpScenario==='excursion'){const bubble=size*s.warpRadius,near=this.configCache.horizon[0]+bubble+.18*m,far=Math.max(near+3*m,obj.radius*m);radius=near+(far-near)*(.5+.5*Math.cos(this.time*.16));angle=obj.phase;headingAngle=angle-Math.PI/2+Math.PI*(1-Math.tanh(Math.sin(this.time*.16)*8))/2;height=obj.height*m*.2;}}
   put(obj.type,radius,angle,size,obj.type==='star'?[1,.62,.25]:obj.type==='probe'?[.82,.87,.92]:[.06,.28,.57],height,obj.id,headingAngle);
   const entry=this.objectFrames[count-1];entry.luminosity=obj.type==='probe'?Math.pow(10,clamp(Number(obj.logLuminosity)||0,0,8)):1;this.luminosityData[entry.index]=entry.luminosity;
   if(obj.placement==='local')entry.position=[obj.x||0,obj.y||0,obj.z||0].map(v=>v/REFERENCE_RG_METERS);
   if(s.warp&&obj.id===this.warpObjectId&&s.warpScenario==='isolated'){entry.position=[...this.warpTravelPosition];[obj.x,obj.y,obj.z]=entry.position.map(v=>v*REFERENCE_RG_METERS);}
   this.objectData.set(entry.position,entry.index*4);
  }
  const bridgeElapsed=this.time-this.bridgeTravelTime;if(bridgeElapsed<0)this.bridgeTime=Math.max(0,this.time);else if(s.bridge&&s.bridgeTravel!==false)this.bridgeTime+=bridgeElapsed;this.bridgeTravelTime=this.time;
  if(s.bridge){
   const ship=this.objectFrames.find(o=>o.id===this.bridgeObjectId);if(ship){const physicalRadius=this.objectRadius(this.objects.find(o=>o.id===ship.id)),path=bridgePath(this.bridgeTime,this.configCache.bridgeRadius,true),conformal=bridgeConformal(path.r,this.configCache.bridgeRadius);ship.position=mul(b[2],path.r);ship.physicalRadius=physicalRadius;ship.radius=physicalRadius/conformal;ship.headingAngle=path.inward?0:Math.PI;ship.frame=path.inward?[mul(b[0],-1),b[1],mul(b[2],-1)]:[b[0],b[1],b[2]];this.objectData.set([...ship.position,ship.radius],ship.index*4);this.headingData.set(path.inward?[1,0]:[-1,0],ship.index*2);}
  }
  // Local placements are rigid offsets measured in meters. Resolve their small
  // reference tree after traveler/warp motion so no Kepler orbit leaks into a
  // ship-only scene, and children remain beside their chosen reference.
  const resolved=new Set(),resolving=new Set();
  const resolve=object=>{if(resolved.has(object.id)||resolving.has(object.id))return;resolving.add(object.id);
   const entry=this.objectFrames.find(o=>o.id===object.id),parent=this.objects.find(o=>o.id===object.referenceId);
   if(entry&&object.placement==='local'&&parent&&object.id!==this.warpObjectId&&object.id!==this.bridgeObjectId){resolve(parent);const reference=this.objectFrames.find(o=>o.id===parent.id);if(reference){
    const coordinateScale=reference.physicalRadius?reference.radius/reference.physicalRadius:1;const offset=[object.x||0,object.y||0,object.z||0].map(v=>v/REFERENCE_RG_METERS*coordinateScale);entry.position=add(reference.position,transform(reference.frame,offset));entry.headingAngle=reference.headingAngle+object.phase;
    const a=entry.headingAngle;entry.frame=[add(mul(b[0],-Math.cos(a)),mul(b[2],-Math.sin(a))),b[1],add(mul(b[0],Math.sin(a)),mul(b[2],-Math.cos(a)))];
    if(s.bridge){entry.physicalRadius=this.objectRadius(object);entry.radius=entry.physicalRadius/bridgeConformal(Math.hypot(...entry.position),this.configCache.bridgeRadius);}
    this.objectData.set([...entry.position,entry.radius],entry.index*4);this.headingData.set([Math.cos(a),Math.sin(a)],entry.index*2);
   }}resolving.delete(object.id);resolved.add(object.id);
  };
  for(const object of this.objects)resolve(object);
  this.objectCount=count;return count;
 }
 updateCameraFrame(){
  const c=this.camera,focused=this.focusId?this.getFocusFrame():null;let observer,forward,right,up,inspectCamera=[0,0,6],inspectForward=[0,0,-1],inspectRight=[1,0,0],inspectUp=[0,1,0],inspectIndex=-1,hideIndex=-1;
  if(focused){
   const onboard=this.focusMode==='onboard';
   let eye=onboard?(focused.type==='hole'?[0,0,1.04]:focused.type==='planet'||focused.type==='star'?[0,.25,1.03]:focused.type==='astronaut'?[0,.55,.30]:focused.type==='enterprise'?[0,.22,.35]:focused.type==='shuttle'?[-.045,.075,.48]:[0,.3,.8]):[Math.cos(c.pitch)*Math.sin(c.yaw)*c.focusDistance,Math.sin(c.pitch)*c.focusDistance,Math.cos(c.pitch)*Math.cos(c.yaw)*c.focusDistance];
   if(this.state.blackHole){let clampedObserver=false,actual=add(focused.position,transform(focused.frame,mul(eye,focused.radius)));for(let k=0;k<(this.state.binary?2:1);k++){const center=Array.from(this.holeData.slice(k*4,k*4+3)),delta=actual.map((x,i)=>x-center[i]),distance=Math.hypot(...delta),minimum=this.configCache.horizon[k]*1.013;if(distance<minimum){const outward=distance>1e-15?mul(delta,1/distance):unit(focused.position.map((x,i)=>x-center[i]));actual=add(center,mul(outward,minimum));clampedObserver=true;}}if(clampedObserver)eye=mul(inverse(focused.frame,actual.map((x,i)=>x-focused.position[i])),1/focused.radius);}
   const baseForward=onboard?[0,0,1]:unit(mul(eye,-1)),baseRight=unit(cross(baseForward,[0,1,0])),baseUp=cross(baseRight,baseForward);
   const horizontal=add(mul(baseForward,Math.cos(c.lookYaw)),mul(baseRight,Math.sin(c.lookYaw)));
   inspectForward=unit(add(mul(horizontal,Math.cos(c.lookPitch)),mul(baseUp,Math.sin(c.lookPitch))));inspectRight=unit(add(mul(baseRight,Math.cos(c.lookYaw)),mul(baseForward,-Math.sin(c.lookYaw))));inspectUp=cross(inspectRight,inspectForward);inspectCamera=eye;
   observer=add(focused.position,transform(focused.frame,mul(eye,focused.radius)));forward=transform(focused.frame,inspectForward);right=transform(focused.frame,inspectRight);up=transform(focused.frame,inspectUp);inspectIndex=onboard?-1:focused.index;hideIndex=onboard?focused.index:-1;
  }else if(this.state.viewMode==='free'&&this.freePosition&&this.freeBasis){
   observer=[...this.freePosition];const b=this.freeBasis,horizontal=add(mul(b.forward,Math.cos(c.lookYaw)),mul(b.right,Math.sin(c.lookYaw)));
   forward=unit(add(mul(horizontal,Math.cos(c.lookPitch)),mul(b.up,Math.sin(c.lookPitch))));right=unit(add(mul(b.right,Math.cos(c.lookYaw)),mul(b.forward,-Math.sin(c.lookYaw))));up=cross(right,forward);
  }else{
   observer=[Math.cos(c.pitch)*Math.sin(c.yaw)*c.distance,Math.sin(c.pitch)*c.distance,Math.cos(c.pitch)*Math.cos(c.yaw)*c.distance];
   const baseForward=unit(mul(observer,-1)),baseRight=unit(cross(baseForward,[0,1,0])),baseUp=cross(baseRight,baseForward),horizontal=add(mul(baseForward,Math.cos(c.lookYaw)),mul(baseRight,Math.sin(c.lookYaw)));
   forward=unit(add(mul(horizontal,Math.cos(c.lookPitch)),mul(baseUp,Math.sin(c.lookPitch))));right=unit(add(mul(baseRight,Math.cos(c.lookYaw)),mul(baseForward,-Math.sin(c.lookYaw))));up=cross(right,forward);
  }
  if(this.state.bridge){const minimum=this.configCache.bridgeRadius*.003,r=Math.hypot(...observer);if(r<minimum)observer=mul(r>1e-20?unit(observer):[0,0,1],minimum);}
  this.cameraFrame={observer,forward,right,up,inspectIndex,hideIndex,inspectCamera,inspectForward,inspectRight,inspectUp};
 }
 validateFrameGeometry(frame=this.cameraFrame){
  // Validate the actual frame before either backend publishes it. A dark sky is
  // a valid composition; geometry failure must be detected from state, not color.
  let reason='';const k=this.configCache;
  if(NUMERIC_STATE_KEYS.some(key=>!Number.isFinite(this.state[key]))||!Number.isFinite(this.time)||!(this.massScale>0)||!(k.bounds>0)||!Number.isFinite(k.bounds))reason='invalid scene dimensions';
  else if(!frame||CAMERA_KEYS.some(key=>!Number.isFinite(this.camera[key]))||!finiteVector(frame.observer,3)||!finiteVector(frame.inspectCamera,3)||!validBasis(frame.right,frame.up,frame.forward)||!validBasis(frame.inspectRight,frame.inspectUp,frame.inspectForward))reason='invalid camera orientation';
  else if(!finiteVector(this.holeData,8)||!finiteVector(k.horizon,2)||!finiteVector(k.isco,2)||!finiteVector(k.diskOuter,2)||k.horizon.some(v=>v<=0)||k.isco.some(v=>v<=0)||this.state.disk&&!(k.diskOuter[0]>0))reason='invalid gravitational geometry';
  else if(this.state.bridge&&(!(k.bridgeRadius>0)||!Number.isFinite(k.bridgeRadius)))reason='invalid bridge dimensions';
  else if(!finiteVector(this.objectData,48)||!finiteVector(this.colorData,48)||!finiteVector(this.headingData,24)||!finiteVector(this.luminosityData,12)||!finiteVector(this.tidalData,4))reason='invalid object coordinates';
  else for(const body of this.objectFrames){if(!finiteVector(body.position,3)||!(body.radius>0)||!Number.isFinite(body.radius)||!validBasis(body.frame?.[0],body.frame?.[1],body.frame?.[2])||(body.physicalRadius!==undefined&&(!(body.physicalRadius>0)||!Number.isFinite(body.physicalRadius)))){reason='invalid object dimensions';break;}}
  if(reason){const message=`Scene geometry could not be rendered: ${reason}. Reset the view or choose another scene.`;if(this.geometryError!==message){this.geometryError=message;this.onError(message);}return false;}
  this.geometryError='';return true;
 }
 setDrawUniforms(frame=this.cameraFrame,{gl:g=this.gl,uniforms:u=this.uniforms,width=this.canvas.width,height=this.canvas.height,viewport=[0,0,width,height],projectionMode=0,inverseProjection=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],steps=this.steps,detail=this.detail||0}={}){
  const s=this.state,c=this.camera,k=this.configCache;
  g.uniform3fv(u.uObserver,frame.observer);g.uniform3fv(u.uForward,frame.forward);g.uniform3fv(u.uRight,frame.right);g.uniform3fv(u.uUp,frame.up);g.uniform1i(u.uInspectIndex,frame.inspectIndex);g.uniform1i(u.uHideObjectIndex,frame.hideIndex);g.uniform3fv(u.uInspectCamera,frame.inspectCamera);g.uniform3fv(u.uInspectForward,frame.inspectForward);g.uniform3fv(u.uInspectRight,frame.inspectRight);g.uniform3fv(u.uInspectUp,frame.inspectUp);g.uniform2fv(u['uHeadings[0]'],this.headingData);g.uniform1i(u.uCockpitMode,this.focusMode==='onboard'&&this.getFocusFrame()?.type==='shuttle'?1:0);
  const warp=this.warpObjectId?this.objectFrames.find(o=>o.id===this.warpObjectId):null,warpRadius=warp?warp.radius*s.warpRadius:1,warpCenter=warp?.position||[0,0,0];g.uniform3fv(u.uWarpCenter,warpCenter);g.uniform3fv(u.uWarpAxis,warp?.frame[2]||[0,0,1]);g.uniform1f(u.uWarpRadius,warpRadius);g.uniform1f(u.uWarpStrength,s.warp?Math.min(3,s.warpFactor*.3):0);g.uniform1f(u.uWarpThickness,s.warpThickness);g.uniform4f(u.uWarpFlags,s.warp&&warp&&s.warpFactor>0?1:0,s.warpField?1:0,s.warpGrid?1:0,s.blackHole?1:0);g.uniform3fv(u.uWarpObserver,frame.observer.map((x,i)=>(x-warpCenter[i])/warpRadius));g.uniform1i(u.uWarpObjectIndex,warp?.index??-1);const wrapGrid=v=>((v%4096)+4096)%4096;g.uniform2f(u.uWarpGridOffset,warp?wrapGrid(dot(warpCenter,k.primaryBasis[0])/warpRadius):0,warp?wrapGrid(dot(warpCenter,k.primaryBasis[2])/warpRadius):0);g.uniform2f(u.uWarpGridRotation,warp?dot(warp.frame[2],k.primaryBasis[0]):1,warp?dot(warp.frame[2],k.primaryBasis[2]):0);g.uniform1f(u.uDetail,detail);
  g.uniform2f(u.uResolution,width,height);
  g.uniform4f(u.uRayViewport,...viewport);g.uniform1i(u.uProjectionMode,projectionMode);g.uniformMatrix4fv(u.uInverseProjection,false,inverseProjection);g.uniform4f(u.uBridge,s.bridge?1:0,k.bridgeRadius||1,0,0);g.uniform1f(u.uWhiteHole,s.whiteHole?1:0);g.uniform3fv(u.uBridgeSkyColor,k.bridgeOtherColor);g.uniform1f(u.uBridgeOtherNebula,s.bridgeOtherNebula?1:0);g.uniform4f(u.uBridgeSkyParams,ENUMS.bridgeOtherShape.indexOf(s.bridgeOtherShape),s.bridgeOtherScale,s.bridgeOtherIntensity,radians(s.bridgeOtherRotation));
  const scalar={uTime:this.time,uExposure:s.exposure,uDistance:c.distance,uYaw:c.yaw,uPitch:c.pitch,uLookYaw:c.lookYaw,uLookPitch:c.lookPitch,uMass:this.massScale,uBounds:k.bounds,uStars:s.starDensity};
  for(const name in scalar)g.uniform1f(u[name],scalar[name]);
  g.uniform3fv(u.uPrimaryAxis,k.primaryAxis);g.uniform3fv(u.uSecondaryAxis,k.secondaryAxis);
  g.uniform2f(u.uSpin,s.spin,s.secondarySpin);g.uniform2f(u.uHorizon,...k.horizon);g.uniform2f(u.uIsco,...k.isco);g.uniform2f(u.uDiskOuter,...k.diskOuter);
  g.uniform4fv(u['uHoles[0]'],this.holeData);g.uniform4f(u.uFlags,s.grid?1:0,s.disk?1:0,s.lensing?1:0,s.jets?1:0);g.uniform4f(u.uFlags2,s.stars?1:0,s.nebula?1:0,s.tidalStar?1:0,s.horizonGuide?1:0);
  g.uniform4f(u.uDiskParams,ENUMS.diskStyle.indexOf(s.diskStyle),s.diskThickness,s.diskDensity,0);g.uniform3fv(u.uDiskColor,k.diskColor);
  g.uniform4f(u.uNebulaParams,ENUMS.nebulaShape.indexOf(s.nebulaShape),s.nebulaScale,s.nebulaIntensity,radians(s.nebulaRotation));g.uniform3fv(u.uNebulaColor,k.nebulaColor);
  g.uniform4f(u.uJets,s.jetSpread,s.jetLength,s.jetIntensity,0);g.uniform3fv(u.uJetColor,k.jetColor);g.uniform3fv(u.uStarColor,k.starColor);
  g.uniform1i(u.uSpectrum,ENUMS.spectrum.indexOf(s.spectrum));g.uniform1i(u.uBinary,s.binary?1:0);g.uniform1i(u.uSteps,steps);
  g.uniform1i(u.uObjectCount,this.objectCount||0);g.uniform4fv(u['uObjects[0]'],this.objectData);g.uniform4fv(u['uColors[0]'],this.colorData);g.uniform1fv(u['uLuminosities[0]'],this.luminosityData);g.uniform4fv(u.uTidal,this.tidalData);
 }
 drawScene(frame=this.cameraFrame,options={}){
  if(!this.validateFrameGeometry(frame))return false;
  const g=this.gl;g.useProgram(this.program);g.bindBuffer(g.ARRAY_BUFFER,this.buffer);g.enableVertexAttribArray(this.activeProgram.attribute);g.vertexAttribPointer(this.activeProgram.attribute,2,g.FLOAT,false,0,0);
  this.setDrawUniforms(frame,options);g.drawArrays(g.TRIANGLES,0,3);return true;
 }
 beginPhotoCapture(){
  if(!this.gl||this.contextLost||this.disposed||this.photoActive||this.xr?.active)throw new Error('Still rendering needs an available GPU outside VR.');
  this.fillHoles();this.fillObjects();this.updateCameraFrame();
  if(!this.validateFrameGeometry())throw new Error(this.geometryError);
  this.cancelCapture('Still rendering started.');this.photoActive=true;cancelAnimationFrame(this.raf);this.raf=0;this.lastTime=0;
  const uniforms=[],names=Object.fromEntries(UNIFORM_NAMES.map(name=>[name,name])),recorder={};
  for(const method of ['uniform1f','uniform1i','uniform2f','uniform3f','uniform4f','uniform1fv','uniform2fv','uniform3fv','uniform4fv','uniformMatrix3fv','uniformMatrix4fv'])recorder[method]=(name,...args)=>uniforms.push({name,method,args:args.map(a=>ArrayBuffer.isView(a)||Array.isArray(a)?Array.from(a):a)});
  this.setDrawUniforms(this.cameraFrame,{gl:recorder,uniforms:names,steps:768,detail:3});
  return {features:{...this.shaderFeatures(),ultra:true},uniforms,width:this.canvas.width,height:this.canvas.height,time:this.time};
 }
 endPhotoCapture(){
  if(!this.photoActive)return;this.photoActive=false;this.lastTime=0;this.lastSubmit=0;this.nextSubmit=0;this.budget.resetTiming(this.now());
  if(this.gl&&!this.contextLost){const g=this.gl;g.bindFramebuffer(g.FRAMEBUFFER,null);if(this.activeProgram){g.useProgram(this.program);g.bindBuffer(g.ARRAY_BUFFER,this.buffer);g.enableVertexAttribArray(this.activeProgram.attribute);g.vertexAttribPointer(this.activeProgram.attribute,2,g.FLOAT,false,0,0);}this.resize();}
  if(!this.disposed&&!document.hidden&&!this.presentationPaused&&!this.xr?.active&&!this.raf)this.raf=requestAnimationFrame(this.frame);
 }
 getVRSupport(){if(!this.xr)this.xr=new XRViewController(this);return this.xr.support();}
 enterVR(session=null){if(!this.xr)this.xr=new XRViewController(this);return this.xr.enter(session);}
 exitVR(){return this.xr?.exit()||Promise.resolve();}
 render(now=this.now(),fromFrame=false){
  if(this.disposed||this.contextLost||document.hidden||this.presentationPaused||this.photoActive||this.xr?.active)return false;
  this.pollProgram();this.requestProgram();
  // Keep the previous complete image while a newly requested feature compiles.
  // Rendering it with an incompatible program would silently omit its objects.
  if(!this.ready||!this.programSupports(this.shaderFeatures())||!this.gpuAvailable(now))return false;
  // WebGL1 has no fence guarantee; leave a browser frame between submissions.
  if(fromFrame&&!this.canFence&&this.nextSubmit&&now+.25<this.nextSubmit)return false;
  if(this.resizePending)this.resize();
  const started=this.now(),g=this.gl,u=this.uniforms,s=this.state,c=this.camera,k=this.configCache;
  this.fillHoles();this.protectObserver();const count=this.fillObjects();this.updateCameraFrame();g.useProgram(this.program);
  if(!this.drawScene())return false;
  this.captureFreshFrame();
  const warmup=this.warmupFrames>0;if(warmup)this.warmupFrames--;
  if(this.canFence){const sync=g.fenceSync(g.SYNC_GPU_COMMANDS_COMPLETE,0);if(sync){this.gpuFence={sync,started:now,generation:this.budget.generation,warmup,polls:0};g.flush();}else this.canFence=false;}
  if(!this.canFence){
   this.frames++;if(this.budget.noteCompletion(now,{eligible:!warmup}))this.resizePending=true;
   // Preserve the 30Hz deadline phase at 60/120/144Hz instead of rounding
   // every interval upward to an integer number of RAF callbacks.
   const interval=1000/30;this.nextSubmit=this.nextSubmit&&now-this.nextSubmit<interval*2?this.nextSubmit+interval:now+interval;
  }
  this.lastSubmit=now;this.budget.noteSubmit(now,this.now()-started);return true;
 }
 frame(now){
  this.raf=0;if(this.disposed||document.hidden||this.presentationPaused||this.photoActive||this.xr?.active){this.lastTime=0;return;}this.raf=requestAnimationFrame(this.frame);
  if(this.contextLost){this.lastTime=0;return;}
  this.advanceSimulation(now);this.render(now,true);this.emitStats(now);
 }
 advanceSimulation(now){
  const gap=this.lastTime?Math.max(0,now-this.lastTime):0;if(this.budget.noteFrame(now,gap))this.resizePending=true;
  const dt=gap?Math.min(.1,gap/1000):1/60;this.lastTime=now;
  if(!this.state.paused)this.time+=dt*this.state.speed;
  const isLooking=this.state.viewMode==='free'||this.state.viewMode==='look'||Math.abs(this.target.lookYaw)+Math.abs(this.target.lookPitch)>.0001;
  if(this.state.autoRotate&&!this.pointers.size&&!isLooking)this.target.yaw+=dt*.055;
  const smooth=1-Math.exp(-dt*8),travelSmooth=1-Math.exp(-dt*.22);
  for(const key of ['yaw','pitch','lookYaw','lookPitch','focusDistance'])this.camera[key]+=(this.target[key]-this.camera[key])*smooth;
  this.camera.distance+=(this.target.distance-this.camera.distance)*(this.travel?travelSmooth:smooth);
  if(this.state.viewMode==='free'&&this.freePosition&&this.freeTarget)this.freePosition=this.freePosition.map((v,i)=>v+(this.freeTarget[i]-v)*smooth);
  if(this.travel&&Math.abs(this.target.distance-this.camera.distance)<.04*this.massScale)this.travel=false;
  return dt;
 }
 emitStats(now){
  if(!this.statsStart)this.statsStart=now;
  if(now-this.statsStart>600){
   this.fps=this.frames*1000/(now-this.statsStart);this.frames=0;this.statsStart=now;
   this.onStats({...this.getState(),fps:Math.round(this.fps),scale:this.renderScale,steps:this.steps,horizonAU:this.state.mass*1.47662504/149.5978707*horizonRg(this.state.spin),width:this.canvas.width,height:this.canvas.height,webgl:this.webgl2?2:1,discTruncated:this.state.binary&&this.configCache.diskOuter[0]/this.massScale<this.configCache.isco[0]+.4});
  }
 }
 dispose(){this.xr?.dispose();this.cancelCapture('The renderer was closed before the image was ready.');this.disposed=true;cancelAnimationFrame(this.raf);this.listeners.forEach(remove=>remove());this.observer?.disconnect();if(this.gl&&!this.contextLost){this.releaseFence();this.gl.deleteBuffer(this.buffer);for(const entry of this.programs.values())this.gl.deleteProgram(entry.program);if(this.pendingProgram){this.pendingProgram.shaders.forEach(shader=>this.gl.deleteShader(shader));this.gl.deleteProgram(this.pendingProgram.program);}}this.programs?.clear();this.pendingProgram=null;this.ready=false;}
}

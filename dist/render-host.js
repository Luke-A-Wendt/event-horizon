import { BlackHoleRenderer } from './renderer.js';
import { CpuRenderer } from './cpu-renderer.js';
import { CpuCommandCanvas, CpuCommandPlayer, createCpuTaskScheduler } from './cpu-commands.js';
import { createPhotoRender, PHOTO_PRESETS } from './photo-renderer.js';
import { RENDER_WORKER_SOURCE } from './render-worker-bundle.js';
import { PLANET_TEXTURE_DATA } from './planet-texture-data.js';
import { captureAnnotationFrame } from './annotations.js';
import { DiagnosticFramePresenter } from './frame-presentation.js';
import { snapshotRenderer, restoreRenderer, renderSignature, LatestStateMailbox, SceneLoadLifecycle, GPU_SCENE_LOAD_TIMEOUT_MS, CPU_SCENE_TIMEOUT_MS } from './render-state.js';

const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const hostMethods=new Set(['startup','getState','captureImage','renderPicture','getVRSupport','enterVR','exitVR','dispose','restartRendering','workerMode','requestSceneLoad','prepareMutation','finishMutation','getDiagnostics','didRestoreSnapshot','loadScene','loadSnapshot','loadWarpScenario','setPresentationPaused','noteInteraction']);
const interactionMethods=new Set(['update','updateStellar','setFlightInput','setFlightPower','nudgeFlightTurn','resetFlight','brakeFlight','reverseFlight','updateObject','updateTreeObject','addObject','addChildObject','removeObject','removeTreeObject','reparentObject','clearObjects','setObjectWarp','setBridgeTraveler','exploreWarp','setFreeDrive','freeRoamRelative','setQuality','setViewMode','setCameraPreset','setDistanceRg','setDistanceMeters','setOrbitRadiusMeters','focusTarget','focusObject','releaseFocus','resetCamera','resetSceneView','look','rotate','zoom','moveForward','resetAll']);
const hostFrameKey=renderer=>JSON.stringify([renderer.controlRevision,renderer.geometryRevision,renderer.sceneRevision,renderer.sceneId,renderer.quality,renderer.state,renderer.camera,renderer.target,renderer.focusId,renderer.focusMode,renderer.selectedId,renderer.driveId,renderer.objects.find(o=>o.driveReturn)?.driveReturn.elapsed,renderer.state.viewMode==='free'?renderer.freePosition:null,renderer.freeTarget,renderer.freeBasis,renderer.time,renderer.objects.length]);
const viewport=canvas=>{const r=canvas.getBoundingClientRect();return {width:Math.max(2,r.width),height:Math.max(2,r.height),dpr:Math.min(3,window.devicePixelRatio||1),cssWidth:window.innerWidth||r.width,cssHeight:window.innerHeight||r.height};};
const workerAvailable=()=>typeof Worker==='function'&&typeof Blob==='function'&&typeof URL?.createObjectURL==='function';
export function workerRenderingSupported(canvas){return workerAvailable()&&typeof canvas?.transferControlToOffscreen==='function';}

// This controller computes only cheap state/camera changes on the main thread.
// Shader compilation, ray tracing, CPU painting, and stills run in its worker.
export class RenderHost extends BlackHoleRenderer {
 constructor(canvas,callbacks={},options={}){
  super(canvas,{...callbacks,autoStart:false});
  this.callbacks=callbacks;this.cpu=!!options.cpu;this.cpuMode=this.cpu;this.isCPU=this.cpu;this.workerMode=false;this.worker=null;this.delegate=null;this.pendingRequests=new Map();this.requestId=0;this.workerStats={};this.workerReady=false;this.lastWorkerAt=0;this.lastFrameAt=0;this.frameSeen=false;this.lastUiStats=0;this.hostDisposed=false;this.photoRunning=false;this.gpuUnavailable=false;this.awaitingBackendChoice=false;this.commandPlayer=null;this.commandMode=false;this.cpuProducer=null;this.lastHostFrame=0;this.lastStatsNotice=0;
  if(this.cpu){this.gl=null;this.quality='cpu';}
  this.sceneLoad=new SceneLoadLifecycle({cpu:this.cpu,now:()=>this.now()});this.sceneRevision=this.sceneLoad.revision;
  this.monitorAt=this.now();this.uiLagMs=0;this.loadReason='Starting local renderer';
  this.controlRevision=0;
  this.loadMonitor=setInterval(()=>{const now=this.now();this.uiLagMs=document.hidden?0:Math.max(0,now-this.monitorAt-250);this.monitorAt=now;this.checkSceneLoad();if(!document.hidden)this.emitHostStats();},250);
  this.startup=new Promise(resolve=>{this.resolveStartup=resolve;});
  this.startBackend();
  if(!this.raf)this.raf=requestAnimationFrame(this.frame);
  return new Proxy(this,{get:(target,key)=>{
   if(target.delegate&&!hostMethods.has(key)){const value=target.delegate[key];return typeof value==='function'?interactionMethods.has(key)?(...args)=>{target.noteInteraction();return value.apply(target.delegate,args);}:value.bind(target.delegate):value;}
   if(interactionMethods.has(key)&&typeof target[key]==='function')return (...args)=>{target.noteInteraction();return target[key](...args);};
   const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
 }
 initGL(){this.gl={worker:true};this.ready=true;this.contextLost=false;this.programs=new Map();this.failedPrograms=new Set();this.pendingProgram=null;this.activeProgram=null;this.gpuFence=null;this.webgl2=true;}
 requestProgram(){}
 pollProgram(){}
 noteInteraction(){this.controlRevision=(this.controlRevision||0)+1;}
 bindControls(){super.bindControls();this.listen(document,'visibilitychange',()=>{this.sceneLoad?.check(true);if(document.hidden)this.cancelCpuWork();this.worker?.postMessage({type:'visibility',hidden:document.hidden,presentationPaused:this.presentationPaused});});}
 cancelCpuWork(){this.commandPlayer?.cancelFrame();this.cpuTasks?.cancel(this.cpuTask);this.cpuTask=null;this.cpuProducing=false;}
 resize(){this.noteInteraction();this.hostViewport=null;this.resizeSnapshotPending=true;if(this.worker)this.queueSnapshot();}
 render(){return false;}
 currentSignature(){return renderSignature(this.delegate||this);}
 requestSceneLoad(){
  this.noteInteraction();
  this.loadReason='Preparing this scene';this.sceneRevision=this.sceneLoad.begin();if(this.delegate)this.delegate.sceneRevision=this.sceneRevision;
  this.preparedSceneLoad=true;this.cancelCpuWork();this.onError('');this.emitHostStats(true);return this.sceneRevision;
 }
 prepareMutation(reason='Updating scene…'){const revision=this.requestSceneLoad();this.loadReason=String(reason);return revision;}
 finishMutation(){this.preparedSceneLoad=false;this.queueSnapshot();this.emitHostStats(true);}
 didRestoreSnapshot(){if(!this.sceneLoad||this.restoringScene)return;this.sceneRevision=this.sceneLoad.begin();if(this.delegate)this.delegate.sceneRevision=this.sceneRevision;this.preparedSceneLoad=false;}
 // The parsed file is already validated. Its transport revision and backend
 // cannot override this renderer's current lifecycle or explicit CPU choice.
 loadSnapshot(snapshot){
  if(!this.preparedSceneLoad)this.requestSceneLoad();
  const revision=this.sceneRevision,source=this.delegate||this;
  const saved={...snapshot,sceneRevision:revision,state:{...snapshot.state,paused:true},quality:this.cpu?'cpu':snapshot.quality==='cpu'?'adaptive':snapshot.quality};
  this.restoringScene=true;
  try{
   restoreRenderer(source,saved);this.sceneRevision=source.sceneRevision=revision;
   this.preparedSceneLoad=false;this.lastSnapshotKey=null;this.preparedFrameKey=null;this.noteInteraction();
   if(this.gpuUnavailable||this.cpuProducer&&!this.cpuProducer.ready)this.restartRendering();
   this.queueSnapshot();this.emitHostStats(true);return this.getState();
  }catch(error){this.preparedSceneLoad=false;this.workerFailed('This scene could not load: '+(error?.message||error),{allowFallback:false});return this.getState();}
  finally{this.restoringScene=false;}
 }
 loadScene(id='disk'){
  if(!this.preparedSceneLoad)this.requestSceneLoad();this.preparedSceneLoad=false;
  try{
   const result=this.delegate?this.delegate.loadScene(id):super.loadScene(id);
   if(this.gpuUnavailable||this.cpuProducer&&!this.cpuProducer.ready)this.restartRendering();
   this.queueSnapshot();this.emitHostStats(true);return result;
  }catch(error){this.workerFailed('This scene could not load: '+(error?.message||error));return this.getState();}
 }
 checkSceneLoad(){
  if(this.hostDisposed||!this.sceneLoad)return;
  const renderer=this.delegate||this,suspended=!!(this.awaitingBackendChoice||document.hidden||renderer.presentationPaused||this.photoRunning||renderer.photoActive||renderer.xr?.active);
  if(this.sceneLoad.check(suspended))this.workerFailed(this.sceneLoad.error,{allowFallback:false});
 }
 completedFrame(signature,revision=this.sceneRevision){
  if(this.preparedSceneLoad||signature!==this.currentSignature()||revision!==this.sceneRevision||this.sceneLoad?.state==='failed')return false;
  this.frameSeen=true;this.lastFrameAt=this.now();this.workerStats.renderedSignature=signature;this.workerStats.frameReady=true;this.sceneLoad?.complete(revision);return true;
 }
 presentAnnotations(frame,signature,revision=this.sceneRevision){
  if(!frame||this.hostDisposed||this.preparedSceneLoad||signature!==this.currentSignature()||revision!==this.sceneRevision||this.sceneLoad?.state==='failed')return;
  this.callbacks.onFrame?.(frame);
 }
 frame(now){
  this.raf=0;if(this.hostDisposed||this.delegate||document.hidden||this.presentationPaused||this.photoRunning){this.lastTime=0;return;}
  this.raf=requestAnimationFrame(this.frame);if(this.cpu&&now-this.lastHostFrame<1000/30-1)return;this.lastHostFrame=now;try{this.advanceSimulation(now);const key=hostFrameKey(this);if(key!==this.preparedFrameKey){this.fillHoles();this.protectObserver();this.fillObjects();this.updateCameraFrame();this.preparedFrameKey=key;}}catch(error){this.workerFailed('Scene preparation failed: '+(error?.message||error),{allowFallback:false});return;}
  if(this.workerReady&&this.lastWorkerAt&&this.now()-this.lastWorkerAt>this.sceneLoad.timeout){this.workerFailed('The graphics renderer stopped responding. Retry to restart it; your controls remain available.');return;}
  if(this.cpuProducer){if(this.commandPlayer?.busy&&this.commandSignature!==renderSignature(this))this.commandPlayer.cancelFrame();this.produceCpuFrame(now);}else this.queueSnapshot();
  this.emitHostStats();
 }
 getDiagnostics(){
  const now=this.now(),source=this.delegate||this,backend=this.cpu?(this.cpuProducer?'cooperative-main':this.commandMode?'worker-commands':'worker-canvas'):this.delegate?'main-gpu':'worker-gpu',failed=this.sceneLoad?.state==='failed';
  const phase=failed?'failed':this.awaitingBackendChoice?'waiting-choice':this.preparedSceneLoad?'preparing':!(this.workerReady||this.cpuProducer||this.delegate)?'starting':this.commandPlayer?.busy?'presenting':(source.pendingProgram||this.workerStats.shaderCompiling)?'compiling':this.sceneLoad?.state==='loading'?'drawing':'ready';
  const detail=backend==='main-gpu'?'Graphics runs on the page because worker WebGL is unavailable. Driver compilation may pause this browser.':backend==='cooperative-main'?'Workers are unavailable. CPU work yields in short batches; a browser task can still overrun.':backend==='worker-commands'?'Geometry runs in a local worker; complete frames are painted in short batches.':'Rendering runs in a local worker, separate from page controls.';
  return {backend,phase,mainThread:backend==='main-gpu'||backend==='cooperative-main',frameAgeMs:this.frameSeen?Math.max(0,now-this.lastFrameAt):null,loadElapsedMs:this.sceneLoad?.elapsed||0,deadlineMs:this.sceneLoad?.timeout||0,workerAgeMs:this.lastWorkerAt?Math.max(0,now-this.lastWorkerAt):null,queuedStates:this.mailbox?.inflight?1:0,presentationBusy:!!this.commandPlayer?.busy,uiLagMs:this.uiLagMs||0,detail,error:this.sceneLoad?.error||''};
 }
 getState(){
  const source=this.delegate||this,base=this.delegate?this.delegate.getState():super.getState();
  const suspended=source.presentationPaused||this.photoRunning||source.photoActive||document.hidden;
  const stale=!!(this.frameSeen&&!suspended&&this.now()-this.lastFrameAt>1200);
  const matching=!!(this.frameSeen&&this.workerStats.renderedSignature===this.currentSignature());
  const failed=this.sceneLoad?.state==='failed'||this.gpuUnavailable;
  const waiting=!!(!matching||stale||this.workerStats.contextLost||this.sceneLoad?.state==='loading');
  const backend=this.cpu?(this.cpuProducer?'cooperative-main':this.commandMode?'worker-commands':'worker-canvas'):this.delegate?'main-gpu':'worker-gpu';
  return {...base,...(this.delegate?{}:this.workerStats),objects:base.objects,sceneTargets:base.sceneTargets,cpu:this.cpu?true:base.cpu,quality:source.quality,workerMode:this.workerMode,renderBackend:backend,cpuBackend:this.cpu?backend:undefined,renderReady:matching&&!failed,renderBusy:waiting&&!failed&&!this.awaitingBackendChoice,awaitingBackendChoice:this.awaitingBackendChoice,renderFailed:failed,loadingReason:failed?'Scene failed to load':!(this.workerReady||this.cpuProducer||this.delegate)?'Starting local renderer':waiting?this.loadReason||'Preparing this view':'',diagnostics:this.getDiagnostics(),fps:stale?0:(this.delegate?base.fps:this.workerStats.fps||0),shaderCompiling:waiting&&!failed&&!this.awaitingBackendChoice,photoActive:this.photoRunning||base.photoActive,...this.sceneLoad?.stats};
 }
 emitHostStats(force=false){const now=this.now();if(!force&&now-this.lastStatsNotice<(this.cpu?250:200))return;this.lastStatsNotice=now;this.onStats(this.getState());}
 queueSnapshot(){
  if(!this.mailbox||this.hostDisposed||this.delegate||!this.workerReady||this.photoRunning||this.preparedSceneLoad)return;
  // Do not repeatedly clone a scene while its worker is busy. The next ACK
  // takes a fresh snapshot, retaining only the latest user intent.
  if(this.mailbox.inflight){this.snapshotDirty=true;return;}this.snapshotDirty=false;
  const stateKey=hostFrameKey(this);if(this.lastSnapshotKey===stateKey&&!this.resizeSnapshotPending)return;this.lastSnapshotKey=stateKey;this.resizeSnapshotPending=false;
  const signature=renderSignature(this);if(this.commandPlayer?.busy&&this.commandSignature!==signature)this.commandPlayer.cancelFrame();
  // Orbital time and camera changes do not mutate the catalog. Transfer its
  // 515+ records only after a model edit; the worker retains the prior copy.
  const dynamicObjects=!!this.driveId||this.objects.some(o=>o.driveReturn);
  const includeObjects=this.lastSnapshotObjects!==this.objects||this.lastSnapshotGeometry!==this.geometryRevision||dynamicObjects||this.lastSnapshotDynamic;
  this.mailbox.push({snapshot:snapshotRenderer(this,{includeObjects}),viewport:this.hostViewport||(this.hostViewport=viewport(this.canvas)),signature,presentationPaused:this.presentationPaused||document.hidden});
  this.lastSnapshotObjects=this.objects;this.lastSnapshotGeometry=this.geometryRevision;this.lastSnapshotDynamic=dynamicObjects;
 }
 async startBackend(){
  if(workerAvailable()&&(this.cpu||workerRenderingSupported(this.canvas))){
   let url;
   try{
    url=URL.createObjectURL(new Blob([RENDER_WORKER_SOURCE],{type:'text/javascript'}));
    const worker=new Worker(url,{name:'event-horizon-renderer'});this.worker=worker;this.workerMode=true;this.lastSnapshotKey=null;this.lastSnapshotObjects=null;this.lastSnapshotGeometry=null;this.lastSnapshotDynamic=false;
    worker.addEventListener('message',event=>{if(this.worker===worker)this.handleWorker(event.data);});worker.addEventListener('error',event=>{if(this.worker===worker)this.workerFailed(event.message||'The render worker stopped.');});
    this.mailbox=new LatestStateMailbox(message=>worker.postMessage(message));
    this.commandMode=!!(this.cpu&&(this.forceCpuCommands||!workerRenderingSupported(this.canvas)));
    if(this.commandMode)this.commandPlayer=new CpuCommandPlayer(this.canvas);
    const offscreen=this.commandMode?null:this.canvas.transferControlToOffscreen();this.transferred=!!offscreen;
    worker.postMessage({type:'init',canvas:offscreen,commandMode:this.commandMode,cpu:this.cpu,viewport:viewport(this.canvas),snapshot:snapshotRenderer(this),signature:renderSignature(this),...(!this.cpu?{assets:PLANET_TEXTURE_DATA}:{})},offscreen?[offscreen]:[]);
    this.startupTimer=setTimeout(()=>{if(this.worker===worker)this.workerFailed('The renderer is taking too long to start. Try again or choose a simpler scene.',{allowFallback:false});},this.cpu?CPU_SCENE_TIMEOUT_MS:GPU_SCENE_LOAD_TIMEOUT_MS);
    return;
   }catch(error){this.worker?.terminate();this.worker=null;this.mailbox?.close();this.workerMode=false;
    if(this.transferred)this.replaceCanvas();
   }finally{if(url)URL.revokeObjectURL(url);}
  }
  // Unsupported older browsers retain a limited main-thread renderer. Paint the
  // loading state first; a browser cannot promise isolation without Workers.
  await nextPaint();if(this.hostDisposed)return;
  this.startDirectFallback();
 }
 startDirectFallback(reason=''){
  this.directFallbackAttempted=true;
  if(this.cpu){this.startLocalCpu(reason);return;}
  try{this.switchToDirect();const available=this.cpu?!!this.delegate.ready:!!this.delegate.gl;this.awaitingBackendChoice=!available&&!this.cpu;this.sceneLoad?.check(true);this.resolveStartup?.({available,worker:false,cpu:this.cpu,reason});this.resolveStartup=null;this.onStats(this.getState());}
  catch(error){this.workerFailed(error?.message||'The local renderer could not start.');}
 }
 startLocalCpu(reason=''){
  try{
   this.worker?.terminate();this.worker=null;this.mailbox?.close();this.workerMode=false;this.workerReady=false;
   this.unbind();if(this.transferred)this.replaceCanvas();this.bindControls();this.commandPlayer?.dispose();this.commandPlayer=new CpuCommandPlayer(this.canvas);this.commandMode=true;
   const surface=new CpuCommandCanvas();surface.getBoundingClientRect=()=>this.hostViewport||(this.hostViewport=viewport(this.canvas));
   this.cpuTasks?.dispose();this.cpuTasks=createCpuTaskScheduler();this.cpuProducer=new CpuRenderer(surface,{bindControls:false,autoStart:false,onError:message=>{if(message)this.workerFailed(message,{allowFallback:false});}});this.cpuSnapshotObjects=null;this.cpuSnapshotGeometry=null;this.cpuSnapshotDynamic=false;this.ready=!!this.cpuProducer.ready;this.gpuUnavailable=!this.ready;this.cpuProductionAfter=0;
   this.resolveStartup?.({available:this.ready,worker:false,cpu:true,reason:reason||'This browser uses short, cooperative CPU tasks.'});this.resolveStartup=null;this.emitHostStats(true);
  }catch(error){this.workerFailed(error.message,{allowFallback:false});}
 }
 produceCpuFrame(now){
  if(this.preparedSceneLoad||this.cpuProducing||this.commandPlayer?.busy||now<(this.cpuProductionAfter||0)||!this.cpuProducer?.ready)return;
  const producer=this.cpuProducer,surface=producer.canvas,signature=renderSignature(this),revision=this.sceneRevision,frameStarted=now;this.cpuProducing=true;
  let stages;try{const dynamicObjects=!!this.driveId||this.objects.some(o=>o.driveReturn),includeObjects=this.cpuSnapshotObjects!==this.objects||this.cpuSnapshotGeometry!==this.geometryRevision||dynamicObjects||this.cpuSnapshotDynamic;restoreRenderer(producer,snapshotRenderer(this,{includeObjects}));this.cpuSnapshotObjects=this.objects;this.cpuSnapshotGeometry=this.geometryRevision;this.cpuSnapshotDynamic=dynamicObjects;producer.resize();surface.beginFrame();stages=producer.renderStages(now,false,true);}catch(error){this.cpuProducing=false;this.workerFailed('CPU scene preparation failed: '+error.message,{allowFallback:false});return;}
  const pump=()=>{
   this.cpuTask=null;if(this.hostDisposed||producer!==this.cpuProducer){this.cpuProducing=false;return;}
   if(this.presentationPaused||document.hidden||signature!==renderSignature(this)){this.cpuProducing=false;return;}
   const started=this.now();let step,count=0;try{do{step=stages.next();count++;}while(!step.done&&count<4&&this.now()-started<4);}catch(error){this.cpuProducing=false;producer.ready=false;this.workerFailed('CPU rendering stopped: '+error.message+'. Retry graphics to continue.',{allowFallback:false});return;}
   if(!step.done){this.cpuTask=this.cpuTasks.post(pump);return;}
   this.cpuProducing=false;if(!step.value)return;
   const annotationFrame=captureAnnotationFrame(producer);
   this.commandSignature=signature;this.commandPlayer.present(surface.takeFrame(),({costMs,cancelled,error})=>{
    if(error){producer.ready=false;this.workerFailed('CPU presentation stopped: '+error.message+'. Retry graphics to continue.',{allowFallback:false});return;}const previousFrameAt=this.lastFrameAt;if(cancelled||!this.completedFrame(signature,revision))return;
    this.presentAnnotations(annotationFrame,signature,revision);
    const now=this.now(),gap=previousFrameAt?now-previousFrameAt:1000/30;producer.noteCpuCost(costMs,now);this.cpuProductionAfter=frameStarted+Math.min(1000/15,Math.max(1000/30,producer.cpuDrawCost*1.15));
    this.workerStats={fps:1000/Math.max(1,gap),effectiveQuality:'cpu',webgl:0,cpu:true,width:surface.width,height:surface.height,scale:producer.renderScale,steps:0,renderedSignature:signature,frameReady:true};this.emitHostStats(true);
   });
  };
  this.cpuTask=this.cpuTasks.post(pump);
 }
 handleWorker(message){
  if(this.hostDisposed)return;this.lastWorkerAt=this.now();
  if(message.type==='ready'){
   clearTimeout(this.startupTimer);this.workerReady=!!message.available;this.gpuUnavailable=!message.available;
   if(!message.available){
    // Some browsers support OffscreenCanvas 2D but not worker WebGL. Probe the
    // ordinary GPU backend before deciding that graphics are unavailable.
    this.worker?.terminate();this.worker=null;this.mailbox?.close();this.gpuUnavailable=false;
    if(this.cpu&&!this.commandMode){this.forceCpuCommands=true;this.unbind();if(this.transferred)this.replaceCanvas();this.bindControls();void this.startBackend();return;}
    void nextPaint().then(()=>{if(!this.hostDisposed)this.startDirectFallback('This browser uses graphics on the main thread.');});return;
   }else{this.ready=true;if(!this.cpu)this.gl={worker:true};this.queueSnapshot();}
   this.resolveStartup?.({available:!!message.available,worker:true,cpu:this.cpu,reason:message.reason});this.resolveStartup=null;this.emitHostStats(true);return;
  }
  if(message.type==='cpu-frame'){
   const worker=this.worker;this.commandSignature=message.signature;
   if(this.presentationPaused||document.hidden||message.signature!==renderSignature(this)){worker?.postMessage({type:'cpu-presented',serial:message.serial,costMs:0,cancelled:true});return;}
   this.commandPlayer?.present(message.frame,({costMs,cancelled,error})=>{if(this.worker!==worker)return;if(error){this.workerFailed('CPU presentation stopped: '+error.message+'. Retry graphics to continue.',{allowFallback:false});return;}if(!cancelled&&this.completedFrame(message.signature,message.sceneRevision??this.sceneRevision))this.presentAnnotations(message.annotationFrame,message.signature,message.sceneRevision??this.sceneRevision);worker?.postMessage({type:'cpu-presented',serial:message.serial,costMs,cancelled});this.emitHostStats();});return;
  }
  if(message.type==='bitmap-frame'){
   const worker=this.worker;let cancelled=true;
   try{if(!this.presentationPaused&&!document.hidden&&message.signature===this.currentSignature()&&message.sceneRevision===this.sceneRevision&&!this.preparedSceneLoad){
    this.framePresenter??=new DiagnosticFramePresenter(this.canvas);
    cancelled=!this.framePresenter.present(message.bitmap,message.serial,()=>{if(this.completedFrame(message.signature,message.sceneRevision))this.presentAnnotations(message.frame,message.signature,message.sceneRevision);});
   }else message.bitmap?.close?.();}
   catch(error){message.bitmap?.close?.();this.workerFailed('Diagnostic frame presentation failed: '+error.message,{allowFallback:false});}
   finally{worker?.postMessage({type:'bitmap-presented',serial:message.serial,cancelled});}
   return;
  }
  if(message.type==='direct-frame'){
   if(message.signature===this.currentSignature()&&message.sceneRevision===this.sceneRevision)this.framePresenter?.hide();return;
  }
  if(message.type==='annotation-frame'){
   if(this.completedFrame(message.signature,message.sceneRevision))this.presentAnnotations(message.frame,message.signature,message.sceneRevision);return;
  }
  if(message.type==='ack'){this.mailbox?.acknowledge(message.serial);if(this.snapshotDirty)this.queueSnapshot();return;}
  if(message.type==='status'){
   const stats=message.stats||{},signature=stats.renderedSignature;
   // A late GPU fence or CPU acknowledgement belongs to its original scene.
   // It may never dismiss the next scene's loader or advance its deadline.
   if(signature&&signature!==this.currentSignature())return;
   const changed=!this.frameSeen||this.workerStats.renderedSignature!==signature;
   const {frameReady,renderedSignature,...telemetry}=stats;this.workerStats={...this.workerStats,...telemetry};
   const completed=frameReady&&this.completedFrame(signature,stats.sceneRevision??this.sceneRevision);
   if(Number.isFinite(stats.adaptiveLevel))this.budget.level=stats.adaptiveLevel;
   this.emitHostStats(changed&&!!completed);return;
  }
  if(message.type==='render-error'){if(this.workerReady&&message.message&&(!message.signature||message.signature===this.currentSignature()))this.workerFailed(message.message,{allowFallback:false});return;}
  if(message.type==='progress'){this.pendingRequests.get(message.id)?.onProgress?.(message.progress);return;}
  if(message.type==='result'||message.type==='error'){
   if(this.ignoredRequestIds?.delete(message.id))return;
   const request=this.pendingRequests.get(message.id);if(request){clearTimeout(request.timeout);request.cleanup?.();this.pendingRequests.delete(message.id);if(message.type==='error')request.reject(Object.assign(new Error(message.message),{name:message.name||'Error'}));else request.resolve(message.value);}
   else if(message.type==='error'&&(!message.signature||message.signature===this.currentSignature()))this.workerFailed(message.message,{allowFallback:false});
  }
 }
 workerFailed(message,{allowFallback=true}={}){
  if(this.hostDisposed)return;
  this.noteInteraction();
  // A blocked Blob/CSP or unsupported worker context must not strand a browser
  // that can use ordinary WebGL. Attempt this only before its first worker ready.
  if(allowFallback&&this.resolveStartup&&!this.workerReady&&!this.directFallbackAttempted){this.directFallbackAttempted=true;clearTimeout(this.startupTimer);this.worker?.terminate();this.worker=null;this.mailbox?.close();void nextPaint().then(()=>{if(!this.hostDisposed)this.startDirectFallback('Worker graphics unavailable; using this browser’s main renderer.');});return;}
  this.sceneLoad?.fail(message);this.delegate?.setPresentationPaused(true);cancelAnimationFrame(this.raf);this.raf=0;
  clearTimeout(this.startupTimer);this.cancelCpuWork();this.worker?.terminate();this.worker=null;this.mailbox?.close();this.workerReady=false;this.gpuUnavailable=true;this.ready=false;
  for(const request of this.pendingRequests.values()){clearTimeout(request.timeout);request.cleanup?.();request.reject(new Error(message));}this.pendingRequests.clear();
  // Worker failure is not evidence of absent GPU hardware. Do not silently
  // activate CPU or claim WebGL unavailable; explicit retry uses a fresh canvas.
  this.resolveStartup?.({available:false,worker:true,cpu:this.cpu,workerFailed:true,reason:message});this.resolveStartup=null;this.onError(message);this.onStats(this.getState());
 }
 rpc(type,options={}){
  if(!this.workerReady||!this.worker)return Promise.reject(new Error('Wait for the renderer to finish loading.'));
  const id=++this.requestId;
  return new Promise((resolve,reject)=>{
   const request={resolve,reject,onProgress:options.onProgress};
   if(options.signal){const cancel=()=>{this.worker?.postMessage({type:'cancel-photo',id});request.cancelTimer=setTimeout(()=>{if(this.pendingRequests.has(id))this.workerFailed('The picture renderer did not stop. It was closed safely; retry graphics to continue.');},4000);};options.signal.addEventListener('abort',cancel,{once:true});request.cleanup=()=>{clearTimeout(request.cancelTimer);options.signal.removeEventListener('abort',cancel);};if(options.signal.aborted){request.cleanup();reject(Object.assign(new Error('Picture rendering cancelled.'),{name:'AbortError'}));return;}}
   request.timeout=setTimeout(()=>{this.pendingRequests.delete(id);request.cleanup?.();this.worker?.postMessage({type:'cancel-photo',id});this.ignoredRequestIds??=new Set();this.ignoredRequestIds.add(id);if(this.ignoredRequestIds.size>16)this.ignoredRequestIds.delete(this.ignoredRequestIds.values().next().value);if(type==='photo'&&options.baseline){resolve({...options.baseline,presetId:options.presetId,fallback:true,budgetLimited:true,elapsedMs:options.budgetMs,complete:true});this.workerFailed('Picture time budget reached while graphics were unresponsive. The current frame was saved; retry graphics to continue.',{allowFallback:false});}else reject(new Error('The renderer did not finish. You can retry without reloading the page.'));},type==='photo'?(options.budgetMs||120000)+300:Math.max(1,Math.min(10000,Number(options.timeoutMs)||8000))+100);
   this.pendingRequests.set(id,request);this.worker.postMessage({type,id,snapshot:snapshotRenderer(this),viewport:viewport(this.canvas),options:{presetId:options.presetId,baseline:options.baseline,budgetMs:options.budgetMs,timeoutMs:options.timeoutMs,allowPreview:options.allowPreview}});
  });
 }
 async captureImage({signal,timeoutMs=8000,onProgress=()=>{},allowPreview=true}={}){
  if(signal?.aborted)throw Object.assign(new Error('Picture cancelled.'),{name:'AbortError'});
  const options={signal,timeoutMs,onProgress,allowPreview};let timer,stop;
  const deadline=new Promise((_,reject)=>{stop=()=>{this.delegate?.cancelCapture?.(Object.assign(new Error('Picture cancelled.'),{name:'AbortError'}));reject(Object.assign(new Error('Picture cancelled.'),{name:'AbortError'}));};signal?.addEventListener('abort',stop,{once:true});timer=setTimeout(()=>{this.delegate?.cancelCapture?.('Image capture timed out.');reject(new Error('Image capture did not finish within its time budget. Retry graphics or choose a lower live quality.'));},Math.max(1,Math.min(10000,Number(timeoutMs)||8000))+200);});
  try{
   // The GPU performs a frozen timer-driven draw even while Picture studio
   // covers the viewport. Diagnostic/CPU frames already live on a 2D canvas.
   const capture=this.delegate?this.delegate.captureImage(options):this.framePresenter?.active?this.framePresenter.capture(this.canvas.parentElement?.querySelector('.scene-annotations'),options):this.commandPlayer?this.commandPlayer.capture():this.rpc('capture',options);
   return await Promise.race([capture,deadline]);
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);}
 }
 async renderPicture(options={}){
  const cancelled=()=>Object.assign(Error('Picture cancelled.'),{name:'AbortError'});
  if(options.signal?.aborted)throw cancelled();
  if(this.photoRunning)throw new Error('A picture is already rendering.');
  const requested=({standard:'high',fine:'maximum'})[options.presetId]||options.presetId||'quick';
  const preset=PHOTO_PRESETS.find(p=>p.id===requested);if(!preset)throw new Error('Choose a picture quality.');
  if(preset.id!=='quick'&&this.cpu)throw new Error('Choose Quick to save the CPU preview.');
  this.noteInteraction();this.sceneLoad?.check(true);this.photoRunning=true;cancelAnimationFrame(this.raf);this.raf=0;
  const started=this.now();let removeCaptureAbort=()=>{},captureHeartbeat=null,refineHeartbeat=null,capturePhase='Capturing current frame…',captureWarning='';
  try{
   const captureProgress=()=>options.onProgress?.({progress:0,indeterminate:true,phase:capturePhase,elapsedMs:this.now()-started,remainingMs:preset.id==='quick'?null:Math.max(0,preset.budgetMs-(this.now()-started))});
   captureProgress();captureHeartbeat=setInterval(captureProgress,250);
   const capture=this.captureImage({signal:options.signal,timeoutMs:8000,onProgress:p=>{capturePhase=p.phase||capturePhase;if(p.warning)captureWarning=p.warning;captureProgress();}});
   const abort=new Promise((_,reject)=>{const stop=()=>{reject(cancelled());this.delegate?.cancelCapture?.('Picture cancelled.');};options.signal?.addEventListener('abort',stop,{once:true});removeCaptureAbort=()=>options.signal?.removeEventListener('abort',stop);if(options.signal?.aborted)stop();});
   const blob=await Promise.race([capture,abort]);removeCaptureAbort();clearInterval(captureHeartbeat);captureHeartbeat=null;
   if(options.signal?.aborted)throw cancelled();
   if(!blob?.size)throw new Error('The current frame could not be captured.');
   const bytes=new DataView(await blob.slice(0,24).arrayBuffer()),png=bytes.byteLength===24&&bytes.getUint32(0)===0x89504e47&&bytes.getUint32(4)===0x0d0a1a0a;
   const state=this.getState(),width=png?bytes.getUint32(16):(state.width||this.canvas.width||1),height=png?bytes.getUint32(20):(state.height||this.canvas.height||1);
   if(options.signal?.aborted)throw cancelled();
   const baseline={blob,width,height,samples:1,steps:0,detail:0,complete:true,...(captureWarning?{warning:captureWarning}:{})};
   if(preset.id==='quick')return {...baseline,presetId:'quick',elapsedMs:this.now()-started,fallback:false,budgetLimited:false};
   const captureMs=this.now()-started,remaining=Math.max(0,preset.budgetMs-captureMs);
   if(remaining<100)return {...baseline,presetId:preset.id,elapsedMs:this.now()-started,fallback:true,budgetLimited:true,workBudgetMs:preset.budgetMs};
   let latestProgress={progress:.05,indeterminate:true,phase:'Preparing GPU renderer',elapsedMs:0,remainingMs:remaining};
   const refinementProgress=()=>{const elapsedMs=Math.max(this.now()-started,captureMs+(latestProgress.elapsedMs||0));options.onProgress?.({...latestProgress,elapsedMs,remainingMs:Math.max(0,preset.budgetMs-elapsedMs),workBudgetMs:preset.budgetMs});};
   refinementProgress();refineHeartbeat=setInterval(refinementProgress,250);
   const settings={...options,presetId:preset.id,baseline,budgetMs:remaining,onProgress:progress=>{latestProgress=progress;refinementProgress();}};
   const result=this.delegate?await createPhotoRender(this.delegate,settings):await this.rpc('photo',settings);
   if(options.signal?.aborted)throw cancelled();
   return {...result,elapsedMs:this.now()-started,workBudgetMs:preset.budgetMs};
  }finally{
   removeCaptureAbort();clearInterval(captureHeartbeat);clearInterval(refineHeartbeat);this.sceneLoad?.check(true);this.photoRunning=false;this.lastTime=0;
   if(!this.hostDisposed){this.queueSnapshot();if(!this.delegate&&!document.hidden&&!this.presentationPaused&&!this.raf)this.raf=requestAnimationFrame(this.frame);}
  }
 }

 setPresentationPaused(paused){
  this.noteInteraction();
  this.sceneLoad?.check(true);
  if(this.delegate){this.delegate.setPresentationPaused(paused);return;}
  const next=!!paused;if(this.presentationPaused===next)return;this.presentationPaused=next;this.lastTime=0;
  if(next){this.cancelCpuWork();cancelAnimationFrame(this.raf);this.raf=0;}else if(!this.hostDisposed&&!document.hidden&&!this.photoRunning&&!this.raf)this.raf=requestAnimationFrame(this.frame);
  this.queueSnapshot();
 }
 async getVRSupport(){
  if(this.delegate)return this.delegate.getVRSupport();if(this.cpu)return {supported:false,reason:'VR needs GPU graphics.'};
  if(globalThis.isSecureContext===false)return {supported:false,reason:'VR needs HTTPS or a localhost server.'};
  if(!navigator.xr||typeof XRWebGLLayer!=='function')return {supported:false,reason:'Use a WebXR-capable browser and headset.'};
  try{const supported=await navigator.xr.isSessionSupported('immersive-vr');return {supported,reason:supported?'Headset ready. VR uses the browser’s headset renderer.':'No compatible headset is available.'};}catch{return {supported:false,reason:'The browser could not check headset support.'};}
 }
 unbind(){this.listeners.forEach(remove=>remove());this.listeners=[];this.observer?.disconnect();this.observer=null;}
 replaceCanvas(){this.framePresenter?.dispose();this.framePresenter=null;this.commandPlayer?.dispose();this.commandPlayer=null;this.hostViewport=null;const fresh=this.canvas.cloneNode(false);this.canvas.replaceWith(fresh);this.canvas=fresh;this.transferred=false;this.callbacks.onCanvasChanged?.(fresh);return fresh;}
 switchToDirect(){
  const saved=snapshotRenderer(this);this.worker?.terminate();this.worker=null;this.mailbox?.close();cancelAnimationFrame(this.raf);this.raf=0;this.unbind();
  if(this.transferred)this.replaceCanvas();
  const Base=this.cpu?CpuRenderer:BlackHoleRenderer,host=this;
  const Direct=class extends Base{
   gpuAvailable(now){const fence=this.gpuFence,available=super.gpuAvailable(now);if(fence&&available&&!this.gpuFence)host.completedFrame(fence.renderedSignature,fence.sceneRevision);return available;}
   render(...args){if(host.preparedSceneLoad)return false;const signature=renderSignature(this),revision=this.sceneRevision;let drawn;try{drawn=super.render(...args);}catch(error){host.workerFailed('This scene could not render: '+(error?.message||error),{allowFallback:false});return false;}if(drawn){const annotationFrame=captureAnnotationFrame(this);if(this.gpuFence){this.gpuFence.renderedSignature=signature;this.gpuFence.sceneRevision=revision;this.gpuFence.annotationFrame=annotationFrame;}host.presentAnnotations(annotationFrame,signature,revision);if(!this.gpuFence)host.completedFrame(signature,revision);}return drawn;}
  };
  this.delegate=new Direct(this.canvas,{...this.callbacks,onStats:()=>this.emitHostStats(),onError:message=>{if(message&&this.delegate)this.workerFailed(message,{allowFallback:false});else this.onError(message);}});restoreRenderer(this.delegate,saved);this.delegate.setPresentationPaused(this.presentationPaused);this.workerMode=false;
  return this.delegate;
 }
 async enterVR(){
  this.noteInteraction();
  if(this.cpu)throw new Error('VR needs GPU graphics.');
  if(this.delegate?.xr?.active)return true;
  if(!navigator.xr)throw new Error('This browser does not support headset VR.');
  // Request immediately inside the click, BEFORE creating a Window GL context:
  // a slow driver compilation could otherwise exhaust transient activation.
  const request=navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor']});let session;
  try{session=await request;if(this.hostDisposed)throw new Error('The view closed before VR was ready.');const direct=this.delegate||this.switchToDirect();await direct.enterVR(session);session.addEventListener('end',()=>setTimeout(()=>this.returnToWorker(),0),{once:true});return true;}
  catch(error){try{await session?.end();}catch{}this.returnToWorker();throw error;}
 }
 async exitVR(){if(this.delegate)await this.delegate.exitVR();}
 returnToWorker(){
  if(this.hostDisposed||!this.delegate||this.delegate.xr?.active)return;
  const saved=snapshotRenderer(this.delegate),paused=this.delegate.presentationPaused;this.delegate.dispose();this.delegate=null;
  this.replaceCanvas();restoreRenderer(this,saved);this.presentationPaused=paused;this.workerStats={};this.frameSeen=false;this.workerReady=false;this.gpuUnavailable=false;this.initGL();this.bindControls();
  this.startBackend();if(!paused&&!document.hidden&&!this.raf)this.raf=requestAnimationFrame(this.frame);
 }
 restartRendering(){this.noteInteraction();for(const request of this.pendingRequests.values()){clearTimeout(request.timeout);request.cleanup?.();request.reject(Object.assign(new Error('Rendering restarted.'),{name:'AbortError'}));}this.pendingRequests.clear();this.lastSnapshotKey=null;this.awaitingBackendChoice=false;if(this.delegate){const saved=snapshotRenderer(this.delegate);this.delegate.dispose();this.delegate=null;restoreRenderer(this,saved);this.presentationPaused=false;}if(this.sceneLoad.state==='failed'){this.sceneRevision=this.sceneLoad.begin();}this.cancelCpuWork();this.cpuProducer?.dispose();this.cpuProducer=null;this.cpuTasks?.dispose();this.worker?.terminate();this.worker=null;this.mailbox?.close();this.unbind();this.replaceCanvas();this.workerStats={};this.frameSeen=false;this.workerReady=false;this.gpuUnavailable=false;this.initGL();this.bindControls();this.startBackend();if(!document.hidden&&!this.presentationPaused&&!this.raf)this.raf=requestAnimationFrame(this.frame);}
 dispose(){
  if(this.hostDisposed)return;this.noteInteraction();this.hostDisposed=true;this.disposed=true;clearInterval(this.loadMonitor);clearTimeout(this.startupTimer);cancelAnimationFrame(this.raf);this.unbind();this.worker?.terminate();this.worker=null;this.mailbox?.close();this.delegate?.dispose();this.framePresenter?.dispose();this.commandPlayer?.dispose();this.cpuProducer?.dispose();this.cpuTasks?.cancel(this.cpuTask);this.cpuTasks?.dispose();
  for(const request of this.pendingRequests.values()){clearTimeout(request.timeout);request.cleanup?.();request.reject(new Error('The renderer was closed.'));}this.pendingRequests.clear();this.ready=false;
 }
}
export function createRenderHost(canvas,callbacks={},options={}){return new RenderHost(canvas,callbacks,options);}

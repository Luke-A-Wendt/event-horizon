/* Local-only WebXR stereo camera. Matrices come from the headset; no symmetric
 * frustum assumption or remote rendering. Head translations remain SI meters. */
import { REFERENCE_RG_METERS } from './objects.js';
import { bridgeConformal } from './bridge-math.js';

export function inverse4(matrix){
 const a=Array.from({length:4},(_,r)=>Array.from({length:8},(_,c)=>c<4?matrix[c*4+r]:Number(c-4===r)));
 for(let c=0;c<4;c++){
  let pivot=c;for(let r=c+1;r<4;r++)if(Math.abs(a[r][c])>Math.abs(a[pivot][c]))pivot=r;
  if(Math.abs(a[pivot][c])<1e-15)throw new Error('The headset supplied a singular camera matrix.');
  [a[c],a[pivot]]=[a[pivot],a[c]];const scale=a[c][c];for(let k=0;k<8;k++)a[c][k]/=scale;
  for(let r=0;r<4;r++)if(r!==c){const factor=a[r][c];for(let k=0;k<8;k++)a[r][k]-=factor*a[c][k];}
 }
 return Array.from({length:16},(_,i)=>a[i%4][4+Math.floor(i/4)]);
}
export function multiply4(a,b){return Array.from({length:16},(_,i)=>{const row=i%4,col=Math.floor(i/4);let value=0;for(let k=0;k<4;k++)value+=a[k*4+row]*b[col*4+k];return value;});}
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
const worldVector=(base,v)=>base.right.map((x,i)=>x*v[0]+base.up[i]*v[1]-base.forward[i]*v[2]);
export function composeEyeFrame(base,relative,metersToWorld,focused=null){
 const translation=worldVector(base,[relative[12],relative[13],relative[14]]).map(x=>x*metersToWorld);
 const right=unit(worldVector(base,[relative[0],relative[1],relative[2]])),up=unit(worldVector(base,[relative[4],relative[5],relative[6]])),forward=unit(worldVector(base,[-relative[8],-relative[9],-relative[10]]));
 const frame={...base,observer:base.observer.map((x,i)=>x+translation[i]),forward,right,up};
 if(focused){
  // Never subtract two huge world positions to recover centimeter eye offsets.
  // Transform the small displacement before adding it in the craft-local chart.
  frame.inspectCamera=base.inspectCamera.map((x,i)=>x+dot(focused.frame[i],translation)/focused.radius);
  frame.inspectRight=focused.frame.map(axis=>dot(axis,right));frame.inspectUp=focused.frame.map(axis=>dot(axis,up));frame.inspectForward=focused.frame.map(axis=>dot(axis,forward));
 }
 return frame;
}

export class XRViewController {
 constructor(renderer){this.renderer=renderer;this.active=false;this.starting=false;this.lastError='';this.entryGeneration=0;this.session=null;this.reference=null;this.layer=null;this.originInverse=null;this.lastLayerKey='';this.lastLayerAt=0;this.handleFrame=this.handleFrame.bind(this);this.onEnd=this.onEnd.bind(this);}
 async support(){
  if(!this.renderer.gl)return {supported:false,reason:'VR needs the GPU renderer.'};
  if(globalThis.isSecureContext===false)return {supported:false,reason:'Open the HTTPS website or a localhost server to use VR.'};
  if(!globalThis.navigator?.xr||typeof globalThis.XRWebGLLayer!=='function')return {supported:false,reason:'This browser does not provide WebXR. Use a compatible headset browser.'};
  try{const supported=await navigator.xr.isSessionSupported('immersive-vr');return {supported,reason:supported?'Headset ready. Enter VR from this view.':'No compatible immersive VR headset is available.'};}
  catch{return {supported:false,reason:'The browser could not check VR availability. Check headset permissions.'};}
 }
 async enter(authorizedSession=null){
  const r=this.renderer;
  if(this.active)return true;if(this.starting)throw new Error('VR is already starting.');
  if(!r.gl||r.contextLost||r.disposed||r.photoActive)throw new Error('VR needs an available GPU outside still rendering.');
  if(globalThis.isSecureContext===false||!globalThis.navigator?.xr||typeof globalThis.XRWebGLLayer!=='function')throw new Error('VR needs a compatible headset browser on HTTPS or localhost.');
  this.starting=true;this.lastError='';const generation=++this.entryGeneration;let session=null;
  const checkSession=()=>{if(this.entryGeneration!==generation||this.session!==session||r.disposed)throw new Error('The VR session closed before setup finished.');};
  try{
   // Request from the button's user activation, without awaiting a support query.
   session=authorizedSession||await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor']});
   if(this.entryGeneration!==generation||r.disposed)throw new Error('The VR request was cancelled.');
   this.session=session;session.addEventListener('end',this.onEnd);
   if(typeof r.gl.makeXRCompatible==='function')await r.gl.makeXRCompatible();
   checkSession();if(r.contextLost||r.disposed)throw new Error('The graphics adapter changed. Wait for the view to recover and enter VR again.');
   this.reference=await session.requestReferenceSpace('local');checkSession();
   this.layer=new XRWebGLLayer(this.session,r.gl,{alpha:false,antialias:false,depth:false,stencil:false,ignoreDepthValues:true,framebufferScaleFactor:.6});
   this.nominalWidth=this.layer.framebufferWidth/.6;this.nominalHeight=this.layer.framebufferHeight/.6;
   this.session.updateRenderState({baseLayer:this.layer,depthNear:.02,depthFar:10000});
   this.active=true;this.originInverse=null;this.lastLayerKey='';this.lastLayerAt=0;
   cancelAnimationFrame(r.raf);r.raf=0;r.cancelCapture('VR started. Exit VR to save a still.');r.lastTime=0;r.statsStart=0;r.frames=0;r.budget.resetTiming(r.now());if(r.gpuFence)r.gpuFence.ignoreLatency=true;
   this.session.requestAnimationFrame(this.handleFrame);return true;
  }catch(error){this.lastError=error?.message||'VR could not start.';if(this.session===session)this.onEnd();try{await session?.end();}catch{}throw error;}
  finally{this.starting=false;}
 }
 recenter(){this.originInverse=null;}
 updateLayer(now){
  const r=this.renderer,p=r.profile(),key=`${r.quality}:${r.budget.effectiveQuality}`;
  if(key===this.lastLayerKey||r.gpuFence||now-this.lastLayerAt<1000&&this.lastLayerKey)return;
  const factor=Math.min(1.25,p.scale,Math.sqrt(p.pixels/Math.max(1,this.nominalWidth*this.nominalHeight)),(r.maxSize||4096)/this.nominalWidth,(r.maxSize||4096)/this.nominalHeight);
  const layer=new XRWebGLLayer(this.session,r.gl,{alpha:false,antialias:false,depth:false,stencil:false,ignoreDepthValues:true,framebufferScaleFactor:Math.max(.1,factor)});
  if('fixedFoveation' in layer)layer.fixedFoveation=r.quality==='ultra'?0:.5;
  this.layer=layer;this.session.updateRenderState({baseLayer:layer});this.lastLayerKey=key;this.lastLayerAt=now;r.budget.resetTiming(now,'Measuring stereo rendering');
 }
 handleFrame(now,xrFrame){
  try{this.renderFrame(now,xrFrame);}catch(error){this.lastError='VR stopped: '+(error?.message||'The headset could not render this view.');void this.exit().catch(()=>{});}
 }
 renderFrame(now,xrFrame){
  if(!this.active||!this.session)return;this.session.requestAnimationFrame(this.handleFrame);
  const r=this.renderer,g=r.gl;
  if(r.disposed||r.contextLost){void this.exit();return;}
  if(this.session.visibilityState==='hidden'||r.presentationPaused){r.lastTime=0;return;}
  r.advanceSimulation(now);r.pollProgram();r.requestProgram();
  if(!r.ready||!r.programSupports(r.shaderFeatures())||!r.gpuAvailable(now)){r.emitStats(now);return;}
  if(!r.canFence&&r.nextSubmit&&now+.25<r.nextSubmit){r.emitStats(now);return;}
  const pose=xrFrame.getViewerPose(this.reference);if(!pose){r.lastTime=0;return;}
  if(!this.originInverse)this.originInverse=inverse4(pose.transform.matrix);
  this.updateLayer(now);
  // A newly requested layer applies on the next XR frame, not the current one.
  const layer=this.session.renderState.baseLayer;if(!layer)return;
  const p=r.profile();r.steps=Math.min(p.steps,r.activeProgram?.features.ultra?768:288);r.detail=p.detail;
  r.fillHoles();r.protectObserver();r.fillObjects();r.updateCameraFrame();
  const base=r.cameraFrame,focused=r.getFocusFrame();
  const conformal=r.state.bridge?bridgeConformal(Math.hypot(...base.observer),r.configCache.bridgeRadius):1,metersToWorld=1/(REFERENCE_RG_METERS*conformal);
  g.bindFramebuffer(g.FRAMEBUFFER,layer.framebuffer);
  const started=r.now();let drawn=0;
  for(const view of pose.views){
   const viewport=layer.getViewport(view);if(!viewport||viewport.width<1||viewport.height<1)continue;
   const eye=composeEyeFrame(base,multiply4(this.originInverse,view.transform.matrix),metersToWorld,focused);
   g.viewport(viewport.x,viewport.y,viewport.width,viewport.height);
   r.drawScene(eye,{width:viewport.width,height:viewport.height,viewport:[viewport.x,viewport.y,viewport.width,viewport.height],projectionMode:1,inverseProjection:inverse4(view.projectionMatrix)});drawn++;
  }
  if(drawn){
   const warmup=r.warmupFrames>0;if(warmup)r.warmupFrames--;
   if(r.canFence){const sync=g.fenceSync(g.SYNC_GPU_COMMANDS_COMPLETE,0);if(sync){r.gpuFence={sync,started:now,generation:r.budget.generation,warmup,polls:0};g.flush();}else r.canFence=false;}
   if(!r.canFence){r.frames++;r.budget.noteCompletion(now,{eligible:!warmup});const interval=1000/30;r.nextSubmit=r.nextSubmit&&now-r.nextSubmit<interval*2?r.nextSubmit+interval:now+interval;}
   r.lastSubmit=now;r.budget.noteSubmit(now,r.now()-started);
  }
  r.emitStats(now);
 }
 async exit(){const session=this.session;if(this.starting)this.entryGeneration++;if(!session)return;try{await session.end();}finally{if(this.session===session)this.onEnd();}}
 onEnd(){
  const r=this.renderer,session=this.session;this.entryGeneration++;this.active=false;this.session=null;this.reference=null;this.layer=null;this.originInverse=null;session?.removeEventListener('end',this.onEnd);
  r.lastTime=0;r.lastSubmit=0;r.nextSubmit=0;r.statsStart=0;r.frames=0;r.budget.resetTiming(r.now());
  if(r.gl&&!r.contextLost){try{r.gl.bindFramebuffer(r.gl.FRAMEBUFFER,null);r.releaseFence();r.resize();}catch{r.resizePending=true;}}
  if(!r.disposed&&!document.hidden&&!r.presentationPaused&&!r.photoActive&&!r.raf)r.raf=requestAnimationFrame(r.frame);
  r.onStats({...r.getState(),fps:0,steps:r.steps,width:r.canvas.width,height:r.canvas.height});
 }
 dispose(){this.entryGeneration++;this.active=false;const session=this.session;this.session=null;session?.removeEventListener('end',this.onEnd);if(session)void session.end().catch(()=>{});}
}

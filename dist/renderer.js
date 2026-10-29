/* All geometry is in fixed GM_ref/c² units, M_ref=4.3 million solar masses.
 * Holding observer position fixed while changing M therefore changes apparent
 * scale. Curved rays, plasma, binary lens fields, and debris are approximations. */
import { DEFAULTS, SCENE_PRESETS, REFERENCE_MASS, horizonRg, iscoRg, makePreset, holeDisplayName } from './config.js';
import { VERTEX, createFragment } from './shaders.js';
import { weakGridFlowWindow } from './grid-glsl.js';
import {dysonHabitableRadius,dysonIllumination} from './dyson.js';
import { OBJECT_KIND, OBJECT_CLASS, OBJECT_TYPES, OBJECT_DIMENSIONS, REFERENCE_RG_METERS, objectRadiusMeters, isCompactType, compactSatellite } from './objects.js';
import { effectiveWarpRadius, warpDisplayStrength, anomalyCruise } from './warp-physics.js';
import { illustrativeCancellationPair } from './compact-merger.js';
import {warpSideFraming,apparentCaptureAngle} from './camera-framing.js';
import { tidalShape } from './tidal-shape.js';
import { RenderBudget, QUALITY_PROFILES } from './performance-controller.js';
import { XRViewController } from './xr-view.js';
import { PlanetTextureCache } from './planet-textures.js';
import { bridgePath, bridgeJourney, bridgeConformal, bridgeProperRadius, BRIDGE_VEHICLE_CAMERA } from './bridge-math.js';
import { stellarInfo, stellarPatch, STELLAR_STYLE_IDS, LIGHT_SPEED } from './stellar-physics.js';
import { integrateFrenet, integratePlanar, setPlanarHeading, orthonormalFrame, speedForWarp, warpForSpeed, flightControlRates, shuttleThrustSetting, warpStarRate, shuttleRelativity, resetFlightClocks, FLIGHT_STANDARD_GRAVITY, SHUTTLE_THRUST_MAX_G, ENTERPRISE_THRUST_MAX_G, impulseThrustSetting } from './flight-dynamics.js';
import {travelTargets,previewRoute,beginRoute,cancelRoute,routeState,advanceRoute} from './travel-routes.js';
import {supportsObjectClock,createObjectClock,clockRate,advanceObjectClock,objectClockReading,compactExteriorRadius} from './object-clocks.js';

export const MAX_SCENE_OBJECTS=1024;
export const MAX_RENDER_OBJECTS=12;
// Cache only validated, authored object templates. Live positions, textures,
// cameras and GPU programs never enter this small, process-local cache.
const PRESET_OBJECT_TEMPLATES=new WeakMap();
const OBJECT_PROPERTY_RANGES=[['anomalyStrength',0,3],['anomalyScale',.3,3],['anomalyMotion',0,2],['dysonCutaway',0,.8],['tidalDeformation',0,1],['angularVelocity',-1e5,1e5],['collapsePeriod',4,300],['collapseRadiusMin',.01,1e15],['collapseRadiusMax',.01,1e15],['surfaceId',0,100],['axialTilt',-360,360],['surfaceRotationPhase',-1e6,1e6],['rotationPeriodSeconds',-1e12,1e12],['orbitInclination',-180,180],['orbitNode',-360,360],['argumentPeriapsis',-360,360],['orbitalPeriodSeconds',-1e20,1e20],['opacity',0,1],['eccentricity',0,.99],['heightMeters',-1e17,1e17],['radiusMeters',.01,1e15],['massSolar',0,1e12],['radiusProxyMeters',0,1e15],['orbitMeters',1,1e17],['spots',0,1],['corona',0,2],['rotation',0,10],['innerRadiusRatio',.05,.9999],['thicknessRatio',.00001,.2]];
const UNIFORM_NAMES=['uAnomalyCount','uAnomalies[0]','uAnomalyParams[0]','uResolution','uTime','uStellarTime','uExposure','uDistance','uYaw','uPitch','uLookYaw','uLookPitch','uMass','uBounds','uStars','uPrimaryAxis','uSecondaryAxis','uSpin','uHorizon','uIsco','uDiskOuter','uHoles[0]','uFlags','uFlags2','uDiskParams','uDiskColor','uNebulaParams','uNebulaColor','uJets','uJetColor','uSpectrum','uBinary','uSteps','uObjectCount','uGravityCount','uObjects[0]','uColors[0]','uTidal','uStarColor','uObserver','uForward','uRight','uUp','uInspectIndex','uHideObjectIndex','uInspectCamera','uInspectForward','uInspectRight','uInspectUp','uHeadings[0]','uWarpCenter','uWarpAxis','uWarpRadius','uWarpStrength','uWarpThickness','uWarpFlags','uWarpObserver','uWarpObjectIndex','uWarpGridOffset','uWarpGridRotation','uWarpMotion','uDetail','uRayViewport','uInverseProjection','uProjectionMode','uBridge','uBridgeGridAxis','uBridgeStage','uBridgeBubble','uBridgeBubbleAxis','uWhiteHole','uBridgeSkyColor','uBridgeSkyParams','uBridgeOtherNebula','uLuminosities[0]','uCockpitMode','uBodyParams[0]','uBodyMasses[0]','uBodyOpacity[0]','uTransparentBodies','uBridgeStars','uSkyParams','uDriveIndex','uDriveRight','uDriveUp','uDriveForward','uDiskSecondaryParams','uDiskSecondaryColor','uJetSecondaryParams','uJetSecondaryColor','uBodyShape[0]','uGridAnchor','uGridHigh','uGridFlowWindow','uWorldOrigin','uPlanetAtlas','uPlanetFocus','uPlanetAtlasReady','uPlanetFocusId','uMetricOptions','uSceneOptions','uJetStructure','uFlightMetrics'];
const LIMITS={mergerDuration:[5,300],waveAmplitude:[0,2],waveFrequency:[.1,5],secondaryDiskOuter:[6.1,60],secondaryDiskThickness:[.15,6],secondaryDiskDensity:[0,4],secondaryJetSpread:[.15,5],secondaryJetLength:[.2,3],secondaryJetIntensity:[0,4],starBrightness:[0,5],starVariety:[0,2],bridgeOtherStarDensity:[0,3],bridgeOtherStarBrightness:[0,5],bridgeOtherStarVariety:[0,2],mass:[.000001,100000],spin:[0,.998],secondarySpin:[0,.998],speed:[0,10],exposure:[.1,5],starDensity:[0,3],diskOuter:[6.1,60],diskThickness:[.15,6],diskDensity:[0,4],nebulaScale:[.2,4],nebulaIntensity:[0,4],nebulaRotation:[-360,360],planetMass:[.01,10000],planetRadius:[.1,15],planetDistance:[4,100],starRadius:[.1,5],disruptionStrength:[.1,3],starDistance:[5,40],binaryRatio:[.1,4],binarySeparation:[12,100],primaryTilt:[0,180],primaryAzimuth:[-360,360],secondaryTilt:[0,180],secondaryAzimuth:[-360,360],jetSpread:[.15,5],jetLength:[.2,3],jetIntensity:[0,4],warpFactor:[0,10],warpRadius:[1.3,8],warpThickness:[1,20],bridgeRadius:[.61,30],bridgeOtherScale:[.2,4],bridgeOtherIntensity:[0,4],bridgeOtherRotation:[-360,360]};
const ENUMS={mergerOutcome:['coalescence','illustrative-cancellation'],binaryMotion:['orbit','merger'],bridgeMode:['single','crossed'],bridgeGridOrientation:['perpendicular','parallel'],bridgeLifecycle:['steady','open-transit-close'],bridgeWorlds:['caladan','earth-proxima'],diskPalette:['physical','artistic','rainbow'],secondaryDiskPalette:['physical','artistic','rainbow'],jetStructure:['steady','knots','helix'],secondaryJetStructure:['steady','knots','helix'],secondaryDiskStyle:['thermal','hydrogen','helium','dust','nebula','radiant','ribbons'],bridgeTravelerType:['enterprise','shuttle','astronaut','heighliner','blackhole','whitehole'],bridgeOtherShape:['cloud','shell','filaments','spiral'],objectScaleMode:['physical'],warpScenario:['isolated','orbit','excursion'],spectrum:['visible','infrared','xray','radio','gamma','geometry'],viewMode:['orbit','look','free'],diskStyle:['thermal','hydrogen','helium','dust','nebula','radiant','ribbons'],nebulaShape:['cloud','shell','filaments','spiral']};
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
function directionBlend(a,b,t){const d=clamp(dot(a,b),-1,1);if(d>.999)return unit(a.map((v,i)=>v*(1-t)+b[i]*t));let tangent=b.map((v,i)=>v-a[i]*d);if(Math.hypot(...tangent)<1e-6)tangent=cross(a,Math.abs(a[1])<.9?[0,1,0]:[1,0,0]);tangent=unit(tangent);const angle=Math.acos(d)*t;return add(mul(a,Math.cos(angle)),mul(tangent,Math.sin(angle)));}
const TAU=2*Math.PI;
const objectScale=obj=>Number.isFinite(obj.scale)?obj.scale:1;
const wrap=a=>((a%TAU)+TAU)%TAU;
function finiteVector(vector,length=vector?.length){if(!vector||vector.length!==length)return false;for(let i=0;i<length;i++)if(!Number.isFinite(vector[i]))return false;return true;}
function validBasis(right,up,forward){if(!finiteVector(right,3)||!finiteVector(up,3)||!finiteVector(forward,3))return false;return Math.abs(dot(right,right)-1)<.002&&Math.abs(dot(up,up)-1)<.002&&Math.abs(dot(forward,forward)-1)<.002&&Math.abs(dot(right,up))<.002&&Math.abs(dot(right,forward))<.002&&Math.abs(dot(up,forward))<.002;}
export function metricOctDirection(vector){const norm=Math.abs(vector[0])+Math.abs(vector[1])+Math.abs(vector[2]);if(norm<1e-30)return [2,2];let x=vector[0]/norm,y=vector[1]/norm,z=vector[2]/norm;if(z<0){const old=x;x=(1-Math.abs(y))*(old>=0?1:-1);y=(1-Math.abs(old))*(y>=0?1:-1);}return [x,y];}
export function packMetricDirection(vector){const [x,y]=metricOctDirection(vector);return x>1?0:1+Math.round((x*.5+.5)*1023)+1024*Math.round((y*.5+.5)*1023);}
function rocheFraction(q){const x=Math.cbrt(q);return .49*x*x/(.6*x*x+Math.log1p(x));}
// A conservative exterior limb-deflection bound in radians: 4GM/(Rc²).
// Subpixel weak fields keep their true masses and analytic surface intersections,
// but need neither per-step force evaluations nor tiny curvature-limited steps.
export function bodyLensingSignificant(body,pixelAngle){
 if(!['star','planet','moon','blackhole','whitehole'].includes(body.type))return false;
 const axes=body.shapeAxes||[1,1,1],surfaceRadius=body.radius*Math.min(...axes)/Math.max(...axes);
 const deflection=4*Math.max(0,body.massSolar||0)/(4300000*Math.max(surfaceRadius,1e-30));
 return deflection>=Math.max(1e-12,pixelAngle)*.05;
}

export class BlackHoleRenderer {
 constructor(canvas,{onStats=()=>{},onError=()=>{},bindControls=true,autoStart=true,deferProgram=false}={}){
  this.canvas=canvas;this.onStats=onStats;this.onError=onError;this.deferProgram=deferProgram;
  this.state={...DEFAULTS,objectScaleMode:'physical'};this.camera={yaw:.25,pitch:.19,distance:32,lookYaw:0,lookPitch:0,focusDistance:6};this.target={...this.camera};
  this.cameraGuide=null;this.sceneId='disk';this.sceneFocusId=null;this.bridgeObjectId=null;this.bridgeTime=0;this.bridgeTravelTime=0;this.freePosition=null;this.freeTarget=null;this.freeBasis=null;this.photoActive=false;this.xr=null;this.nextObjectId=1;this.selectedId=null;this.focusId=null;this.focusMode=null;this.warpObjectId=null;this.savedOverview=null;this.warpTravelWorld=0;this.warpTravelPosition=[0,0,0];this.warpTravelTime=0;this.objectFrames=[];this.cameraFrame=null;
  this.quality='adaptive';this.budget=new RenderBudget();this.adaptiveScale=this.budget.profile.scale;this.steps=this.budget.profile.steps;this.objects=[];this.time=0;this.orbitOverrides={};this.flightInput={speed:0,curvature:0,torsion:0};
  this.lastTime=0;this.statsStart=0;this.frames=0;this.fps=0;this.lastSubmit=0;this.nextSubmit=0;this.gpuFence=null;this.resizePending=false;this.resizeMeasurePending=false;this.presentationPaused=false;this.captureRequest=null;this.warmupFrames=0;this.frame=this.frame.bind(this);
  this.listeners=[];this.pointers=new Map();this.disposed=false;this.travel=false;this.navigationUntil=0;this.pinchOwned=false;
  this.bodySurfaceData=new Float32Array(48);this.bodyShapeData=new Float32Array(48);this.bodyShapeData.fill(1);this.bodyMassData=new Float32Array(12);this.bodyOpacityData=new Float32Array(12);this.bodyOpacityData.fill(1);this.transparentBodyCount=0;this.bodyParamData=new Float32Array(48);this.luminosityData=new Float32Array(12);this.luminosityData.fill(1);this.headingData=new Float32Array(24);this.objectData=new Float32Array(48);this.colorData=new Float32Array(48);this.holeData=new Float32Array(8);this.tidalData=new Float32Array(4);
  this.configCache={};this.refreshConfiguration();this.initGL();if(bindControls)this.bindControls();this.resize();
  this.raf=autoStart?requestAnimationFrame(this.frame):0;
 }
 initGL(){
  this.planetTextures?.dispose();this.planetTextures=null;this.textureError='';
  this.ready=false;this.contextLost=false;this.gl=null;this.program=null;this.activeProgram=null;this.pendingProgram=null;this.programs=new Map();this.failedPrograms=new Set();this.gpuFence=null;this.budget.setContext(true,this.now());
  const options={alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'high-performance',preserveDrawingBuffer:false};
  let gl=this.canvas.getContext('webgl2',options);this.webgl2=!!gl;if(!gl)gl=this.canvas.getContext('webgl',options);
  if(!gl){this.onError('WebGL is unavailable. Enable hardware acceleration or try a current browser.');return;}
  this.gl=gl;this.supportsDerivatives=this.webgl2||!!gl.getExtension('OES_standard_derivatives');const uniformVectors=Number(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS))||128;this.uniformVectorLimit=uniformVectors;this.gpuObjectLimit=uniformVectors<160?6:uniformVectors<192?8:12;this.budget.setContext(this.webgl2,this.now());
  const extension=gl.getExtension('KHR_parallel_shader_compile');this.parallelCompile=extension&&typeof extension.COMPLETION_STATUS_KHR==='number'?extension:null;
  this.nativeFence=this.webgl2&&typeof gl.fenceSync==='function'&&typeof gl.clientWaitSync==='function'&&typeof gl.SYNC_GPU_COMMANDS_COMPLETE==='number'&&typeof gl.TIMEOUT_EXPIRED==='number';
  const timer=!this.nativeFence?gl.getExtension('EXT_disjoint_timer_query'):null;
  // WebGL1 timer-query availability is also an asynchronous completion signal.
  // No result or synchronizing readback is requested until the draw has retired.
  this.completionQuery=timer&&typeof timer.createQueryEXT==='function'&&typeof timer.getQueryObjectEXT==='function'?timer:null;
  this.canFence=!!(this.nativeFence||this.completionQuery);
  this.maxSize=Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),gl.getParameter(gl.MAX_TEXTURE_SIZE),8192);
  this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  // A cold start never compiles the craft, warp or Ultra branches unnecessarily.
  if(!this.deferProgram)this.requestProgram(this.shaderFeatures());
 }
 shaderObjectSlots(){const count=this.objects.reduce((n,o)=>n+(o.type==='anomaly'?0:1),0)+(this.state.planet?1:0)+(this.state.tidalStar?1:0);return Math.min(this.gpuObjectLimit||MAX_RENDER_OBJECTS,count<=2?2:count<=4?4:count<=6?6:count<=8?8:12);}
 shaderFeatures(){
  const warp=!!this.state.warp&&!!this.warpObjectId&&!this.state.bridge;let craftMask=warp?8:0;
  for(const object of this.objects){const kind=OBJECT_KIND[object.type];if(kind>=3&&kind<=6)craftMask|=1<<(kind-3);else if(kind===12)craftMask|=16;}
  return {anomaly:this.objects.some(o=>o.type==='anomaly'),dyson:this.objects.some(o=>o.type==='dyson'),derivatives:!!this.supportsDerivatives,derivativeExtension:!!this.supportsDerivatives&&!this.webgl2,diagnostics:!!this.state.metrics||this.state.spectrum==='geometry'||!!this.state.interiorView,attachments:this.objects.some(o=>['disk','jets'].includes(o.type)),objectSlots:this.shaderObjectSlots(),planetary:this.objects.some(o=>['planet','moon'].includes(o.type)&&o.surfaceId>0),bodyGravity:!!this.state.planet||!!this.state.tidalStar||this.objects.some(o=>['star','planet','moon','blackhole','whitehole'].includes(o.type)),stellar:!!this.state.tidalStar||this.objects.some(o=>['star','blackhole','whitehole'].includes(o.type)),rings:this.objects.some(o=>['ring','belt','disk','jets'].includes(o.type)),ultra:this.quality==='ultra',craft:craftMask!==0,craftMask,warp,grid:!!this.state.grid,bridge:!!this.state.bridge,probe:this.objects.some(object=>object.type==='probe')};
 }
 programKey(features){return `${features.anomaly?1:0}${features.dyson?1:0}${features.derivatives?1:0}${features.derivativeExtension?1:0}${features.diagnostics?1:0}${features.attachments?1:0}${features.ultra?1:0}${features.warp?1:0}${features.grid?1:0}${features.bridge?1:0}${features.probe?1:0}${features.stellar?1:0}${features.rings?1:0}${features.bodyGravity?1:0}${features.planetary?1:0}:${features.craftMask??(features.craft?15:0)}:${features.objectSlots||MAX_RENDER_OBJECTS}`;}
 programSupports(features,active=this.activeProgram){const mask=features.craftMask??(features.craft?15:0);return !!active&&(!features.anomaly||active.features.anomaly)&&(!features.dyson||active.features.dyson)&&(active.features.objectSlots||MAX_RENDER_OBJECTS)===(features.objectSlots||MAX_RENDER_OBJECTS)&&((active.features.craftMask??(active.features.craft?15:0))&mask)===mask&&(!features.warp||active.features.warp)&&(!features.grid||active.features.grid)&&(!!features.bridge===!!active.features.bridge)&&(!features.diagnostics||active.features.diagnostics)&&(!features.attachments||active.features.attachments)&&(!features.probe||active.features.probe)&&(!features.stellar||active.features.stellar)&&(!features.rings||active.features.rings)&&(!features.bodyGravity||active.features.bodyGravity)&&(!features.planetary||active.features.planetary); }
 requestProgram(features=this.shaderFeatures()){
  if(!this.gl||this.contextLost||this.disposed)return;
  const key=this.programKey(features),cached=this.programs.get(key);
  // Switching scenes must not wait for an abandoned asynchronous compile.
  if(this.pendingProgram&&this.pendingProgram.key!==key){const old=this.pendingProgram;this.pendingProgram=null;old.shaders.forEach(shader=>this.gl.deleteShader(shader));this.gl.deleteProgram(old.program);}
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
   pending.shaders.forEach(shader=>gl.deleteShader(shader));gl.deleteProgram(pending.program);
   // An abandoned scene may finish compiling after another scene was selected.
   // Its failure must not abort the new scene or its loading lifecycle.
   if(pending.key===this.programKey(this.shaderFeatures())){this.failedPrograms.add(pending.key);this.cancelCapture('The selected graphics could not compile.');this.onError('This graphics mode could not start. '+message);}return;
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
 releaseFence(){if(this.gpuFence&&this.gl&&!this.contextLost){if(this.gpuFence.query)this.completionQuery?.deleteQueryEXT(this.gpuFence.query);else this.gl.deleteSync(this.gpuFence.sync);}this.gpuFence=null;}
 gpuAvailable(now){
  if(!this.gpuFence)return true;
  const gl=this.gl,fence=this.gpuFence,status=fence.query?null:gl.clientWaitSync(fence.sync,0,0),elapsed=Math.max(0,now-fence.started);
  const complete=fence.query?!!this.completionQuery.getQueryObjectEXT(fence.query,this.completionQuery.QUERY_RESULT_AVAILABLE_EXT):status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED;
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
  request.finish(message instanceof Error?message:new Error(message));
 }
 captureImage({signal,timeoutMs=8000,onProgress=()=>{},allowPreview=false}={}){
  if(signal?.aborted)return Promise.reject(Object.assign(new Error('Picture cancelled.'),{name:'AbortError'}));
  if(this.disposed||this.contextLost||document.hidden||this.photoActive||this.xr?.active)return Promise.reject(new Error('The page must be visible and the GPU available to save an image.'));
  if(!this.gl||(!this.ready&&!this.pendingProgram))return Promise.reject(new Error('Start the GPU renderer before saving an image.'));
  if(this.failedPrograms.has(this.programKey(this.shaderFeatures())))return Promise.reject(new Error('The selected graphics could not compile. Choose another quality or retry the renderer.'));
  if(typeof this.canvas.toBlob!=='function'&&typeof this.canvas.convertToBlob!=='function')return Promise.reject(new Error('This browser cannot save a canvas image.'));
  if(this.captureRequest)return this.captureRequest.promise;
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const started=this.now(),limit=Math.max(1,Math.min(10000,Number(timeoutMs)||8000)),request={promise,quality:this.quality,allowPreview,timeout:null,pump:null,encoding:false};this.captureRequest=request;
  // A modal covers the live viewport, and worker RAF may be throttled. Capture
  // owns a bounded timer-driven draw; it never advances the simulation clock.
  cancelAnimationFrame(this.raf);this.raf=0;
  const aborted=()=>request.finish(Object.assign(new Error('Picture cancelled.'),{name:'AbortError'}));
  request.finish=(error,blob)=>{
   if(this.captureRequest!==request)return;
   this.captureRequest=null;clearTimeout(request.timeout);clearTimeout(request.pump);signal?.removeEventListener('abort',aborted);
   this.lastTime=0;
   if(!this.disposed&&!this.contextLost&&!document.hidden&&!this.presentationPaused&&!this.photoActive&&!this.xr?.active&&!this.raf)this.raf=requestAnimationFrame(this.frame);
   if(error)reject(error);else resolve(blob);
  };
  request.progress=phase=>onProgress({phase,progress:0,indeterminate:true,elapsedMs:this.now()-started,remainingMs:Math.max(0,limit-(this.now()-started))});
  request.timeout=setTimeout(()=>request.finish(new Error(request.encoding?'PNG encoding timed out. Try Quick again or restart graphics.':'Image capture timed out waiting for the GPU. Retry graphics or choose a lower live quality.')),limit);
  signal?.addEventListener('abort',aborted,{once:true});
  const pump=()=>{
   if(this.captureRequest!==request)return;
   if(this.disposed||this.contextLost||document.hidden){request.finish(new Error('Image capture stopped because the page or GPU became unavailable.'));return;}
   try{if(!request.encoding){this.captureDrawing=true;try{this.render(this.now(),false);}finally{this.captureDrawing=false;}}request.progress(request.encoding?'Encoding current frame…':this.pendingProgram?'Preparing current graphics…':'Capturing current frame…');}
   catch(error){request.finish(error);return;}
   if(this.captureRequest===request)request.pump=setTimeout(pump,32);
  };
  request.progress('Capturing current frame…');request.pump=setTimeout(pump,0);
  return promise;
 }
 captureFreshFrame(){
  const request=this.captureRequest;if(!request||request.encoding)return;
  // Ultra may temporarily show the compatible High program while compiling.
  // Explicit Ultra captures wait; Picture's Quick/baseline captures may save
  // the compatible program actually visible while Ultra is still preparing.
  if(this.quality!==request.quality){this.cancelCapture('Render quality changed before the image was ready. Please save again.');return;}
  if(!request.allowPreview&&(this.quality==='ultra')!==!!this.activeProgram?.features.ultra)return;
  request.encoding=true;request.progress('Encoding current frame…');
  // preserveDrawingBuffer is false: snapshot in the SAME task as the new draw,
  // before the browser composites and is allowed to discard its drawing buffer.
  const complete=blob=>blob?.size?request.finish(null,blob):request.finish(new Error('The browser returned an empty PNG.'));
  // Retain the request and deadline until encoding settles. In particular,
  // convertToBlob errors must not be hidden by a callback compatibility shim.
  try{if(typeof this.canvas.convertToBlob==='function')this.canvas.convertToBlob({type:'image/png'}).then(complete,error=>request.finish(new Error('PNG encoding failed: '+(error?.message||error))));else this.canvas.toBlob(complete,'image/png');}
  catch(error){request.finish(error);}
 }
 listen(target,name,fn,options){target.addEventListener(name,fn,options);this.listeners.push(()=>target.removeEventListener(name,fn,options));}
 now(){return typeof performance!=='undefined'?performance.now():Date.now();}
 bindControls(){
  const canvas=this.canvas;canvas.style.touchAction='none';canvas.style.cursor='grab';
  this.listen(canvas,'pointerdown',e=>{
   const mouse=e.pointerType==='mouse';if(mouse&&e.button!==0&&e.button!==1)return;
   const mode=(e.button===1||this.state.viewMode==='look'||this.state.viewMode==='free'||['onboard','chase'].includes(this.focusMode))?'look':'orbit';
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
    if(previous.mode==='look'){if((dx||dy)&&(this.cameraGuide!=='warp-side'||this.focusMode!=='track'))this.cameraGuide=null;this.target.lookYaw-=dx*.006;this.target.lookPitch=clamp(this.target.lookPitch+dy*.005,-1.5533,1.5533);}
    else this.rotate(-dx*.006,dy*.005);
   }
   this.pointers.set(e.pointerId,{...previous,x:e.clientX,y:e.clientY});
  });
  const end=e=>{this.pointers.delete(e.pointerId);if(!this.pointers.size){this.pinchOwned=false;canvas.style.cursor='grab';}};
  this.listen(canvas,'pointerup',end);this.listen(canvas,'pointercancel',end);this.listen(canvas,'lostpointercapture',end);
  this.listen(canvas,'auxclick',e=>{if(e.button===1)e.preventDefault();});
  this.listen(canvas,'wheel',e=>{e.preventDefault();if([...this.pointers.values()].some(p=>p.mode==='look'))return;this.zoom(Math.exp(clamp(e.deltaY,-180,180)*.0022));},{passive:false});
  this.listen(canvas,'keydown',e=>{
   if(this.driveId&&['w','s','a','d','q','e'].includes(e.key.toLowerCase()))return;
   const directional=(yaw,pitch)=>{if(this.cameraGuide!=='warp-side'||this.focusMode!=='track')this.cameraGuide=null;if(this.state.viewMode==='look'||this.state.viewMode==='free'||['onboard','chase'].includes(this.focusMode)||e.shiftKey){this.travel=false;this.target.lookYaw+=yaw;this.target.lookPitch=clamp(this.target.lookPitch+pitch,-1.5533,1.5533);}else this.rotate(yaw,pitch);};
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
 get minDistance(){return this.state.interiorView&&this.state.spectrum==='geometry'?.02*this.massScale:this.massScale*horizonRg(this.state.spin)*1.012;}
 get maxDistance(){return Math.max(5000*this.massScale,(this.configCache.bounds||0)*4);}
 maxFocusDistance(){const focus=this.getFocusFrame();if(!focus)return 160;let extent=160*focus.radius;for(const object of this.objects){if(object.parentId===this.focusId){const orbital=(object.orbitMeters||object.radius*this.massScale*REFERENCE_RG_METERS)*(1+(object.eccentricity||0))/REFERENCE_RG_METERS;extent=Math.max(extent,(orbital+this.objectRadius(object)*3)*2.4);}}return Math.min(1e12,Math.max(160,extent/Math.max(1e-20,focus.radius)));}

 refreshConfiguration(){
  this.state.metrics=false;
  this.geometryRevision=(this.geometryRevision||0)+1;
  this.anomalyObjects=this.objects.filter(o=>o.type==='anomaly').slice(0,4);
  this.clockActors=this.objects.filter(o=>supportsObjectClock(o.type));
  for(const object of this.clockActors)if(!object.clock)object.clock=createObjectClock();
  const s=this.state,c=this.configCache,m=this.massScale;
  s.warpRadius=effectiveWarpRadius(s.warpFactor);
  const bridgeShip=this.objects.find(o=>o.id===this.bridgeObjectId)||this.objects.find(o=>['enterprise','shuttle','astronaut','heighliner','blackhole','whitehole'].includes(o.type));c.bridgeRadius=(bridgeShip?this.objectRadius(bridgeShip):this.bodyRadius(s.bridgeTravelerType||'enterprise'))*(s.bridgeRadius||8);
  c.primaryAxis=axis(s.primaryTilt,s.primaryAzimuth);c.secondaryAxis=axis(s.secondaryTilt,s.secondaryAzimuth);c.primaryBasis=basis(c.primaryAxis);
  c.bridgeOtherColor=color(s.bridgeOtherColor,DEFAULTS.bridgeOtherColor);c.diskColor=color(s.diskColor,DEFAULTS.diskColor);c.nebulaColor=color(s.nebulaColor,DEFAULTS.nebulaColor);c.jetColor=color(s.jetColor,DEFAULTS.jetColor);c.starColor=color(s.starColor,DEFAULTS.starColor);c.planetColor=color(s.planetColor,DEFAULTS.planetColor);
  c.horizon=[m*horizonRg(s.spin),m*s.binaryRatio*horizonRg(s.secondarySpin)];c.isco=[iscoRg(s.spin),iscoRg(s.secondarySpin)];
  const separation=s.binarySeparation*m;
  c.diskOuter=s.binary?[Math.min(s.diskOuter*m,.65*separation*rocheFraction(1/s.binaryRatio)),Math.min((s.secondaryDiskOuter??s.diskOuter)*m*s.binaryRatio,.65*separation*rocheFraction(s.binaryRatio))]:[s.diskOuter*m,0];
  const holeOffset=s.binary?separation*Math.max(1,s.binaryRatio)/(1+s.binaryRatio):0;
  c.bounds=holeOffset+Math.max(26*m,s.disk||s.binary&&s.secondaryDisk?Math.max(...c.diskOuter)*1.25:0,s.jets||s.binary&&s.secondaryJets?42*m*Math.max(s.jetLength,s.secondaryJetLength||s.jetLength)*Math.max(1,s.binary?s.binaryRatio:1):0,s.planet?s.planetDistance*m+this.bodyRadius('planet',s.planetRadius)+2*m:0,s.tidalStar?s.starDistance*m+this.bodyRadius('star',s.starRadius)+2*m:0,...this.objects.map(o=>(Math.hypot(o.radius,o.height||0)*m+this.objectRadius(o)*(s.warp&&o.id===this.warpObjectId?effectiveWarpRadius(s.warpFactor)*3:1)+2*m)));

 }
 update(partial={}){
  const manualEnterprise=this.objects.some(o=>o.id===this.driveId&&o.type==='enterprise'),wasSpectrum=this.state.spectrum,wasBinary=this.state.binary,wasWarpScenario=this.state.warpScenario,wasViewMode=this.state.viewMode,wasBridge=this.state.bridge,wasBlackHole=this.state.blackHole,wasWarp=this.state.warp;
  this.fillHoles();this.fillObjects();const previousFrames=new Map(this.objectFrames.map(o=>[o.id,{position:[...o.position],heading:o.headingAngle}]));
  if(partial.warp===false&&this.warpObjectId)this.setObjectWarp(this.warpObjectId,false);
  if(Object.hasOwn(partial,'bridgeTravel')&&partial.bridgeTravel!==this.state.bridgeTravel)this.fillObjects();
  if(!this.buildingScene&&!partial.scene&&this.state.blackHole&&(Object.hasOwn(partial,'mass')||Object.hasOwn(partial,'binaryRatio'))&&this.objects.some(o=>isCompactType(o.type))){
   const savedMass=this.state.mass,savedRatio=this.state.binaryRatio;
   if(Number.isFinite(Number(partial.mass)))this.state.mass=clamp(Number(partial.mass),...LIMITS.mass);
   if(Number.isFinite(Number(partial.binaryRatio)))this.state.binaryRatio=clamp(Number(partial.binaryRatio),...LIMITS.binaryRatio);
   const invalid=this.objects.filter(o=>isCompactType(o.type)).map(o=>this.canParentObject(o.type,o.parentId,o.id)).find(result=>!result.ok);
   this.state.mass=savedMass;this.state.binaryRatio=savedRatio;if(invalid){this.lastTreeError=invalid.reason;return this.getState();}
  }
  if(partial.scene)Object.assign(this.state,makePreset(partial.scene));
  for(const [key,value] of Object.entries(partial))if(key in DEFAULTS)this.state[key]=value;
  if(Object.hasOwn(partial,'grid')||Object.hasOwn(partial,'warpGrid')){const enabled=Object.hasOwn(partial,'grid')?Boolean(partial.grid):Boolean(partial.warpGrid);this.state.grid=enabled;this.state.warpGrid=enabled;}
  else if(partial.scene){this.state.grid=this.state.warpGrid=!!(this.state.grid||this.state.warpGrid);}
  for(const [key,[lo,hi]] of Object.entries(LIMITS)){const value=Number(this.state[key]);this.state[key]=Number.isFinite(value)?clamp(value,lo,hi):DEFAULTS[key];}
  for(const [key,values] of Object.entries(ENUMS))if(!values.includes(this.state[key]))this.state[key]=DEFAULTS[key];
  this.state.metrics=false;this.state.objectScaleMode='physical';if(this.state.spectrum==='geometry'){this.state.grid=this.state.warpGrid=true;if(wasSpectrum!=='geometry'&&!Object.hasOwn(partial,'annotations'))this.state.annotations=true;}
  for(const [key,value] of Object.entries(DEFAULTS))if(typeof value==='boolean')this.state[key]=Boolean(this.state[key]);
  // The Ellis bridge is a different spacetime, not a superposed black-hole or
  // Alcubierre metric. Switch these fields atomically and retain placed bodies.
  if(wasBridge&&partial.bridge!==true&&(partial.blackHole===true||partial.warp===true&&!manualEnterprise||partial.binary===true||partial.whiteHole===true))this.state.bridge=false;
  if(partial.whiteHole===true)this.state.blackHole=true;
  if(this.state.bridge){this.state.blackHole=false;this.state.whiteHole=false;this.state.warp=manualEnterprise;this.state.binary=false;}
  if(wasBridge&&!this.state.bridge&&partial.binary===true)this.state.blackHole=true;
  if(!this.state.blackHole){this.state.whiteHole=false;this.state.disk=false;this.state.jets=false;this.state.binary=false;this.state.planet=false;this.state.tidalStar=false;}
  const enteringBridge=!wasBridge&&this.state.bridge,leavingBridge=wasBridge&&!this.state.bridge;
  if(wasBlackHole!==this.state.blackHole){
   for(const object of this.objects){if(object.parentId&&!['primary','secondary'].includes(object.parentId))continue;const previous=previousFrames.get(object.id);object.phase=this.currentPhase(object);object.epoch=this.time;
    if(this.state.blackHole){object.placement='orbit';object.referenceId=null;object.radius=clamp(previous?Math.hypot(...previous.position)/this.massScale:12,6,100);object.height=OBJECT_KIND[object.type]>=3?1.1:.1;}
    else{object.placement='local';object.referenceId=null;[object.x,object.y,object.z]=(previous?.position||[0,0,0]).map(v=>v*REFERENCE_RG_METERS);}
   }
   if(this.state.warp){this.state.warpScenario=this.state.blackHole?'orbit':'isolated';this.warpObjectId=null;}
  }
  if(enteringBridge){this.bridgeTime=0;this.bridgeTravelTime=this.time;const traveler=this.objects.find(o=>o.type===this.state.bridgeTravelerType)||this.objects.find(o=>['enterprise','shuttle','astronaut','heighliner','blackhole','whitehole'].includes(o.type))||this.addObject(this.state.bridgeTravelerType,14,0,1);this.bridgeObjectId=traveler?.id||null;if(traveler)this.state.bridgeTravelerType=traveler.type;}
  if(!this.state.bridge)this.bridgeObjectId=null;
  if(this.state.bridge&&!manualEnterprise){this.warpObjectId=null;for(const object of this.objects)object.warpEnabled=false;}
  this.refreshConfiguration();
  if(this.state.bridge&&Object.hasOwn(partial,'bridgeTravelerType'))this.setBridgeTraveler(this.state.bridgeTravelerType);
  if(Number.isFinite(partial.distance))this.setDistanceRg(partial.distance);
  if(this.state.blackHole&&!this.state.binary&&!this.focusId&&this.state.viewMode!=='free'){this.target.distance=Math.max(this.minDistance,this.target.distance);this.camera.distance=Math.max(this.minDistance,this.camera.distance);}
  if(wasBinary!==this.state.binary){this.time=0;if(this.state.binary)for(const [secondary,primary] of Object.entries({secondaryDisk:'disk',secondaryJets:'jets',secondaryDiskOuter:'diskOuter',secondaryDiskStyle:'diskStyle',secondaryDiskColor:'diskColor',secondaryDiskThickness:'diskThickness',secondaryDiskDensity:'diskDensity',secondaryJetColor:'jetColor',secondaryJetSpread:'jetSpread',secondaryJetLength:'jetLength',secondaryJetIntensity:'jetIntensity'}))if(!Object.hasOwn(partial,secondary))this.state[secondary]=this.state[primary];this.refreshConfiguration();}
  if(wasWarpScenario!==this.state.warpScenario)this.resetWarpTravel();
  if(this.state.warp&&(!wasWarp||!this.objects.some(o=>o.id===this.warpObjectId))){const ship=this.objects.find(o=>o.id===this.selectedId&&o.type==='enterprise')||this.objects.find(o=>o.type==='enterprise')||this.addObject('enterprise',14,1.3,1);if(ship)this.setObjectWarp(ship.id,true);else this.state.warp=false;}
  if(!this.state.warp){this.warpObjectId=null;for(const object of this.objects)object.warpEnabled=false;}
  if(Object.hasOwn(partial,'warpFactor')&&this.driveId===this.warpObjectId){const pilot=this.objects.find(o=>o.id===this.driveId);if(pilot?.flight)pilot.flight.speed=speedForWarp(this.state.warpFactor);}
  if(Object.hasOwn(partial,'warpFactor')&&this.focusId===this.warpObjectId)this.resumeWarpCameraFit();
  if(this.state.viewMode!==wasViewMode){const mode=this.state.viewMode;this.state.viewMode=wasViewMode;this.setViewMode(mode);}
  if(enteringBridge)this.resetCamera();
  else if(leavingBridge){
   this.releaseFocus(false,false);this.target={yaw:.25,pitch:.19,distance:this.state.blackHole?(this.state.binary?48:32)*this.massScale:1000/REFERENCE_RG_METERS,lookYaw:0,lookPitch:0,focusDistance:6};this.camera={...this.target};this.fillHoles();this.fillObjects();this.updateCameraFrame();
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
  const selectedPreset=SCENE_PRESETS.find(p=>p.id===this.sceneId),preset=(this.state.bridge&&!selectedPreset?.patch?.bridge?SCENE_PRESETS.find(p=>p.id==='bridge'):selectedPreset)||SCENE_PRESETS[0],bridgeVehicle=this.state.bridge&&this.objects.some(o=>o.id===this.bridgeObjectId&&['enterprise','shuttle','heighliner'].includes(o.type)),view=bridgeVehicle?{...(preset.camera||{}),...BRIDGE_VEHICLE_CAMERA,focusTarget:null}:preset.camera||{},pitchLimit=preset.category==='Geometry'?Math.PI/2-.001:1.48;
  this.releaseFocus(false,false);this.travel=false;this.freePosition=this.freeTarget=this.freeBasis=null;this.state.viewMode='orbit';
  this.target={yaw:Number.isFinite(view.yaw)?view.yaw:.25,pitch:Number.isFinite(view.pitch)?clamp(view.pitch,-pitchLimit,pitchLimit):.19,distance:Number.isFinite(view.distanceMeters)?view.distanceMeters/REFERENCE_RG_METERS:this.state.blackHole?(Number.isFinite(view.distanceRg)?view.distanceRg:(this.state.binary?48:32))*this.massScale:1000/REFERENCE_RG_METERS,lookYaw:0,lookPitch:0,focusDistance:6};
  if(this.state.bridge)this.target.distance=this.configCache.bridgeRadius*8;
  if(this.state.blackHole&&!this.state.binary)this.target.distance=Math.max(this.minDistance,this.target.distance);
  this.camera={...this.target};this.fillHoles();this.fillObjects();this.updateCameraFrame();
  const target=this.state.bridge&&view.focusTarget==='bridge'?{id:'bridge'}:this.state.bridge?this.objects.find(o=>o.id===this.bridgeObjectId)||{id:'bridge'}:Number.isInteger(view.focusIndex)?this.objects.find(o=>o.id===this.sceneFocusId):this.state.warp&&this.state.warpScenario==='isolated'?this.objects.find(o=>o.id===this.warpObjectId):null;
  if(target){this.focusTarget(target.id,target.id==='bridge'?'track':view.mode||'track',true);if(Number.isFinite(view.yaw))this.camera.yaw=this.target.yaw=view.yaw;if(Number.isFinite(view.pitch))this.camera.pitch=this.target.pitch=clamp(view.pitch,-pitchLimit,pitchLimit);if((view.mode||'track')==='track'&&(Number.isFinite(view.yaw)||Number.isFinite(view.pitch)))this.resetView();this.camera.focusDistance=this.target.focusDistance=clamp(view.focusDistance||(this.state.warp?10:6),1.15,160);this.updateCameraFrame();}
  if(!target&&view.mode==='free')this.setViewMode('free');
  if(Number.isFinite(view.lookYaw))this.camera.lookYaw=this.target.lookYaw=view.lookYaw;
  if(Number.isFinite(view.lookPitch))this.camera.lookPitch=this.target.lookPitch=clamp(view.lookPitch,-1.48,1.48);
  if(view.fitGeometry)this.fitGeometryOverview();
  this.cameraGuide=view.fitWarpSide?'warp-side':view.guideBlueFire?'blue-fire-edge':null;
  if(view.fitWarpSide)this.fitWarpCamera(true);
  this.updateCameraFrame();this.xr?.recenter();return this.getState();
 }
 // Fit the whole initial geometric system, including a complete traveler
 // circuit, inside the HUD-free center. CSS pixels, not render resolution,
 // determine the crop, so adaptive quality cannot make the camera jump.
 fitGeometryOverview(){
  const rect=this.canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height),aspect=width/height,fov=.83*Math.max(1,1.35/aspect);
  const compact=height<420,top=compact?90:Math.min(170,height*.28),bottom=compact?88:Math.min(150,height*.25),side=width<500?32:48;
  const pixels=Math.max(18,Math.min(width*.5-side,height*.5-top,height*.5-bottom))*.92;
  const focused=this.getFocusFrame(),center=focused?.position||[0,0,0];let extent=0;
  if(this.state.blackHole){const q=this.state.binary?this.state.binaryRatio:0,m=this.massScale;extent=this.state.binary?(this.state.binarySeparation*Math.max(1,q)/(1+q)+7*Math.max(1,q))*m:8*m;}
  for(const object of this.objects){const frame=this.getFocusFrame(object.id);if(!frame)continue;const orbital=object.placement==='orbit'?(object.orbitMeters?object.orbitMeters/REFERENCE_RG_METERS:object.radius*this.massScale):0;extent=Math.max(extent,Math.hypot(...frame.position.map((v,i)=>v-center[i]))+frame.radius*2,orbital+frame.radius*2);}
  if(!(extent>0))return;
  // A slight perspective margin includes the near side of each solid sphere.
  const distance=extent*height/(fov*pixels)+extent*.08;
  if(focused)this.camera.focusDistance=this.target.focusDistance=distance/focused.radius;
  else this.camera.distance=this.target.distance=distance;
 }
 resetView(){this.target.lookYaw=0;this.target.lookPitch=0;this.camera.lookYaw=0;this.camera.lookPitch=0;}
 setViewMode(mode){
  if(!ENUMS.viewMode.includes(mode))return;this.cameraGuide=null;
  if(mode==='free'&&this.state.viewMode!=='free'){
   this.fillHoles();this.fillObjects();this.updateCameraFrame();const f=this.cameraFrame;
   this.freePosition=[...f.observer];this.freeTarget=[...f.observer];this.freeBasis={forward:[...f.forward],right:[...f.right],up:[...f.up]};
   this.focusId=null;this.focusMode=null;this.focusReferenceFrame=null;this.savedOverview=null;this.travel=false;this.resetView();
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
  if(this.driveId)return false;
  this.freeTarget=this.freeTarget.map((v,i)=>v+direction[i]*distance);this.freeTarget=this.safeObserver(this.freeTarget);
  const extent=Math.hypot(...this.freeTarget),limit=this.maxDistance;if(extent>limit)this.freeTarget=mul(this.freeTarget,limit/extent);
  this.travel=false;return true;
 }
 navigationStep(){
  let distance=Math.hypot(...(this.freePosition||this.cameraFrame?.observer||[0,0,this.camera.distance]));
  for(const object of this.objectFrames){const d=Math.hypot(...object.position.map((x,i)=>x-(this.freePosition||this.cameraFrame.observer)[i]));distance=Math.min(distance,Math.max(object.radius*2,d));}
  if(this.state.blackHole)for(let k=0;k<(this.state.binary?2:1);k++){const center=Array.from(this.holeData.slice(k*4,k*4+3)),d=Math.hypot(...center.map((x,i)=>x-(this.freePosition||this.cameraFrame.observer)[i]));distance=Math.min(distance,Math.max(this.massScale*.015,d-this.configCache.horizon[k]));}
  return Math.max(1e-11,distance*.65);
 }
 safeObserver(position){
  if(this.state.interiorView&&this.state.spectrum==='geometry')return [...position];
  if(!this.state.blackHole)return [...position];let p=[...position];
  for(let k=0;k<(this.state.binary?2:1);k++){const center=Array.from(this.holeData.slice(k*4,k*4+3)),delta=p.map((x,i)=>x-center[i]),distance=Math.hypot(...delta),minimum=this.configCache.horizon[k]*1.013;if(distance<minimum)p=add(center,mul(distance>1e-15?unit(delta):[0,0,1],minimum));}
  return p;
 }
 look(direction){if(this.cameraGuide!=='warp-side'||this.focusMode!=='track')this.cameraGuide=null;this.travel=false;this.target.lookYaw=direction==='outward'?Math.PI:direction==='tangent'?Math.PI/2:0;this.target.lookPitch=direction==='above'?Math.PI/2-.001:0;this.camera.lookYaw=this.target.lookYaw;this.camera.lookPitch=this.target.lookPitch;}
 setCameraPreset(preset){if(!['in-plane','above-plane'].includes(preset))return false;if(this.cameraGuide!=='warp-side'||this.focusMode!=='track')this.cameraGuide=null;this.travel=false;if(['onboard','chase'].includes(this.focusMode)||this.state.viewMode==='free'||this.state.viewMode==='look'){this.look(preset==='above-plane'?'above':'tangent');}else{this.resetView();this.camera.pitch=this.target.pitch=preset==='above-plane'?Math.PI/2-.001:0;}this.updateCameraFrame();return true;}
 rotate(yawDelta,pitchDelta){if(this.cameraGuide!=='warp-side'||this.focusMode!=='track')this.cameraGuide=null;if(this.state.viewMode==='free'){this.target.lookYaw+=yawDelta;this.target.lookPitch=clamp(this.target.lookPitch+pitchDelta,-1.5533,1.5533);return;}this.travel=false;this.target.distance=this.camera.distance;if(!['onboard','chase'].includes(this.focusMode))this.resetView();if(['onboard','chase'].includes(this.focusMode)){this.target.lookYaw+=yawDelta;this.target.lookPitch=clamp(this.target.lookPitch+pitchDelta,-1.5533,1.5533);}else{this.target.yaw+=yawDelta;this.target.pitch=clamp(this.target.pitch+pitchDelta,-Math.PI/2+.001,Math.PI/2-.001);}this.navigationUntil=this.now()+100;}
 detachRide(){this.cameraGuide=null;
  this.updateCameraFrame();const f=this.getFocusFrame();if(!f)return false;
  const forward=inverse(f.frame,this.cameraFrame.forward),distance=this.focusMode==='chase'?Math.hypot(...this.cameraFrame.inspectCamera):1.15;
  this.focusMode='track';this.state.viewMode='orbit';this.resetView();this.camera.yaw=this.target.yaw=Math.atan2(-forward[0],-forward[2]);this.camera.pitch=this.target.pitch=clamp(Math.asin(-forward[1]),-1.5533,1.5533);this.camera.focusDistance=this.target.focusDistance=Math.max(1.15,distance);this.updateCameraFrame();return true;
 }
 zoom(factor){this.cameraGuide=null;if(this.state.viewMode==='free'){this.moveForward(-Math.log(clamp(factor,.01,100))*this.navigationStep());return;}this.travel=false;if(this.focusId){if(['onboard','chase'].includes(this.focusMode)){if(factor<=1)return;this.detachRide();}this.target.focusDistance=clamp(this.target.focusDistance*factor,['dyson','anomaly'].includes(this.getFocusFrame()?.type)?1e-7:this.state.interiorView&&this.state.spectrum==='geometry'&&this.getFocusFrame()?.collapsed?.02:1.15,this.maxFocusDistance());}else{const lower=this.state.blackHole?(this.state.binary?.05*this.massScale:this.minDistance):.1/REFERENCE_RG_METERS;this.target.distance=clamp(this.target.distance*factor,lower,this.maxDistance);}this.navigationUntil=this.now()+180;}

 setDistanceRg(value){if(!Number.isFinite(Number(value)))return;this.releaseFocus(false,false);this.travel=false;this.resetView();const lower=this.state.blackHole?(this.state.binary?.05*this.massScale:this.minDistance):.1/REFERENCE_RG_METERS;this.target.distance=clamp(Number(value)*this.massScale,lower,this.maxDistance);}
 setDistanceMeters(value){if(!Number.isFinite(Number(value)))return;this.releaseFocus(false,false);this.travel=false;this.resetView();this.target.distance=clamp(Number(value)/REFERENCE_RG_METERS,this.state.blackHole?this.minDistance:.1/REFERENCE_RG_METERS,this.maxDistance);}
 approach(){if(this.travel){this.travel=false;this.target.distance=this.camera.distance;return false;}this.releaseFocus(false,false);this.resetView();this.travel=true;this.target.distance=(this.state.binary?Math.max(20,this.state.binarySeparation*1.6):12)*this.massScale;return true;}
 bodyRadius(type,scale=1){return objectRadiusMeters(type,scale)/REFERENCE_RG_METERS;}
 // Accelerating this fictional binary must not make its illustrative surface
 // convection and wind noise jump thousands of frames per displayed second.
 simulationTimeScale(){return Math.max(1e-12,SCENE_PRESETS.find(p=>p.id===this.sceneId)?.simulationTimeScale||1);}
 playbackSpeedLimit(){
  if(this.sceneId!=='geometry-orbit')return 10;
  const omega=this.objects.reduce((fastest,object)=>Math.max(fastest,Math.abs(this.orbitalOmega(object))),0);
  return omega>0?Math.min(10,TAU/(10*omega*this.simulationTimeScale())):10;
 }
 effectivePlaybackSpeed(){return Math.min(this.state.speed,this.playbackSpeedLimit());}
 orbitDisplayPeriodSeconds(){
  if(this.sceneId!=='geometry-orbit')return null;
  const omega=this.objects.reduce((fastest,object)=>Math.max(fastest,Math.abs(this.orbitalOmega(object))),0),rate=this.effectivePlaybackSpeed()*this.simulationTimeScale();
  return omega>0&&rate>0?TAU/(omega*rate):null;
 }
 // Accelerating the fictional stellar system leaves convection visually legible.
 stellarVisualTime(){return this.sceneId==='thorne-zytkow'?this.time/(SCENE_PRESETS.find(p=>p.id===this.sceneId)?.simulationTimeScale||1):this.time;}
 objectRadius(obj){if(obj.type==='star'){const info=stellarInfo(obj,this.time);return (info.collapsed?info.horizonMeters:info.radiusMeters)/REFERENCE_RG_METERS;}if(['blackhole','whitehole'].includes(obj.type))return 2*1476.62504*(obj.massSolar||10)/REFERENCE_RG_METERS;const shape=Array.isArray(obj.shapeAxes)?Math.max(1e-6,...obj.shapeAxes):1;return shape*(Number.isFinite(obj.radiusMeters)&&obj.radiusMeters>0?obj.radiusMeters*objectScale(obj):objectRadiusMeters(obj.type,obj.scale))/REFERENCE_RG_METERS;}
 orbitalOmega(obj){if(obj.placement==='local'||['ring','belt','disk','jets','dyson'].includes(obj.type))return 0;if(obj.orbitMeters){const r=Math.max(1,obj.orbitMeters)/REFERENCE_RG_METERS,m=(this.parentMassSolar(obj)+(OBJECT_CLASS[(this.objectById?.get(obj.parentId)||this.objects.find(p=>p.id===obj.parentId))?.type||(obj.parentId==='planet'?'planet':obj.parentId==='tidalStar'?'star':null)]===OBJECT_CLASS[obj.type]||obj.barycentric?this.objectMassSolar(obj):0))/(REFERENCE_MASS*1e6);return 18*Math.sqrt(Math.max(1e-30,m)/(r*r*r));}const r=Math.max(.1,obj.radius)*this.massScale;return 18*Math.sqrt(this.massScale/(r*r*r));}
 currentPhase(obj){if(obj.placement==='local'||obj.motion==='horizon'||obj.motion==='infall'||this.state.bridge&&obj.id===this.bridgeObjectId)return obj.phase;if(this.state.warp&&obj.id===this.warpObjectId&&this.state.warpScenario!=='orbit')return obj.phase;return obj.phase-(this.time-(obj.epoch||0))*this.orbitalOmega(obj);}
 componentOrbitPhase(id,omega,initial=0){const saved=this.orbitOverrides?.[id];return (saved?.phase??initial)-(this.time-(saved?.epoch||0))*omega;}
 orbitMassSolar(obj){const parent=this.objectById?.get(obj.parentId)||this.objects.find(p=>p.id===obj.parentId),parentClass=OBJECT_CLASS[parent?.type||(obj.parentId==='planet'?'planet':obj.parentId==='tidalStar'?'star':null)];return this.parentMassSolar(obj)+(parentClass===OBJECT_CLASS[obj.type]||obj.barycentric?this.objectMassSolar(obj):0);}
 minimumObjectRadiusRg(object,height){
  if(height===undefined)height=object.orbitMeters&&Number.isFinite(object.heightMeters)?object.heightMeters/(this.massScale*REFERENCE_RG_METERS):object.height||0;
  const parentId=object.parentId||'primary',index=parentId==='primary'?0:parentId==='secondary'?1:-1;
  if(index<0||!this.state.blackHole)return 2.2;
  const clearance=compactExteriorRadius(this.configCache.horizon[index],this.objectRadius(object))/this.massScale;
  return Math.max(.000001,Math.sqrt(Math.max(0,clearance*clearance-height*height)));
 }
 getOrbitEditInfo(id){
  const object=this.objects.find(o=>o.id===id),parentId=object?.parentId||(id==='planet'||id==='tidalStar'||id==='secondary'?'primary':id==='primary'?'space':null),result={editable:false,parentId,radiusMeters:0,minimumMeters:1,maximumMeters:1e17,periodDays:null,speedMetersPerSecond:null};
  if(this.state.bridge)return {...result,reason:'This traveler follows the wormhole route, not an orbit.'};
  if(id==='tidalStar')return {...result,reason:'This star follows a disruption path. Adjust its distance in Properties.'};
  if(id==='primary'||id==='space')return {...result,reason:'The root of this system has no parent orbit.'};
  if(['disk','jets','secondary-disk','secondary-jets'].includes(id)||['ring','belt','disk','jets','dyson'].includes(object?.type))return {...result,reason:'Change this attachment’s extent in Properties.'};
  let radius,mass,e=0,bodyRadius=0,parentRadius=0;
  if(id==='secondary'&&this.state.binary){radius=this.state.binarySeparation*this.massScale*REFERENCE_RG_METERS;mass=this.state.mass*1e6*(1+this.state.binaryRatio);result.minimumMeters=12*this.massScale*REFERENCE_RG_METERS;result.maximumMeters=100*this.massScale*REFERENCE_RG_METERS;result.radiusLabel='Binary separation';}
  else if(id==='planet'&&this.state.planet){radius=this.state.planetDistance*this.massScale*REFERENCE_RG_METERS;mass=this.state.mass*1e6+this.state.planetMass*3.00349e-6;result.minimumMeters=4*this.massScale*REFERENCE_RG_METERS;result.maximumMeters=100*this.massScale*REFERENCE_RG_METERS;}
  else if(object){
   if(object.placement==='local'||parentId==='space')return {...result,reason:'This object has a local position. Choose an orbital parent in Properties.'};
   if(object.motion&&object.motion!=='orbit'||this.driveId===id||object.driveReturn||this.state.warp&&id===this.warpObjectId&&this.state.warpScenario!=='orbit')return {...result,reason:'Resume its orbit before changing the orbital radius.'};
   radius=object.orbitMeters||object.radius*this.massScale*REFERENCE_RG_METERS;mass=this.orbitMassSolar(object);e=object.eccentricity||0;bodyRadius=this.objectRadius(object)*REFERENCE_RG_METERS;
   const parent=this.objects.find(o=>o.id===parentId);parentRadius=parent?this.objectRadius(parent)*REFERENCE_RG_METERS:parentId==='primary'?this.configCache.horizon[0]*REFERENCE_RG_METERS:parentId==='secondary'?this.configCache.horizon[1]*REFERENCE_RG_METERS:parentId==='planet'?this.bodyRadius('planet',this.state.planetRadius)*REFERENCE_RG_METERS:parentId==='tidalStar'?this.bodyRadius('star',this.state.starRadius)*REFERENCE_RG_METERS:0;
   const compact=['primary','secondary'].includes(parentId)||parent&&(['blackhole','whitehole'].includes(parent.type)||parent.type==='star'&&stellarInfo(parent,this.time).collapsed);
   const height=object.orbitMeters?(object.heightMeters||0):(object.height||0)*this.massScale*REFERENCE_RG_METERS,clearance=compactExteriorRadius(parentRadius,bodyRadius);
   const minimumPericenter=compact?Math.sqrt(Math.max(1,clearance*clearance-height*height)):(parentRadius+bodyRadius)*1.02;
   result.minimumMeters=Math.max(1,minimumPericenter/(1-e));result.radiusLabel=e>0?'Semi-major axis':'Orbital radius';
   if(compact)result.orbitNote='Near-horizon paths are prescribed demonstrations; circular orbits below the innermost stable orbit are not stable physical orbits.';
  }else return {...result,reason:'Choose an orbiting body.'};
  const mu=1.32712440018e20*Math.max(0,mass),period=mu>0?TAU*Math.sqrt(radius**3/mu):null;
  return {...result,editable:true,radiusMeters:radius,minimumMeters:Math.min(result.minimumMeters,radius),maximumMeters:Math.max(result.maximumMeters,radius),periodDays:period===null?null:period/86400,speedMetersPerSecond:mu>0?Math.sqrt(mu/radius):null,velocityLabel:e>0?'Circular-equivalent speed':'Orbital speed',reason:''};
 }
 setOrbitRadiusMeters(id,meters){
  const info=this.getOrbitEditInfo(id);if(!info.editable||!Number.isFinite(Number(meters)))return false;
  const radius=clamp(Number(meters),info.minimumMeters,info.maximumMeters),s=this.state,m=this.massScale;
  if(id==='secondary'||id==='planet'){
   const oldRadius=id==='secondary'?s.binarySeparation*m:s.planetDistance*m,omega=id==='secondary'?15*Math.sqrt(m*(1+s.binaryRatio)/(oldRadius**3)):18*Math.sqrt((m+s.planetMass*3.00349e-6/(REFERENCE_MASS*1e6))/(oldRadius**3));
   this.orbitOverrides??={};this.orbitOverrides[id]={phase:this.componentOrbitPhase(id,omega,id==='planet'?1.15:0),epoch:this.time};
   this.update({[id==='secondary'?'binarySeparation':'planetDistance']:radius/(m*REFERENCE_RG_METERS)});this.fillHoles();this.fillObjects();this.updateCameraFrame();
  }else{
   const object=this.objects.find(o=>o.id===id),patch={orbitMeters:radius};
   if(!object.orbitMeters&&object.heightMeters===undefined)patch.heightMeters=(object.height||0)*m*REFERENCE_RG_METERS;
   this.updateObject(id,patch);
  }
  return {ok:true,...this.getOrbitEditInfo(id)};
 }
 getObjectTree(){
  const nodes=[{id:'space',parentId:null,type:'space',label:'Space',component:'space',enabled:true,canAdd:!this.state.bridge,canTrack:false,canBoard:false}],preset=SCENE_PRESETS.find(p=>p.id===this.sceneId);
  const add=(id,parentId,type,label,component)=>nodes.push({id,parentId,type,label,component,enabled:true,canAdd:!['disk','jets','ring','belt','dyson','anomaly'].includes(type),canTrack:true,canBoard:!['disk','jets','ring','belt'].includes(type)});
  if(this.state.blackHole){add('primary','space',this.state.whiteHole?'whitehole':'blackhole',holeDisplayName(this.state,0,preset),'blackHole');if(this.state.disk)add('disk','primary','disk','Accretion disc','disk');if(this.state.jets)add('jets','primary','jets','Polar jets','jets');if(this.state.binary){add('secondary','primary',this.state.secondaryWhiteHole?'whitehole':'blackhole',holeDisplayName(this.state,1,preset),'binary');if(this.state.secondaryDisk)add('secondary-disk','secondary','disk','Accretion disc','secondary-disk');if(this.state.secondaryJets)add('secondary-jets','secondary','jets','Polar jets','secondary-jets');}}
  if(this.state.planet)add('planet',this.state.blackHole?'primary':'space','planet','Planet A','planet');if(this.state.tidalStar)add('tidalStar',this.state.blackHole?'primary':'space','star','Disrupting star','tidalStar');
  for(const object of this.objects)add(object.id,object.parentId||(object.referenceId||(this.state.blackHole?'primary':'space')),object.type,object.name||`${OBJECT_TYPES.find(t=>t.id===object.type)?.label||object.type} ${object.id.replace('body-','')}`);
  const byId=new Map(nodes.map(node=>{node.children=[];return [node.id,node];}));for(const node of nodes)if(byId.has(node.parentId))byId.get(node.parentId).children.push(node.id);
  const output=[],visited=new Set();const visit=node=>{if(visited.has(node.id))return;visited.add(node.id);output.push(node);for(const id of node.children)visit(byId.get(id));};visit(nodes[0]);for(const node of nodes)if(!visited.has(node.id)){node.parentId='space';visit(node);}return output;
 }
 compactNodeMass(id){if(id==='primary')return this.state.mass*1e6;if(id==='secondary')return this.state.mass*1e6*this.state.binaryRatio;return this.objectMassSolar(this.objects.find(o=>o.id===id)||{});}
 canParentObject(type,parentId='space',excludeId=null,properties={}){
  const nodes=this.getObjectTree(),parent=nodes.find(n=>n.id===parentId),parentMass=this.compactNodeMass(parentId),candidateMass=Number(properties.massSolar??(excludeId?this.compactNodeMass(excludeId):parentId==='primary'&&!this.state.binary?this.state.mass*1e6*this.state.binaryRatio:Math.max(.000001,parentMass*.02))),satellite=compactSatellite(type,candidateMass,parent?.type,parentMass);let reason='';
  if(this.state.bridge)reason='The bridge has one route traveler; change it in the bridge properties.';
  else if(!parent)reason='Choose an existing parent.';
  else if(!parent.canAdd)reason='Attachments cannot contain orbiting objects.';
  else if(type==='anomaly'&&parentId!=='space')reason='A gravity anomaly is a region in Space, not an orbiting body.';
  else if(type==='anomaly'&&this.objects.filter(o=>o.type==='anomaly'&&o.id!==excludeId).length>=4)reason='Up to four gravity anomaly regions can be combined.';
  else if(excludeId===parentId)reason='An object cannot orbit itself.';
  else if(['disk','jets'].includes(type)&&!['blackhole','whitehole','star'].includes(parent.type))reason='Accretion discs and jets attach to stars or black holes.';
  else if(['disk','jets'].includes(type)&&((['primary','secondary'].includes(parentId)&&this.state[parentId==='secondary'?(type==='disk'?'secondaryDisk':'secondaryJets'):type])||nodes.some(n=>n.parentId===parentId&&n.type===type&&n.id!==excludeId)))reason='This object already has this component.';
  else if(type==='dyson'&&!['star','blackhole','whitehole'].includes(parent.type))reason='A Dyson sphere is concentric with a star or compact central body.';
  else if(type==='dyson'&&nodes.some(n=>n.parentId===parentId&&n.type===type&&n.id!==excludeId))reason='This central body already has a Dyson sphere.';
  else if(['ring','belt'].includes(type)&&!['star','planet'].includes(parent.type))reason='Rings and belts belong to stars or planets.';
  else if(!['disk','jets','ring','belt'].includes(type)&&OBJECT_CLASS[type]===undefined)reason='Unknown object type.';
  else if(OBJECT_CLASS[type]>OBJECT_CLASS[parent.type])reason='A heavier object class cannot orbit a lighter parent.';
  if(!reason&&excludeId){let ancestor=parent;const visited=new Set();while(ancestor&&!visited.has(ancestor.id)){if(ancestor.id===excludeId){reason='This would create a cycle.';break;}visited.add(ancestor.id);ancestor=nodes.find(n=>n.id===ancestor.parentId);}}
  if(!reason&&OBJECT_CLASS[type]===OBJECT_CLASS[parent.type]&&!satellite){const grand=nodes.find(n=>n.id===parent.parentId),comparable=(child,host)=>OBJECT_CLASS[child?.type]===OBJECT_CLASS[host?.type]&&!compactSatellite(child?.type,this.compactNodeMass(child?.id),host?.type,this.compactNodeMass(host?.id));if((grand&&comparable(parent,grand))||nodes.some(n=>n.id!==excludeId&&n.parentId===parentId&&comparable(n,parent))||(excludeId&&nodes.some(n=>n.parentId===excludeId&&comparable(n,{id:excludeId,type}))))reason='Comparable-mass compact bodies and equal-class objects are restricted to a pair; smaller compact satellites must be at most one tenth of their host mass.';}
  return {ok:!reason,reason};
 }
 allowedChildTypes(parentId='space'){return OBJECT_TYPES.filter(t=>this.canParentObject(t.id,parentId).ok).map(t=>t.id);}
 addChildObject(parentId,type,options={}){
  const permission=this.canParentObject(type,parentId,null,options);this.lastTreeError=permission.reason;if(!permission.ok)return false;
  if(isCompactType(type)&&((parentId==='space'&&!this.state.blackHole)||(parentId==='primary'&&!this.state.binary&&!Object.hasOwn(options,'massSolar')))){this.update(parentId==='space'?{blackHole:true,whiteHole:type==='whitehole'}:{binary:true,secondaryWhiteHole:type==='whitehole'});return {id:parentId==='space'?'primary':'secondary',type};}
  if(isCompactType(type)&&parentId!=='space'&&!Object.hasOwn(options,'massSolar'))options={...options,massSolar:Math.max(.000001,this.compactNodeMass(parentId)*.02)};
  if((type==='disk'||type==='jets')&&['primary','secondary'].includes(parentId)){const key=parentId==='secondary'?(type==='disk'?'secondaryDisk':'secondaryJets'):type;this.update({[key]:true});return {id:parentId==='secondary'?'secondary-'+type:type,type};}
  if(this.objects.length>=MAX_SCENE_OBJECTS){this.lastTreeError='This scene supports up to 1,024 catalog objects; only visible bodies use detailed GPU slots.';return false;}
  const added=this.addObject(type,options.radius??12,options.phase??0,options.scale??1);if(!added)return false;
  const obj=this.objects.find(o=>o.id===added.id);obj.parentId=parentId;obj.referenceId=null;
  if(parentId==='space'){obj.placement='local';obj.x=options.x??0;obj.y=options.y??0;obj.z=options.z??0;}
  else{obj.placement='orbit';const parent=this.objects.find(o=>o.id===parentId);if(parent)obj.orbitMeters=options.orbitMeters??Math.max(10,(this.objectRadius(parent)+this.objectRadius(obj))*REFERENCE_RG_METERS*3);else if(['planet','tidalStar'].includes(parentId)){this.fillObjects();const frame=this.getFocusFrame(parentId);obj.orbitMeters=options.orbitMeters??Math.max(10,((frame?.radius||0)+this.objectRadius(obj))*REFERENCE_RG_METERS*3);}else if(parentId==='secondary')obj.radius=options.radius??6;}
  if(['disk','jets'].includes(type)){const parent=this.objects.find(o=>o.id===parentId);obj.radiusMeters=this.objectRadius(parent)*REFERENCE_RG_METERS*(type==='disk'?5:12);obj.innerRadiusRatio=type==='disk'?.23:.01;obj.thicknessRatio=.025;obj.color=type==='disk'?'#83bfff':'#65b8ff';}
  if(type==='dyson'){const parent=this.objects.find(o=>o.id===parentId);obj.radiusMeters=dysonHabitableRadius(parent);obj.dysonCutaway=0;obj.opacity=1;obj.massSolar=0;obj.color='#a5bdce';obj.height=0;obj.orbitMeters=1;obj.radius=0;obj.rotation=0;obj.dataNote='Fictional rigid habitat shell. Earth-equivalent stellar flux sets its initial radius; active support and artificial surface gravity are assumed. The shell center stays on its parent.';}
  this.updateObject(obj.id,options);return {...obj};
 }
 reparentObject(id,parentId){
  const obj=this.objects.find(o=>o.id===id);if(!obj)return false;
  const result=this.canParentObject(obj.type,parentId,id);this.lastTreeError=result.reason;if(!result.ok)return false;
  this.fillObjects();const current=this.objectFrames.find(o=>o.id===id),phase=this.currentPhase(obj);
  obj.parentId=parentId;obj.referenceId=null;obj.phase=phase;obj.epoch=this.time;
  if(parentId==='space'){obj.placement='local';[obj.x,obj.y,obj.z]=(current?.position||[0,0,0]).map(v=>v*REFERENCE_RG_METERS);}
  else{obj.placement='orbit';const parent=this.objects.find(o=>o.id===parentId);obj.orbitMeters=parent?Math.max(10,(this.objectRadius(parent)+this.objectRadius(obj))*REFERENCE_RG_METERS*3):['planet','tidalStar'].includes(parentId)?Math.max(10,((this.getFocusFrame(parentId)?.radius||0)+this.objectRadius(obj))*REFERENCE_RG_METERS*3):undefined;}
  // An intrinsic field follows its owner's placement. Reparenting must not
  // leave the isolated travel path overriding a newly assigned physical orbit.
  if(this.state.warp&&this.warpObjectId===id){this.state.warpScenario=parentId==='space'?'isolated':'orbit';this.warpTravelWorld=0;this.warpTravelTime=this.time;this.warpTravelPosition=[...(current?.position||[0,0,0])];}
  if(obj.type==='dyson'){obj.radius=0;obj.orbitMeters=1;obj.height=0;}
  this.refreshConfiguration();return true;
 }

 removeTreeObject(id){
  if(id==='space')return false;const nodes=this.getObjectTree(),remove=new Set([id]);let changed=true;while(changed){changed=false;for(const node of nodes)if(remove.has(node.parentId)&&!remove.has(node.id)){remove.add(node.id);changed=true;}}
  this.removeObjectSet(remove);
  if(remove.has('primary'))this.update({blackHole:false,binary:false,disk:false,jets:false,planet:false,tidalStar:false});else if(remove.has('secondary'))this.update({binary:false});
  for(const key of ['disk','jets','planet','tidalStar'])if(remove.has(key))this.update({[key]:false});if(remove.has('secondary-disk'))this.update({secondaryDisk:false});if(remove.has('secondary-jets'))this.update({secondaryJets:false});return true;
 }
 updateTreeObject(id,patch){if(id==='secondary-disk'||id==='secondary-jets'){const translated={};for(const [key,value]of Object.entries(patch))translated[key.startsWith('disk')?'secondaryD'+key.slice(1):key.startsWith('jet')?'secondaryJ'+key.slice(1):key]=value;return this.update(translated);}if((id==='primary'||id==='secondary')&&typeof patch.name==='string'){patch={...patch,[id==='primary'?'primaryName':'secondaryName']:patch.name.trim().slice(0,64)};}if(this.objects.some(o=>o.id===id))return this.updateObject(id,patch);if(id==='secondary'){const translated={...patch};if('spin'in patch){translated.secondarySpin=patch.spin;delete translated.spin;}return this.update(translated);}return this.update(patch);}
 parentMassSolar(obj){if(obj.parentId==='planet')return this.state.planetMass*3.00349e-6;if(obj.parentId==='tidalStar')return 1;if(obj.parentId==='secondary')return this.state.mass*1e6*this.state.binaryRatio;if(obj.parentId==='primary'||!obj.parentId&&this.state.blackHole)return this.state.mass*1e6;const p=this.objectById?.get(obj.parentId)||this.objects.find(o=>o.id===obj.parentId);if(!p)return 0;const companion=obj.orbitBarycenter?(this.barycentricByParent?.get(p.id)||this.objects.find(o=>o.parentId===p.id&&o.barycentric)):null;return this.objectMassSolar(p)+(companion?this.objectMassSolar(companion):0);}
 objectMassSolar(obj){if(Number.isFinite(obj.massSolar)&&obj.massSolar>=0)return obj.massSolar;return Math.max(1e-30,Number(obj.massSolar)||(obj.type==='star'?1:obj.type==='planet'?3.00349e-6:obj.type==='moon'?3.694e-8:obj.type==='astronaut'?5e-29:5e-26));}
 getObjectMetrics(id=this.focusId||this.selectedId||'primary'){
  const frame=this.getFocusFrame(id),object=this.objects.find(o=>o.id===id);if(!frame)return null;const orbit=this.getOrbitEditInfo(id),star=object?.type==='star'?stellarInfo(object,this.time):null,flight=id===this.driveId?this.getFlightState():null,parentId=object?.parentId||(id==='secondary'?'primary':'space'),parent=this.getFocusFrame(parentId),distance=parent?Math.hypot(...frame.position.map((v,i)=>v-parent.position[i]))*REFERENCE_RG_METERS:null,rg=(frame.massSolar||0)*1476.62504,spin=frame.spinParameter??0;
  const angularVelocity=star?.angularVelocity??(frame.type==='hole'&&rg>0?spin*LIGHT_SPEED/(2*rg*(1+Math.sqrt(Math.max(0,1-spin*spin)))):object?.rotationPeriodSeconds?TAU/object.rotationPeriodSeconds:null),velocity=flight?.type==='shuttle'?flight.velocity:frame.velocity||[0,0,0],speed=flight?.speedMetersPerSecond??(orbit?.editable?Math.sqrt(Math.max(0,1.32712440018e20*(object?this.orbitMassSolar(object):id==='secondary'?this.state.mass*1e6*(1+this.state.binaryRatio):this.state.mass*1e6)*(2/Math.max(1,distance||orbit.radiusMeters)-1/orbit.radiusMeters))):Math.hypot(...velocity)*LIGHT_SPEED/18);
  return {id,name:object?.name||frame.label||object?.type||id,parentId,massSolar:frame.massSolar||0,radiusMeters:(frame.physicalRadius||frame.radius)*REFERENCE_RG_METERS,distanceMeters:distance,speedMetersPerSecond:speed,velocityDirection:Math.hypot(...velocity)>0?unit(velocity):[0,0,0],angularVelocity,spinParameter:star?.spinParameter??spin,orbitalAngularVelocity:orbit?.periodDays?TAU/(orbit.periodDays*86400):null,horizonMeters:frame.horizonRadius?frame.horizonRadius*REFERENCE_RG_METERS:null,innerHorizonMeters:frame.innerHorizonRadius?frame.innerHorizonRadius*REFERENCE_RG_METERS:null,collapsed:!!frame.collapsed,illustrativePath:!!this.state.bridge||this.state.binaryMotion==='merger'||!!flight||object?.motion==='infall'};
 }
 protectClockBodies(){
  if(!this.clockActors?.length){this.clockSweepStarts?.clear();return;}
  const compact=[];
  if(this.state.blackHole)for(let k=0;k<(this.state.binary?2:1);k++)if(this.holeData[k*4+3]>0)compact.push({position:Array.from(this.holeData.slice(k*4,k*4+3)),radius:this.configCache.horizon[k]});
  for(const frame of this.objectFrames)if(frame.collapsed)compact.push({id:frame.id,position:frame.position,radius:frame.horizonRadius||frame.radius});
  if(!compact.length){this.clockSweepStarts?.clear();return;}
  for(const object of this.clockActors){
   const frame=this.frameById.get(object.id);if(!frame)continue;let moved=false;
   const bodyRadius=frame.physicalRadius||frame.radius,start=this.clockSweepStarts?.get(object.id);this.clockSweepStarts?.delete(object.id);
   // A relativistic Shuttle can cross a small horizon between two frames.
   // Test its swept center segment once; do not let a coarse time step tunnel.
   if(start){const delta=frame.position.map((v,i)=>v-start[i]),a=dot(delta,delta);let first=1;
    if(a>0)for(const source of compact){const offset=start.map((v,i)=>v-source.position[i]),radius=compactExteriorRadius(source.radius,bodyRadius),b=dot(offset,delta),c=dot(offset,offset)-radius*radius,disc=b*b-a*c;if(c>0&&b<0&&disc>=0){const hit=(-b-Math.sqrt(disc))/a;if(hit>=0&&hit<first)first=hit;}}
    if(first<1){frame.position=start.map((v,i)=>v+delta[i]*Math.max(0,first-1e-10));moved=true;}
   }
   for(let pass=0;pass<4;pass++){let changed=false;for(const source of compact){if(source.id===object.id)continue;const offset=frame.position.map((v,i)=>v-source.position[i]),distance=Math.hypot(...offset),minimum=compactExteriorRadius(source.radius,bodyRadius);if(distance>=minimum)continue;
    const direction=distance>1e-30?offset.map(v=>v/distance):[1,0,0];frame.position=source.position.map((v,i)=>v+direction[i]*minimum);changed=moved=true;
   }if(!changed)break;}
   // Overlapping capture surfaces can make sequential projections conflict.
   // A bounded exterior fallback is preferable to placing a person inside one.
   if(compact.some(source=>Math.hypot(...frame.position.map((v,i)=>v-source.position[i]))<compactExteriorRadius(source.radius,bodyRadius)*(1-1e-12))){
    const extent=Math.max(...compact.map(source=>Math.hypot(...source.position)+compactExteriorRadius(source.radius,bodyRadius)))*(1+1e-9),length=Math.hypot(...frame.position);frame.position=length>0?frame.position.map(v=>v/length*extent):[extent,0,0];moved=true;
   }
   if(moved&&object.drivePosition){object.drivePosition=[...frame.position];if(object.flight)object.flight.position=frame.position.map(v=>v*REFERENCE_RG_METERS);}
  }
 }
 clockSources(){
  // Keep the logical mass list, rather than rebuilding it for every clock or
  // depending on which bodies fit into the GPU's visible-object budget.
  if(this.clockSourceCache?.revision!==this.geometryRevision||this.clockSourceCache?.objects!==this.objects){
   const ids=[...(this.state.blackHole?['primary',...(this.state.binary?['secondary']:[])]:[]),...this.objects.filter(o=>['star','planet','moon','blackhole','whitehole'].includes(o.type)).map(o=>o.id),...(this.state.planet?['planet']:[]),...(this.state.tidalStar?['tidalStar']:[])];
   this.clockSourceCache={revision:this.geometryRevision,objects:this.objects,sources:ids.map(id=>({id,positionMeters:[0,0,0],velocityMetersPerSecond:[0,0,0]}))};
  }
  const sources=this.clockSourceCache.sources;
  for(const source of sources){
   const index=source.id==='primary'?0:source.id==='secondary'?1:-1,frame=index<0?this.frameById?.get(source.id):null;
   if(index>=0){const offset=index*4;source.massSolar=this.state.blackHole?this.holeData[offset+3]*REFERENCE_MASS*1e6:0;source.radiusMeters=this.configCache.horizon[index]*REFERENCE_RG_METERS;source.horizonMeters=source.radiusMeters;for(let j=0;j<3;j++){source.positionMeters[j]=this.holeData[offset+j]*REFERENCE_RG_METERS;source.velocityMetersPerSecond[j]=(this.holeVelocities?.[index]?.[j]||0)*LIGHT_SPEED/18;}}
   else if(frame){source.massSolar=frame.massSolar||0;source.radiusMeters=(frame.physicalRadius||frame.radius)*REFERENCE_RG_METERS;source.horizonMeters=frame.collapsed?(frame.horizonRadius||frame.radius)*REFERENCE_RG_METERS:0;for(let j=0;j<3;j++){source.positionMeters[j]=frame.position[j]*REFERENCE_RG_METERS;source.velocityMetersPerSecond[j]=(frame.velocity?.[j]||0)*LIGHT_SPEED/18;}}
   else source.massSolar=0;
  }
  return sources;
 }
 clockRateForObject(object,sources=this.clockSources()){
  const frame=this.frameById?.get(object.id);if(!frame)return clockRate();
  const position=frame.position.map(v=>v*REFERENCE_RG_METERS);
  let dominant=null,weight=0;
  for(const source of sources){if(source.id===object.id||!(source.massSolar>0))continue;const r=Math.max(source.radiusMeters||0,Math.hypot(...position.map((v,i)=>v-source.positionMeters[i])),1),value=source.massSolar/r;if(value>weight){weight=value;dominant=source;}}
  const bridgeClock=this.state.bridge&&object.id===this.bridgeObjectId;
  const prescribedRadialClock=this.state.blackHole&&this.driveId!==object.id&&['infall','horizon'].includes(object.motion);
  const rate=clockRate({id:object.id,positionMeters:position,bodyRadiusMeters:(frame.physicalRadius||frame.radius)*REFERENCE_RG_METERS,rapidityVector:object.clock?.rapidityVector,sources});
  const referenceDistanceMeters=dominant?Math.hypot(...position.map((v,i)=>v-dominant.positionMeters[i])):null,horizonRadiusMeters=dominant?.horizonMeters||0;
  const referenceName=dominant?(this.objectById.get(dominant.id)?.name||this.getFocusFrame(dominant.id)?.label||dominant.id):null;
  return {...rate,ultrastaticBridge:bridgeClock,prescribedRadialClock,model:bridgeClock?'Ellis ultrastatic throat · proper-thrust clock comparison':'Exterior gravitational comparison × proper-thrust rapidity · approximate',referenceId:dominant?.id||null,referenceName,referenceDistanceMeters,horizonRadiusMeters,horizonGapMeters:horizonRadiusMeters>0?referenceDistanceMeters-horizonRadiusMeters:null};
 }
 getObjectClock(id){
  const object=this.objectById?.get(id)||this.objects.find(o=>o.id===id);if(!object||!supportsObjectClock(object.type)||!this.objects.includes(object))return null;
  return objectClockReading(object.clock,this.clockRateForObject(object),{id:object.id,type:object.type,name:object.name||OBJECT_TYPES.find(t=>t.id===object.type)?.label||object.type,properSecondsPerWallSecond:1});
 }
 getTravelTargets(){return travelTargets(this);}
 previewTravel(targetId){return previewRoute(this,targetId);}
 startTravel(targetId){return beginRoute(this,targetId);}
 cancelTravel(){return cancelRoute(this);}
 getTravelState(){return routeState(this);}
 advanceTravel(dt){return advanceRoute(this,dt);}
 advanceClocks(properSeconds){
  if(!this.clockActors?.length||!(properSeconds>0))return;
  this.fillHoles();this.fillObjects();const sources=this.clockSources();
  for(const object of this.clockActors){
   if(this.transfer?.craftId===object.id||this.transferClockObjectId===object.id)continue;
   const flight=this.driveId===object.id?object.flight:null,thrust=flight&&object.type==='shuttle'?(flight.brakeSpeed?Math.max(0,flight.thrust||0):shuttleThrustSetting(flight.thrust))*FLIGHT_STANDARD_GRAVITY:0;
   const acceleration=thrust>0?flight.basis[2].map(v=>v*thrust):[0,0,0];
   advanceObjectClock(object.clock,properSeconds,this.clockRateForObject(object,sources),acceleration);
  }
 }
 getStellarInfo(id){const obj=this.objects.find(o=>o.id===id&&o.type==='star');return obj?stellarInfo(obj,this.time):null;}
 updateStellar(id,patch={}){const obj=this.objects.find(o=>o.id===id&&o.type==='star');if(!obj)return false;const phases=this.objects.filter(o=>o.parentId===id).map(o=>[o,this.currentPhase(o)]),result=this.updateObject(id,stellarPatch(obj,patch));for(const [child,phase]of phases){child.phase=phase;child.epoch=this.time;if(child.orbitMeters){const mu=1.32712440018e20*this.orbitMassSolar(child);if(mu>0)child.orbitalPeriodSeconds=TAU*Math.sqrt(child.orbitMeters**3/mu);}}this.refreshConfiguration();this.fillObjects();this.updateCameraFrame();return result;}
 // Manual Enterprise piloting always uses warp. Automatic bridge routes are
 // prescribed impulse journeys and never enter this controller.
 setFlightMode(mode){
  const obj=this.objects.find(o=>o.id===this.driveId),f=obj?.flight;if(obj?.type!=='enterprise'||!f||mode!=='warp')return false;
  if(f.mode!=='warp'){f.speed=speedForWarp(f.warpSetting??4);f.thrust=0;f.mode='warp';f.brakeSpeed=false;this.setFlightInput({});}
  this.state.warp=true;this.warpObjectId=obj.id;this.state.warpFactor=warpForSpeed(f.speed);
  for(const body of this.objects)body.warpEnabled=body.id===obj.id;
  this.state.warpScenario=obj.placement==='orbit'&&obj.parentId!=='space'?'orbit':'isolated';
  this.refreshConfiguration();this.fillObjects();if(this.focusId===obj.id)this.resumeWarpCameraFit();this.updateCameraFrame();return this.getFlightState();
 }
 setFlightPower(value){this.cancelTravel();const obj=this.objects.find(o=>o.id===this.driveId);if(!obj?.flight)return false;const f=obj.flight,warp=obj.type==='enterprise';if(warp){f.speed=speedForWarp(clamp(Number(value)||0,0,9.9999));f.warpSetting=warpForSpeed(f.speed);if(obj.id===this.warpObjectId)this.state.warpFactor=f.warpSetting;if(this.focusId===obj.id)this.resumeWarpCameraFit();}else f.thrust=impulseThrustSetting(value,obj.type==='enterprise'?ENTERPRISE_THRUST_MAX_G:SHUTTLE_THRUST_MAX_G);f.brakeSpeed=false;return this.getFlightState();}
 setFlightHeading(degrees){this.cancelTravel();const f=this.objects.find(o=>o.id===this.driveId)?.flight;if(!f||!Number.isFinite(Number(degrees)))return false;setPlanarHeading(f,Number(degrees)*Math.PI/180);return this.getFlightState();}
 nudgeFlightTurn(direction){this.cancelTravel();const f=this.objects.find(o=>o.id===this.driveId)?.flight;if(!f)return false;return setPlanarHeading(f,(f.headingTarget??f.headingAngle??0)+Math.sign(Number(direction)||0)*Math.PI/36);}
 setFlightInput(input={}){if(input.speed||input.curvature||input.torsion)this.cancelTravel();this.flightInput={speed:clamp(Number(input.speed)||0,-1,1),curvature:clamp(Number(input.curvature)||0,-1,1),torsion:clamp(Number(input.torsion)||0,-1,1)};return this.getFlightState();}
 getFlightState(){
  const obj=this.objects.find(o=>o.id===this.driveId),f=obj?.flight;if(!obj||!f)return {active:false,id:null};
  const enterprise=obj.type==='enterprise',warp=enterprise,maxThrustG=enterprise?ENTERPRISE_THRUST_MAX_G:SHUTTLE_THRUST_MAX_G,relativity=warp?null:shuttleRelativity(f,{maxThrustG}),velocity=warp?f.basis[2].map(v=>v*f.speed*(f.travelDirection||1)):relativity.velocity,speed=warp?f.speed:relativity.speed,warpFactor=warp?warpForSpeed(speed):0,maxSpeed=warp?speedForWarp(9.9999):LIGHT_SPEED,rates=flightControlRates(f,{warp,lengthMeters:OBJECT_DIMENSIONS[obj.type].lengthMeters}),thrustSetting=warp?0:f.brakeSpeed?Math.max(0,f.thrust||0):impulseThrustSetting(f.thrust,maxThrustG),requested=this.flightInput?.speed||(f.brakeSpeed?-1:0),stopped=this.state.paused||this.state.speed===0;
  const throttle=warp?(stopped||speed<=0&&requested<0||speed>=maxSpeed&&requested>0?0:requested):(stopped?0:thrustSetting/maxThrustG),accelerationMetersPerSecondSquared=warp?throttle*rates.speedRate:stopped?0:relativity.coordinateAcceleration;
  const clock=enterprise?null:objectClockReading(obj.clock),coordinateTimeSeconds=enterprise?f.coordinateTimeSeconds||0:clock.coordinateSeconds,timeLagSeconds=enterprise?null:clock.lagSeconds,properTimeSeconds=enterprise?null:clock.properSeconds,properAcceleration=warp?null:stopped?0:relativity.properAcceleration;
  return {active:true,id:obj.id,type:obj.type,flightMode:warp?'warp':'impulse',canWarp:enterprise,maxThrustG,coordinateTimeSeconds,properTimeSeconds,timeLagSeconds,properAcceleration,coordinateAcceleration:accelerationMetersPerSecondSquared,lorentzFactor:warp?null:relativity.lorentzFactor,beta:warp?null:relativity.beta,clockModel:enterprise?'Enterprise clocks are exempt':'Since creation · approximate gravity + local SR',speed:speed,curvature:f.curvature,torsion:f.torsion,speedMetersPerSecond:speed,velocity,velocityMetersPerSecond:[...velocity],curvaturePerMeter:f.curvature,torsionPerMeter:f.torsion,warpFactor,thrustSetting,thrustSettingG:thrustSetting,standardGravityMetersPerSecondSquared:FLIGHT_STANDARD_GRAVITY,steeringInput:stopped?0:clamp((f.angularVelocity||0)/.65,-1,1),headingDegrees:Math.atan2(Math.sin(f.headingAngle||0),Math.cos(f.headingAngle||0))*180/Math.PI,headingTargetDegrees:Math.atan2(Math.sin(f.headingTarget||0),Math.cos(f.headingTarget||0))*180/Math.PI,travelDirection:warp?(f.travelDirection||1):1,bridgeNavigation:!!this.state.bridge,warpRatePerSecond:throttle*rates.warpRate,curvatureRatePerMeterSecond:stopped?0:(this.flightInput?.curvature||0)*rates.curvatureRate,torsionRatePerMeterSecond:stopped?0:(this.flightInput?.torsion||0)*rates.torsionRate,turnRateRadiansPerSecond:f.angularVelocity||0,twistRateRadiansPerSecond:speed*f.torsion,throttle,accelerationMetersPerSecondSquared,accelerationVectorMetersPerSecondSquared:warp?f.basis[2].map(v=>v*accelerationMetersPerSecondSquared):stopped?[0,0,0]:[...relativity.coordinateAccelerationVector],speedFraction:Math.min(1,speed/maxSpeed),basis:f.basis.map(v=>[...v]),position:[...f.position],travelCompression:f.travelCompression||1};
 }
 brakeFlight(axis='speed'){this.cancelTravel();const obj=this.objects.find(o=>o.id===this.driveId),f=obj?.flight;if(!f)return false;if(axis==='turn')f.brakeTurn=true;else{f.brakeSpeed=true;f.brakeInitialSpeed=obj.type==='enterprise'?f.speed:Math.max(0,f.thrust||0);}return true;}
 reverseFlight(){const o=this.objects.find(o=>o.id===this.driveId);if(!o?.flight||o.type!=='enterprise'||!this.state.bridge)return false;o.flight.travelDirection=-(o.flight.travelDirection||1);return true;}
 resetFlight(){const obj=this.objects.find(o=>o.id===this.driveId);if(!obj?.flight)return false;if(obj.type==='enterprise')obj.flight.speed=0;else{obj.flight.thrust=0;obj.flight.brakeSpeed=false;}obj.flight.curvature=0;obj.flight.torsion=0;obj.flight.angularVelocity=0;obj.flight.headingTarget=obj.flight.headingAngle||0;if(obj.id===this.warpObjectId||obj.id===this.bridgeObjectId)this.state.warpFactor=0;if(obj.type==='enterprise'&&this.focusId===obj.id)this.resumeWarpCameraFit();this.setFlightInput({});return this.getFlightState();}
 setFreeDrive(id,enabled){
  if(this.transfer?.active&&(!enabled||this.transfer.craftId!==id))this.cancelTravel();
  const obj=this.objects.find(o=>o.id===id&&['enterprise','shuttle'].includes(o.type));if(!obj)return false;this.fillObjects();const frame=this.objectFrames.find(o=>o.id===id);if(!frame)return false;
  if(enabled){
   if(this.driveId===id)return true;if(this.driveId)this.setFreeDrive(this.driveId,false);
   if(obj.type==='enterprise')obj.driveRestore={warp:this.state.warp,warpObjectId:this.warpObjectId||null,warpFactor:this.state.warpFactor,warpScenario:this.state.warpScenario,warpTravelWorld:this.warpTravelWorld||0,warpTravelPosition:this.warpTravelPosition?[...this.warpTravelPosition]:null,warpTravelTime:this.warpTravelTime||0};
   obj.drivePosition=[...frame.position];obj.driveBasis=orthonormalFrame(frame.frame);obj.driveReturn=null;
   obj.flight={position:frame.position.map(v=>v*REFERENCE_RG_METERS),basis:obj.driveBasis.map(v=>[...v]),speed:0,curvature:0,torsion:0,angularVelocity:0,headingAngle:0,headingTarget:0,thrust:0,velocity:[0,0,0],...(obj.type==='enterprise'?{warpSetting:this.state.warp&&id===this.warpObjectId?this.state.warpFactor:4}:{mode:'impulse'})};
   resetFlightClocks(obj.flight);if(obj.clock){obj.flight.coordinateTimeSeconds=obj.clock.coordinateSeconds;obj.flight.timeLagSeconds=obj.clock.lagSeconds;obj.flight.coordinateTimeCompensation=obj.clock.coordinateCompensation;obj.flight.timeLagCompensation=obj.clock.lagCompensation;}
   this.driveId=id;this.setFlightInput({});if(obj.type==='enterprise')this.setFlightMode('warp');
  }
  else if(this.driveId===id){if(this.state.bridge&&id===this.bridgeObjectId&&this.state.bridgeLifecycle!=='open-transit-close'){const b=this.configCache.bridgeRadius,l=bridgeProperRadius(Math.hypot(...obj.drivePosition),b),phase=Math.acos(clamp(l/(6*b),-1,1)),velocity=obj.type==='enterprise'?obj.driveBasis[2].map(v=>v*(obj.flight?.travelDirection||1)):obj.flight?.velocity||obj.driveBasis[2],inward=dot(velocity,obj.drivePosition)<0;this.bridgeTime=(inward?phase:TAU-phase)/.12;}obj.driveReturn={position:[...obj.drivePosition],basis:(obj.driveBasis||frame.frame).map(v=>[...v]),elapsed:0};delete obj.drivePosition;this.driveId=null;this.setFlightInput({});
   const saved=obj.driveRestore;if(saved){const owner=this.objects.find(o=>o.id===saved.warpObjectId&&o.type==='enterprise');this.state.warp=saved.warp&&!!owner;this.warpObjectId=owner?saved.warpObjectId:null;this.state.warpFactor=saved.warpFactor;this.state.warpScenario=saved.warpScenario;this.warpTravelWorld=saved.warpTravelWorld;this.warpTravelPosition=saved.warpTravelPosition;this.warpTravelTime=saved.warpTravelTime;for(const body of this.objects)body.warpEnabled=this.state.warp&&body.id===this.warpObjectId;delete obj.driveRestore;this.refreshConfiguration();}
  }
  return true;
 }
 freeRoamRelative(id){if(this.driveId&&this.driveId!==id)this.setFreeDrive(this.driveId,false);this.fillObjects();const frame=this.getFocusFrame(id);if(!frame&&id!=='space')return false;if(frame)this.focusTarget(id,'track');this.setViewMode('free');this.freeReferenceId=id==='space'?null:id;this.freeReferencePosition=frame?[...frame.position]:null;return true;}
 getObjectContext(){
  if(this.state.bridge)return {kind:'bridge',referenceId:this.bridgeObjectId,referenceLabel:'Bridge route',unit:'m',addMode:'traveler',allowedTypes:['enterprise','shuttle','astronaut','heighliner','blackhole','whitehole']};
  if(this.state.blackHole)return {kind:'orbit',referenceId:'primary',referenceLabel:'Black hole',unit:'r_g',addMode:'object',allowedTypes:OBJECT_TYPES.filter(o=>Object.hasOwn(OBJECT_KIND,o.id)).map(o=>o.id)};
  const lookup=id=>this.sceneBuildObjects?this.sceneBuildObjects.get(id):this.objects.find(o=>o.id===id),reference=lookup(this.warpObjectId)||lookup(this.focusId)||lookup(this.selectedId)||this.objects.find(o=>OBJECT_KIND[o.type]>=3)||this.objects[0];
  return {kind:'local',referenceId:reference?.id||null,referenceLabel:reference?OBJECT_TYPES.find(t=>t.id===reference.type)?.label||reference.type:'World origin',unit:'m',addMode:'object',allowedTypes:OBJECT_TYPES.filter(o=>Object.hasOwn(OBJECT_KIND,o.id)).map(o=>o.id)};
 }
 addObject(type='planet',radius=12,phase=0,scale=1){
  const kind=Object.hasOwn(OBJECT_KIND,type)?type:'planet',context=this.getObjectContext();
  if(context.kind==='bridge'){if(!context.allowedTypes.includes(kind))return false;if(this.objects.some(o=>o.id===this.bridgeObjectId))return this.setBridgeTraveler(kind);}
  if(kind==='anomaly'&&this.objects.filter(o=>o.type==='anomaly').length>=4){this.lastTreeError='Up to four gravity anomaly regions can be combined.';return false;}
  if(this.objects.length>=MAX_SCENE_OBJECTS)return false;
  const obj={type:kind,radius:clamp(Number(radius)||12,2.2,1e7),phase:Number.isFinite(Number(phase))?Number(phase):0,parentId:context.kind==='orbit'?'primary':'space',height:OBJECT_KIND[kind]>=3?1.1:.1,scale:clamp(Number(scale)||1,.25,4),epoch:this.time,id:`body-${this.nextObjectId++}`,placement:context.kind==='orbit'?'orbit':'local',referenceId:null,x:0,y:0,z:0,warpEnabled:false,motion:'orbit',motionEpoch:this.time,logLuminosity:0};
  if(supportsObjectClock(kind))obj.clock=createObjectClock();
  if(context.kind==='local'&&context.referenceId){const reference=this.sceneBuildObjects?this.sceneBuildObjects.get(context.referenceId):this.objects.find(o=>o.id===context.referenceId);obj.referenceId=reference.id;obj.x=Math.max(50,(objectRadiusMeters(reference.type,reference.scale)+objectRadiusMeters(obj.type,obj.scale))*2.5);}
  if(kind==='anomaly'){obj.parentId='space';obj.referenceId=null;obj.placement='local';obj.x=0;obj.y=0;obj.z=0;obj.massSolar=0;obj.radiusMeters=6000;obj.anomalyStrength=1.8;obj.anomalyScale=1;obj.anomalyMotion=1;obj.color='#89cfff';}
  if(['blackhole','whitehole'].includes(kind))obj.massSolar=10*obj.scale;this.objects.push(obj);this.sceneBuildObjects?.set(obj.id,obj);if(this.state.bridge&&!this.bridgeObjectId&&['enterprise','shuttle','astronaut','heighliner','blackhole','whitehole'].includes(obj.type))this.bridgeObjectId=obj.id;this.selectedId=obj.id;if(!this.buildingScene)this.refreshConfiguration();return {...obj};
 }
 updateObject(id,patch={}){
  const obj=this.sceneBuildObjects?this.sceneBuildObjects.get(id):this.objects.find(o=>o.id===id);if(!obj)return false;const phase=this.buildingScene&&this.time===obj.epoch?obj.phase:this.currentPhase(obj);
  if(!this.buildingScene&&isCompactType(obj.type)&&Number.isFinite(Number(patch.massSolar))){
   const oldMass=obj.massSolar;obj.massSolar=clamp(Number(patch.massSolar),.000001,1e12);
   const affected=[obj,...this.objects.filter(child=>child.parentId===obj.id&&isCompactType(child.type))];
   const invalid=affected.map(child=>this.canParentObject(child.type,child.parentId,child.id)).find(result=>!result.ok);
   obj.massSolar=oldMass;if(invalid){this.lastTreeError=invalid.reason;return false;}
  }
  if(obj.placement!=='local'){
   if(Number.isFinite(Number(patch.radius)))obj.radius=clamp(Number(patch.radius),this.minimumObjectRadiusRg(obj,Number.isFinite(Number(patch.height))?Number(patch.height):undefined),1e7);
   if(Number.isFinite(Number(patch.height)))obj.height=clamp(Number(patch.height),-30,30);
   if(obj.orbitMeters&&Number.isFinite(Number(patch.height))&&!Object.hasOwn(patch,'heightMeters'))obj.heightMeters=obj.height*this.massScale*REFERENCE_RG_METERS;
   if(Object.hasOwn(patch,'height')&&!obj.orbitMeters)obj.radius=Math.max(obj.radius,this.minimumObjectRadiusRg(obj));
  }else{
   for(const key of ['x','y','z'])if(Number.isFinite(Number(patch[key])))obj[key]=clamp(Number(patch[key]),-1e12,1e12);
   if(Object.hasOwn(patch,'referenceId')){let target=this.objects.find(o=>o.id===patch.referenceId),ancestor=target,valid=true;for(let i=0;ancestor&&i<=this.objects.length;i++){if(ancestor.id===id){valid=false;break;}ancestor=this.objects.find(o=>o.id===ancestor.referenceId);}if(valid){obj.referenceId=target?.id||null;obj.parentId=target?.id||'space';}}
  }
  if(Number.isFinite(Number(patch.scale)))obj.scale=clamp(Number(patch.scale),.001,1000);
  if(typeof patch.name==='string')obj.name=patch.name.trim().slice(0,64);
  if(/^#[0-9a-f]{6}$/i.test(patch.color))obj.color=patch.color;if(/^#[0-9a-f]{6}$/i.test(patch.surfaceTint))obj.surfaceTint=patch.surfaceTint;
  for(const key of ['catalogId','dataNote','sourceKey','reference','bodyClass','sourceFrame','orbitReferenceFrame'])if(typeof patch[key]==='string')obj[key]=patch[key].slice(0,1000);
  if(Array.isArray(patch.shapeAxes)&&patch.shapeAxes.length===3&&patch.shapeAxes.every(v=>Number.isFinite(v)&&v>0))obj.shapeAxes=patch.shapeAxes.map(v=>clamp(v,.05,5));
  for(const key of ['tidallyLocked','radiusEstimated','massEstimated','physicalRadiusKnown','barycentric','orbitBarycenter','collapseEnabled'])if(typeof patch[key]==='boolean')obj[key]=patch[key];
  for(const [key,lo,hi] of OBJECT_PROPERTY_RANGES)if(Number.isFinite(Number(patch[key])))obj[key]=clamp(Number(patch[key]),lo,hi);
  if(obj.placement==='orbit'&&['primary','secondary'].includes(obj.parentId)){
   const unit=this.massScale*REFERENCE_RG_METERS;
   if(Object.hasOwn(patch,'orbitMeters')&&obj.orbitMeters)obj.radius=clamp(obj.orbitMeters/unit,0,1e7);
   if(Object.hasOwn(patch,'heightMeters'))obj.height=clamp(obj.heightMeters/unit,-30,30);
  }
  for(const [key,values] of Object.entries({starStyle:STELLAR_STYLE_IDS,planetStyle:['rocky','gas','ice','ocean'],material:['rocky','icy','metallic']}))if(values.includes(patch[key]))obj[key]=patch[key];
  for(const key of ['diskStyle','diskPalette','jetStructure'])if(ENUMS[key].includes(patch[key]))obj[key]=patch[key];
  for(const [key,lo,hi]of [['diskThickness',.15,6],['diskDensity',0,4],['jetSpread',.15,5],['jetIntensity',0,4]])if(Number.isFinite(Number(patch[key])))obj[key]=clamp(Number(patch[key]),lo,hi);
  if(['contact','rubble','ellipsoid'].includes(patch.shapeStyle))obj.shapeStyle=patch.shapeStyle;
  if(patch.parentId&&patch.parentId!==obj.parentId)this.reparentObject(id,patch.parentId);
  if(obj.type==='probe'&&Number.isFinite(Number(patch.logLuminosity)))obj.logLuminosity=clamp(Number(patch.logLuminosity),0,8);
  if(['orbit','infall','horizon'].includes(patch.motion)){if(obj.motion!==patch.motion)obj.motionEpoch=this.time;obj.motion=patch.motion;}
  if(obj.motion==='infall'&&['radius','height','phase'].some(key=>Object.hasOwn(patch,key)))obj.motionEpoch=this.time;
  if(!this.buildingScene&&obj.placement==='orbit'&&['radius','orbitMeters'].some(key=>Object.hasOwn(patch,key))){
   if(Object.hasOwn(patch,'radius')&&!Object.hasOwn(patch,'orbitMeters')&&obj.orbitMeters)obj.orbitMeters=obj.radius*this.massScale*REFERENCE_RG_METERS;
   const a=obj.orbitMeters||obj.radius*this.massScale*REFERENCE_RG_METERS,mu=1.32712440018e20*this.orbitMassSolar(obj);if(mu>0)obj.orbitalPeriodSeconds=TAU*Math.sqrt(a**3/mu);
  }
  if(obj.type==='anomaly'){obj.parentId='space';obj.referenceId=null;obj.placement='local';obj.massSolar=0;}
  if(obj.type==='dyson'){obj.radius=0;obj.orbitMeters=1;obj.height=0;obj.massSolar=0;}
  obj.phase=Number.isFinite(Number(patch.phase))?Number(patch.phase):phase;obj.epoch=this.time;this.selectedId=obj.id;
  if(obj.id===this.warpObjectId&&this.state.warpScenario==='isolated'&&['x','y','z'].some(key=>Object.hasOwn(patch,key)))this.warpTravelPosition=[obj.x||0,obj.y||0,obj.z||0].map(v=>v/REFERENCE_RG_METERS);
  if(!this.buildingScene){this.refreshConfiguration();this.fillObjects();this.updateCameraFrame();}
  if(Object.hasOwn(patch,'warpEnabled'))this.setObjectWarp(id,!!patch.warpEnabled);
  return this.buildingScene?{...obj}:this.getObjects().find(o=>o.id===id);
 }
 setObjectWarp(id,enabled){
  const ship=this.objects.find(o=>o.id===id&&o.type==='enterprise');if(!ship)return false;if(this.driveId===id&&ship.flight)return enabled?this.setFlightMode('warp'):this.setFlightPower(0);if(this.state.bridge)return false;
  this.fillHoles();this.fillObjects();const current=this.objectFrames.find(o=>o.id===id),position=current?[...current.position]:[0,0,0];
  if(enabled){
   if(this.state.warp&&this.warpObjectId===id){this.selectedId=id;return this.getObjects().find(o=>o.id===id);}
   const previous=this.objects.find(o=>o.id===this.warpObjectId),previousFrame=this.objectFrames.find(o=>o.id===this.warpObjectId);
   if(previous&&previousFrame&&previous.placement==='local'){previous.referenceId=null;[previous.x,previous.y,previous.z]=previousFrame.position.map(v=>v*REFERENCE_RG_METERS);}
   if(ship.placement!=='orbit'||ship.parentId==='space'){ship.placement='local';ship.referenceId=null;[ship.x,ship.y,ship.z]=position.map(v=>v*REFERENCE_RG_METERS);}
   for(const object of this.objects)object.warpEnabled=object.id===id;
   this.warpObjectId=id;this.state.warp=true;this.state.warpScenario=ship.placement==='orbit'&&ship.parentId!=='space'?(this.state.blackHole&&this.state.warpScenario==='excursion'?'excursion':'orbit'):'isolated';
   if(this.driveId===id&&ship.flight)ship.flight.speed=speedForWarp(this.state.warpFactor);
   this.warpTravelWorld=0;this.warpTravelPosition=position;this.warpTravelTime=this.time;
  }else{
   ship.warpEnabled=false;
   if(this.warpObjectId===id){
    if(ship.placement!=='orbit'||ship.parentId==='space'){ship.placement='local';ship.referenceId=null;[ship.x,ship.y,ship.z]=position.map(v=>v*REFERENCE_RG_METERS);}
    this.state.warp=false;this.warpObjectId=null;
   }
  }
  this.selectedId=id;this.refreshConfiguration();this.fillObjects();if(this.focusId===id)this.resumeWarpCameraFit();this.updateCameraFrame();return this.getObjects().find(o=>o.id===id);
 }
 exploreWarp(){
  if(this.state.bridge)this.update({bridge:false});
  const ship=this.objects.find(o=>o.id===this.selectedId&&o.type==='enterprise')||this.objects.find(o=>o.type==='enterprise')||this.addObject('enterprise',14,1.3,1);
  if(!ship)return false;this.setObjectWarp(ship.id,true);this.focusTarget(ship.id,'track');this.camera.focusDistance=this.target.focusDistance=10;this.updateCameraFrame();return this.getObjects().find(o=>o.id===ship.id);
 }
 setBridgeTraveler(type){
  if(!this.state.bridge||!['enterprise','shuttle','astronaut','heighliner','blackhole','whitehole'].includes(type))return false;
  let traveler=this.objects.find(o=>o.id===this.bridgeObjectId);
  if(!traveler){traveler=this.addObject(type,12,0,1);if(!traveler)return false;traveler=this.objects.find(o=>o.id===traveler.id);this.bridgeObjectId=traveler.id;}
  const typeChanged=traveler.type!==type;
  if(typeChanged){for(const key of ['radiusMeters','massSolar','shapeAxes','surfaceId','surfaceTint','starStyle','angularVelocity','flight','drivePosition','driveBasis','driveReturn'])delete traveler[key];traveler.scale=1;if(['blackhole','whitehole'].includes(type))traveler.massSolar=10;}traveler.type=type;traveler.warpEnabled=false;if(this.warpObjectId===traveler.id)this.warpObjectId=null;traveler.placement='local';traveler.referenceId=null;this.state.bridgeTravelerType=type;
  this.refreshConfiguration();this.fillObjects();if(typeChanged&&['enterprise','shuttle','heighliner'].includes(type))this.resetCamera();else if(!this.focusId||this.focusId==='bridge')this.focusTarget(traveler.id,'track');else this.updateCameraFrame();
  return this.getObjects().find(o=>o.id===traveler.id);
 }
 removeObjectSet(remove){
  if(!this.objects.some(o=>remove.has(o.id)))return false;
  const bridgeShip=this.state.bridge&&remove.has(this.bridgeObjectId),wasFocused=remove.has(this.focusId);
  if(wasFocused)this.releaseFocus(!bridgeShip,false);
  this.objects=this.objects.filter(o=>!remove.has(o.id));this.objectFrames=this.objectFrames.filter(o=>!remove.has(o.id));this.frameById=new Map(this.objectFrames.map(o=>[o.id,o]));this.objectById=new Map(this.objects.map(o=>[o.id,o]));
  if(remove.has(this.driveId))this.driveId=null;if(remove.has(this.freeReferenceId)){this.freeReferenceId=null;this.freeReferencePosition=null;}
  if(remove.has(this.selectedId))this.selectedId=this.objects[0]?.id||null;
  if(remove.has(this.warpObjectId)){this.warpObjectId=null;this.state.warp=false;}
  if(bridgeShip)this.bridgeObjectId=this.objects.find(o=>['enterprise','shuttle','astronaut','heighliner','blackhole','whitehole'].includes(o.type))?.id||null;
  this.refreshConfiguration();if(bridgeShip&&(wasFocused||!this.focusId))this.resetCamera();return true;
 }
 removeObject(id){
  if(!this.objects.some(o=>o.id===id))return false;const remove=new Set([id]);let changed=true;
  while(changed){changed=false;for(const object of this.objects)if((remove.has(object.parentId)||remove.has(object.referenceId))&&!remove.has(object.id)){remove.add(object.id);changed=true;}}
  return this.removeObjectSet(remove);
 }
 selectObject(id){if(!this.getObjectTree().some(o=>o.id===id))return false;this.selectedId=id;return true;}
 clearObjects(){this.releaseFocus(false,false);this.objects=[];this.selectedId=null;this.warpObjectId=null;this.bridgeObjectId=null;this.state.warp=false;this.refreshConfiguration();if(this.state.bridge)this.resetCamera();}
 getFocusFrame(id=this.focusId){
  if(['disk','jets','secondary-disk','secondary-jets'].includes(id)){const k=id.startsWith('secondary-')?1:0,owner=this.getFocusFrame(k?'secondary':'primary');if(!owner)return null;const disk=id.endsWith('disk');return {...owner,id,type:disk?'disk':'jets',radius:disk?this.configCache.diskOuter[k]:this.massScale*(k?this.state.binaryRatio:1)*12,frame:k?basis(this.configCache.secondaryAxis):this.configCache.primaryBasis,label:disk?'Accretion disc':'Polar jets'};}
  if(id==='bridge'&&this.state.bridge)return {id,type:'bridge',index:-1,position:[0,0,0],radius:this.configCache.bridgeRadius/2,physicalRadius:this.configCache.bridgeRadius,frame:[[1,0,0],[0,1,0],[0,0,1]],label:'Bridge throat'};
  if(id==='primary'||id==='secondary'){
   const k=id==='primary'?0:1;if(!this.state.blackHole||(k===1&&!this.state.binary)||!(this.holeData[k*4+3]>0))return null;
   const spin=k?this.state.secondarySpin:this.state.spin,mass=this.holeData[k*4+3];return {id,type:'hole',index:-1,whiteHole:k?!!this.state.secondaryWhiteHole:!!this.state.whiteHole,velocity:this.holeVelocities?.[k]||[0,0,0],spinParameter:spin,massSolar:mass*REFERENCE_MASS*1e6,collapsed:true,horizonRadius:this.configCache.horizon[k],innerHorizonRadius:mass*(1-Math.sqrt(1-spin*spin)),singularityRadius:mass*Math.abs(spin),position:Array.from(this.holeData.slice(k*4,k*4+3)),radius:this.configCache.horizon[k],frame:[[1,0,0],[0,1,0],[0,0,1]],label:holeDisplayName(this.state,k,SCENE_PRESETS.find(scene=>scene.id===this.sceneId))};
  }
  return this.frameById?.get(id)||this.objectFrames.find(o=>o.id===id)||null;
 }
 getSceneTargets(objects=this.getObjects(),tree=this.getObjectTree()){
  const targets=[];
  if(this.state.bridge)targets.push({id:'bridge',label:'Bridge throat',kind:'bridge',canTrack:true,canBoard:false,enabled:true});
  if(this.state.blackHole){targets.push({id:'primary',label:tree.find(o=>o.id==='primary')?.label||'Primary black hole',kind:'hole',canTrack:true,canBoard:true,enabled:true});if(this.state.binary)targets.push({id:'secondary',label:tree.find(o=>o.id==='secondary')?.label||'Binary companion',kind:'hole',canTrack:true,canBoard:true,enabled:true});}
  if(this.state.planet)targets.push({id:'planet',label:'Environment planet',kind:'planet',canTrack:true,canBoard:true,enabled:true});
  if(this.state.tidalStar)targets.push({id:'tidalStar',label:'Disrupting star',kind:'star',canTrack:true,canBoard:true,enabled:true});
  for(const node of tree.filter(n=>['disk','jets'].includes(n.type)&&n.component))targets.push({...node,kind:node.type,canTrack:true,canBoard:false});
  for(const item of objects){const target={...item};target.kind=item.type;target.canTrack=true;target.canBoard=!['ring','belt','disk','jets'].includes(item.type);target.enabled=true;targets.push(target);}
  return targets;
 }
 focusObject(id,mode='track'){return this.objects.some(o=>o.id===id)?this.focusTarget(id,mode):false;}
 focusTarget(id,mode='track',prepared=false,reset=false){
  this.focusReferenceFrame=null;this.cameraGuide=null;
  if(!reset&&id===this.focusId&&mode==='track'&&['onboard','chase'].includes(this.focusMode)){this.detachRide();return true;}
  if(!prepared){this.fillHoles();this.fillObjects();}const obj=this.getFocusFrame(id);if(!obj||(['bridge','ring','belt','disk','jets'].includes(obj.type)&&mode==='onboard'))return false;
  if(!this.focusId)this.savedOverview={camera:{...this.camera},target:{...this.target},viewMode:this.state.viewMode,travel:this.travel,freePosition:this.freePosition?[...this.freePosition]:null,freeTarget:this.freeTarget?[...this.freeTarget]:null,freeBasis:this.freeBasis?{forward:[...this.freeBasis.forward],right:[...this.freeBasis.right],up:[...this.freeBasis.up]}:null};
  // Set the navigation mode directly: changing from free flight must not replace
  // this target camera with a radius measured about the scene origin.
  this.state.viewMode=['onboard','chase'].includes(mode)?'look':'orbit';this.freePosition=this.freeTarget=this.freeBasis=null;this.pointers.clear();this.pinchOwned=false;
  if(this.objects.some(o=>o.id===id))this.selectedId=id;this.focusId=id;this.focusMode=['onboard','chase'].includes(mode)?mode:'track';this.travel=false;this.resetView();
  this.target.yaw=.7;this.target.pitch=.28;this.target.focusDistance=obj.type==='hole'?8:6;this.camera.yaw=this.target.yaw;this.camera.pitch=this.target.pitch;this.camera.focusDistance=this.target.focusDistance;if(mode==='track'&&['enterprise','shuttle'].includes(obj.type)){this.camera.yaw=this.target.yaw=Math.PI;this.camera.pitch=this.target.pitch=Math.atan2(1.44,4.32);this.camera.focusDistance=this.target.focusDistance=Math.hypot(1.44,4.32);this.camera.lookPitch=this.target.lookPitch=0;}if(reset&&mode==='track'&&obj.type==='enterprise'){this.cameraGuide='warp-side';this.camera.yaw=this.target.yaw=-Math.PI/2;this.camera.pitch=this.target.pitch=0;this.fitWarpCamera(true);}this.updateCameraFrame();this.xr?.recenter();return true;
 }
 releaseFocus(restore=true,includeState=true){
  this.focusReferenceFrame=null;this.cameraGuide=null;  this.freeReferenceId=null;this.freeReferencePosition=null;const saved=restore?this.savedOverview:null;this.focusId=null;this.focusMode=null;this.savedOverview=null;
  if(saved){this.camera={...saved.camera};this.target={...saved.target};this.travel=saved.travel;this.state.viewMode=saved.viewMode;this.freePosition=saved.freePosition;this.freeTarget=saved.freeTarget;this.freeBasis=saved.freeBasis;}
  else{this.state.viewMode='orbit';this.freePosition=this.freeTarget=this.freeBasis=null;this.resetView();}
  this.pointers.clear();this.pinchOwned=false;this.fillHoles();this.fillObjects();this.updateCameraFrame();this.xr?.recenter();return includeState?this.getState():undefined;
 }
 resetWarpTravel(){this.warpTravelWorld=0;this.warpTravelPosition=[0,0,0];this.warpTravelTime=this.time;}
 warpSpeedWorld(){const ship=this.objects.find(o=>o.id===this.warpObjectId);return this.state.warp&&this.state.warpScenario==='isolated'&&ship?this.objectRadius(ship)*effectiveWarpRadius(this.state.warpFactor)*.07*this.state.warpFactor:0;}
 loadScene(id='disk'){
  const preset=SCENE_PRESETS.find(p=>p.id===id)||SCENE_PRESETS[0],paused=true;
  this.clearObjects();this.focusReferenceFrame=null;this.transfer=null;this.lastTransfer=null;this.travelTargetCache=null;this.driveId=null;this.freeReferenceId=null;this.freeReferencePosition=null;this.sceneId=preset.id;this.state={...makePreset(preset.id),paused,objectScaleMode:'physical'};this.refreshConfiguration();this.time=0;this.orbitOverrides={};this.bridgeTime=0;this.bridgeTravelTime=0;this.resetWarpTravel();
  this.state.grid=this.state.warpGrid=!!(this.state.grid||this.state.warpGrid||this.state.spectrum==='geometry');this.flightInput={speed:0,curvature:0,torsion:0};
  // Presets are validated at build time. Instantiate their graph in one batch;
  // normal user additions still pass canParentObject and its full safety rules.
  const cacheable=(preset.objects?.length||0)>=32,signature=cacheable?JSON.stringify([preset.objects,this.state]):null,cached=cacheable?PRESET_OBJECT_TEMPLATES.get(preset):null;
  if(cached&&cached.signature===signature){
   // Fresh records/arrays keep edits and flight state isolated from the template.
   const objects=JSON.parse(cached.objects),ids=new Map(objects.map(object=>[object.id,`body-${this.nextObjectId++}`]));
   for(const [index,key]of cached.negativeZeros)objects[index][key]=-0;
   for(const object of objects){object.id=ids.get(object.id);object.parentId=ids.get(object.parentId)||object.parentId;if(object.referenceId)object.referenceId=ids.get(object.referenceId)||object.referenceId;}
   this.objects=objects;this.selectedId=objects.at(-1)?.id||null;
  }else{
   this.buildingScene=true;this.sceneBuildObjects=new Map();const keys=new Map();
   try{
    for(const entry of preset.objects||[]){
     const parentId=entry.parentKey?keys.get(entry.parentKey):entry.parentId;
     const added=this.addObject(entry.type,entry.radius,entry.phase,entry.scale);if(!added)continue;
     const object=this.objects[this.objects.length-1];
     if(parentId!==undefined){object.parentId=parentId;object.referenceId=null;object.placement=parentId==='space'?'local':'orbit';if(parentId==='space'){object.x=entry.x??0;object.y=entry.y??0;object.z=entry.z??0;}else if(entry.orbitMeters)object.orbitMeters=entry.orbitMeters;}
     this.updateObject(object.id,entry);if(entry.key)keys.set(entry.key,object.id);
    }
    if(cacheable){
     // JSON cloning is fast on old browsers too. Preserve signed scalar zeros
     // explicitly (catalog orbital phases can contain -0).
     const negativeZeros=[];for(let index=0;index<this.objects.length;index++)for(const key in this.objects[index])if(Object.is(this.objects[index][key],-0))negativeZeros.push([index,key]);
     PRESET_OBJECT_TEMPLATES.set(preset,{signature,objects:JSON.stringify(this.objects),negativeZeros});
    }
   }finally{this.buildingScene=false;this.sceneBuildObjects=null;}
  }
  if(this.state.warp){const ship=this.objects.find(o=>o.type==='enterprise')||this.addObject('enterprise',14,1.3,1);if(ship){this.warpObjectId=ship.id;this.selectedId=ship.id;const raw=this.objects.find(o=>o.id===ship.id);raw.warpEnabled=true;}}
  this.bridgeObjectId=this.state.bridge?this.objects.find(o=>['enterprise','shuttle','astronaut','heighliner','blackhole','whitehole'].includes(o.type))?.id||null:null;this.sceneFocusId=Number.isInteger(preset.camera?.focusIndex)?this.objects[preset.camera.focusIndex]?.id||null:this.state.warp&&this.state.warpScenario==='isolated'?this.warpObjectId:null;this.refreshConfiguration();return this.resetCamera();
 }
 loadWarpScenario(mode='isolated'){return this.loadScene(mode==='orbit'?'warp-orbit':mode==='excursion'?'warp-excursion':'warp-lab');}
 getObjects(){
  // Decorate one shallow copy; avoid repeatedly rebuilding wide catalog records.
  const f=this.cameraFrame,rect=this.canvas.getBoundingClientRect(),aspect=rect.width/Math.max(1,rect.height),fov=.83*Math.max(1,1.35/aspect);return this.objects.map(obj=>{
   const entry=this.frameById?.get(obj.id)||this.objectFrames.find(x=>x.id===obj.id),dimension=OBJECT_DIMENSIONS[obj.type],phase=wrap(this.currentPhase(obj)),radiusMeters=this.objectRadius(obj)*REFERENCE_RG_METERS;let screenX=.5,screenY=.5,visible=false,screenRadius=0;if(f&&entry){const q=entry.position.map((x,i)=>x-f.observer[i]),depth=dot(q,f.forward);screenX=.5+dot(q,f.right)/(depth*fov*aspect);screenY=.5-dot(q,f.up)/(depth*fov);screenRadius=entry.radius/Math.max(depth,1e-20)/fov;visible=depth>0&&screenX>-.05&&screenX<1.05&&screenY>-.05&&screenY<1.05;}
   const item={...obj};
   if(obj.placement==='orbit'&&obj.orbitMeters&&['primary','secondary'].includes(obj.parentId)){const unit=this.massScale*REFERENCE_RG_METERS;item.radius=obj.orbitMeters/unit;item.height=(obj.heightMeters||0)/unit;}
   item.freeDrive=this.driveId===obj.id;
   item.motion=obj.motion||'orbit';
   item.motionDescription=obj.motion==='infall'?'Illustrative inward approach; slows to a stop outside the horizon.':obj.motion==='horizon'?'Fixed just outside the horizon, facing outward; not a freely falling observer.':'Prescribed circular orbit.';
   item.luminosity=Math.pow(10,clamp(Number(obj.logLuminosity)||0,0,8));
   item.placement=this.state.bridge&&obj.id===this.bridgeObjectId?'bridge':obj.placement||'orbit';
   item.referenceLabel=obj.referenceId?(OBJECT_TYPES.find(t=>t.id===this.objects.find(o=>o.id===obj.referenceId)?.type)?.label||'World origin'):'World origin';
   item.headingDegrees=phase*180/Math.PI;
   item.warpEnabled=obj.type==='enterprise'&&this.state.warp&&obj.id===this.warpObjectId;
   item.bridgeTraveler=this.state.bridge&&obj.id===this.bridgeObjectId;
   item.phase=phase;
   item.label=obj.name||OBJECT_TYPES.find(t=>t.id===obj.type)?.label||obj.type;
   item.lengthMeters=isCompactType(obj.type)?2*radiusMeters:obj.radiusMeters?radiusMeters*dimension.normalizedExtent:dimension.lengthMeters*obj.scale;
   item.renderRadiusMeters=radiusMeters;
   item.physicalDescription=isCompactType(obj.type)?`${Number(this.objectMassSolar(obj).toPrecision(3)).toLocaleString()} solar-mass horizon diameter`:dimension.description;
   item.selected=obj.id===this.selectedId;
   item.focused=obj.id===this.focusId;
   item.screenX=screenX;
   item.screenY=screenY;
   item.visible=visible;
   item.screenRadius=screenRadius;
   item.currentRadius=entry?Math.hypot(...entry.position.map((x,i)=>x-this.holeData[i]))/this.massScale:obj.radius;
   item.position=entry?[...entry.position]:null;
   return item;
  });
 }
 getState(){const objectTree=this.getObjectTree(),objects=this.getObjects(),sceneTargets=this.getSceneTargets(objects,objectTree),observerRadius=Math.hypot(...(this.cameraFrame?.observer||[0,0,this.camera.distance])),throat=(this.configCache.bridgeRadius||1)/2;return {...this.state,playbackSpeedLimit:this.playbackSpeedLimit(),effectivePlaybackSpeed:this.effectivePlaybackSpeed(),orbitDisplayPeriodSeconds:this.orbitDisplayPeriodSeconds(),flight:this.getFlightState(),travelTransfer:this.getTravelState(),mergerProgress:this.mergerProgress||0,mergerComplete:!!this.mergerComplete,objectTree,lastTreeError:this.lastTreeError||'',driveId:this.driveId||null,objectContext:this.getObjectContext(),bridgeRegion:observerRadius>throat*1.04?'near':observerRadius<throat*.96?'far':'throat',bridgePhase:bridgeJourney(this.bridgeTime,this.configCache.bridgeRadius,this.state.bridgeLifecycle).phase,fps:Math.round(this.fps||0),scale:this.renderScale||0,steps:this.steps,width:this.canvas.width||0,height:this.canvas.height||0,webgl:this.webgl2?2:1,sceneId:this.sceneId,vrActive:!!this.xr?.active,vrError:this.xr?.lastError||'',photoActive:this.photoActive,camera:{...this.camera},distance:this.cameraFrame?Math.hypot(...this.cameraFrame.observer)/this.massScale:this.camera.distance/this.massScale,worldDistance:this.cameraFrame?Math.hypot(...this.cameraFrame.observer):this.camera.distance,horizonRg:horizonRg(this.state.spin),iscoRg:iscoRg(this.state.spin),quality:this.quality,effectiveQuality:this.budget.effectiveQuality,adaptiveLevel:this.budget.level,adaptiveStatus:this.budget.adaptiveStatus,adaptiveReason:this.budget.adaptiveReason,targetFps:30,minimumFps:15,probePending:this.budget.probing,qualityReduced:this.budget.pixelScale<1,adaptivePixelScale:this.budget.pixelScale,surfaceRefining:!!this.planetTextures?.pending,surfaceWarning:this.textureError||'',shaderCompiling:!!this.pendingProgram||this.warmupFrames>0||!!this.gpuFence?.warmup,presentationPaused:this.presentationPaused,gpuWaiting:!!this.gpuFence,frameBudgetMs:this.budget.frameMs,objectCount:this.objects.length,travel:this.travel,maxObjects:MAX_SCENE_OBJECTS,renderedObjectCount:this.objectCount||0,gpuObjectLimit:this.gpuObjectLimit||12,uniformVectorLimit:this.uniformVectorLimit||null,viewYaw:this.camera.lookYaw*180/Math.PI,viewPitch:this.camera.lookPitch*180/Math.PI,selectedId:this.selectedId,focusId:this.focusId,focusMode:this.focusMode,focusLabel:sceneTargets.find(t=>t.id===this.focusId)?.label||null,warpObjectId:this.warpObjectId,bridgeObjectId:this.bridgeObjectId,cameraDistanceMeters:this.focusId?Math.hypot(...(this.cameraFrame?.inspectCamera||[0,0,this.camera.focusDistance]))*(this.getFocusFrame()?.physicalRadius||this.getFocusFrame()?.radius||0)*REFERENCE_RG_METERS:this.camera.distance*REFERENCE_RG_METERS,objects,sceneTargets,warpTravelMeters:this.warpTravelWorld*REFERENCE_RG_METERS,warpSpeedMetersPerSecond:this.warpSpeedWorld()*REFERENCE_RG_METERS};}
 fillHoles(){
  const s=this.state,m=this.massScale,h=this.holeData,previous=Array.from(h);h.fill(0);h[3]=m;this.mergerProgress=0;this.mergerComplete=false;this.holeVelocities=[[0,0,0],[0,0,0]];
  this.cancellationFlat=false;this.cancellationFraction=1;
  if(s.binary){const total=m*(1+s.binaryRatio),initialSecondary=m*s.binaryRatio,progress=s.binaryMotion==='merger'?clamp(this.time/(s.mergerDuration||45),0,1):0,t=clamp(progress/.82,0,1),smooth=t*t*(3-2*t),fusion=clamp((progress-.82)/.18,0,1),blend=fusion*fusion*(3-2*fusion),secondary=initialSecondary*(1-blend),primary=total-secondary;
   const initialD=s.binarySeparation*m,d=initialD*(1-smooth)+.3*total*smooth,duration=s.mergerDuration||45,omega=15*Math.sqrt(total/Math.pow(initialD,3)),angle=this.componentOrbitPhase('secondary',omega)-30*progress**3,r1=d*secondary/total,r2=d*primary/total;
   const dp=progress>0&&progress<1?1/duration:0,dsmooth=t>0&&t<1?6*t*(1-t)*dp/.82:0,dd=(.3*total-initialD)*dsmooth,df=fusion>0&&fusion<1?6*fusion*(1-fusion)*dp/.18:0,dm2=-initialSecondary*df,da=-omega-90*progress*progress*dp,dr1=(dd*secondary+d*dm2)/total,dr2=(dd*primary-d*dm2)/total;
   this.holeVelocities=[[Math.cos(angle)*dr1-Math.sin(angle)*r1*da,0,Math.sin(angle)*dr1+Math.cos(angle)*r1*da],[-Math.cos(angle)*dr2+Math.sin(angle)*r2*da,0,-Math.sin(angle)*dr2-Math.cos(angle)*r2*da]];
   h[0]=Math.cos(angle)*r1;h[2]=Math.sin(angle)*r1;h[3]=primary;h[4]=-Math.cos(angle)*r2;h[6]=-Math.sin(angle)*r2;h[7]=secondary;this.mergerProgress=progress;this.mergerComplete=progress>=1;
   if(this.mergerComplete){h[4]=h[5]=h[6]=0;h[7]=0;this.holeVelocities=[[0,0,0],[0,0,0]];}
  }
  if(s.binary&&s.binaryMotion==='merger'&&s.mergerOutcome==='illustrative-cancellation'&&s.whiteHole!==s.secondaryWhiteHole){
   const duration=s.mergerDuration||45,pair=illustrativeCancellationPair({primaryMass:m,secondaryMass:m*s.binaryRatio,primarySpin:s.spin,secondarySpin:s.secondarySpin,initialSeparation:s.binarySeparation*m,progress:this.time/duration});
   const omega=15*Math.sqrt(m*(1+s.binaryRatio)/Math.pow(s.binarySeparation*m,3)),angle=this.componentOrbitPhase('secondary',omega)-30*pair.progress**3,da=pair.complete?0:-omega-90*pair.progress**2/duration;
   const d=pair.separation,dd=pair.separationRate/duration,r1=d*pair.primaryOrbitFraction,r2=d*pair.secondaryOrbitFraction,dr1=dd*pair.primaryOrbitFraction,dr2=dd*pair.secondaryOrbitFraction,co=Math.cos(angle),si=Math.sin(angle);
   h[0]=co*r1;h[2]=si*r1;h[3]=pair.primary;h[4]=-co*r2;h[6]=-si*r2;h[7]=pair.secondary;
   this.holeVelocities=[[co*dr1-si*r1*da,0,si*dr1+co*r1*da],[-co*dr2+si*r2*da,0,-si*dr2-co*r2*da]];
   this.mergerProgress=pair.progress;this.mergerComplete=pair.complete;this.cancellationFlat=pair.flat;this.cancellationFraction=pair.remainingFraction;
  }
  this.configCache.horizon=[h[3]*horizonRg(s.spin),h[7]*horizonRg(s.secondarySpin)];
  if(s.binaryMotion==='merger'&&s.binary){const separation=Math.hypot(h[0]-h[4],h[2]-h[6]);this.configCache.diskOuter=[0,1].map(k=>{const mass=h[k*4+3],other=h[(1-k)*4+3],extent=(k?s.secondaryDiskOuter:s.diskOuter)*mass;return mass<=0?0:other<=0?extent:Math.min(extent,.65*separation*rocheFraction(mass/other));});}
  if(h.some((v,i)=>v!==previous[i]))this.holeRevision=(this.holeRevision||0)+1;
 }
 protectObserver(){
  if(this.state.interiorView&&this.state.spectrum==='geometry')return;
  if(this.state.viewMode==='free'){if(this.freePosition)this.freePosition=this.safeObserver(this.freePosition);if(this.freeTarget)this.freeTarget=this.safeObserver(this.freeTarget);return;}if(!this.state.blackHole||this.focusId)return;
  if(!this.state.binary){this.camera.distance=Math.max(this.minDistance,this.camera.distance);return;}
  const c=this.camera,dir=[Math.cos(c.pitch)*Math.sin(c.yaw),Math.sin(c.pitch),Math.cos(c.pitch)*Math.cos(c.yaw)];
  for(let k=0;k<2;k++){const o=k*4,h=this.holeData,rr=this.configCache.horizon[k]*1.012,x=dir[0]*c.distance-h[o],y=dir[1]*c.distance-h[o+1],z=dir[2]*c.distance-h[o+2];if(x*x+y*y+z*z<rr*rr){const along=dir[0]*h[o]+dir[1]*h[o+1]+dir[2]*h[o+2],perp=h[o]*h[o]+h[o+1]*h[o+1]+h[o+2]*h[o+2]-along*along;c.distance=Math.max(.05*this.massScale,along+Math.sqrt(Math.max(0,rr*rr-perp))+.02*this.massScale);this.target.distance=c.distance;}}
 }
 infallState(object,size){
  const m=this.massScale,exterior=compactExteriorRadius(this.configCache.horizon[0],size),start=Math.max(exterior+.5*m,object.radius*m),elapsed=Math.max(0,this.time-(object.motionEpoch||0));
  if(this.sceneId==='radiant-descent'){
   const remaining=Math.max(0,1-elapsed/10),progress=remaining**3,rate=elapsed<10?-3*remaining*remaining/10:0;
   return {radius:exterior+(start-exterior)*progress,height:object.height*m*progress,radialSpeed:(start-exterior)*rate,heightSpeed:object.height*m*rate};
  }
  const progress=Math.exp(-elapsed/75),radius=exterior+(start-exterior)*progress,height=object.height*m*radius/start;
  return {radius,height,radialSpeed:-(radius-exterior)/75,heightSpeed:-height/75};
 }
 fillObjects(){
  const metadataChanged=this.lastGeometryRevision!==this.geometryRevision||this.lastGeometryCount!==this.objects.length||this.geometryObjects!==this.objects;
  if(!metadataChanged&&this.lastGeometryTime===this.time&&this.lastGeometryHoles===(this.holeRevision||0)&&!this.driveId&&!this.objects.some(o=>o.driveReturn)){this.packRenderObjects(this.cameraFrame);return this.objectCount;}
  const previousFrames=this.frameById||new Map();
  this.lastGeometryTime=this.time;this.lastGeometryRevision=this.geometryRevision;this.lastGeometryCount=this.objects.length;this.lastGeometryHoles=this.holeRevision||0;
  const s=this.state,m=this.massScale,b=this.configCache.primaryBasis,h=this.holeData;
  const holeVelocity=k=>this.holeVelocities?.[k]||[0,0,0];
  // Orbital planes, masses and body dimensions change only with a geometry
  // revision. Keep every catalog body in the logical model, but do not rebuild
  // its static transforms and hierarchy on every animation frame.
  if(metadataChanged){
   this.geometryObjects=this.objects;this.objectById=new Map(this.objects.map(o=>[o.id,o]));this.barycentricByParent=new Map(this.objects.filter(o=>o.barycentric).map(o=>[o.parentId,o]));
   this.orbitGeometryById=new Map();this.orbitPairs=new Map();
   for(const object of this.objects){
    const parent=this.objectById.get(object.parentId),equator=radians(String(object.orbitReferenceFrame||'').toLowerCase()==='equatorial'?(parent?.axialTilt||0):0),inc=radians(object.orbitInclination||0),node=radians(object.orbitNode||0),peri=radians(object.argumentPeriapsis||0);
    const ci=Math.cos(inc),si=Math.sin(inc),cn=Math.cos(node),sn=Math.sin(node),ce=Math.cos(equator),se=Math.sin(equator);
    const rotate=v=>{const y=v[1]*ci-v[2]*si,z=v[1]*si+v[2]*ci,xx=v[0]*cn+z*sn,zz=-v[0]*sn+z*cn;return transform(b,[xx,y*ce-zz*se,y*se+zz*ce]);};
    const e=object.eccentricity||0,height=object.orbitMeters?(object.heightMeters||0)/REFERENCE_RG_METERS:(object.height||0)*m;
    const compact=object.type==='blackhole'||object.type==='whitehole',stellarSource=compact?{...object,massSolar:object.massSolar||10,radiusMeters:1,angularVelocity:0}:object,stellar=object.type==='star'||compact?stellarInfo(stellarSource,this.time):null;
    this.orbitGeometryById.set(object.id,{omega:this.orbitalOmega(object),radius:this.objectRadius(object),mass:this.objectMassSolar(object),stellar,stellarSource,compact,style:object.type==='star'?STELLAR_STYLE_IDS.indexOf(object.starStyle):['rocky','gas','ice','ocean'].indexOf(object.planetStyle),e,minorRatio:Math.sqrt(1-e*e),semiMajor:object.orbitMeters?object.orbitMeters/REFERENCE_RG_METERS:object.radius*m,periCos:Math.cos(peri),periSin:Math.sin(peri),basis:[rotate([1,0,0]),rotate([0,1,0]),rotate([0,0,1])],height:transform(b,[0,height*ce,height*se])});
    if(parent&&((OBJECT_CLASS[parent.type]===OBJECT_CLASS[object.type]&&!compactSatellite(object.type,this.objectMassSolar(object),parent.type,this.objectMassSolar(parent)))||object.barycentric))this.orbitPairs.set(parent.id,object);
   }
   for(const [parentId,object]of this.orbitPairs){const child=this.orbitGeometryById.get(object.id),parent=this.orbitGeometryById.get(parentId);child.pairRatio=child.mass/Math.max(1e-30,parent.mass+child.mass);}
  }
  const elapsed=this.time-this.warpTravelTime;
  if(elapsed<0){this.warpTravelWorld=0;this.warpTravelPosition=[0,0,0];}
  else if(elapsed>0&&this.driveId!==this.warpObjectId){const travel=elapsed*this.warpSpeedWorld(),ship=this.objectById.get(this.warpObjectId);this.warpTravelWorld+=travel;if(travel&&ship){const sine=Math.sin(ship.phase),cosine=Math.cos(ship.phase);for(let i=0;i<3;i++)this.warpTravelPosition[i]+=travel*(b[0][i]*sine-b[2][i]*cosine);}}
  this.warpTravelTime=this.time;this.objectFrames=[];if(metadataChanged)this.frameById=new Map();
  const put=(type,r,angle,size,baseColor,height=0,id=null,headingAngle=angle)=>{
   const x=Math.cos(angle)*r,z=Math.sin(angle)*r,ch=Math.cos(headingAngle),sh=Math.sin(headingAngle),bx=b[0],by=b[1],bz=b[2];
   const position=[h[0]+bx[0]*x+by[0]*height+bz[0]*z,h[1]+bx[1]*x+by[1]*height+bz[1]*z,h[2]+bx[2]*x+by[2]*height+bz[2]*z];
   const frame=[[bx[0]*-ch+bz[0]*-sh,bx[1]*-ch+bz[1]*-sh,bx[2]*-ch+bz[2]*-sh],by,[bx[0]*sh+bz[0]*-ch,bx[1]*sh+bz[1]*-ch,bx[2]*sh+bz[2]*-ch]];
   const entry=previousFrames.get(id)||{};Object.assign(entry,{id,type,index:-1,position,radius:Math.max(1e-14,size),frame,angle,headingAngle,velocity:[0,0,0]});if(metadataChanged||!entry.tint)Object.assign(entry,{tint:baseColor,bodyParams:[0,.35,.35,1],massSolar:type==='star'?1:type==='planet'?3.00349e-6:1e-26,luminosity:1});
   this.objectFrames.push(entry);this.frameById.set(id,entry);return entry;
  };
  if(s.planet){const r=s.planetDistance*m,planetWorldMass=s.planetMass*3.00349e-6/(REFERENCE_MASS*1e6),omega=18*Math.sqrt((m+planetWorldMass)/(r*r*r));const entry=put('planet',r,this.componentOrbitPhase('planet',omega,1.15),this.bodyRadius('planet',s.planetRadius),this.configCache.planetColor,.10*m,'planet');entry.massSolar=s.planetMass*3.00349e-6;entry.velocity=add(holeVelocity(0),transform(b,[Math.sin(entry.angle)*r*omega,0,-Math.cos(entry.angle)*r*omega]));}
  const cycle=(this.time*.027*s.disruptionStrength)%1,stop=Math.max(2.1,horizonRg(s.spin)+.4),r=(s.starDistance-cycle*(s.starDistance-stop))*m,phase=.4-this.time*.32-cycle*3;
  this.tidalData.set([r,phase,cycle,s.disruptionStrength]);
  if(s.tidalStar){const size=this.bodyRadius('star',s.starRadius)*Math.pow(Math.max(.002,1-cycle),.6*s.disruptionStrength);put('star',r,phase,size,this.configCache.starColor,0,'tidalStar');}
  for(const obj of this.objects){
   const geometry=this.orbitGeometryById.get(obj.id),omega=geometry.omega,fixedPhase=obj.placement==='local'||obj.motion==='horizon'||obj.motion==='infall'||s.bridge&&obj.id===this.bridgeObjectId||s.warp&&obj.id===this.warpObjectId&&s.warpScenario!=='orbit';
   let radius=obj.placement==='local'?0:obj.radius*m,angle=fixedPhase?obj.phase:obj.phase-(this.time-(obj.epoch||0))*omega,headingAngle=angle,height=obj.placement==='local'?0:obj.height*m,infall=null;const size=obj.type==='star'&&obj.collapseEnabled?this.objectRadius(obj):geometry.radius;
   if(s.blackHole&&(obj.motion==='infall'||obj.motion==='horizon')){
    infall=this.infallState(obj,size);radius=obj.motion==='horizon'?compactExteriorRadius(this.configCache.horizon[0],size):infall.radius;height=obj.motion==='horizon'?0:infall.height;headingAngle=angle+(obj.motion==='horizon'?Math.PI/2:-Math.PI/2);
   }
   if(s.warp&&obj.id===this.warpObjectId){if(s.warpScenario==='isolated'){radius=0;height=0;angle=obj.phase;}else if(s.warpScenario==='excursion'){const bubble=size*effectiveWarpRadius(s.warpFactor),near=this.configCache.horizon[0]+bubble+.18*m,far=Math.max(near+3*m,obj.radius*m);radius=near+(far-near)*(.5+.5*Math.cos(this.time*.16));angle=obj.phase;headingAngle=angle-Math.PI/2+Math.PI*(1-Math.tanh(Math.sin(this.time*.16)*8))/2;height=obj.height*m*.2;}}
   const entry=put(obj.type,radius,angle,size,metadataChanged?color(obj.surfaceId>0?(obj.surfaceTint||'#ffffff'):obj.color,obj.type==='star'?'#ff9e40':obj.type==='probe'?'#d1deeb':'#0f4791'):previousFrames.get(obj.id)?.tint,height,obj.id,headingAngle);
   if(metadataChanged)Object.assign(entry,{...obj,index:-1,position:entry.position,radius:entry.radius,frame:entry.frame,headingAngle:entry.headingAngle,massSolar:geometry.mass});
   const style=geometry.style;
   if(metadataChanged)entry.bodyParams=['ring','belt','disk','jets'].includes(obj.type)?[['rocky','icy','metallic'].indexOf(obj.material||'rocky'),obj.innerRadiusRatio??.55,obj.thicknessRatio??.015,obj.opacity??.78]:[Math.max(0,style),obj.spots??.35,obj.corona??.35,obj.rotation??1];
   if(geometry.stellar){const compact=geometry.compact,info=obj.collapseEnabled?stellarInfo(geometry.stellarSource,this.time):geometry.stellar;entry.stellar=info;entry.collapsed=compact||info.collapsed;entry.spinParameter=info.spinParameter;entry.horizonRadius=info.horizonMeters/REFERENCE_RG_METERS;entry.innerHorizonRadius=info.innerHorizonMeters/REFERENCE_RG_METERS;entry.singularityRadius=info.singularityRadiusMeters/REFERENCE_RG_METERS;entry.whiteHole=obj.type==='whitehole';entry.radius=(entry.collapsed?info.horizonMeters:info.radiusMeters)/REFERENCE_RG_METERS;entry.massSolar=info.massSolar;entry.bodyParams=[compact?(obj.type==='whitehole'?9:8):Math.max(0,style),obj.spots??.35,entry.collapsed?-Math.max(1e-6,entry.horizonRadius/entry.radius):(obj.corona??.35),info.angularVelocity*18*REFERENCE_RG_METERS/LIGHT_SPEED];}
   if(['disk','jets'].includes(obj.type)){entry.diskPalette=obj.diskPalette||'physical';entry.bodyParams=obj.type==='disk'?[Math.max(0,ENUMS.diskStyle.indexOf(obj.diskStyle||'thermal')),obj.diskThickness??1,obj.diskDensity??1,0]:[obj.jetSpread??1,1,obj.jetIntensity??1,0];entry.massSolar=0;}
   entry.velocity=obj.placement==='local'?[0,0,0]:add(holeVelocity(0),transform(b,[Math.sin(angle)*radius*omega,0,-Math.cos(angle)*radius*omega]));
   if(s.blackHole&&obj.motion==='horizon')entry.velocity=holeVelocity(0);
   if(s.blackHole&&obj.motion==='infall'){const radial=infall.radialSpeed;entry.velocity=add(holeVelocity(0),transform(b,[Math.cos(angle)*radial,infall.heightSpeed,Math.sin(angle)*radial]));}
   entry.luminosity=obj.type==='probe'?Math.pow(10,clamp(Number(obj.logLuminosity)||0,0,8)):1;
   if(obj.placement==='local')entry.position=[obj.x||0,obj.y||0,obj.z||0].map(v=>v/REFERENCE_RG_METERS);
   if(s.warp&&obj.id===this.warpObjectId&&s.warpScenario==='isolated'){entry.position=[...this.warpTravelPosition];entry.velocity=transform(b,[Math.sin(obj.phase)*this.warpSpeedWorld(),0,-Math.cos(obj.phase)*this.warpSpeedWorld()]);[obj.x,obj.y,obj.z]=entry.position.map(v=>v*REFERENCE_RG_METERS);}
   if(this.sceneId==='gravity-anomaly'&&obj.id===this.warpObjectId&&this.driveId!==obj.id){const field=this.objects.find(o=>o.type==='anomaly');if(field){const center=[field.x||0,field.y||0,field.z||0].map(v=>v/REFERENCE_RG_METERS),R=this.objectRadius(field),route=anomalyCruise(this.warpTravelWorld/Math.max(R*.25,1e-20),center,R);entry.position=route.position;entry.velocity=mul(route.forward,this.warpSpeedWorld());entry.frame=[unit(cross(b[1],route.forward)),b[1],route.forward];this.warpTravelPosition=[...entry.position];[obj.x,obj.y,obj.z]=entry.position.map(v=>v*REFERENCE_RG_METERS);}}
  }
  const bridgeElapsed=this.time-this.bridgeTravelTime;if(bridgeElapsed<0)this.bridgeTime=Math.max(0,this.time);else if(s.bridge&&s.bridgeTravel!==false&&this.driveId!==this.bridgeObjectId)this.bridgeTime+=bridgeElapsed;this.bridgeTravelTime=this.time;
  if(s.bridge){const ship=this.frameById.get(this.bridgeObjectId);if(ship){const physicalRadius=this.objectRadius(this.objectById.get(ship.id)),path=bridgeJourney(this.bridgeTime,this.configCache.bridgeRadius,s.bridgeLifecycle),driving=this.objectById.get(ship.id)?.drivePosition,conformal=bridgeConformal(driving?Math.hypot(...driving):path.r,this.configCache.bridgeRadius);ship.position=driving?[...driving]:mul(b[2],path.r);ship.physicalRadius=physicalRadius;ship.radius=physicalRadius/conformal;if(ship.collapsed){ship.horizonRadius=ship.radius;ship.innerHorizonRadius=0;ship.singularityRadius=0;}ship.headingAngle=path.headingAngle??(path.inward?0:Math.PI);if(Number.isFinite(path.headingAngle)){const c=Math.cos(path.headingAngle),sn=Math.sin(path.headingAngle);ship.frame=[b[0].map((v,i)=>-v*c+b[2][i]*sn),b[1],b[2].map((v,i)=>-v*c-b[0][i]*sn)];}else ship.frame=path.inward?[mul(b[0],-1),b[1],mul(b[2],-1)]:[b[0],b[1],b[2]];}}
  // Logical coordinates are resolved in doubles independently of the small
  // GPU list. A focused moon can therefore be reached even when it was culled.
  const resolved=new Set(),resolving=new Set(),pairs=this.orbitPairs,orbitVelocities=new Map(),orbitOffsets=new Map();
  const orbitOffset=object=>{
   if(orbitOffsets.has(object.id))return orbitOffsets.get(object.id);
   const g=this.orbitGeometryById.get(object.id),rr=g.semiMajor,e=g.e,mean=wrap(this.frameById.get(object.id)?.angle??this.currentPhase(object));let anomaly=mean;
   for(let i=0;e>0&&i<7;i++)anomaly-=(anomaly-e*Math.sin(anomaly)-mean)/(1-e*Math.cos(anomaly));
   const ca=Math.cos(anomaly),sa=Math.sin(anomaly),xx0=(ca-e)*rr,zz0=sa*g.minorRatio*rr,x=xx0*g.periCos-zz0*g.periSin,z=xx0*g.periSin+zz0*g.periCos;
   const angular=-g.omega/(1-e*ca),vx=-sa*rr*angular,vz=ca*g.minorRatio*rr*angular,px=vx*g.periCos-vz*g.periSin,pz=vx*g.periSin+vz*g.periCos;
   orbitVelocities.set(object.id,transform(g.basis,[px,0,pz]));
   const offset=add(transform(g.basis,[x,0,z]),g.height);orbitOffsets.set(object.id,offset);return offset;
  };
  for(const id of ['planet','tidalStar']){const entry=this.frameById.get(id),paired=this.objects.find(o=>o.parentId===id&&o.type===(id==='planet'?'planet':'star'));if(entry&&paired){const primaryMass=id==='planet'?s.planetMass*3.00349e-6:1,ratio=this.objectMassSolar(paired)/Math.max(1e-30,primaryMass+this.objectMassSolar(paired));entry.position=add(entry.position,mul(orbitOffset(paired),-ratio));entry.velocity=add(entry.velocity||[0,0,0],mul(orbitVelocities.get(paired.id)||[0,0,0],-ratio));}}
  const resolve=object=>{
   if(resolved.has(object.id)||resolving.has(object.id))return;resolving.add(object.id);
   const entry=this.frameById.get(object.id),parent=this.objectById.get(object.parentId||object.referenceId),legacy=this.objectById.get(object.referenceId);
   if(entry&&(object.id!==this.bridgeObjectId||object.drivePosition||object.driveReturn)&&(object.id!==this.warpObjectId||s.warpScenario==='orbit'||object.drivePosition||object.driveReturn)){
    if(object.placement==='local'&&legacy){resolve(legacy);const reference=this.frameById.get(legacy.id),factor=reference.physicalRadius?reference.radius/reference.physicalRadius:1;entry.position=add(reference.position,transform(reference.frame,[object.x||0,object.y||0,object.z||0].map(v=>v/REFERENCE_RG_METERS*factor)));entry.headingAngle=reference.headingAngle+object.phase;entry.velocity=[...reference.velocity];}
    else if(object.placement==='orbit'&&parent){resolve(parent);const reference=this.frameById.get(parent.id);entry.position=['ring','belt','disk','jets','dyson'].includes(object.type)?[...reference.position]:add(reference.position,orbitOffset(object));entry.velocity=add(reference.velocity||[0,0,0],orbitVelocities.get(object.id)||[0,0,0]);
     const companion=object.orbitBarycenter?pairs.get(parent.id):null;if(companion){const ratio=this.orbitGeometryById.get(companion.id).pairRatio;entry.position=add(entry.position,mul(orbitOffset(companion),ratio));entry.velocity=add(entry.velocity,mul(orbitVelocities.get(companion.id)||[0,0,0],ratio));}
    }
    else if(object.placement==='orbit'&&['planet','tidalStar'].includes(object.parentId)){const reference=this.frameById.get(object.parentId);if(reference)entry.position=['ring','belt','disk','jets','dyson'].includes(object.type)?[...reference.position]:add(reference.position,orbitOffset(object));entry.velocity=add(reference.velocity||[0,0,0],orbitVelocities.get(object.id)||[0,0,0]);}
    else if(object.placement==='orbit'&&['primary','secondary'].includes(object.parentId)&&(!object.motion||object.motion==='orbit')){const k=object.parentId==='secondary'?1:0;entry.position=object.type==='dyson'?Array.from(h.slice(k*4,k*4+3)):add(Array.from(h.slice(k*4,k*4+3)),orbitOffset(object));entry.velocity=add(holeVelocity(k),orbitVelocities.get(object.id)||[0,0,0]);}
    const paired=pairs.get(object.id);if(paired){const ratio=this.orbitGeometryById.get(paired.id).pairRatio;entry.position=add(entry.position,mul(orbitOffset(paired),-ratio));entry.velocity=add(entry.velocity||[0,0,0],mul(orbitVelocities.get(paired.id)||[0,0,0],-ratio));}
    if(['disk','jets'].includes(object.type)&&parent){const reference=this.frameById.get(parent.id);entry.frame=reference.frame.map(v=>[...v]);entry.headingAngle=reference.headingAngle;entry.axialTilt=parent.axialTilt||0;entry.bodyParams[3]=reference.spinParameter||0;}
    if(object.drivePosition)entry.position=[...object.drivePosition];else if(object.driveReturn){const t=Math.min(1,object.driveReturn.elapsed/3),smooth=t*t*(3-2*t);entry.position=entry.position.map((v,i)=>object.driveReturn.position[i]*(1-smooth)+v*smooth);if(t>=1)delete object.driveReturn;}
    if(this.driveId===object.id&&object.driveBasis){entry.frame=object.driveBasis.map(v=>[...v]);entry.velocity=object.type==='shuttle'&&object.flight?.velocity?mul(object.flight.velocity,1/REFERENCE_RG_METERS):mul(entry.frame[2],(object.flight?.speed||0)*(object.type==='enterprise'?(object.flight?.travelDirection||1):1)/REFERENCE_RG_METERS);}
    else if(!(this.sceneId==='gravity-anomaly'&&object.id===this.warpObjectId)){const a=entry.headingAngle,plane=this.orbitGeometryById.get(object.id).basis,ca=Math.cos(a),sa=Math.sin(a);entry.frame=[transform(plane,[-ca,0,-sa]),plane[1],transform(plane,[sa,0,-ca])];}
    if(object.driveReturn?.basis){const t=Math.min(1,object.driveReturn.elapsed/3),a=t*t*(3-2*t),old=object.driveReturn.basis,forward=directionBlend(old[2],entry.frame[2],a),upGuess=directionBlend(old[1],entry.frame[1],a),right=unit(cross(Math.abs(dot(upGuess,forward))>.999?(Math.abs(forward[1])<.9?[0,1,0]:[1,0,0]):upGuess,forward));entry.frame=[right,unit(cross(forward,right)),forward];}
    if(s.bridge){entry.physicalRadius=this.objectRadius(object);entry.radius=entry.physicalRadius/bridgeConformal(Math.hypot(...entry.position),this.configCache.bridgeRadius);}
   }
   resolving.delete(object.id);resolved.add(object.id);
  };
  for(const object of this.objects)resolve(object);
  this.protectClockBodies();
  for(const entry of this.objectFrames){
   const object=this.objectById.get(entry.id);
   if(entry.type==='dyson'){entry.frame=[[1,0,0],[0,1,0],[0,0,1]];const parent=this.frameById.get(object.parentId);entry.bodyParams=[object.dysonCutaway??0,dysonIllumination(parent,entry.radius*REFERENCE_RG_METERS),0,0];entry.massSolar=0;entry.velocity=parent?.velocity?[...parent.velocity]:[0,0,0];}
   if(this.sceneId==='radiant-descent'&&object?.motion==='infall'&&!object.drivePosition){const forward=unit(Array.from(h.slice(0,3)).map((v,i)=>v-entry.position[i])),right=unit(cross(forward,b[1]));entry.frame=[right,cross(right,forward),forward];}
   if(s.blackHole&&object?.tidalDeformation>0&&object.planetStyle==='ocean'&&['planet','moon'].includes(entry.type)){
    const shape=tidalShape(entry.position,Array.from(h.slice(0,3)),b,object.tidalDeformation);
    entry.shapeAxes=shape.axes;entry.coreRadius=this.objectRadius({...object,shapeAxes:[1,1,1]});entry.radius=entry.coreRadius*shape.boundRatio;entry.waterCap=shape.waterCap;
    entry.axialTilt=shape.tilt*180/Math.PI;entry.surfaceRotationPhase=shape.phase;
    entry.rotation=0;entry.rotationPeriodSeconds=0;entry.tidallyLocked=false;entry.shapeStyle='watercap';
    const ct=Math.cos(shape.tilt),st=Math.sin(shape.tilt),cp=Math.cos(shape.phase),sp=Math.sin(shape.phase);
    entry.tidalBasis=[transform(b,[cp,-st*sp,ct*sp]),transform(b,[0,ct,st]),transform(b,[-sp,-st*cp,ct*cp])];
   }else if(entry.tidalBasis){delete entry.tidalBasis;delete entry.waterCap;delete entry.coreRadius;entry.shapeAxes=object?.shapeAxes;entry.shapeStyle=object?.shapeStyle;entry.axialTilt=object?.axialTilt;entry.surfaceRotationPhase=object?.surfaceRotationPhase;entry.rotation=object?.rotation;entry.rotationPeriodSeconds=object?.rotationPeriodSeconds;entry.tidallyLocked=object?.tidallyLocked;}
  }
  // A conservative logical bound is retained for camera and validation. The
  // GPU optical domain is still capped by the selected visible geometry.
  for(const entry of this.objectFrames)this.configCache.bounds=Math.max(this.configCache.bounds,Math.hypot(...entry.position)+entry.radius*3);
  if(this.state.viewMode==='free'&&this.freeReferenceId){const reference=this.getFocusFrame(this.freeReferenceId);if(reference&&this.freeReferencePosition&&this.freePosition&&this.freeTarget){const delta=reference.position.map((v,i)=>v-this.freeReferencePosition[i]);this.freePosition=add(this.freePosition,delta);this.freeTarget=add(this.freeTarget,delta);}this.freeReferencePosition=reference?[...reference.position]:null;}
  this.anomalyFrames=this.anomalyObjects?.length?this.anomalyObjects.map(o=>this.frameById.get(o.id)).filter(Boolean):null;
  this.packRenderObjects(this.cameraFrame);return this.objectCount;
 }
 // The actual scene remains present at every distance. This compatibility
 // hook is also read by the CPU renderer; there is no far-field replacement.
 isDriveOpenSpace(){return false;}
 displayState(){return this.state;}
 warpGridState(warp,radius){
  const flight=warp&&warp.id===this.driveId?this.objectById.get(warp.id)?.flight:null;
  if(warp?.type==='enterprise'&&flight?.mode==='warp')return {offset:[flight.gridPhase||0,0],rotation:[1,0]};
  const wrap=v=>((v%4096)+4096)%4096,k=this.configCache;
  return {offset:warp?[wrap(dot(warp.position,k.primaryBasis[0])/radius),wrap(dot(warp.position,k.primaryBasis[2])/radius)]:[0,0],rotation:warp?[dot(warp.frame[2],k.primaryBasis[0]),dot(warp.frame[2],k.primaryBasis[2])]:[1,0]};
 }
 warpMotionState(){
  const pilot=this.objectById?.get(this.driveId),s=this.state;
  const isolated=pilot?.parentId==='space'&&!s.blackHole&&!s.binary&&!s.planet&&!s.tidalStar&&!s.bridge&&!this.objects.some(o=>['star','planet','moon','blackhole','whitehole','anomaly'].includes(o.type));
  const active=pilot?.type==='enterprise'&&pilot.flight?.mode!=='impulse'&&!!pilot.flight&&isolated;
  const beta=active?Math.max(0,pilot.flight.starBeta||0):0;
  return {active,phase:active?(pilot.flight.starPhase||0):0,rate:warpStarRate(beta),beta};
 }
 packRenderObjects(frame=this.cameraFrame,renderHeight=this.canvas.height){
  const values=frame?[...frame.observer,...frame.forward,...frame.right,...frame.up,this.canvas.width,renderHeight,this.state.lensing,this.focusId,this.focusMode,this.driveId,this.warpObjectId]:[];
  if(this.packedFrames===this.objectFrames&&this.packedView?.length===values.length&&values.every((v,i)=>v===this.packedView[i])){const focused=this.frameById?.get(this.focusId);if(frame){frame.inspectIndex=this.focusMode==='onboard'?-1:focused?.index??-1;frame.hideIndex=this.focusMode==='onboard'&&focused?.type!=='dyson'?focused?.index??-1:-1;}return;}
  this.packedFrames=this.objectFrames;this.packedView=values;
  const all=this.isDriveOpenSpace()?this.objectFrames.filter(o=>o.id===this.driveId):this.anomalyObjects?.length?this.objectFrames.filter(o=>o.type!=='anomaly'):this.objectFrames,limit=this.shaderObjectSlots(),selected=[],required=new Set();
  if(this.focusId)required.add(this.focusId);if(this.warpObjectId&&this.state.warp)required.add(this.warpObjectId);if(this.driveId)required.add(this.driveId);
  let ancestor=this.objectById?.get(this.focusId);while(ancestor?.parentId&&required.size<limit){required.add(ancestor.parentId);ancestor=this.objectById.get(ancestor.parentId);}
  for(const entry of all)if(['ring','belt','disk','jets','dyson'].includes(entry.type)&&(entry.parentId===this.focusId||required.has(entry.parentId)))required.add(entry.id);
  const rect=this.canvas.getBoundingClientRect(),aspect=Math.max(.1,rect.width/Math.max(1,rect.height)),fov=.83*Math.max(1,1.35/aspect),pixelHeight=Math.max(2,renderHeight||rect.height),selectionHeight=Math.max(2,rect.height);
  const score=entry=>{
   if(entry.type==='dyson'&&frame&&Math.hypot(...entry.position.map((v,i)=>v-frame.observer[i]))<entry.radius*1.05)return 1e12;
   if(required.has(entry.id))return 1e12+(entry.id===this.focusId?1e10:0);
   if(!frame)return 1;const q=entry.position.map((x,i)=>x-frame.observer[i]),depth=dot(q,frame.forward),distance=Math.hypot(...q),projected=entry.radius/Math.max(1e-30,distance)/fov*selectionHeight;
   // Selection uses display pixels, so adaptive coarsening does not remove
   // visible bodies. Weak-lens work below still follows the actual ray pixels.
   // Off-axis bodies retain a margin for lensing; subpixel bodies are deferred.
   const x=Math.abs(dot(q,frame.right)),y=Math.abs(dot(q,frame.up)),margin=this.state.blackHole?1.5:1.12;
   const visible=depth+entry.radius>0&&x<(Math.max(depth,0)*fov*aspect+entry.radius)*margin&&y<(Math.max(depth,0)*fov+entry.radius)*margin;
   entry.projectedPixels=projected;entry.inFrustum=visible;
   return visible&&projected>=.25?projected*projected:0;
  };
  const ranked=all.map((entry,order)=>({entry,order,score:score(entry)}));
  // Keep one luminous source for reflected surfaces even when it lies behind
  // the camera. This does not force all distant moons into the ray loop.
  const luminous=ranked.filter(v=>v.entry.type==='star').sort((a,b)=>{const center=this.frameById?.get(this.focusId)?.position||frame?.observer||[0,0,0],da=Math.hypot(...a.entry.position.map((x,i)=>x-center[i])),db=Math.hypot(...b.entry.position.map((x,i)=>x-center[i]));return da-db;})[0];if(luminous)luminous.score=Math.max(luminous.score,1e11);
  let candidates;
  const compactAttachments=all.some(entry=>['disk','jets'].includes(entry.type)&&isCompactType(this.objectById.get(entry.parentId)?.type));
  if(compactAttachments&&all.length>limit){
   candidates=[];const included=new Set(),byId=new Map(ranked.map(value=>[value.entry.id,value]));
   for(const value of ranked.filter(v=>v.score>0).sort((a,b)=>b.score-a.score||a.order-b.order)){
    if(included.has(value.entry.id))continue;const parent=['disk','jets'].includes(value.entry.type)?byId.get(value.entry.parentId):null,group=parent&&isCompactType(parent.entry.type)&&!included.has(parent.entry.id)?[parent,value]:[value];
    if(candidates.length+group.length>limit)continue;for(const item of group){included.add(item.entry.id);candidates.push(item);}
   }
  }else candidates=all.length<=limit?ranked:ranked.filter(v=>v.score>0).sort((a,b)=>b.score-a.score||a.order-b.order).slice(0,limit);
  // Significant lenses occupy a compact prefix. This bounds each midpoint
  // force evaluation by active curvature sources, not by visible moons/rings.
  for(const value of candidates)value.entry.lensingActive=!!this.state.lensing&&bodyLensingSignificant(value.entry,fov/pixelHeight);
  candidates.sort((a,b)=>Number(b.entry.lensingActive)-Number(a.entry.lensingActive)||a.order-b.order);for(const value of candidates)selected.push(value.entry);
  this.gravityCount=selected.filter(entry=>entry.lensingActive).length;
  for(const entry of all)entry.index=-1;
  this.objectData.fill(0);this.colorData.fill(0);this.headingData.fill(0);this.bodyMassData.fill(0);this.bodyOpacityData.fill(1);this.transparentBodyCount=0;this.bodyParamData.fill(0);this.bodySurfaceData.fill(0);this.bodyShapeData.fill(1);this.luminosityData.fill(1);
  for(let index=0;index<selected.length;index++){
   const entry=selected[index],o=index*4;entry.index=index;this.objectData.set([...entry.position,entry.radius],o);this.colorData.set([...entry.tint,OBJECT_KIND[entry.type]??0],o);this.headingData.set([Math.cos(entry.headingAngle),Math.sin(entry.headingAngle)],index*2);this.bodyMassData[index]=entry.massSolar;this.bodyOpacityData[index]=this.state.spectrum==='geometry'||entry.collapsed||['blackhole','whitehole'].includes(entry.type)?1:clamp(entry.opacity??1,0,1);if(this.bodyOpacityData[index]<.999&&!['ring','belt','disk','jets'].includes(entry.type))this.transparentBodyCount++;this.bodyParamData.set(entry.bodyParams,o);this.luminosityData[index]=entry.type==='probe'?entry.luminosity:packMetricDirection(Math.hypot(...(entry.velocity||[0,0,0]))>entry.radius*1e-7?entry.velocity:[0,0,0]);
   const parent=this.objectById?.get(entry.parentId),tilt=entry.axialTilt??(['ring','belt','disk','jets'].includes(entry.type)?parent?.axialTilt:0)??0,axes=entry.shapeAxes||[1,1,1],maximum=Math.max(...axes);
   if(entry.type==='probe')this.headingData.set(metricOctDirection(entry.velocity||[0,0,0]),index*2);else if(['star','planet','moon','blackhole','whitehole'].includes(entry.type)){const sign=entry.type==='star'?Math.sign(entry.stellar?.angularVelocity??1):Math.sign(entry.rotationPeriodSeconds||1),angle=radians(tilt);entry.spinAxis=mul(transform(this.configCache.primaryBasis,[0,Math.cos(angle),Math.sin(angle)]),sign||1);const spinning=entry.type==='star'?Math.abs(entry.stellar?.angularVelocity||0)>1e-12:['blackhole','whitehole'].includes(entry.type)?Math.abs(entry.spinParameter||0)>.001:Math.abs(entry.rotationPeriodSeconds||entry.rotation||0)>0;this.headingData.set(metricOctDirection(spinning?entry.spinAxis:[0,0,0]),index*2);}
   const period=entry.rotationPeriodSeconds,spin=entry.tidallyLocked?entry.headingAngle+Math.PI:Math.abs(period)>1?-this.time*(18*REFERENCE_RG_METERS/299792458)*TAU/period:-this.time*(entry.rotation??1)*.05;
   if(['disk','jets'].includes(entry.type)){const owner=this.frameById?.get(entry.parentId);this.bodyShapeData.set([entry.innerRadiusRatio??Math.max(.05,(owner?.radius||0)/entry.radius),owner?.spinParameter||0,entry.diskPalette==='rainbow'?2:entry.diskPalette==='artistic'?1:0,radians(tilt)],o);}
   this.bodySurfaceData.set([entry.surfaceId||0,radians(tilt),wrap((entry.surfaceRotationPhase||0)+spin),entry.shapeStyle==='watercap'?3:entry.shapeStyle==='contact'?1:entry.shapeStyle==='rubble'?2:0],o);if(!['disk','jets'].includes(entry.type))this.bodyShapeData.set([...(entry.waterCap?[1,entry.waterCap.radiusRatio,entry.waterCap.offsetRatio].map(v=>v*entry.coreRadius/entry.radius):axes.map(v=>v/maximum)),radians(tilt)],o);
   if(entry.type==='planet'||entry.type==='moon'||entry.type==='probe')this.bodyParamData.set([entry.bodyParams[0]+4*(entry.surfaceId||0),this.bodySurfaceData[o+2],this.bodySurfaceData[o+3],entry.rotation??1],o);
  }
  this.renderObjects=selected;this.objectCount=selected.length;
  if(frame){const focused=this.frameById?.get(this.focusId);frame.inspectIndex=this.focusMode==='onboard'?-1:focused?.index??-1;frame.hideIndex=this.focusMode==='onboard'?focused?.index??-1:-1;}
 }
 // Every field-size change resumes fitting, including braking and reset. Keep
 // the chosen orbit angles; only recenter a look-pan that puts the subject
 // behind the camera or underneath a control, where no zoom can possibly fit.
 resumeWarpCameraFit(){
  if(this.focusMode!=='track'||this.getFocusFrame()?.type!=='enterprise')return false;
  this.cameraGuide='warp-side';
  if(this.fitWarpCamera())return true;
  this.camera.lookYaw=this.target.lookYaw=0;this.camera.lookPitch=this.target.lookPitch=0;
  return this.fitWarpCamera();
 }
 // Orbit rotations retain fitting. Manual zoom overrides it until the next
 // field-size change, and onboard/chase views keep their selected perspective.
 // Zoom outward immediately to keep a growing wall inside the safe bounds;
 // existing camera easing brings a shrinking field/hull inward smoothly.
 fitWarpCamera(snap=false){
  const body=this.getFocusFrame();if(body?.type!=='enterprise'||this.focusMode!=='track')return false;
  const rect=this.canvas.getBoundingClientRect(),enabled=this.state.warp&&this.focusId===this.warpObjectId,key=[rect.width,rect.height,this.state.warpFactor,enabled,this.target.yaw,this.target.pitch,this.target.lookYaw,this.target.lookPitch,!!this.driveId,window.innerWidth||rect.width,window.innerHeight||rect.height].join('/');
  if(key!==this.warpFitKey){this.warpFitKey=key;this.warpFit=warpSideFraming(rect.width,rect.height,this.state.warpFactor,{enabled,yaw:this.target.yaw,pitch:this.target.pitch,lookYaw:this.target.lookYaw,lookPitch:this.target.lookPitch,driving:!!this.driveId,cssWidth:window.innerWidth||rect.width,cssHeight:window.innerHeight||rect.height});}
  const fit=this.warpFit;if(!Number.isFinite(fit.distance))return false;
  this.target.focusDistance=fit.distance;
  let minimum=fit.distance;
  // The hull's silhouette changes during an orbit. Fit both the destination
  // and the currently displayed heading so easing cannot briefly clip it.
  if(!snap&&['yaw','pitch','lookYaw','lookPitch'].some(k=>Math.abs(this.camera[k]-this.target[k])>1e-6)){
   const current=warpSideFraming(rect.width,rect.height,this.state.warpFactor,{enabled,yaw:this.camera.yaw,pitch:this.camera.pitch,lookYaw:this.camera.lookYaw,lookPitch:this.camera.lookPitch,driving:!!this.driveId,cssWidth:window.innerWidth||rect.width,cssHeight:window.innerHeight||rect.height});
   if(Number.isFinite(current.distance))minimum=Math.max(minimum,current.distance);
  }
  if(snap||this.camera.focusDistance<minimum)this.camera.focusDistance=minimum;
  return true;
 }
 updateCameraFrame(){
  const c=this.camera,focused=this.focusId?this.getFocusFrame():null;let observer,forward,right,up,inspectCamera=[0,0,6],inspectForward=[0,0,-1],inspectRight=[1,0,0],inspectUp=[0,1,0],inspectIndex=-1,hideIndex=-1;
  if(focused){
   const reference=this.focusMode==='track'&&this.focusReferenceFrame?.id===focused.id?this.focusReferenceFrame.basis:focused.frame;
   if(this.cameraGuide==='warp-side'&&focused.type==='enterprise'&&this.focusMode==='track')this.fitWarpCamera();
   const onboard=this.focusMode==='onboard',chase=this.focusMode==='chase';
   let eye=chase?[0,Math.max(1.1,c.focusDistance*.24),-Math.max(2.6,c.focusDistance*.72)]:onboard?(focused.type==='hole'?[0,0,1.04]:focused.type==='dyson'?[0,0,.65]:['planet','moon','star'].includes(focused.type)?[0,.25,1.03]:focused.type==='astronaut'?[0,.55,.30]:focused.type==='enterprise'?[0,.22,.35]:focused.type==='shuttle'?[0,.28,.65]:[0,.3,.8]):[Math.cos(c.pitch)*Math.sin(c.yaw)*c.focusDistance,Math.sin(c.pitch)*c.focusDistance,Math.cos(c.pitch)*Math.cos(c.yaw)*c.focusDistance];
   if(this.state.blackHole&&!(this.state.interiorView&&this.state.spectrum==='geometry')){let clampedObserver=false,actual=add(focused.position,transform(reference,mul(eye,focused.radius)));for(let k=0;k<(this.state.binary?2:1);k++){const center=Array.from(this.holeData.slice(k*4,k*4+3)),delta=actual.map((x,i)=>x-center[i]),distance=Math.hypot(...delta),minimum=this.configCache.horizon[k]*1.013;if(distance<minimum){const outward=distance>1e-15?mul(delta,1/distance):unit(focused.position.map((x,i)=>x-center[i]));actual=add(center,mul(outward,minimum));clampedObserver=true;}}if(clampedObserver)eye=mul(inverse(reference,actual.map((x,i)=>x-focused.position[i])),1/focused.radius);}
   const baseForward=onboard&&focused.type==='dyson'?[0,0,-1]:onboard||chase?[0,0,1]:unit(mul(eye,-1)),baseRight=unit(cross(baseForward,[0,1,0])),baseUp=cross(baseRight,baseForward);
   if(this.cameraGuide==='blue-fire-edge'&&onboard&&this.state.blackHole){
    const position=add(focused.position,transform(reference,mul(eye,focused.radius))),center=Array.from(this.holeData.slice(0,3)),delta=center.map((v,i)=>v-position[i]),distance=Math.hypot(...delta),inward=unit(delta),rawRight=unit(cross(inward,this.configCache.primaryAxis)),edgeRight=mul(rawRight,dot(rawRight,transform(reference,baseRight))<0?-1:1),angle=this.state.lensing?apparentCaptureAngle(distance,this.holeData[3]):Math.asin(Math.min(1,this.configCache.horizon[0]/distance));
    const direction=inverse(reference,add(mul(inward,Math.cos(angle)),mul(edgeRight,Math.sin(angle))));
    // Bake the guided direction into the regular camera angles. A drag or
    // change of view can release the guide without snapping the orientation.
    c.lookYaw=this.target.lookYaw=Math.atan2(dot(direction,baseRight),dot(direction,baseForward));
    c.lookPitch=this.target.lookPitch=Math.asin(clamp(dot(direction,baseUp),-1,1));
   }
   const horizontal=add(mul(baseForward,Math.cos(c.lookYaw)),mul(baseRight,Math.sin(c.lookYaw)));
   inspectForward=unit(add(mul(horizontal,Math.cos(c.lookPitch)),mul(baseUp,Math.sin(c.lookPitch))));inspectRight=unit(add(mul(baseRight,Math.cos(c.lookYaw)),mul(baseForward,-Math.sin(c.lookYaw))));inspectUp=cross(inspectRight,inspectForward);inspectCamera=eye;
   observer=add(focused.position,transform(reference,mul(eye,focused.radius)));forward=transform(reference,inspectForward);right=transform(reference,inspectRight);up=transform(reference,inspectUp);if(reference!==focused.frame){inspectCamera=inverse(focused.frame,transform(reference,eye));inspectForward=inverse(focused.frame,forward);inspectRight=inverse(focused.frame,right);inspectUp=inverse(focused.frame,up);}inspectIndex=onboard?-1:focused.index;hideIndex=onboard?focused.index:-1;
  }else if(this.state.viewMode==='free'&&this.freePosition&&this.freeBasis){
   observer=[...this.freePosition];const b=this.freeBasis,horizontal=add(mul(b.forward,Math.cos(c.lookYaw)),mul(b.right,Math.sin(c.lookYaw)));
   forward=unit(add(mul(horizontal,Math.cos(c.lookPitch)),mul(b.up,Math.sin(c.lookPitch))));right=unit(add(mul(b.right,Math.cos(c.lookYaw)),mul(b.forward,-Math.sin(c.lookYaw))));up=cross(right,forward);
  }else{
   observer=[Math.cos(c.pitch)*Math.sin(c.yaw)*c.distance,Math.sin(c.pitch)*c.distance,Math.cos(c.pitch)*Math.cos(c.yaw)*c.distance];
   const baseForward=unit(mul(observer,-1)),baseRight=unit(cross(baseForward,[0,1,0])),baseUp=cross(baseRight,baseForward),horizontal=add(mul(baseForward,Math.cos(c.lookYaw)),mul(baseRight,Math.sin(c.lookYaw)));
   forward=unit(add(mul(horizontal,Math.cos(c.lookPitch)),mul(baseUp,Math.sin(c.lookPitch))));right=unit(add(mul(baseRight,Math.cos(c.lookYaw)),mul(baseForward,-Math.sin(c.lookYaw))));up=cross(right,forward);
  }
  if(this.state.bridge){const minimum=this.configCache.bridgeRadius*.003,r=Math.hypot(...observer);if(r<minimum)observer=mul(r>1e-20?unit(observer):[0,0,1],minimum);}
  this.cameraFrame={observer,forward,right,up,inspectIndex,hideIndex,inspectCamera,inspectForward,inspectRight,inspectUp};this.packRenderObjects(this.cameraFrame);this.focusSurfaceId=focused?.surfaceId||[...(this.renderObjects||[])].filter(o=>o.surfaceId>0).sort((a,b)=>(b.projectedPixels||0)-(a.projectedPixels||0))[0]?.surfaceId||0;
 }
 validateFrameGeometry(frame=this.cameraFrame){
  // Validate the actual frame before either backend publishes it. A dark sky is
  // a valid composition; geometry failure must be detected from state, not color.
  let reason='';const k=this.configCache;
  if(NUMERIC_STATE_KEYS.some(key=>!Number.isFinite(this.state[key]))||!Number.isFinite(this.time)||!(this.massScale>0)||!(k.bounds>0)||!Number.isFinite(k.bounds))reason='invalid scene dimensions';
  else if(!frame||CAMERA_KEYS.some(key=>!Number.isFinite(this.camera[key]))||!finiteVector(frame.observer,3)||!finiteVector(frame.inspectCamera,3)||!validBasis(frame.right,frame.up,frame.forward)||!validBasis(frame.inspectRight,frame.inspectUp,frame.inspectForward))reason='invalid camera orientation';
  else if(!finiteVector(this.holeData,8)||!finiteVector(k.horizon,2)||!finiteVector(k.isco,2)||!finiteVector(k.diskOuter,2)||k.horizon.some((v,i)=>v<0||(i===0&&this.state.blackHole&&v===0&&!(this.state.mergerOutcome==='illustrative-cancellation'&&this.mergerComplete)))||k.isco.some(v=>v<=0)||this.state.disk&&this.holeData[3]>0&&!(k.diskOuter[0]>0))reason='invalid gravitational geometry';
  else if(this.state.bridge&&(!(k.bridgeRadius>0)||!Number.isFinite(k.bridgeRadius)))reason='invalid bridge dimensions';
  else if(!finiteVector(this.bodySurfaceData,48)||!finiteVector(this.bodyShapeData,48)||!finiteVector(this.bodyMassData,12)||!finiteVector(this.bodyOpacityData,12)||!finiteVector(this.bodyParamData,48)||!finiteVector(this.objectData,48)||!finiteVector(this.colorData,48)||!finiteVector(this.headingData,24)||!finiteVector(this.luminosityData,12)||!finiteVector(this.tidalData,4))reason='invalid object coordinates';
  else for(const body of this.objectFrames){if(!finiteVector(body.position,3)||!(body.radius>0)||!Number.isFinite(body.radius)||!validBasis(body.frame?.[0],body.frame?.[1],body.frame?.[2])||(body.physicalRadius!==undefined&&(!(body.physicalRadius>0)||!Number.isFinite(body.physicalRadius)))){reason='invalid object dimensions';break;}}
  if(reason){const message=`Scene geometry could not be rendered: ${reason}. Reset the view or choose another scene.`;if(this.geometryError!==message){this.geometryError=message;this.onError(message);}return false;}
  this.geometryError='';return true;
 }
 setDrawUniforms(frame=this.cameraFrame,{gl:g=this.gl,uniforms:u=this.uniforms,width=this.canvas.width,height=this.canvas.height,viewport=[0,0,width,height],projectionMode=0,inverseProjection=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],steps=this.steps,detail=this.detail||0}={}){
  const s=this.displayState(),c=this.camera,k=this.configCache;
  if(g===this.gl)this.planetTextures?.bind(u);else{g.uniform1i(u.uPlanetAtlas,0);g.uniform1i(u.uPlanetFocus,1);g.uniform1f(u.uPlanetAtlasReady,this.planetTextures?.atlasReady?1:0);g.uniform1f(u.uPlanetFocusId,this.planetTextures?.focusId||0);}
  this.packRenderObjects(frame,height);
  // Rebase before Float32 conversion. Meter-scale moons and grids keep local
  // precision even when their whole system is millions of r_g from a hole.
  const focused=this.getFocusFrame(),origin=s.bridge?[0,0,0]:focused?[...focused.position]:Math.hypot(...frame.observer)>64?[...frame.observer]:[0,0,0];
  this.renderOrigin=origin;
  const observer=frame.observer.map((v,i)=>v-origin[i]),objects=new Float32Array(48),holes=new Float32Array(8);
  for(const body of this.renderObjects||[])objects.set([...body.position.map((v,i)=>v-origin[i]),body.radius],body.index*4);
  for(let j=0;j<2;j++)holes.set([this.holeData[j*4]-origin[0],this.holeData[j*4+1]-origin[1],this.holeData[j*4+2]-origin[2],this.holeData[j*4+3]],j*4);
  const normal=s.binary?[0,1,0]:k.primaryAxis,chart=s.binary?origin:inverse(k.primaryBasis,origin);
  const gridScale=s.blackHole?Math.max(this.massScale,1e-12):Math.max(1e-10,focused?Math.max(focused.radius*.5,Math.hypot(...frame.observer.map((v,i)=>v-focused.position[i]))*.035):Math.hypot(...frame.observer)*.035);
  const scaled=[chart[0]/gridScale,chart[2]/gridScale],high=scaled.map(v=>Math.floor((v+.75*512)/(.75*1024))*1024),low=scaled.map((v,i)=>v-high[i]*.75);
  let gridBody=null;if(s.grid&&!s.blackHole)for(const body of this.objectFrames){if((body.type==='star'||body.type==='planet'||body.type==='moon')&&body.massSolar>0&&(!gridBody||body.massSolar>gridBody.massSolar))gridBody=body;}
  g.uniform1f(u.uGridFlowWindow,gridBody?weakGridFlowWindow(gridBody.radius,gridBody.massSolar/4300000):0);
  g.uniform4f(u.uGridAnchor,low[0],low[1],-dot(origin,normal),gridScale);g.uniform2fv(u.uGridHigh,high);g.uniform3fv(u.uWorldOrigin,origin);
  let opticalBounds=s.blackHole?Math.max(...[0,...(s.binary?[1]:[])].map(j=>Math.hypot(...[holes[j*4],holes[j*4+1],holes[j*4+2]])+Math.max(this.massScale*26,k.diskOuter[j]*1.25,(s.jets||s.secondaryJets)?this.massScale*60:0))):1e-8;
  for(const body of this.renderObjects||[])opticalBounds=Math.max(opticalBounds,Math.hypot(...body.position.map((v,i)=>v-origin[i]))+body.radius*4);
  const anomalies=this.isDriveOpenSpace()?[]:this.anomalyFrames||[];
  if(anomalies.length){const anomalyData=new Float32Array(16),anomalyParams=new Float32Array(16);
  for(let j=0;j<anomalies.length;j++){const a=anomalies[j];anomalyData.set([...a.position.map((v,i)=>v-origin[i]),a.radius],j*4);anomalyParams.set([a.anomalyStrength??1.8,a.anomalyScale??1,a.anomalyMotion??1,0],j*4);opticalBounds=Math.max(opticalBounds,Math.hypot(...a.position.map((v,i)=>v-origin[i]))+a.radius*3);}
  g.uniform4fv(u['uAnomalies[0]'],anomalyData);g.uniform4fv(u['uAnomalyParams[0]'],anomalyParams);}
  if(u.uAnomalyCount!=null)g.uniform1i(u.uAnomalyCount,anomalies.length);
  if(s.bridge)opticalBounds=k.bounds;
  const driven=this.objectFrames.find(f=>f.id===this.driveId)||this.objectFrames.find(f=>this.objectById?.get(f.id)?.driveReturn)||this.objectFrames.find(f=>f.id===this.warpObjectId),df=driven?.frame||[[1,0,0],[0,1,0],[0,0,1]];g.uniform1i(u.uDriveIndex,driven?.index??-1);g.uniform3fv(u.uDriveRight,df[0]);g.uniform3fv(u.uDriveUp,df[1]);g.uniform3fv(u.uDriveForward,df[2]);
  g.uniform3fv(u.uObserver,observer);g.uniform3fv(u.uForward,frame.forward);g.uniform3fv(u.uRight,frame.right);g.uniform3fv(u.uUp,frame.up);g.uniform1i(u.uInspectIndex,s.metrics||s.spectrum==='geometry'?-1:frame.inspectIndex);g.uniform1i(u.uHideObjectIndex,frame.hideIndex);g.uniform3fv(u.uInspectCamera,frame.inspectCamera);g.uniform3fv(u.uInspectForward,frame.inspectForward);g.uniform3fv(u.uInspectRight,frame.inspectRight);g.uniform3fv(u.uInspectUp,frame.inspectUp);g.uniform2fv(u['uHeadings[0]'],this.headingData.subarray(0,(this.activeProgram?.features.objectSlots||this.shaderObjectSlots())*2));g.uniform1i(u.uCockpitMode,0);
  const warp=(this.warpObjectId?this.objectFrames.find(o=>o.id===this.warpObjectId):null)||driven||null,warpRadius=warp?warp.radius*(s.warp?effectiveWarpRadius(s.warpFactor):6):1,warpCenter=warp?.position||[0,0,0];g.uniform3fv(u.uWarpCenter,warpCenter.map((v,i)=>v-origin[i]));g.uniform3fv(u.uWarpAxis,warp?.frame[2]||[0,0,1]);g.uniform1f(u.uWarpRadius,warpRadius);g.uniform1f(u.uWarpStrength,s.warp?warpDisplayStrength(s.warpFactor):0);g.uniform1f(u.uWarpThickness,Math.min(20,s.warpThickness*(1+s.warpFactor*.04)));g.uniform4f(u.uWarpFlags,s.warp&&warp?1:0,s.warpField?1:0,s.warpGrid?1:0,s.blackHole&&(this.holeData[3]>0||this.holeData[7]>0)?1:0);g.uniform3fv(u.uWarpObserver,frame.observer.map((x,i)=>(x-warpCenter[i])/warpRadius));g.uniform1i(u.uWarpObjectIndex,warp?.index??-1);const gridMotion=this.warpGridState(warp,warpRadius);g.uniform2f(u.uWarpGridOffset,...gridMotion.offset);g.uniform2f(u.uWarpGridRotation,...gridMotion.rotation);const motion=this.warpMotionState();g.uniform4f(u.uWarpMotion,motion.phase,motion.rate,motion.beta,motion.active?1:0);g.uniform1f(u.uDetail,detail);
  const flight=this.getFlightState();g.uniform4f(u.uFlightMetrics,flight.active?flight.throttle:0,flight.active?flight.steeringInput:0,this.time,flight.active&&flight.type==='shuttle'?1:0);
  g.uniform4f(u.uMetricOptions,0,s.gravitationalWaves?(s.waveAmplitude??.3)*(this.cancellationFraction??1):0,s.waveFrequency??1,s.interiorView&&s.spectrum==='geometry'?1:0);g.uniform4f(u.uSceneOptions,s.secondaryWhiteHole?1:0,s.bridgeMode==='crossed'?1:0,s.diskPalette==='rainbow'?2:s.diskPalette==='artistic'?1:0,s.secondaryDiskPalette==='rainbow'?2:s.secondaryDiskPalette==='artistic'?1:0);g.uniform2f(u.uJetStructure,Math.max(0,ENUMS.jetStructure.indexOf(s.jetStructure))+packMetricDirection(this.holeVelocities?.[0]||[0,0,0])/4194304,Math.max(0,ENUMS.secondaryJetStructure.indexOf(s.secondaryJetStructure))+packMetricDirection(this.holeVelocities?.[1]||[0,0,0])/4194304);
  g.uniform2f(u.uResolution,width,height);
  g.uniform4f(u.uRayViewport,...viewport);g.uniform1i(u.uProjectionMode,projectionMode);g.uniformMatrix4fv(u.uInverseProjection,false,inverseProjection);g.uniform4f(u.uBridge,s.bridge?1:0,k.bridgeRadius||1,s.bridgeSurfaces?1:0,s.bridgeWorlds==='earth-proxima'?1:0);g.uniform3fv(u.uBridgeGridAxis,s.bridgeGridOrientation==='parallel'?k.primaryBasis[1]:k.primaryBasis[2]);const bridgeStage=bridgeJourney(this.bridgeTime,k.bridgeRadius,s.bridgeLifecycle);g.uniform3f(u.uBridgeStage,bridgeStage.open,bridgeStage.far?1:0,s.bridgeLifecycle==='open-transit-close'?1:0);const bridgeCraft=s.bridge?this.frameById.get(this.bridgeObjectId):null,bridgeBubble=bridgeCraft?.type==='enterprise'&&this.driveId===bridgeCraft.id&&s.warp&&s.warpFactor>0;g.uniform4f(u.uBridgeBubble,...(bridgeCraft?.position||[0,0,0]),bridgeBubble?bridgeCraft.radius*effectiveWarpRadius(s.warpFactor):0);g.uniform3fv(u.uBridgeBubbleAxis,bridgeCraft?.frame?.[2]||k.primaryBasis[2]);g.uniform1f(u.uWhiteHole,s.whiteHole?1:0);g.uniform3fv(u.uBridgeSkyColor,k.bridgeOtherColor);g.uniform1f(u.uBridgeOtherNebula,s.bridgeOtherNebula?1:0);g.uniform4f(u.uBridgeSkyParams,ENUMS.bridgeOtherShape.indexOf(s.bridgeOtherShape),s.bridgeOtherScale,s.bridgeOtherIntensity,radians(s.bridgeOtherRotation));
  const scalar={uTime:this.time,uStellarTime:this.stellarVisualTime(),uExposure:s.exposure,uDistance:c.distance,uYaw:c.yaw,uPitch:c.pitch,uLookYaw:c.lookYaw,uLookPitch:c.lookPitch,uMass:this.massScale,uBounds:opticalBounds,uStars:s.starDensity};
  for(const name in scalar)g.uniform1f(u[name],scalar[name]);
  g.uniform3fv(u.uPrimaryAxis,k.primaryAxis);g.uniform3fv(u.uSecondaryAxis,k.secondaryAxis);
  g.uniform2f(u.uSpin,s.spin,s.secondarySpin);g.uniform2f(u.uHorizon,...k.horizon);g.uniform2f(u.uIsco,...k.isco);g.uniform2f(u.uDiskOuter,...k.diskOuter);
  g.uniform4fv(u['uHoles[0]'],holes);g.uniform4f(u.uFlags,s.grid?1:0,s.disk?1:0,s.lensing?1:0,s.jets?1:0);g.uniform4f(u.uFlags2,s.stars?1:0,s.nebula?1:0,s.tidalStar?1:0,s.horizonGuide?1:0);
  g.uniform4f(u.uDiskSecondaryParams,ENUMS.secondaryDiskStyle.indexOf(s.secondaryDiskStyle),s.secondaryDiskThickness??s.diskThickness,s.secondaryDiskDensity??s.diskDensity,s.binary&&this.holeData[7]>0&&s.secondaryDisk?1:0);g.uniform3fv(u.uDiskSecondaryColor,color(s.secondaryDiskColor||s.diskColor));g.uniform4f(u.uJetSecondaryParams,s.secondaryJetSpread??s.jetSpread,s.secondaryJetLength??s.jetLength,s.secondaryJetIntensity??s.jetIntensity,s.binary&&this.holeData[7]>0&&s.secondaryJets?1:0);g.uniform3fv(u.uJetSecondaryColor,color(s.secondaryJetColor||s.jetColor));
  g.uniform4f(u.uDiskParams,ENUMS.diskStyle.indexOf(s.diskStyle),s.diskThickness,s.diskDensity,0);g.uniform3fv(u.uDiskColor,k.diskColor);
  g.uniform4f(u.uNebulaParams,ENUMS.nebulaShape.indexOf(s.nebulaShape),s.nebulaScale,s.nebulaIntensity,radians(s.nebulaRotation));g.uniform3fv(u.uNebulaColor,k.nebulaColor);
  g.uniform4f(u.uJets,s.jetSpread,s.jetLength,s.jetIntensity,0);g.uniform3fv(u.uJetColor,k.jetColor);g.uniform3fv(u.uStarColor,k.starColor);
  g.uniform1i(u.uSpectrum,ENUMS.spectrum.indexOf(s.spectrum));g.uniform1i(u.uBinary,s.binary&&this.holeData[7]>0?1:0);g.uniform1i(u.uSteps,steps);
  g.uniform1i(u.uObjectCount,this.objectCount||0);g.uniform1i(u.uGravityCount,this.gravityCount||0);g.uniform4fv(u['uObjects[0]'],objects.subarray(0,(this.activeProgram?.features.objectSlots||this.shaderObjectSlots())*4));g.uniform4fv(u['uColors[0]'],this.colorData.subarray(0,(this.activeProgram?.features.objectSlots||this.shaderObjectSlots())*4));g.uniform1fv(u['uLuminosities[0]'],this.luminosityData.subarray(0,this.activeProgram?.features.objectSlots||this.shaderObjectSlots()));g.uniform4fv(u['uBodyParams[0]'],this.bodyParamData.subarray(0,(this.activeProgram?.features.objectSlots||this.shaderObjectSlots())*4));g.uniform1fv(u['uBodyMasses[0]'],this.bodyMassData.subarray(0,this.activeProgram?.features.objectSlots||this.shaderObjectSlots()));g.uniform4fv(u['uBodyOpacity[0]'],this.bodyOpacityData);g.uniform1i(u.uTransparentBodies,this.transparentBodyCount);g.uniform4fv(u['uBodyShape[0]'],this.bodyShapeData.subarray(0,(this.activeProgram?.features.objectSlots||this.shaderObjectSlots())*4));g.uniform2f(u.uBridgeStars,s.stars?s.starDensity:0,s.bridgeOtherStars===false?0:(s.bridgeOtherStarDensity??1));g.uniform4f(u.uSkyParams,s.starBrightness??1,s.starVariety??1,s.bridgeOtherStarBrightness??1,s.bridgeOtherStarVariety??1);g.uniform4fv(u.uTidal,this.tidalData);
  // The locator solver consumes the exact submitted optical chart, including
  // floating-origin rebasing and quality step budget, never a later camera.
  this.annotationOptics={
   anomalyTime:this.time,anomalies:anomalies.map(a=>({position:a.position.map((v,i)=>v-origin[i]),radius:a.radius,anomalyStrength:a.anomalyStrength,anomalyScale:a.anomalyScale,anomalyMotion:a.anomalyMotion})),
   origin:[...origin],bounds:opticalBounds,steps,detail,width,height,projectionMode,gravityCount:this.gravityCount||0,
   observer:[...observer],forward:[...frame.forward],right:[...frame.right],up:[...frame.up],
   holes:Array.from(holes),objects:Array.from(objects.subarray(0,(this.objectCount||0)*4)),
   bodyOpacity:Array.from(this.bodyOpacityData.subarray(0,this.objectCount||0)),transparentBodies:this.transparentBodyCount,bodyMasses:Array.from(this.bodyMassData.subarray(0,this.objectCount||0)),bodyParams:Array.from(this.bodyParamData.subarray(0,(this.objectCount||0)*4)),bodyTypes:Array.from(this.colorData.subarray(0,(this.objectCount||0)*4)),
   warp:{enabled:!!s.warp,index:warp?.index??-1,center:warpCenter.map((v,i)=>v-origin[i]),axis:[...(warp?.frame[2]||[0,0,1])],radius:warpRadius,strength:s.warp?warpDisplayStrength(s.warpFactor):0,thickness:Math.min(20,s.warpThickness*(1+s.warpFactor*.04)),local:!!warp&&(!s.blackHole||frame.inspectIndex===warp.index||frame.hideIndex===warp.index)},
   inspectIndex:s.metrics||s.spectrum==='geometry'?-1:frame.inspectIndex,hideIndex:frame.hideIndex
  };
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
  return {focusSurfaceId:this.focusSurfaceId||0,features:{...this.shaderFeatures(),ultra:true},uniforms,width:this.canvas.width,height:this.canvas.height,time:this.time};
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
  if(this.disposed||this.contextLost||document.hidden||(this.presentationPaused&&!this.captureDrawing)||this.photoActive||this.xr?.active)return false;
  this.pollProgram();this.requestProgram();
  // Keep the previous complete image while a newly requested feature compiles.
  // Rendering it with an incompatible program would silently omit its objects.
  if(!this.ready||!this.programSupports(this.shaderFeatures())||!this.gpuAvailable(now))return false;
  // Legacy contexts without fences/queries keep a bounded submission cadence.
  if(fromFrame&&!this.canFence&&this.nextSubmit&&now+.25<this.nextSubmit)return false;
  if(this.resizePending)this.resize();
  const started=this.now(),g=this.gl,u=this.uniforms,s=this.state,c=this.camera,k=this.configCache;
  this.fillHoles();this.protectObserver();const count=this.fillObjects();this.updateCameraFrame();g.useProgram(this.program);
  if(this.shaderFeatures().planetary){
   if(!this.planetTextures)this.planetTextures=new PlanetTextureCache(g);
   const surface=this.getFocusFrame()?.surfaceId?this.getFocusFrame():[...(this.renderObjects||[])].filter(o=>o.surfaceId>0).sort((a,b)=>(b.projectedPixels||0)-(a.projectedPixels||0))[0];
   const pixels=surface?surface.radius/Math.max(surface.radius,Math.hypot(...surface.position.map((v,i)=>v-this.cameraFrame.observer[i])))*this.canvas.height/.83:0;
   this.focusSurfaceId=pixels>=40?surface?.surfaceId||0:0;
   const cap=({low:512,medium:1024,high:2048,ultra:4096})[this.budget.effectiveQuality]||1024,size=Math.min(cap,Math.max(256,2**Math.ceil(Math.log2(Math.max(1,pixels*4)))));
   // Draw procedural surfaces immediately; refine with the atlas/map when its
   // local decode finishes. A failed optional texture must not blank the scene.
   this.textureError=this.planetTextures.error?'Included surface detail unavailable; using procedural/atlas surfaces.':'';
   if(!this.planetTextures.ready(this.focusSurfaceId,size)&&(!this.planetTextures.error||this.planetTextures.targetId!==this.focusSurfaceId))this.planetTextures.ensure(this.focusSurfaceId,{maxSize:size}).catch(()=>{});
  }
  let query=null;if(this.completionQuery){query=this.completionQuery.createQueryEXT();if(query)this.completionQuery.beginQueryEXT(this.completionQuery.TIME_ELAPSED_EXT,query);}
  let drawn;try{drawn=this.drawScene();}finally{if(query)this.completionQuery.endQueryEXT(this.completionQuery.TIME_ELAPSED_EXT);}
  if(!drawn){if(query)this.completionQuery.deleteQueryEXT(query);return false;}
  this.captureFreshFrame();
  const warmup=this.warmupFrames>0;if(warmup)this.warmupFrames--;
  if(this.canFence){const sync=this.nativeFence?g.fenceSync(g.SYNC_GPU_COMMANDS_COMPLETE,0):null;if(sync||query){this.gpuFence={sync,query,started:now,generation:this.budget.generation,warmup,polls:0};g.flush();}else this.canFence=false;}
  if(!this.canFence){
   this.frames++;if(this.budget.noteCompletion(now,{eligible:!warmup}))this.resizePending=true;
   // A 40Hz ceiling leaves room to measure >30 FPS and probe higher quality.
   // Preserve its phase at 60/120/144Hz rather than rounding every interval.
   const interval=1000/40;this.nextSubmit=this.nextSubmit&&now-this.nextSubmit<interval*2?this.nextSubmit+interval:now+interval;
  }
  this.lastSubmit=now;this.budget.noteSubmit(now,this.now()-started);return true;
 }
 frame(now){
  this.raf=0;if(this.disposed||document.hidden||this.presentationPaused||this.photoActive||this.captureRequest||this.xr?.active){this.lastTime=0;return;}this.raf=requestAnimationFrame(this.frame);
  if(this.contextLost){this.lastTime=0;return;}
  this.advanceSimulation(now);this.render(now,true);this.emitStats(now);
 }
 advanceSimulation(now){
  const gap=this.lastTime?Math.max(0,now-this.lastTime):0;if(this.budget.noteFrame(now,gap))this.resizePending=true;
  const dt=gap?Math.min(.1,gap/1000):1/60,previousWarp=this.state.warpFactor;this.lastTime=now;this.transferClockObjectId=null;
  if(!this.state.paused){this.time+=dt*this.effectivePlaybackSpeed()*this.simulationTimeScale();const transferring=!!this.transfer?.active;if(transferring&&!this.presentationPaused&&!document.hidden&&!this.photoActive&&!this.photoRunning&&this.sceneLoad?.state!=='loading'){const travelDt=gap/1000,steps=Math.max(1,Math.min(4,Math.ceil(travelDt/.1)));for(let i=0;i<steps&&this.transfer?.active;i++)this.advanceTravel(travelDt/steps);}const obj=this.objects.find(o=>o.id===this.driveId);if(obj?.flight&&!transferring){const before=[...obj.flight.position];if(obj.type==='shuttle'){this.clockSweepStarts??=new Map();this.clockSweepStarts.set(obj.id,before.map(v=>v/REFERENCE_RG_METERS));}integratePlanar(obj.flight,dt*this.state.speed,this.flightInput,{lengthMeters:OBJECT_DIMENSIONS[obj.type].lengthMeters,maxSpeed:obj.type==='enterprise'?speedForWarp(9.9999):undefined,warp:obj.type==='enterprise',maxThrustG:obj.type==='enterprise'?ENTERPRISE_THRUST_MAX_G:SHUTTLE_THRUST_MAX_G,clockExempt:obj.type==='enterprise',controlled:true});if(this.state.bridge&&obj.id===this.bridgeObjectId){
 const f=obj.flight,b=this.configCache.bridgeRadius*REFERENCE_RG_METERS,nominal=Math.hypot(...f.position.map((v,i)=>v-before[i])),limit=b*.40*dt*this.state.speed*Math.min(3,obj.type==='enterprise'?warpForSpeed(f.speed)/4:f.speed/100),travel=Math.min(nominal,limit),direction=nominal>0?f.position.map((v,i)=>(v-before[i])/nominal*(obj.type==='enterprise'?(f.travelDirection||1):1)):[0,0,0];
 f.position=[...before];for(let j=0;j<12;j++){const r=Math.hypot(...f.position),conformal=bridgeConformal(r,b),step=travel/12/conformal;f.position=f.position.map((v,i)=>v+direction[i]*step);const radius=Math.hypot(...f.position);if(radius<b*.025)f.position=f.position.map(v=>v/radius*b*.025);}
 f.travelCompression=nominal>0?Math.max(1e-15,travel/nominal):1;
 }obj.drivePosition=obj.flight.position.map(v=>v/REFERENCE_RG_METERS);obj.driveBasis=obj.flight.basis.map(v=>[...v]);if(obj.type==='enterprise'&&obj.id===this.warpObjectId)this.state.warpFactor=this.getFlightState().warpFactor;this.state.warpRadius=effectiveWarpRadius(this.state.warpFactor);}}for(const object of this.objects)if(object.driveReturn)object.driveReturn.elapsed+=dt;
  if(!this.transfer?.active&&previousWarp!==this.state.warpFactor&&this.focusId===this.warpObjectId)this.resumeWarpCameraFit();
  const isLooking=this.state.viewMode==='free'||this.state.viewMode==='look'||Math.abs(this.target.lookYaw)+Math.abs(this.target.lookPitch)>.0001;
  if(this.state.autoRotate&&!this.pointers.size&&!isLooking)this.target.yaw+=dt*.055;
  const smooth=1-Math.exp(-dt*8),travelSmooth=1-Math.exp(-dt*.22);
  for(const key of ['yaw','pitch','lookYaw','lookPitch','focusDistance'])this.camera[key]+=(this.target[key]-this.camera[key])*smooth;
  this.camera.distance+=(this.target.distance-this.camera.distance)*(this.travel?travelSmooth:smooth);
  if(this.state.viewMode==='free'&&this.freePosition&&this.freeTarget)this.freePosition=this.freePosition.map((v,i)=>v+(this.freeTarget[i]-v)*smooth);
  if(this.travel&&Math.abs(this.target.distance-this.camera.distance)<.04*this.massScale)this.travel=false;
  if(!this.state.paused&&!this.presentationPaused&&!document.hidden&&!this.photoActive&&!this.photoRunning&&this.sceneLoad?.state!=='loading'&&this.clockActors?.length)this.advanceClocks(gap/1000);
  return dt;
 }
 emitStats(now){
  if(!this.statsStart)this.statsStart=now;
  if(now-this.statsStart>600){
   this.fps=this.frames*1000/(now-this.statsStart);this.frames=0;this.statsStart=now;
   this.onStats({...this.getState(),fps:Math.round(this.fps),scale:this.renderScale,steps:this.steps,horizonAU:this.state.mass*1.47662504/149.5978707*horizonRg(this.state.spin),width:this.canvas.width,height:this.canvas.height,webgl:this.webgl2?2:1,discTruncated:this.state.binary&&this.configCache.diskOuter[0]/this.massScale<this.configCache.isco[0]+.4});
  }
 }
 dispose(){this.planetTextures?.dispose();this.xr?.dispose();this.cancelCapture('The renderer was closed before the image was ready.');this.disposed=true;cancelAnimationFrame(this.raf);this.listeners.forEach(remove=>remove());this.observer?.disconnect();if(this.gl&&!this.contextLost){this.releaseFence();this.gl.deleteBuffer(this.buffer);for(const entry of this.programs.values())this.gl.deleteProgram(entry.program);if(this.pendingProgram){this.pendingProgram.shaders.forEach(shader=>this.gl.deleteShader(shader));this.gl.deleteProgram(this.pendingProgram.program);}}this.programs?.clear();this.pendingProgram=null;this.ready=false;}
}

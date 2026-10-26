import {dysonShellHit,dysonPreviewMaterial} from './dyson.js';
import { BlackHoleRenderer } from './renderer.js';
import { REFERENCE_RG_METERS } from './objects.js';
import { weakGridFlowWindow, weakGridTracerRadius } from './grid-glsl.js';
import { effectiveWarpRadius } from './warp-physics.js';
import {apparentCaptureAngle} from './camera-framing.js';
import {captureSpans} from './cpu-shadow.js';
import { predictedFlightPath } from './flight-dynamics.js';
import { bridgeWorldSphere } from './bridge-glsl.js';

// An explicitly chosen Canvas 2D fallback, never an automatic quality tier.
// This schematic renderer shares scene state, physical sizes, and camera paths
// with the GPU renderer. Its projected glow/lens cues are NOT ray integration.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const plus=(a,b)=>a.map((v,i)=>v+b[i]);
const scale=(a,s)=>a.map(v=>v*s);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>scale(a,1/(Math.hypot(...a)||1));
const TAU=Math.PI*2;
const circle=Array.from({length:73},(_,j)=>[Math.cos(j/72*TAU),Math.sin(j/72*TAU)]);
let starDirections;

export function cpuSpectrum(rgb,band,kind='surface',heat=1){
 if(band==='geometry')return kind==='white-hole'?rgb:[0,0,0];
 if(!band||band==='visible')return rgb;
 // Qualitative component responses, shared in intent with the GPU shader.
 // These are false-color illustrations, not calibrated detector images.
 const light=(rgb[0]+rgb[1]+rgb[2])/3,h=clamp(heat,0,1);
 // Only the cool, opaque TZO envelope is observable. Interior metadata never
 // creates a second source or a bright neutron-star high-energy component.
 if(kind==='tzo'||kind==='tzo-wind'){
  const wind=kind==='tzo-wind',response={infrared:[[1.3,.42,.2],wind?.35:1.5],xray:[[.2,.5,.95],wind?.0005:.001],radio:[[.34,.22,.20],wind?.015:.004],gamma:[[.30,.23,.45],wind?.000005:.00001]}[band];
  return response?response[0].map(v=>v*light*response[1]):rgb;
 }
 let hue=[1,.32,.15],weight=1;
 if(band==='infrared'){
  weight=kind==='nebula'?2.6:kind==='jet'?.22:kind==='probe'?.48:kind==='hot'?.15+2.5*(1-h)**1.2:1;
  hue=[1.3,.42,.2];
 }else if(band==='xray'){
  hue=[.2,.5,.95];weight=kind==='hot'?.025+5*h**5:kind==='jet'?2.4:kind==='nebula'?.20:kind==='star'?.09:kind==='probe'?.018:kind==='source'?1.7:kind==='white-hole'?.6:.008;
 }else if(band==='radio'){
  hue=kind==='hot'?[.24+.76*Math.sqrt(h),.025+.555*Math.sqrt(h),.10+.07*Math.sqrt(h)]:kind==='jet'?[.06+.94*h,.48,.76-.64*h]:kind==='nebula'?[.3,.12,.2]:kind==='source'?[.24,.68,.90]:kind==='probe'?[.32,.45,.55]:kind==='white-hole'?[.8,.35,.12]:[.16,.28,.36];
  weight=kind==='hot'?.20+1.7*h**.7:kind==='jet'?3.2:kind==='nebula'?.65:kind==='star'?.009:kind==='probe'?.003:kind==='source'?.9:kind==='white-hole'?.55:.0003+light*.002;
 }else if(band==='gamma'){
  hue=kind==='hot'?[.4+.52*h,.1+.74*h,.72+.28*h]:kind==='jet'?[.42+.5*h,.1+.75*h,.95+.05*h]:[.7,.4,1];
  weight=kind==='hot'?.0004+1.2*h**9:kind==='jet'?4.8*h**4:kind==='nebula'?.008:kind==='star'?.0004:kind==='probe'?.00001:kind==='source'?1.4:kind==='white-hole'?.025:.000015+light*.00004;
 }else return rgb;
 return hue.map(v=>v*light*weight);
}
export function cpuColor(hex,band,kind='surface',alpha=1,heat=1,brightness=1){
 const valid=/^#[\da-f]{6}$/i.test(hex)?hex:'#8ac6ff';
 const c=cpuSpectrum([1,3,5].map(i=>parseInt(valid.slice(i,i+2),16)/255),band,kind,heat);
 return `rgba(${c.map(v=>Math.round(clamp(v*brightness,0,1)*255)).join(',')},${clamp(alpha,0,1)})`;
}
// Bolometric redshift cue for the quasistatic surface comparison. No change
// in opacity: a fading star still blocks the sky. This is not collapse dynamics.
export function cpuStellarRadiance(info){
 if(!info)return 1;if(info.collapsed)return 0;
 const r=Math.max(1e-20,info.radiusMeters),rg=info.gravitationalRadiusMeters||0;
 const lapseSquared=clamp(1-2*rg/r,0,1);
 return lapseSquared*lapseSquared;
}
// Distant Schwarzschild apparent radius. The CPU preview applies this
// spherical cue to compact bodies; spin and finite-observer corrections are
// intentionally left to the GPU optical renderer.
export function cpuCompactImageRadius(radius,rg,lensing=true,interior=false){
 if(!lensing||interior||!(rg>0))return radius;
 return radius>3*rg?radius/Math.sqrt(Math.max(1e-20,1-2*rg/radius)):3*Math.sqrt(3)*rg;
}
function cpuStellarTint(hex,info){
 const valid=/^#[\da-f]{6}$/i.test(hex)?hex:'#ffe2af',g=Math.pow(cpuStellarRadiance(info),.25),weights=[1,.20+.80*g,.025+.975*g];
 return '#'+[1,3,5].map((offset,index)=>Math.round(parseInt(valid.slice(offset,offset+2),16)*weights[index]).toString(16).padStart(2,'0')).join('');
}
export function cpuProject(point,frame,width,height){
 if(!frame)return null;
 const q=point.map((v,i)=>v-frame.observer[i]),depth=dot(q,frame.forward);
 if(!(depth>1e-14))return null;
 const aspect=width/Math.max(height,1),fov=.83*Math.max(1,1.35/aspect),pixels=height/fov;
 const x=width/2+dot(q,frame.right)/depth*pixels,y=height/2-dot(q,frame.up)/depth*pixels;
 return Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(pixels/depth)?{x,y,depth,pixels:pixels/depth}:null;
}
// Whole catalogs stay selectable, while the CPU paints only resolvable bodies.
// The per-frame limit bounds old-phone command generation independently of the
// number of named moons in the tree. Focused objects are never budget-culled.
export function cpuVisibleBodies(bodies,frame,width,height,focusId=null){
 const candidates=[];
 for(const body of bodies){
  if(body.type==='dyson'){const offset=body.position.map((v,i)=>v-frame.observer[i]),distance=Math.hypot(...offset);if(distance<body.radius*1.05){candidates.push({body,depth:dot(offset,frame.forward),score:1e19});continue;}}
  if(['ring','belt'].includes(body.type)&&body.opacity===0)continue;
  const q=cpuProject(body.position,frame,width,height);if(!q)continue;
  const radius=body.radius*q.pixels,extent=body.type==='probe'?Math.max(12,radius):radius;
  if(!(radius>.12||body.type==='probe')||q.x+extent<0||q.y+extent<0||q.x-extent>width||q.y-extent>height)continue;
  candidates.push({body,depth:q.depth,score:body.id===focusId?1e20:Math.min(radius,10000)});
 }
 candidates.sort((a,b)=>b.score-a.score);
 let rings=0;
 const selected=candidates.filter(x=>!['ring','belt'].includes(x.body.type)||++rings<=4).slice(0,32);
 return selected.sort((a,b)=>Math.abs(a.depth-b.depth)<Math.max(a.body.radius,b.body.radius)*1e-8?(Number(['ring','belt'].includes(a.body.type))-Number(['ring','belt'].includes(b.body.type))):b.depth-a.depth).map(x=>x.body);
}
export function cpuBodyBasis(body,primaryBasis,time=0){
 if(body.tidalBasis)return body.tidalBasis;
 const tilt=(body.axialTilt||0)*Math.PI/180,c=Math.cos(tilt),s=Math.sin(tilt),x=primaryBasis[0],y=plus(scale(primaryBasis[1],c),scale(primaryBasis[2],s)),z=plus(scale(primaryBasis[2],c),scale(primaryBasis[1],-s));
 const period=body.rotationPeriodSeconds,spin=body.tidallyLocked?(body.headingAngle||0)+Math.PI:Math.abs(period)>1?-time*(18*REFERENCE_RG_METERS/299792458)*TAU/period:-time*(body.rotation??1)*.05,phase=(body.surfaceRotationPhase||0)+spin,cp=Math.cos(phase),sp=Math.sin(phase);
 return [plus(scale(x,cp),scale(z,sp)),y,plus(scale(x,-sp),scale(z,cp))];
}
export function cpuRingOccluded(point,parent,observer){
 if(!parent||(parent.opacity??1)<.999)return false;
 // Only the ocean illustration has a second surface; its bounding radius is
 // never treated as an opaque sphere. Both physical spheres block the ray.
 if(parent.waterCap){
  const core=parent.coreRadius||parent.radius,cap=parent.waterCap;
  return cpuRingOccluded(point,{position:parent.position,radius:core},observer)||cpuRingOccluded(point,{position:plus(parent.position,scale(cap.direction,core*cap.offsetRatio)),radius:core*cap.radiusRatio},observer);
 }
 if(parent.tidalBasis&&parent.shapeAxes){
  const maximum=Math.max(...parent.shapeAxes),axes=parent.shapeAxes.map(v=>v/maximum*parent.radius),offset=observer.map((v,i)=>v-parent.position[i]),delta=point.map((v,i)=>v-observer[i]);
  const ro=parent.tidalBasis.map((b,j)=>dot(offset,b)/axes[j]),rd=parent.tidalBasis.map((b,j)=>dot(delta,b)/axes[j]),a=dot(rd,rd),b=dot(ro,rd),c=dot(ro,ro)-1,d=b*b-a*c;
  if(!(a>0&&d>=0))return false;const entry=(-b-Math.sqrt(d))/a;return entry>1e-8&&entry<1-1e-6;
 }
 const delta=point.map((v,i)=>v-observer[i]),distance=Math.hypot(...delta);if(!(distance>0))return false;
 const ray=scale(delta,1/distance),center=parent.position.map((v,i)=>v-observer[i]),along=dot(center,ray),impact2=dot(center,center)-along*along,radius=parent.radius;
 if(along<=0||impact2>=radius*radius)return false;
 return along-Math.sqrt(Math.max(0,radius*radius-impact2))<distance-radius*1e-6;
}
function seeded(n){const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);}

export class CpuRenderer extends BlackHoleRenderer {
 constructor(canvas,options={}){
  const notify=options.onStats||(()=>{});
  super(canvas,{...options,onStats:stats=>notify({...stats,cpu:true,webgl:0,effectiveQuality:'cpu'})});
  this.cpu=true;this.cpuMode=true;this.isCPU=true;this.cpuNextDraw=0;this.cpuDrawCost=0;this.cpuGeometry=1;this.quality='cpu';if(this.ready)this.onError('');
 }
 initGL(){
  this.gl=null;this.webgl2=false;this.contextLost=false;this.programs=new Map();this.failedPrograms=new Set();this.pendingProgram=null;this.activeProgram=null;this.gpuFence=null;
  this.context2d=this.canvas.getContext('2d',{alpha:false});this.ready=!!this.context2d;this.steps=0;this.renderScale=1;
  if(!this.ready)this.onError('This browser cannot start the simplified preview.');
 }
 resize(){
  const rect=this.canvas.getBoundingClientRect(),ratio=Math.min(1,640/Math.max(rect.width,1),420/Math.max(rect.height,1));
  this.canvas.width=Math.max(2,Math.round(rect.width*ratio));this.canvas.height=Math.max(2,Math.round(rect.height*ratio));
  this.renderScale=ratio;this.resizePending=false;this.resizeMeasurePending=false;
 }
 setQuality(){this.quality='cpu';}
 getState(){return {...super.getState(),cpu:true,webgl:0,quality:'cpu',effectiveQuality:'cpu',shaderCompiling:false,gpuWaiting:false};}
 async getVRSupport(){return {supported:false,reason:'VR needs the GPU renderer and a compatible headset browser.'};}
 async enterVR(){throw new Error('VR needs the GPU renderer.');}
 async exitVR(){}
 captureImage(){return new Promise((resolve,reject)=>{
  if(!this.ready||this.disposed){reject(new Error('Start the CPU preview before saving an image.'));return;}
  if(!this.render(this.now(),false,true)){reject(new Error(this.geometryError||'The CPU preview could not render this image.'));return;}
  if(this.canvas.convertToBlob){this.canvas.convertToBlob({type:'image/png'}).then(resolve,reject);return;}this.canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image export failed.')),'image/png');
 });}
 drawLine(points,color,width=1){
  const ctx=this.context2d;ctx.beginPath();let drawing=false;
  for(const p of points){const q=p&&cpuProject(p,this.cameraFrame,this.canvas.width,this.canvas.height);if(!q||Math.abs(q.x)>1e6||Math.abs(q.y)>1e6){drawing=false;continue;}if(drawing)ctx.lineTo(q.x,q.y);else{ctx.moveTo(q.x,q.y);drawing=true;}}
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
 }
 sky(){
  const ctx=this.context2d,w=this.canvas.width,h=this.canvas.height,s=this.state,f=this.cameraFrame;
  const other=s.bridge&&Math.hypot(...f.observer)<this.configCache.bridgeRadius/2;
  const nebula=other?{color:s.bridgeOtherColor,shape:s.bridgeOtherShape,rotation:s.bridgeOtherRotation,scale:s.bridgeOtherScale,intensity:s.bridgeOtherIntensity}:{color:s.nebulaColor,shape:s.nebulaShape,rotation:s.nebulaRotation,scale:s.nebulaScale,intensity:s.nebulaIntensity};
  ctx.fillStyle=s.spectrum==='geometry'?'#000':'#02050b';ctx.fillRect(0,0,w,h);if(s.spectrum==='geometry')return;
  if(other?s.bridgeOtherNebula!==false:s.nebula){
   const n=nebula.shape==='filaments'?7:nebula.shape==='shell'?5:4;
   for(let k=0;k<n;k++){
    const a=(k*.93+nebula.rotation*Math.PI/180),direction=unit([Math.sin(a),Math.cos(a*1.3)*.55,Math.cos(a)]),q=cpuProject(plus(f.observer,scale(direction,100)),f,w,h);if(!q)continue;
    const radius=w*.36*nebula.scale,g=ctx.createRadialGradient(q.x,q.y,0,q.x,q.y,Math.max(1,radius));
    g.addColorStop(0,cpuColor(nebula.color,s.spectrum,'nebula',Math.min(.3,nebula.intensity*.13)));g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
   }
  }
  const showStars=other?s.bridgeOtherStars!==false:s.stars,starDensity=other?(s.bridgeOtherStarDensity??1):s.starDensity,brightness=other?(s.bridgeOtherStarBrightness??1):(s.starBrightness??1),variety=other?(s.bridgeOtherStarVariety??1):(s.starVariety??1);

  if(!starDirections)starDirections=Array.from({length:1600},(_,k)=>{const z=seeded(k*3+1)*2-1,a=seeded(k*3+2)*TAU,r=Math.sqrt(1-z*z);return [r*Math.cos(a),z,r*Math.sin(a),Math.floor(seeded(k*3+3)*15),seeded(k+7)>.96?1.4:.8,seeded(k+8043)];});
  if(this.cpuStarBand!==s.spectrum+variety){this.cpuStarBand=s.spectrum+variety;this.cpuStarColors=Array.from({length:16},(_,i)=>{const palette=['#90b9ff','#c8defa','#fff1cb','#ffbd7d'],tint=variety>.1?palette[i%4]:'#c8defa';return cpuColor(tint,s.spectrum,'star',.25+i/20);});this.cpuSourceColors=Array.from({length:16},(_,i)=>cpuColor('#c8defa',s.spectrum,'source',.25+i/20));}
  const count=Math.min(starDirections.length,Math.floor(280*starDensity*(showStars?1:0))),pixels=h/(.83*Math.max(1,1.35/(w/h)));
  ctx.globalAlpha=clamp(brightness,0,1);
  for(let k=0;k<count;k++){
   const d=starDirections[k],depth=dot(d,f.forward);if(depth<=0)continue;const x=w/2+dot(d,f.right)*pixels/depth,y=h/2-dot(d,f.up)*pixels/depth;if(x<0||y<0||x>w||y>h)continue;
   const source=d[5]>(s.spectrum==='gamma'?.997:s.spectrum==='radio'?.987:s.spectrum==='xray'?.978:1);
   ctx.fillStyle=(source?this.cpuSourceColors:this.cpuStarColors)[d[3]];ctx.fillRect(x,y,d[4]*Math.sqrt(Math.max(.1,brightness)),d[4]*Math.sqrt(Math.max(.1,brightness)));
  }
  ctx.globalAlpha=1;

 }
 grid(){for(const _ of this.gridStages()){} }
 *gridStages(){
  const s=this.state;if(!s.grid&&s.spectrum!=='geometry')return;
  const m=this.massScale,holes=s.binary&&this.holeData[7]>0?2:1,f=this.cameraFrame,ctx=this.context2d,focus=this.getFocusFrame(),distance=focus?Math.hypot(...f.observer.map((v,i)=>v-focus.position[i])):Math.hypot(...f.observer),localScale=s.bridge?this.configCache.bridgeRadius:s.blackHole?m:Math.max(1/REFERENCE_RG_METERS,focus?Math.max(focus.radius*.5,distance*.035):distance*.035),spacing=.75*localScale*Math.pow(2,Math.max(0,Math.floor(Math.log2(Math.max(1,distance/localScale/22))))),extent=spacing*16,samples=this.cpuGeometry===0?16:24,lines=this.cpuGeometry===0?12:16,w=this.canvas.width,h=this.canvas.height,pixels=h/(.83*Math.max(1,1.35/(w/h)));
  const warpOwner=s.warp?this.objectFrames.find(b=>b.id===this.warpObjectId):null;
  const normal=warpOwner?.frame?.[1]||(s.binary?[0,1,0]:this.configCache.primaryAxis),bx=unit(cross(normal,Math.abs(normal[2])>.9?[1,0,0]:[0,0,1])),bz=cross(bx,normal),anchor=warpOwner?scale(normal,dot(warpOwner.position,normal)):(s.blackHole?Array.from(this.holeData.slice(0,3)):[0,0,0]),cameraOffset=f.observer.map((v,i)=>v-anchor[i]),planeSlope=dot(f.forward,normal),hitDistance=Math.abs(planeSlope)>1e-5?-dot(cameraOffset,normal)/planeSlope:-1,origin=hitDistance>0?plus(cameraOffset,scale(f.forward,hitDistance)):cameraOffset,centerX=Math.round(dot(origin,bx)/spacing)*spacing,centerZ=Math.round(dot(origin,bz)/spacing)*spacing;

  const weakBodies=!s.blackHole?this.objectFrames.filter(b=>['star','planet','moon'].includes(b.type)&&b.massSolar>0).sort((a,b)=>b.massSolar-a.massSolar).slice(0,8):[];
  // Two overlapping finite tracer windows replenish the CPU guide forever.
  // Each resets only at zero opacity; no late-time empty grid or hard reset.
  const flowWindow=s.blackHole&&(this.holeData[3]>0||this.holeData[7]>0)?12:weakBodies.length?weakGridFlowWindow(weakBodies[0].radius,weakBodies[0].massSolar/4300000):0;
  const layers=flowWindow>0?2:1;for(let layer=0;layer<layers;layer++){const flowTime=layers===2?(Math.max(0,this.time)+layer*flowWindow*.5)%flowWindow:0,flowOpacity=layers===2?Math.sin(flowTime/flowWindow*Math.PI)**2:1;
  for(let axis=0;axis<2;axis++)for(let j=-lines;j<=lines;j++){
   ctx.beginPath();let drawing=false;for(let i=-samples;i<=samples;i++){
    const gx=centerX+(axis===0?j*spacing:i*extent/samples),gz=centerZ+(axis===0?i*extent/samples:j*spacing);let point=plus(anchor,plus(scale(bx,gx),scale(bz,gz))),visible=true;
    for(let k=0;k<holes&&s.blackHole;k++){
     if(!(this.holeData[k*4+3]>0))continue;
     const center=Array.from(this.holeData.slice(k*4,k*4+3)),relative=point.map((v,i)=>v-center[i]),mass=this.holeData[k*4+3],r=Math.hypot(...relative),scaled=Math.max(r/mass,.1),spin=k?s.secondarySpin:s.spin;
     // Invert the same advected radial label used by the GPU guide.
     const label=Math.pow(scaled,1.5)+((k?s.secondaryWhiteHole:s.whiteHole)?1:-1)*1.5*Math.SQRT2*2*flowTime,radius=Math.cbrt(label*label),factor=radius/scaled,angle=2*spin*this.time/(1+scaled**3),cos=Math.cos(angle),sin=Math.sin(angle),rotation=plus(plus(scale(relative,cos),scale(cross(normal,relative),sin)),scale(normal,dot(normal,relative)*(1-cos)));
     point=plus(center,scale(rotation,factor));if(s.spectrum==='geometry')point=plus(point,scale(normal,-mass*1.8/Math.sqrt(1+(r/Math.max(mass*3,1e-20))**2)));
     if(!s.interiorView&&(label<=0||Math.hypot(...point.map((v,i)=>v-center[i]))<this.configCache.horizon[k])){visible=false;break;}
    }
    if(warpOwner&&s.warpField){const delta=point.map((v,i)=>v-warpOwner.position[i]),size=Math.max(1e-20,warpOwner.radius*effectiveWarpRadius(s.warpFactor)),r=Math.hypot(...delta)/size,profile=Math.exp(-(((r-1)*2.8)**2)),direction=warpOwner.frame?.[2]||[0,0,1];point=plus(point,scale(direction,profile*Math.tanh((s.warpFactor||0)/4)*dot(delta,direction)));point=plus(point,scale(normal,-.34*Math.min(3,s.warpFactor*.3)*dot(delta,direction)*Math.exp(-(((r-1)*s.warpThickness*.7)**2))));}
    // Material markers follow the same radial free-fall clock as the GPU.
    // Replenished windows keep this finite CPU schematic populated indefinitely.
    for(const body of weakBodies){const delta=point.map((v,i)=>v-body.position[i]),radial=Math.hypot(...delta),next=weakGridTracerRadius(radial,body.massSolar/4300000,flowTime);if(next<=body.radius){visible=false;break;}point=plus(body.position,scale(delta,next/Math.max(radial,1e-30)));}
    // The depth cue remains an amplified schematic, not a physical rubber sheet.
    for(const body of weakBodies){const delta=point.map((v,i)=>v-body.position[i]),radial=Math.hypot(...delta),rg=body.massSolar/4300000,scaleRadius=Math.max(body.radius*2,localScale*2),strength=s.spectrum==='geometry'?localScale*1.5*Math.sqrt(body.massSolar/Math.max(weakBodies[0].massSolar,1e-20)):Math.sqrt(Math.max(0,2*rg*scaleRadius)),dip=strength/Math.sqrt(1+(radial/scaleRadius)**2);point=plus(point,scale(normal,-dip));}
    if(s.gravitationalWaves&&s.binary&&s.blackHole&&this.holeData[3]>0&&this.holeData[7]>0){const d=point.map((v,i)=>v-anchor[i]),radial=Math.hypot(...d),angle=Math.atan2(dot(d,bz),dot(d,bx)),phase=(this.time*(s.waveFrequency||1)-radial/Math.max(m,1e-20)*.3)*2,amplitude=(s.waveAmplitude??.3)*(this.cancellationFraction??1)*m/(1+radial/Math.max(m*20,1e-20));point=plus(point,scale(normal,amplitude*Math.cos(phase)*Math.cos(2*angle)));}
    const delta=point.map((v,i)=>v-f.observer[i]),depth=dot(delta,f.forward);if(!visible||depth<=1e-14){drawing=false;continue;}const x=w/2+dot(delta,f.right)*pixels/depth,y=h/2-dot(delta,f.up)*pixels/depth;if(!Number.isFinite(x+y)||Math.abs(x)>1e6||Math.abs(y)>1e6){drawing=false;continue;}if(drawing)ctx.lineTo(x,y);else{ctx.moveTo(x,y);drawing=true;}

   }
   ctx.strokeStyle=`rgba(83,161,207,${.3*flowOpacity})`;ctx.lineWidth=.65;ctx.stroke();yield;
  }
  }
 }
 // A bounded 3D reference lattice for the opt-in CPU schematic. Curved
 // Cartesian lines share their intersections; sinh spacing concentrates cells
 // near the subject without independent detached grids or a per-pixel march.

 *captureShadowStages(center,mass,horizon){
  const ctx=this.context2d,f=this.cameraFrame,width=this.canvas.width,height=this.canvas.height,delta=center.map((v,i)=>v-f.observer[i]),distance=Math.hypot(...delta),toward=unit(delta),angle=this.state.lensing?apparentCaptureAngle(distance,mass):Math.asin(Math.min(1,horizon/distance)),cosine=Math.cos(angle),direction=[dot(toward,f.right),dot(toward,f.up),dot(toward,f.forward)],rows=Math.min(128,Math.max(24,Math.ceil(height/2)));
  ctx.fillStyle='#000';ctx.beginPath();let previous=captureSpans(direction,cosine,width,height,0);
  for(let row=0;row<rows;row++){
   const y0=row*height/rows,y1=(row+1)*height/rows,next=captureSpans(direction,cosine,width,height,y1),middle=captureSpans(direction,cosine,width,height,(y0+y1)*.5);
   for(let j=0;j<middle.length;j++){const top=previous.length===middle.length?previous[j]:middle[j],bottom=next.length===middle.length?next[j]:middle[j];ctx.moveTo(top[0],y0);ctx.lineTo(top[1],y0);ctx.lineTo(bottom[1],y1);ctx.lineTo(bottom[0],y1);ctx.closePath();}
   previous=next;if(row%8===7)yield;
  }
  ctx.fill();
 }
 hole(k){for(const _ of this.holeStages(k)){} }
 *holeStages(k){
  const source=this.state,s=k?{...source,whiteHole:!!source.secondaryWhiteHole,disk:source.secondaryDisk??source.disk,diskStyle:source.secondaryDiskStyle??source.diskStyle,diskColor:source.secondaryDiskColor??source.diskColor,diskThickness:source.secondaryDiskThickness??source.diskThickness,diskDensity:source.secondaryDiskDensity??source.diskDensity,jets:source.secondaryJets??source.jets,jetColor:source.secondaryJetColor??source.jetColor,jetSpread:source.secondaryJetSpread??source.jetSpread,jetLength:source.secondaryJetLength??source.jetLength,jetIntensity:source.secondaryJetIntensity??source.jetIntensity}:source,ctx=this.context2d,m=this.holeData[k*4+3],center=Array.from(this.holeData.slice(k*4,k*4+3)),distance=Math.hypot(...center.map((v,i)=>v-this.cameraFrame.observer[i])),nearCapture=this.sceneId==='radiant-descent'&&k===0&&distance<16*m&&!s.interiorView,q=cpuProject(center,this.cameraFrame,this.canvas.width,this.canvas.height)||(nearCapture?{pixels:this.canvas.height/(.83*Math.max(1,1.35/(this.canvas.width/this.canvas.height))*Math.max(distance,1e-20)),x:this.canvas.width*.5,y:this.canvas.height*.5}:null);if(!q)return;
  if(!(m>0))return;
  const horizon=this.configCache.horizon[k],imageRadius=cpuCompactImageRadius(horizon,m,s.lensing,s.interiorView&&s.spectrum==='geometry'),r=horizon*q.pixels,axis=k?this.configCache.secondaryAxis:this.configCache.primaryAxis,bx=unit(cross(axis,Math.abs(axis[2])>.9?[1,0,0]:[0,0,1])),bz=cross(bx,axis);
  if(s.spectrum==='geometry'){
   if(nearCapture){yield* this.captureShadowStages(center,m,this.configCache.horizon[k]);return;}
   // The same apparent capture disk as Visible; no synthetic cyan contour.
   const radius=Math.max(.5,imageRadius*q.pixels);if(!(radius>0)||radius>100000)return;
   ctx.fillStyle=s.whiteHole?cpuColor('#d8eff7',s.spectrum,'white-hole'):'#000';ctx.beginPath();ctx.arc(q.x,q.y,radius,0,TAU);ctx.fill();
   if(s.whiteHole){const glow=ctx.createRadialGradient(q.x,q.y,radius*.8,q.x,q.y,radius*2.1);glow.addColorStop(0,cpuColor('#ccebff',s.spectrum,'white-hole',.35));glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.fillRect(q.x-radius*2.1,q.y-radius*2.1,radius*4.2,radius*4.2);}
   if(s.interiorView){const spin=k?s.secondarySpin:s.spin,inner=m*(1-Math.sqrt(Math.max(0,1-spin*spin)));if(inner>horizon*.001)this.geometryOutline(center,inner,'#ebc88f',true);this.singularity(center,Math.abs(spin)*m,bx,bz);}
   return;
  }
  if(s.disk){
   const inner=Math.max(horizon*1.03,this.configCache.isco[k]*m),outer=this.configCache.diskOuter[k];
   const cold=s.diskStyle==='dust'||s.diskStyle==='nebula',bandWeight=cold?(s.spectrum==='gamma'?.015:s.spectrum==='radio'?.18:s.spectrum==='xray'?.12:s.spectrum==='infrared'?1.7:1):1;
   for(let ring=0;ring<18;ring++){
    const radius=inner+(outer-inner)*(ring+.5)/18,points=[];for(let j=0;j<=72;j+=this.cpuGeometry===0?2:1){const c=circle[j];points.push([center[0]+(bx[0]*c[0]+bz[0]*c[1])*radius,center[1]+(bx[1]*c[0]+bz[1]*c[1])*radius,center[2]+(bx[2]*c[0]+bz[2]*c[1])*radius]);}
    this.drawLine(points,cpuColor(s.diskPalette==='rainbow'?['#f34b57','#ff9b35','#e9e743','#4ed279','#3daeea','#8161ed','#d952dc'][ring%7]:s.diskColor,s.spectrum,'hot',Math.min(.9,(1-ring/22)*.65*s.diskDensity)*bandWeight,1-ring/18),Math.min(12,Math.max(.8,(outer-inner)*q.pixels/19)));yield;
   }
  }
  if(s.jets)for(const sign of [-1,1]){
   const points=[];for(let j=0;j<=25;j++){const h=(horizon*1.04+j/25*38*m*s.jetLength)*sign;points.push(plus(center,scale(axis,h)));}
   const width=Math.min(10,Math.max(.7,m*q.pixels*.18*s.jetSpread));
   if(s.spectrum==='radio'||s.spectrum==='gamma'){
    for(let j=0;j<25;j+=3){const stream=.65+.35*Math.sin(j*.7-this.time*4),heat=s.spectrum==='gamma'?stream:Math.exp(-j*.12),alpha=.5*s.jetIntensity*(s.spectrum==='gamma'?Math.exp(-j*.06):1);this.drawLine(points.slice(j,Math.min(26,j+4)),cpuColor(s.jetColor,s.spectrum,'jet',alpha,heat),width);yield;}
   }else{this.drawLine(points,cpuColor(s.jetColor,s.spectrum,'jet',.5*s.jetIntensity),width);yield;}
  }
  if(nearCapture){yield* this.captureShadowStages(center,m,horizon);return;}
  if(!(r>0)||r>100000)return;
  const radius=Math.max(.5,imageRadius*q.pixels);
  if(s.lensing&&s.disk){ctx.strokeStyle=cpuColor(s.diskColor,s.spectrum,'hot',.65);ctx.lineWidth=Math.max(1,Math.min(15,r*.17));ctx.beginPath();ctx.arc(q.x,q.y,radius*1.08,0,TAU);ctx.stroke();}
  ctx.fillStyle=s.whiteHole?cpuColor('#d8eff7',s.spectrum,'white-hole'):'#000';ctx.beginPath();ctx.arc(q.x,q.y,radius,0,TAU);ctx.fill();
  if(s.whiteHole){const g=ctx.createRadialGradient(q.x,q.y,radius*.8,q.x,q.y,radius*2.1);g.addColorStop(0,cpuColor('#ccebff',s.spectrum,'white-hole',.35));g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(q.x-radius*2.1,q.y-radius*2.1,radius*4.2,radius*4.2);}
  // The CPU shadow cue and the horizon are different; no unlabeled horizon overlay.
 }
 *annulusStages(body){
  const ctx=this.context2d,s=this.state,frame=this.cameraFrame,parent=this.objectFrames.find(x=>x.id===body.parentId),basis=cpuBodyBasis({...body,axialTilt:body.axialTilt??parent?.axialTilt??0},this.configCache.primaryBasis,this.time),inner=clamp(body.innerRadiusRatio??.55,.1,.97),bandCount=this.cpuGeometry===0?7:11,segments=this.cpuGeometry===0?48:72,material=body.material==='icy'?'#d4dfeb':body.material==='metallic'?'#9b9ea8':'#ad9476',q=cpuProject(body.position,frame,this.canvas.width,this.canvas.height);if(!q)return;
  const r=body.radius*q.pixels;
  ctx.strokeStyle=cpuColor(body.color||material,s.spectrum,body.type==='disk'?'hot':'surface',clamp(body.opacity??(body.type==='belt'?.16:.88),0,body.type==='belt'?.2:1));ctx.lineWidth=Math.min(body.type==='belt'?1.25:14,Math.max(.55,r*(1-inner)/bandCount*1.12));
  for(let k=0;k<bandCount;k++){
   const radius=body.radius*(inner+(1-inner)*(k+.5)/bandCount);ctx.beginPath();let drawing=false;
   for(let j=0;j<=segments;j++){
    const angle=j/segments*TAU,point=plus(body.position,plus(scale(basis[0],Math.cos(angle)*radius),scale(basis[2],Math.sin(angle)*radius))),visible=!cpuRingOccluded(point,parent,frame.observer),p=visible?cpuProject(point,frame,this.canvas.width,this.canvas.height):null;
    if(!p||body.type==='belt'&&seeded(k*segments+j)>.42||Math.abs(p.x)>1e5||Math.abs(p.y)>1e5){drawing=false;continue;}
    if(drawing)ctx.lineTo(p.x,p.y);else{ctx.moveTo(p.x,p.y);drawing=true;}
   }
   ctx.stroke();yield;
  }
 }
 *planetDetailStages(body,r){
  if(r<3)return;const ctx=this.context2d,s=this.state,id=Number(body.surfaceId)||0,fill=(color,alpha=1)=>{ctx.fillStyle=cpuColor(color,s.spectrum,'surface',alpha);},ellipse=(x,y,a,b,color,alpha=1,angle=0)=>{fill(color,alpha);ctx.beginPath();ctx.ellipse(x*r,y*r,a*r,b*r,angle,0,TAU);ctx.fill();};
  // These are bounded projected hints for the explicitly low-fidelity backend.
  // Named GPU surfaces use the separate higher-detail spherical material.
  if(id===1){
   const continents=[[-.58,-.3,.23,.14,-.5],[-.32,.25,.11,.29,-.35],[.13,-.13,.22,.15,.2],[.34,-.35,.33,.13,-.15],[.16,.25,.14,.27,-.25],[.58,.43,.16,.09,.25]];
   for(const[x,y,a,b,angle]of continents)ellipse(x,y,a,b,'#527a43',.92,angle);
   ellipse(-.03,-.87,.35,.09,'#e5edf1',.9);ellipse(.05,.88,.35,.07,'#edf0eb',.9);yield;
   for(let j=0;j<6;j++)ellipse(Math.sin(j*2.2)*.55,Math.cos(j*1.6)*.59,.22,.025,'#eef4fa',.6,j*.4);
  }else if(id===3){
   ellipse(-.1,.1,.47,.18,'#6d473a',.55,.3);ellipse(.2,-.15,.39,.055,'#613d30',.8,-.17);ellipse(-.35,-.35,.14,.10,'#af754e',.8);ellipse(-.35,-.35,.033,.028,'#664734',.9);ellipse(0,-.89,.27,.065,'#e7ded4',.9);ellipse(0,.91,.25,.055,'#e7ded4',.7);
  }else if(id===4||id===5||id===8||id===9){
   const tint=id===4?'#825743':id===5?'#a58c5e':id===8?'#97c9cf':'#3269b4';ctx.strokeStyle=cpuColor(tint,s.spectrum,'surface',.48);ctx.lineWidth=Math.max(.7,r*(id===4?.065:.04));
   for(let j=-6;j<=6;j++){const y=j*r/7,x=Math.sqrt(Math.max(0,r*r-y*y));ctx.beginPath();ctx.moveTo(-x,y);ctx.lineTo(x,y);ctx.stroke();}yield;
   if(id===4){ellipse(.3,.28,.21,.105,'#b06743',.95,.12);ellipse(.3,.28,.12,.06,'#d49363',.75,.12);}
   if(id===5){fill('#776e45',.8);ctx.beginPath();for(let j=0;j<6;j++){const a=j*TAU/6,x=Math.cos(a)*r*.16,y=(-.79+Math.sin(a)*.07)*r;j?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();}
   if(id===9)ellipse(-.3,-.25,.16,.065,'#1d417c',.8,-.15);
  }else if(id===10){ellipse(.12,.2,.3,.32,'#e1d7bc',.9,.4);ellipse(.35,.13,.25,.25,'#ece3cc',.9,-.5);ellipse(-.45,-.1,.26,.2,'#75513f',.6);}
  else if(id===12){for(let j=0;j<7;j++){const x=Math.sin(j*2.3)*.62,y=Math.cos(j*1.9)*.59;ellipse(x,y,.06,.04,j%2?'#683e2a':'#e6a84c',.9);} }
  else if(id===13||id===17){ctx.strokeStyle=cpuColor(id===13?'#ad8e74':'#668e9f',s.spectrum,'surface',.55);ctx.lineWidth=Math.max(.5,r*.012);for(let j=0;j<6;j++){ctx.beginPath();const y=-.65+j*.24;ctx.moveTo(-r*.6,y*r);ctx.lineTo(-r*.14,(y+.13)*r);ctx.lineTo(r*.36,(y-.14)*r);ctx.lineTo(r*.6,y*r);ctx.stroke();}}
  else if(id===16||id===6){for(let j=0;j<6;j++)ellipse(Math.sin(j*1.7)*.4,-.6+j*.22,.4,.035,id===16?'#b88745':'#e6c893',.5,j*.11);}
  else {
   if(id===2){for(const[x,y,a,b]of [[-.35,-.15,.27,.24],[.1,-.42,.22,.15],[.39,-.13,.24,.18],[-.15,.34,.13,.17]])ellipse(x,y,a,b,'#5f656a',.65);yield;}
   if(id===21)ellipse(-.3,0,.48,.75,'#46362b',.8);
   const count=Math.min(this.cpuGeometry===0?10:22,Math.floor(r*.6));
   for(let j=0;j<count;j++){const a=seeded(j+340)*TAU,rho=Math.sqrt(seeded(j+781))*.78,size=.015+.045*seeded(j+989),x=Math.cos(a)*rho,y=Math.sin(a)*rho;ellipse(x,y,size,size*.85,'#555253',.35);ctx.strokeStyle=cpuColor('#c7c3b7',s.spectrum,'surface',.4);ctx.lineWidth=Math.max(.5,r*.006);ctx.beginPath();ctx.ellipse(x*r,y*r,size*r,size*r*.85,0,0,TAU);ctx.stroke();if(j%8===7)yield;}
  }
 }
 body(body){for(const _ of this.bodyStages(body)){} }
 *dysonStages(body,insidePass){
  const width=this.canvas.width,height=this.canvas.height,frame=this.cameraFrame,aspect=width/height,fov=.83*Math.max(1,1.35/aspect),origin=frame.observer.map((v,i)=>(v-body.position[i])/body.radius),ctx=this.context2d,cell=Math.max(12,Math.ceil(Math.sqrt(width*height/2200))),opacity=this.state.spectrum==='geometry'?1:body.opacity??1;
  if(opacity<=0)return;ctx.save();ctx.globalAlpha=opacity;
  for(let y=0;y<height;y+=cell){for(let x=0;x<width;x+=cell){const dx=((x+cell*.5)/width-.5)*aspect*fov,dy=(.5-(y+cell*.5)/height)*fov,ray=unit(frame.forward.map((v,i)=>v+frame.right[i]*dx+frame.up[i]*dy)),hit=dysonShellHit(origin,ray,body.dysonCutaway??0);if(!hit||hit.inside!==insidePass)continue;ctx.fillStyle=this.state.spectrum==='geometry'?(hit.inside?'#727c80':'#606c77'):cpuColor(dysonPreviewMaterial(hit.point,hit.inside,body.bodyParams?.[1]??1),this.state.spectrum,'surface');ctx.fillRect(x,y,Math.min(cell+1,width-x),Math.min(cell+1,height-y));}yield;}
  ctx.restore();
 }
 *bodyStages(body){
  if(body.type==='dyson')return;
  if(body.id===this.focusId&&this.focusMode==='onboard')return;
  const q=cpuProject(body.position,this.cameraFrame,this.canvas.width,this.canvas.height);if(!q)return;
  const imageRadius=['star','blackhole','whitehole'].includes(body.type)?cpuCompactImageRadius(body.radius,(body.massSolar||0)/4300000,this.state.lensing,this.state.interiorView&&this.state.spectrum==='geometry'):body.radius,r=imageRadius*q.pixels;if((r<.15&&body.type!=='probe')||r>20000)return;
  const ctx=this.context2d,s=this.state,type=body.type,starFade=type==='star'?cpuStellarRadiance(body.stellar):1,stellarTint=cpuStellarTint(body.color||s.starColor,body.stellar),starKind=body.starStyle==='tzo'?'tzo':'star';
  if(s.spectrum==='geometry'){
   if(type==='disk'||type==='jets')return;
   if(body.waterCap){yield* this.waterCapStages(body,true);return;}
   const compact=body.collapsed||type==='blackhole'||type==='whitehole';
   if(compact){ctx.fillStyle=body.whiteHole||type==='whitehole'?cpuColor('#e6ecff',s.spectrum,'white-hole'):'#000';ctx.beginPath();ctx.arc(q.x,q.y,Math.max(.5,r),0,TAU);ctx.fill();}
   else if(['star','planet','moon'].includes(type)){
    // The CPU preview is schematic; keep the same solid neutral material and
    // physical projected shape without an independent cyan perimeter.
    ctx.save();ctx.translate(q.x,q.y);if(body.shapeAxes){const shape=this.projectedBodyShape(body);ctx.rotate(shape.angle);ctx.scale(shape.x,shape.y);}
    const shade=ctx.createRadialGradient(-r*.3,-r*.3,0,0,0,r);shade.addColorStop(0,'#aeaeae');shade.addColorStop(.6,'#727272');shade.addColorStop(1,'#343434');ctx.fillStyle=shade;ctx.beginPath();ctx.arc(0,0,Math.max(.5,r),0,TAU);ctx.fill();ctx.restore();
   }else this.geometryOutline(body.position,imageRadius,'#c1eaff',false,body);
   if(body.collapsed&&s.interiorView){if(body.innerHorizonRadius)this.geometryOutline(body.position,body.innerHorizonRadius,'#ebc88f',true);this.singularity(body.position,body.singularityRadius||0,body.frame?.[0]||[1,0,0],body.frame?.[2]||[0,0,1]);}
   yield;return;
  }
  if(body.collapsed||type==='blackhole'||type==='whitehole'){
   ctx.fillStyle=body.whiteHole||type==='whitehole'?cpuColor('#e6ecff',s.spectrum,'white-hole'):'#000';ctx.beginPath();ctx.arc(q.x,q.y,Math.max(.5,imageRadius*q.pixels),0,TAU);ctx.fill();
   yield;return;
  }
  if(body.bridgeWorld!==undefined){this.paintBridgeWorld(q.x,q.y,r,body.bridgeWorld);yield;return;}
  const opacity=clamp(body.opacity??1,0,1);
  if(body.starStyle==='tzo'&&opacity<.999){yield* this.tzoCutawayStages(body,q,r,opacity);return;}
  if(opacity<=0)return;
  if(body.waterCap){ctx.save();ctx.globalAlpha*=opacity;yield* this.waterCapStages(body,false);ctx.restore();return;}
  if(type==='ring'||type==='belt'||type==='disk'){yield* this.annulusStages(body);return;}
  if(type==='jets'){const axis=body.frame?.[1]||[0,1,0];for(const sign of [-1,1]){this.drawLine([plus(body.position,scale(axis,body.radius*.1*sign)),plus(body.position,scale(axis,body.radius*sign))],cpuColor(body.color||s.jetColor,s.spectrum,'jet',.6),Math.min(8,Math.max(.7,r*.05)));yield;}return;}
  if(type==='star'&&s.blackHole&&(body.corona??.35)>0){
   const centers=[0,...(s.binary&&!this.mergerComplete?[1]:[])],k=centers.sort((a,b)=>Math.hypot(...body.position.map((v,i)=>v-this.holeData[a*4+i]))-Math.hypot(...body.position.map((v,i)=>v-this.holeData[b*4+i])))[0],center=Array.from(this.holeData.slice(k*4,k*4+3)),offset=body.position.map((v,i)=>v-center[i]),distance=Math.hypot(...offset),tidal=body.radius*Math.cbrt(this.holeData[k*4+3]*4300000/Math.max(this.objectMassSolar?.(body)||1,.000001)),strength=clamp((tidal/distance)**3*.2,0,1)*(body.corona??.35);
   if(strength>.003){const axis=k?this.configCache.secondaryAxis:this.configCache.primaryAxis,spin=k?s.secondarySpin:s.spin,points=[];for(let j=0;j<=24;j++){const t=j/24,along=this.configCache.horizon[k]*1.05+(distance-this.configCache.horizon[k]*1.05)*t,bend=spin*(1-t)**2*2.4,radial=scale(offset,along/distance),normal=cross(axis,radial),target=plus(plus(scale(radial,Math.cos(bend)),scale(normal,Math.sin(bend))),scale(axis,dot(axis,radial)*(1-Math.cos(bend))));points.push(plus(center,target));}this.drawLine(points,cpuColor(body.color||s.starColor,s.spectrum,'hot',Math.min(1,strength),1),Math.min(12,Math.max(1,r*.2)));yield;}
  }
  ctx.save();ctx.globalAlpha*=opacity;ctx.translate(q.x,q.y);if((type==='planet'||type==='moon')&&body.shapeAxes){const maximum=Math.max(...body.shapeAxes),axes=body.shapeAxes.map(v=>v/maximum),basis=cpuBodyBasis(body,this.configCache.primaryBasis,this.time);let xx=0,xy=0,yy=0;for(let j=0;j<3;j++){const x=dot(basis[j],this.cameraFrame.right)*axes[j],y=-dot(basis[j],this.cameraFrame.up)*axes[j];xx+=x*x;xy+=x*y;yy+=y*y;}const mid=(xx+yy)*.5,spread=Math.sqrt((xx-yy)**2*.25+xy*xy);ctx.rotate(.5*Math.atan2(2*xy,xx-yy));ctx.scale(Math.sqrt(Math.max(.01,mid+spread)),Math.sqrt(Math.max(.01,mid-spread)));}if(type==='probe'){const intensity=Math.max(1,body.luminosity||1),power=Math.log10(intensity)+1,halo=Math.min(this.canvas.width*2,Math.max(.4,r)*(2+power*3)),glow=ctx.createRadialGradient(0,0,0,0,0,halo);glow.addColorStop(0,cpuColor('#e5f8ff',s.spectrum,'probe',Math.min(.95,power*.18)));glow.addColorStop(.25,cpuColor('#94cfff',s.spectrum,'probe',Math.min(.7,power*.08)));glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.fillRect(-halo,-halo,2*halo,2*halo);}const c=cpuColor(type==='star'?stellarTint:body.color||((type==='planet'||type==='moon')?s.planetColor:'#c5cfdb'),s.spectrum,type==='star'?starKind:'surface',1,1,starFade);ctx.fillStyle=c;ctx.strokeStyle=c;ctx.lineWidth=Math.max(.5,r*.025);
  if(type==='enterprise'){
   ctx.beginPath();ctx.ellipse(r*.25,-r*.13,r*.57,r*.15,0,0,TAU);ctx.fill();ctx.fillRect(-r*.15,0,r*.16,r*.27);ctx.fillRect(-r*.48,r*.2,r*.72,r*.15);ctx.fillRect(-r*.7,-r*.35,r*.73,r*.12);ctx.fillRect(-r*.45,-r*.28,r*.07,r*.5);ctx.fillStyle=cpuColor('#d7723e',s.spectrum);ctx.fillRect(-r*.02,-r*.35,r*.06,r*.12);
  }else if(type==='shuttle'){
   if(body.id===this.driveId){const f=this.getFlightState(),power=Math.abs(f.throttle||0),turn=Math.abs(f.steeringInput||0);ctx.fillStyle=cpuColor('#60bcff',s.spectrum,'hot',.8);if(power>.001){const direction=f.throttle>0?1:-1,start=f.throttle>0?.72:-.86;for(const x of [-.10,0,.10]){ctx.beginPath();ctx.moveTo((x-.028)*r,start*r);ctx.lineTo(x*r,(start+direction*(.16+power*.65))*r);ctx.lineTo((x+.028)*r,start*r);ctx.fill();}}if(turn>.001){const side=Math.sign(f.steeringInput);for(const z of [-.6,.55]){ctx.beginPath();ctx.moveTo(side*r*.12,z*r);ctx.lineTo(side*r*.38,(z+.03)*r);ctx.lineTo(side*r*.12,(z+.06)*r);ctx.fill();}}ctx.fillStyle=c;}
   // Bounded schematic of the same 1.72-long / 1.10-wide double-delta planform.
   const outline=[[0,-.86],[.055,-.82],[.10,-.70],[.128,-.50],[.128,-.31],[.205,.18],[.55,.55],[.13,.67],[.13,.72],[-.13,.72],[-.13,.67],[-.55,.55],[-.205,.18],[-.128,-.31],[-.128,-.50],[-.10,-.70],[-.055,-.82]];
   ctx.beginPath();outline.forEach(([x,y],i)=>i?ctx.lineTo(x*r,y*r):ctx.moveTo(x*r,y*r));ctx.closePath();ctx.fill();
   ctx.fillStyle=cpuColor('#18232b',s.spectrum);ctx.beginPath();ctx.ellipse(0,-r*.73,r*.077,r*.13,0,0,TAU);ctx.fill();
   for(const x of [-.067,.007])ctx.fillRect(x*r,-r*.58,r*.060,r*.052);
   ctx.fillRect(-r*.011,r*.22,r*.022,r*.47);for(const x of [-.075,0,.075])ctx.fillRect((x-.025)*r,r*.72,r*.05,r*.14);
  }else if(type==='iss'){
   ctx.fillRect(-r*.5,-r*.08,r,r*.16);ctx.fillRect(-r*.08,-r*.37,r*.16,r*.74);ctx.fillStyle=cpuColor('#a89250',s.spectrum);for(const x of [-.78,.48])for(const y of [-.65,.08])ctx.fillRect(r*x,r*y,r*.3,r*.55);
  }else if(type==='astronaut'){
   ctx.beginPath();ctx.arc(0,-r*.46,r*.22,0,TAU);ctx.fill();ctx.fillRect(-r*.22,-r*.2,r*.44,r*.55);ctx.fillRect(-r*.18,r*.3,r*.13,r*.48);ctx.fillRect(r*.05,r*.3,r*.13,r*.48);ctx.fillRect(-r*.42,-r*.14,r*.22,r*.17);ctx.fillRect(r*.2,-r*.14,r*.22,r*.17);ctx.fillStyle=cpuColor('#dbad46',s.spectrum);ctx.beginPath();ctx.ellipse(0,-r*.46,r*.17,r*.12,0,0,TAU);ctx.fill();
  }else{const g=ctx.createRadialGradient(-r*.3,-r*.3,0,0,0,r);g.addColorStop(0,c);g.addColorStop(1,type==='star'?cpuColor(body.starStyle==='tzo'?'#763719':'#a74413',s.spectrum,starKind,1,1,starFade):cpuColor('#020710',s.spectrum));ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();}
  if(type==='star'&&(body.corona??.35)>0){
   const strength=body.corona??.35,halo=ctx.createRadialGradient(0,0,r,0,0,r*2.2);halo.addColorStop(0,cpuColor(stellarTint,s.spectrum,body.starStyle==='tzo'?'tzo-wind':'hot',Math.min(.8,strength*.35),1,starFade));halo.addColorStop(1,'transparent');ctx.fillStyle=halo;ctx.fillRect(-r*2.2,-r*2.2,r*4.4,r*4.4);
   ctx.fillStyle=cpuColor('#402315',s.spectrum,starKind,Math.min(.8,body.spots??.35),1,starFade);for(let n=0;n<8;n++){const a=seeded(n+39)*TAU+this.time*.07*(this.sceneId==='thorne-zytkow'?(body.bodyParams?.[3]||0):(body.rotation??1)),rho=r*Math.sqrt(seeded(n+98))*.82;ctx.beginPath();ctx.ellipse(Math.cos(a)*rho,Math.sin(a)*rho,r*(.035+.04*seeded(n+7)),r*.035,0,0,TAU);ctx.fill();}
  }
  if((type==='planet'||type==='moon')&&!body.surfaceId&&body.planetStyle==='gas'){
   ctx.strokeStyle=cpuColor(body.color||s.planetColor,s.spectrum,'surface',.28);ctx.lineWidth=Math.max(.5,r*.06);
   for(let n=-5;n<=5;n++){const y=n*r/6,x=Math.sqrt(Math.max(0,r*r-y*y));ctx.beginPath();ctx.moveTo(-x,y);ctx.lineTo(x,y);ctx.stroke();}
  }
  if((type==='planet'||type==='moon')&&!body.surfaceId&&['ice','ocean','rocky'].includes(body.planetStyle)){
   ctx.fillStyle=cpuColor(body.planetStyle==='ice'?'#d2eaf4':body.planetStyle==='ocean'?'#9bd4ee':'#544334',s.spectrum,'surface',.5);
   for(let n=0;n<9;n++){const a=seeded(n+210)*TAU+this.time*.03*(body.rotation??1),rho=r*Math.sqrt(seeded(n+67))*.68;ctx.beginPath();ctx.ellipse(Math.cos(a)*rho,Math.sin(a)*rho,r*(.025+.1*seeded(n+707)),r*(body.planetStyle==='ocean'?.008:body.planetStyle==='ice'?.025:.065),a,0,TAU);ctx.fill();}
  }
  if((type==='planet'||type==='moon')&&body.surfaceId)yield* this.planetDetailStages(body,r);
  if(s.warp&&body.id===this.warpObjectId&&s.warpField){ctx.strokeStyle='rgba(104,183,241,.55)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,r*effectiveWarpRadius(s.warpFactor),r*effectiveWarpRadius(s.warpFactor)*.6,0,0,TAU);ctx.stroke();}
  ctx.restore();
 }
 // Bounded schematic counterpart of the GPU's deliberately enlarged core.
 *tzoCutawayStages(body,q,r,opacity){
  const ctx=this.context2d,band=this.state.spectrum,reveal=1-opacity;
  ctx.save();ctx.translate(q.x,q.y);
  const envelope=ctx.createRadialGradient(0,0,r*.12,0,0,r);
  envelope.addColorStop(0,cpuColor('#e86838',band,'tzo',opacity*.26));
  envelope.addColorStop(.7,cpuColor('#f2813c',band,'tzo',opacity*.64));
  envelope.addColorStop(1,cpuColor('#ffb568',band,'tzo',Math.min(1,opacity*1.8)));
  ctx.fillStyle=envelope;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();
  ctx.strokeStyle=cpuColor('#f5a75b',band,'tzo',opacity*.7);ctx.lineWidth=Math.max(.7,r*.012);ctx.stroke();
  for(let j=0;j<14;j++){const angle=j*2.3999+this.stellarVisualTime()*.006,rho=Math.sqrt(seeded(j+80))*.85;ctx.fillStyle=cpuColor('#ff9c4a',band,'tzo',opacity*(.12+.2*seeded(j+900)));ctx.beginPath();ctx.ellipse(Math.cos(angle)*r*rho,Math.sin(angle)*r*rho,r*.07,r*.035,angle,0,TAU);ctx.fill();}
  const halo=ctx.createRadialGradient(0,0,r*.1,0,0,r*.8);
  halo.addColorStop(0,cpuColor('#9eacff',band,'source',reveal*.8));halo.addColorStop(.5,cpuColor('#535dc5',band,'source',reveal*.35));halo.addColorStop(1,'transparent');ctx.fillStyle=halo;ctx.fillRect(-r,-r,r*2,r*2);yield;
  const core=r*.22,light=ctx.createRadialGradient(-core*.3,-core*.3,0,0,0,core);
  light.addColorStop(0,cpuColor('#edf3ff',band,'source',reveal));light.addColorStop(1,cpuColor('#8894e6',band,'source',reveal));ctx.fillStyle=light;ctx.beginPath();ctx.arc(0,0,core,0,TAU);ctx.fill();
  for(let j=0;j<12;j++){const angle=j*2.3999,rho=Math.sqrt(seeded(j+440))*.75;ctx.fillStyle=cpuColor('#4d5bbb',band,'source',reveal*.65);ctx.beginPath();ctx.ellipse(Math.cos(angle)*core*rho,Math.sin(angle)*core*rho,core*.12,core*.06,angle,0,TAU);ctx.fill();}
  ctx.restore();
 }
 geometryOpaqueBodies(){
  const opaque=this.objectFrames.filter(body=>['star','planet','moon','blackhole','whitehole'].includes(body.type)).map(body=>['star','blackhole','whitehole'].includes(body.type)?{...body,opacity:1,radius:cpuCompactImageRadius(body.radius,(body.massSolar||0)/4300000,this.state.lensing,this.state.interiorView)}:{...body,opacity:1});
  if(this.state.blackHole)for(let k=0;k<(this.state.binary&&this.holeData[7]>0?2:1);k++)opaque.push({id:k?'secondary':'primary',position:Array.from(this.holeData.slice(k*4,k*4+3)),radius:cpuCompactImageRadius(this.configCache.horizon[k],this.holeData[k*4+3],this.state.lensing,this.state.interiorView)});
  return opaque;
 }
 *waterCapStages(body,geometry=false){
  // A spherical rock core plus the exposed portion of a second water sphere.
  // Bounded tessellation is confined to this stylized ocean illustration.
  const ctx=this.context2d,frame=this.cameraFrame,core=body.coreRadius||body.radius,water=body.waterCap,axis=water.direction,capRadius=core*water.radiusRatio,offset=core*water.offsetRatio,center=plus(body.position,scale(axis,offset)),q=cpuProject(body.position,frame,this.canvas.width,this.canvas.height);if(!q)return;
  const corePixels=core*q.pixels;
  const shade=ctx.createRadialGradient(q.x-corePixels*.3,q.y-corePixels*.3,0,q.x,q.y,corePixels);shade.addColorStop(0,geometry?'#aeaeae':cpuColor('#a8aaac',this.state.spectrum));shade.addColorStop(1,geometry?'#343434':cpuColor('#292e34',this.state.spectrum));ctx.fillStyle=shade;
  ctx.beginPath();ctx.arc(q.x,q.y,corePixels,0,TAU);ctx.fill();
  const helper=Math.abs(axis[1])>.9?[1,0,0]:[0,1,0],bx=unit(cross(axis,helper)),bz=cross(axis,bx),shore=(core*core+offset*offset-capRadius*capRadius)/(2*Math.max(offset,core*1e-8)),cosLimit=clamp((shore-offset)/capRadius,-1,1),maxAngle=Math.acos(cosLimit),rows=this.cpuGeometry===0?10:16,columns=this.cpuGeometry===0?24:36,observer=frame.observer,rock={position:body.position,radius:core},opaque=geometry?this.geometryOpaqueBodies():[],point=(i,j)=>{const t=maxAngle*i/rows,a=TAU*j/columns,normal=plus(scale(axis,Math.cos(t)),plus(scale(bx,Math.sin(t)*Math.cos(a)),scale(bz,Math.sin(t)*Math.sin(a))));return {normal,world:plus(center,scale(normal,capRadius))};};
  for(let i=0;i<rows;i++){
   for(let j=0;j<columns;j++){
    const vertices=[point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1)],middle=scale(vertices.reduce((sum,v)=>plus(sum,v.world),[0,0,0]),.25),normal=unit(middle.map((v,k)=>v-center[k]));
    if(dot(normal,observer.map((v,k)=>v-middle[k]))<=0||cpuRingOccluded(middle,rock,observer))continue;
    const projected=vertices.map(v=>cpuProject(v.world,frame,this.canvas.width,this.canvas.height));if(projected.some(v=>!v))continue;
    ctx.beginPath();projected.forEach((v,k)=>k?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();
    const light=.30+.70*Math.max(0,dot(normal,unit(plus(scale(frame.up,.55),plus(scale(frame.right,-.35),scale(frame.forward,-.8))))));ctx.fillStyle=geometry?`rgb(${Math.round(45+125*light)},${Math.round(45+125*light)},${Math.round(45+125*light)})`:cpuColor('#2d9acb',this.state.spectrum,'surface',1,1,light);ctx.fill();
   }
   yield;
  }

 }
 // Low-cost counterpart of the finite bridge worlds. The CPU preview is
 // deliberately schematic; colors and destination order match the GPU model.
 paintBridgeWorld(x,y,r,other){
  const ctx=this.context2d,s=this.state;r=Math.max(.5,Math.min(r,20000));
  ctx.save();ctx.translate(x,y);
  const at=(x,y,first)=>{const scale=Math.max(1,Math.hypot(x,y)/.995);(first?ctx.moveTo:ctx.lineTo).call(ctx,x/scale*r,y/scale*r);};
  ctx.fillStyle=cpuColor(other?'#b97031':'#126485',s.spectrum,'surface');ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();
  if(other){
   for(let j=-8;j<=8;j++){ctx.strokeStyle=cpuColor(j%3===0?'#82502b':'#e2a45a',s.spectrum,'surface',.55);ctx.lineWidth=Math.max(.6,r*.025);ctx.beginPath();for(let k=0;k<=18;k++){const xx=-1+k/9,yy=j*.13+Math.sin(xx*4+j*.6)*.035;at(xx,yy,k===0);}ctx.stroke();}
  }else{
   for(let j=0;j<8;j++){const angle=j*2.39996+.4,rho=Math.sqrt((j+.4)/8)*.7,cx=Math.cos(angle)*rho,cy=Math.sin(angle)*rho;ctx.fillStyle=cpuColor(j%3?'#3b783c':'#69834b',s.spectrum,'surface');ctx.beginPath();for(let k=0;k<=18;k++){const a=k/18*TAU,rr=.28+.065*Math.sin(k*1.5+j*2),xx=cx+Math.cos(a)*rr,yy=cy+Math.sin(a)*rr*.68;at(xx,yy,k===0);}ctx.closePath();ctx.fill();}
   ctx.strokeStyle=cpuColor('#d5e4e9',s.spectrum,'surface',.33);ctx.lineWidth=Math.max(.7,r*.035);for(let j=-3;j<=3;j++){ctx.beginPath();for(let k=0;k<=18;k++){const a=k/18*Math.PI;at(-.15+.62*Math.cos(a),j*.25+.08*Math.sin(a)-.12*Math.cos(a),k===0);}ctx.stroke();}
  }
  const shade=ctx.createRadialGradient(-r*.25,-r*.25,r*.2,0,0,r);shade.addColorStop(0,'transparent');shade.addColorStop(.75,'rgba(0,0,0,.08)');shade.addColorStop(1,'rgba(0,0,0,.55)');ctx.fillStyle=shade;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();ctx.restore();
 }
 bridge(){
  if(!this.state.bridge)return;
  const ctx=this.context2d,radius=this.configCache.bridgeRadius;
  const q=cpuProject([0,0,0],this.cameraFrame,this.canvas.width,this.canvas.height);if(!q)return;
  const r=Math.min(4000,radius*q.pixels);if(!(r>.2))return;
  if(this.state.spectrum==='geometry'){
   this.geometryOutline([0,0,0],radius,'#a8dcf8');
   for(let n=0;n<10;n++){ctx.strokeStyle='rgba(132,209,245,.5)';ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(q.x,q.y,r*(.5+n*.09),r*.7,0,0,TAU);ctx.stroke();}
   if(this.state.bridgeMode==='crossed'){ctx.strokeStyle='#d5b8f0';ctx.lineWidth=2.4;ctx.beginPath();ctx.ellipse(q.x,q.y,r*.7,r*1.22,Math.PI/2,0,TAU);ctx.stroke();}
   return;
  }
  const other=Math.hypot(...this.cameraFrame.observer)>=radius/2,far=other?this.state.bridgeOtherColor:this.state.nebulaColor,hasNebula=other?this.state.bridgeOtherNebula!==false:this.state.nebula;
  ctx.fillStyle=hasNebula?cpuColor(far,this.state.spectrum,'nebula',.75):'#02050b';ctx.beginPath();ctx.arc(q.x,q.y,r*.72,0,TAU);ctx.fill();
  if(!hasNebula&&this.state.stars){ctx.fillStyle=cpuColor('#c8defa',this.state.spectrum,'star',.75);for(let n=0;n<38;n++){const a=seeded(n+901)*TAU,d=Math.sqrt(seeded(n+540))*r*.68;ctx.fillRect(q.x+Math.cos(a)*d,q.y+Math.sin(a)*d,1,1);}}
  if(this.state.bridgeSurfaces)this.paintBridgeWorld(q.x,q.y,r*.46,other);
  const glow=ctx.createRadialGradient(q.x,q.y,r*.7,q.x,q.y,r*1.4);glow.addColorStop(0,cpuColor('#200c38',this.state.spectrum,'nebula',.6));glow.addColorStop(.55,cpuColor('#6dc3eb',this.state.spectrum,'nebula',.7));glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.fillRect(q.x-r*1.4,q.y-r*1.4,r*2.8,r*2.8);
  if(this.state.bridgeMode==='crossed'){ctx.strokeStyle=cpuColor('#ba8ee8',this.state.spectrum,'nebula',.8);ctx.lineWidth=2.4;ctx.beginPath();ctx.ellipse(q.x,q.y,r*.7,r*1.22,0,0,TAU);ctx.stroke();}
  if(this.state.grid){ctx.strokeStyle='rgba(132,209,245,.5)';ctx.lineWidth=.7;for(let n=0;n<10;n++){ctx.beginPath();ctx.ellipse(q.x,q.y,r*(.5+n*.09),r*.7,0,0,TAU);ctx.stroke();}}
 }
 cockpit(){for(const _ of this.cockpitStages()){} }
 *cockpitStages(){
  if(this.focusMode!=='onboard'||this.getFocusFrame()?.type!=='shuttle')return;
  const c=this.cameraFrame,frame={observer:c.inspectCamera,forward:c.inspectForward,right:c.inspectRight,up:c.inspectUp},ctx=this.context2d,w=this.canvas.width,h=this.canvas.height,panels=[];
  // All geometry lives in the same right-seat model frame as the GPU cabin.
  // Clip polygons across the near plane, so looking sideways cannot erase a
  // whole cabin wall simply because one of its vertices is behind the eye.
  const pane=(points,color)=>panels.push({points,color,depth:points.reduce((sum,p)=>sum+dot(p.map((v,i)=>v-frame.observer[i]),frame.forward),0)/points.length});
  const panel=(x1,x2,y1,y2,z,color)=>pane([[x1,y1,z],[x2,y1,z],[x2,y2,z],[x1,y2,z]],color);
  const wind=(x1,x2,y1,y2,corner=false)=>pane([[x1,y1],[x2,y1],[x2,y2],[x1,y2]].map(([x,y])=>[x,y,corner?(.611-.70*Math.abs(x)-.85*y)/.8:(.580-y)/.8]),'#4c514a');
  wind(-.058,.058,.075,.091);wind(-.058,.058,.141,.150);wind(-.0045,.0045,.091,.141);
  for(const side of [-1,1]){
   const a=.052*side,b=.127*side;wind(a,b,.075,.088,true);wind(a,b,.136,.148,true);wind(a,.057*side,.088,.136,true);wind(.121*side,b,.088,.136,true);
   const x=.127*side;pane([[x,-.037,.310],[x,-.037,.610],[x,.081,.610],[x,.081,.310]],'#373d36');pane([[x,.131,.310],[x,.131,.610],[x,.145,.610],[x,.145,.310]],'#555950');
   for(const [z1,z2] of [[.310,.421],[.515,.610]])pane([[x,.081,z1],[x,.081,z2],[x,.131,z2],[x,.131,z1]],'#555950');
   // Side switch panels, upholstered seats and headrests.
   pane([[.095*side,.055,.370],[.125*side,.055,.370],[.125*side,.055,.548],[.095*side,.055,.548]],'#4c5146');
   panel(.022*side,.070*side,.033,.099,.426,'#4d5449');panel(.027*side,.065*side,.092,.120,.426,'#464d41');
  }
  panel(-.127,.127,-.037,.073,.310,'#42483e');panel(-.127,.127,.132,.145,.310,'#4b5148');for(const [x1,x2] of [[-.127,-.09],[-.013,.013],[.09,.127]])panel(x1,x2,.073,.132,.310,'#4b5148');
  pane([[-.127,-.037,.310],[.127,-.037,.310],[.127,-.037,.610],[-.127,-.037,.610]],'#22271f');
  pane([[-.127,.145,.310],[.127,.145,.310],[.127,.145,.610],[-.127,.145,.610]],'#52574c');
  pane([[-.121,.085,.544],[.121,.085,.544],[.121,.085,.592],[-.121,.085,.592]],'#151b16');
  panel(-.118,.118,-.004,.079,.554,'#4b5145');
  pane([[-.019,.038,.412],[.019,.038,.412],[.019,.038,.558],[-.019,.038,.558]],'#495044');
  for(const x of [-.026,0,.026]){
   panel(x-.0105,x+.0105,.028,.054,.553,'#111b14');panel(x-.0088,x+.0088,.031,.051,.5525,'#163b27');
   panel(x-.0078,x+.0078,.041,.0416,.552,'#78b886');
   for(let j=0;j<3;j++)panel(x-.003,x+.003,.034+j*.006,.0346+j*.006,.552,'#78b886');
  }
  for(let n=0;n<12;n++){
   const x=(n<6?-1:1)*[.054,.076,.098][n%3],y=Math.floor(n/3)%2?.058:.030,points=Array.from({length:12},(_,j)=>[x+Math.cos(j*TAU/12)*.0074,y+Math.sin(j*TAU/12)*.0074,.553]);pane(points,'#c3c7b9');pane(points.map(p=>[x+(p[0]-x)*.8,y+(p[1]-y)*.8,.5525]),'#172018');
   const angle=n*.9+.4;pane([[x-.0004,y-.0004,.552],[x+.0004,y-.0004,.552],[x+Math.sin(angle)*.0045+.0004,y+Math.cos(angle)*.0045,.552],[x+Math.sin(angle)*.0045-.0004,y+Math.cos(angle)*.0045,.552]],'#d1d6c6');
  }
  // Bounded detail: fewer than 100 static faces, no per-pixel CPU ray marching.
  panels.sort((a,b)=>b.depth-a.depth);
  let batch=0;for(const {points,color} of panels){
   const clipped=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],da=dot(a.map((v,j)=>v-frame.observer[j]),frame.forward)-.001,db=dot(b.map((v,j)=>v-frame.observer[j]),frame.forward)-.001;if(da>=0)clipped.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);clipped.push(a.map((v,j)=>v+(b[j]-v)*t));}}
   if(clipped.length<3)continue;const projected=clipped.map(p=>cpuProject(p,frame,w,h));if(projected.some(p=>!p))continue;ctx.beginPath();projected.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=cpuColor(color,this.state.spectrum);ctx.fill();if(++batch%4===0)yield;
  }
 }
 geometryOutline(position,radius,color='#c1eaff',dashed=false,body=null){
  const q=cpuProject(position,this.cameraFrame,this.canvas.width,this.canvas.height),ctx=this.context2d;if(!q||!(radius>0))return;
  const r=radius*q.pixels;if(!Number.isFinite(r)||r<.1||r>1e6)return;
  ctx.save();ctx.translate(q.x,q.y);
  if(body?.shapeAxes){const shape=this.projectedBodyShape(body);ctx.rotate(shape.angle);ctx.scale(shape.x,shape.y);}
  ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.strokeStyle='#02050a';ctx.lineWidth=5.5;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=2.8;ctx.setLineDash?.(dashed?[5,5]:[]);ctx.stroke();ctx.setLineDash?.([]);ctx.restore();
 }
 projectedBodyShape(body){
  const maximum=Math.max(...body.shapeAxes),axes=body.shapeAxes.map(v=>v/maximum),basis=cpuBodyBasis(body,this.configCache.primaryBasis,this.time);let xx=0,xy=0,yy=0;
  for(let j=0;j<3;j++){const x=dot(basis[j],this.cameraFrame.right)*axes[j],y=-dot(basis[j],this.cameraFrame.up)*axes[j];xx+=x*x;xy+=x*y;yy+=y*y;}
  const mid=(xx+yy)*.5,spread=Math.sqrt((xx-yy)**2*.25+xy*xy);return {angle:.5*Math.atan2(2*xy,xx-yy),x:Math.sqrt(Math.max(.0001,mid+spread)),y:Math.sqrt(Math.max(.0001,mid-spread))};
 }
 singularity(center,radius,bx,bz){
  if(radius>0){this.drawLine(circle.filter((_,j)=>j%2===0).map(([x,z])=>plus(center,plus(scale(bx,x*radius),scale(bz,z*radius)))),'#f3b3c4',3);}
  else{const q=cpuProject(center,this.cameraFrame,this.canvas.width,this.canvas.height);if(q){const ctx=this.context2d;ctx.fillStyle='#f3b3c4';ctx.beginPath();ctx.arc(q.x,q.y,3,0,TAU);ctx.fill();}}
 }
 *metricSurfaceStages(body,opaque){
  if(!['star','planet','moon','blackhole','whitehole','hole'].includes(body.type))return;
  const frame=['star','planet','moon'].includes(body.type)?cpuBodyBasis(body,this.configCache.primaryBasis,this.time):body.frame||this.configCache.primaryBasis,axis=frame[1],radius=body.coreRadius||body.radius,center=body.position,observer=this.cameraFrame.observer;
  const source=body.collapsed||body.type==='hole'||body.type==='blackhole'||body.type==='whitehole';
  const samples=this.cpuGeometry===0?24:36;
  const draw=(kind,value)=>{
   const points=[];for(let j=0;j<=samples;j++){
    const t=j/samples*TAU,normal=kind==='latitude'?plus(scale(axis,Math.sin(value)),plus(scale(frame[0],Math.cos(value)*Math.cos(t)),scale(frame[2],Math.cos(value)*Math.sin(t)))):plus(scale(axis,Math.sin(t)),plus(scale(frame[0],Math.cos(t)*Math.cos(value)),scale(frame[2],Math.cos(t)*Math.sin(value))));
    const shape=body.shapeAxes||[1,1,1],maximum=Math.max(...shape),axes=shape.map(v=>v/maximum);
    const coords=frame.map(b=>dot(normal,b)),point=plus(center,frame.reduce((v,b,i)=>plus(v,scale(b,coords[i]*axes[i]*radius)),[0,0,0])),surfaceNormal=unit(frame.reduce((v,b,i)=>plus(v,scale(b,coords[i]/axes[i])),[0,0,0])),front=dot(surfaceNormal,observer.map((v,i)=>v-point[i]))>=0;
    const water=body.waterCap,cap=water?{position:plus(center,scale(water.direction,radius*water.offsetRatio)),radius:radius*water.radiusRatio}:null;
    points.push(front&&(!cap||!cpuRingOccluded(point,cap,observer))&&!opaque.some(other=>other.id!==body.id&&cpuRingOccluded(point,other,observer))?point:null);
   }
   this.drawLine(points,source?'rgba(137,199,227,.38)':'rgba(126,210,235,.52)',.9);
  };
  for(const latitude of [-Math.PI/3,-Math.PI/6,0,Math.PI/6,Math.PI/3]){draw('latitude',latitude);yield;}
  for(let meridian=0;meridian<6;meridian++){draw('longitude',meridian*Math.PI/6);yield;}
 }
 *metricStages(bodies){
  if(!this.state.metrics)return;
  const displayed=body=>['star','blackhole','whitehole'].includes(body.type)?{...body,radius:cpuCompactImageRadius(body.radius,(body.massSolar||0)/4300000,this.state.lensing,this.state.interiorView&&this.state.spectrum==='geometry')}:body;
  const visible=bodies.filter(b=>!['disk','jets','ring','belt'].includes(b.type)).slice(0,24).map(displayed),opaque=this.objectFrames.filter(b=>['star','planet','moon','blackhole','whitehole'].includes(b.type)).map(displayed);
  if(this.state.blackHole)for(let k=0;k<(this.state.binary&&this.holeData[7]>0?2:1);k++){
   const radius=cpuCompactImageRadius(this.configCache.horizon[k],this.holeData[k*4+3],this.state.lensing,this.state.interiorView&&this.state.spectrum==='geometry');if(!(radius>0))continue;
   const body={id:k?'secondary':'primary',type:'hole',position:Array.from(this.holeData.slice(k*4,k*4+3)),radius,velocity:this.holeVelocities?.[k]||[0,0,0],frame:k?this.configCache.secondaryBasis:this.configCache.primaryBasis,spin:k?this.state.secondarySpin:this.state.spin};visible.push(body);opaque.push(body);
  }
  const vectorLine=(body,direction,color)=>{if(Math.hypot(...direction)<1e-20)return;const length=body.radius*2.0,tip=plus(body.position,scale(unit(direction),length)),points=[];for(let j=0;j<=12;j++){const p=plus(body.position,scale(unit(direction),length*j/12));points.push(opaque.some(other=>other.id!==body.id&&cpuRingOccluded(p,other,this.cameraFrame.observer))?null:p);}this.drawLine(points,color,2.2);const q=cpuProject(tip,this.cameraFrame,this.canvas.width,this.canvas.height),p=cpuProject(body.position,this.cameraFrame,this.canvas.width,this.canvas.height);if(q&&p&&!opaque.some(other=>other.id!==body.id&&cpuRingOccluded(tip,other,this.cameraFrame.observer))){const dx=q.x-p.x,dy=q.y-p.y,n=Math.hypot(dx,dy)||1,ctx=this.context2d;ctx.strokeStyle=color;ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(q.x-dx/n*6-dy/n*3,q.y-dy/n*6+dx/n*3);ctx.lineTo(q.x,q.y);ctx.lineTo(q.x-dx/n*6+dy/n*3,q.y-dy/n*6-dx/n*3);ctx.stroke();}};
  for(const body of visible){
   if(body.id===this.focusId&&this.focusMode==='onboard')continue;
   const q=cpuProject(body.position,this.cameraFrame,this.canvas.width,this.canvas.height);if(!q||body.radius*q.pixels<2||opaque.some(other=>other.id!==body.id&&cpuRingOccluded(body.position,other,this.cameraFrame.observer)))continue;
   if(body.radius*q.pixels>8&&!(this.state.spectrum==='geometry'&&(body.collapsed||['hole','blackhole','whitehole'].includes(body.type))))yield* this.metricSurfaceStages(body,opaque);
   if(Math.hypot(...(body.velocity||[0,0,0]))>body.radius*1e-7)vectorLine(body,body.velocity,'#70deb1');
   const omega=body.stellar?.angularVelocity??(body.type==='hole'?body.spin:body.rotationPeriodSeconds?TAU/body.rotationPeriodSeconds:body.rotation??0);
   if(Math.abs(omega)>1e-15)vectorLine(body,scale(['star','planet','moon'].includes(body.type)?cpuBodyBasis(body,this.configCache.primaryBasis,this.time)[1]:body.frame?.[1]||[0,1,0],Math.sign(omega)),'#b19af0');yield;
  }
  const pilot=this.objects.find(o=>o.id===this.driveId);if(pilot?.flight){const owner=this.objectFrames.find(o=>o.id===pilot.id);if(owner){const length=owner.radius*REFERENCE_RG_METERS*(this.state.warp?effectiveWarpRadius(this.state.warpFactor):5),points=predictedFlightPath(pilot.flight,length,20).map(p=>scale(p,1/REFERENCE_RG_METERS));this.drawLine(points,'#70deb1',2.4);yield;}}
 }
 *paintStages(){
  this.fillHoles();this.protectObserver();this.fillObjects();this.updateCameraFrame();
  // A scene with no emitting objects can legitimately be black. Validate the
  // actual geometry before painting, rather than guessing from its pixels.
  if(!this.validateFrameGeometry())return false;
  this.sky();yield;
  yield* this.gridStages();
  const geometry=this.state.spectrum==='geometry';
  if(this.state.blackHole&&!geometry){if(this.state.binary&&this.holeData[7]>0)yield* this.holeStages(1);yield* this.holeStages(0);}this.bridge();yield;
  const sceneBodies=[...this.objectFrames];
  // Geometry masks are painted in depth order with bodies, preserving the
  // schematic foreground/behind relationship for black and white boundaries.
  if(geometry&&this.state.blackHole)for(let k=0;k<(this.state.binary&&this.holeData[7]>0?2:1);k++)sceneBodies.push({id:k?'secondary':'primary',type:'hole',holeIndex:k,position:Array.from(this.holeData.slice(k*4,k*4+3)),radius:cpuCompactImageRadius(this.configCache.horizon[k],this.holeData[k*4+3],this.state.lensing,this.state.interiorView)});
  if(this.state.bridge&&this.state.bridgeSurfaces){
   const throat=this.configCache.bridgeRadius,other=Math.hypot(...this.cameraFrame.observer)<throat/2,world=bridgeWorldSphere(other,throat,this.configCache.primaryBasis[2]);
   sceneBodies.push({id:other?'bridge-arakas':'bridge-caladan',type:'planet',position:world.center,radius:world.radius,color:other?'#b97031':'#126485',bridgeWorld:other,rotation:.03});
  }
  const bodies=cpuVisibleBodies(sceneBodies,this.cameraFrame,this.canvas.width,this.canvas.height,this.focusId);
  for(const body of bodies)if(body.type==='dyson'){yield* this.dysonStages(body,true);yield;}
  for(const body of bodies){if(body.type==='hole')yield* this.holeStages(body.holeIndex);else yield* this.bodyStages(body);yield;}for(const body of bodies)if(body.type==='dyson'){yield* this.dysonStages(body,false);yield;}yield* this.metricStages(bodies);yield;return true;
 }
 *renderStages(now=this.now(),fromFrame=false,force=false){
  if(!this.ready||this.disposed||document.hidden||this.presentationPaused)return false;
  if(!force&&this.cpuNextDraw&&now+0.1<this.cpuNextDraw)return false;
  const interval=clamp((this.cpuDrawCost||0)*1.15,1000/30,1000/15);this.cpuNextDraw=this.cpuNextDraw&&now-this.cpuNextDraw<interval*2?this.cpuNextDraw+interval:now+interval;
  let cost=0,started=this.now();const stages=this.paintStages();let stage;
  while(!(stage=stages.next()).done){cost+=Math.max(0,this.now()-started);yield;started=this.now();}
  if(stage.value===false)return false;
  cost+=Math.max(0,this.now()-started);this.frames++;
  this.noteCpuCost(cost,now);return true;
 }
 noteCpuCost(cost,now=this.now()){
  this.cpuDrawCost=(this.cpuDrawCost||0)*.85+Math.max(0,cost)*.15;
  if(this.cpuDrawCost>25){this.cpuGeometry=0;this.cpuDetailChanged=now;}else if(this.cpuDrawCost<17&&now-(this.cpuDetailChanged||0)>5000)this.cpuGeometry=1;
 }
 render(now=this.now(),fromFrame=false,force=false){const stages=this.renderStages(now,fromFrame,force);let step;do{step=stages.next();}while(!step.done);return step.value;}
}

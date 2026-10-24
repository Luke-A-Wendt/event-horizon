import { BlackHoleRenderer } from './renderer.js';
import { REFERENCE_RG_METERS } from './objects.js';

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
 if(!band||band==='visible')return rgb;
 // Qualitative component responses, shared in intent with the GPU shader.
 // These are false-color illustrations, not calibrated detector images.
 const light=(rgb[0]+rgb[1]+rgb[2])/3,h=clamp(heat,0,1);
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
export function cpuColor(hex,band,kind='surface',alpha=1,heat=1){
 const valid=/^#[\da-f]{6}$/i.test(hex)?hex:'#8ac6ff';
 const c=cpuSpectrum([1,3,5].map(i=>parseInt(valid.slice(i,i+2),16)/255),band,kind,heat);
 return `rgba(${c.map(v=>Math.round(clamp(v,0,1)*255)).join(',')},${clamp(alpha,0,1)})`;
}
export function cpuProject(point,frame,width,height){
 if(!frame)return null;
 const q=point.map((v,i)=>v-frame.observer[i]),depth=dot(q,frame.forward);
 if(!(depth>1e-14))return null;
 const aspect=width/Math.max(height,1),fov=.83*Math.max(1,1.35/aspect),pixels=height/fov;
 const x=width/2+dot(q,frame.right)/depth*pixels,y=height/2-dot(q,frame.up)/depth*pixels;
 return Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(pixels/depth)?{x,y,depth,pixels:pixels/depth}:null;
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
  ctx.fillStyle='#02050b';ctx.fillRect(0,0,w,h);
  if(other?s.bridgeOtherNebula!==false:s.nebula){
   const n=nebula.shape==='filaments'?7:nebula.shape==='shell'?5:4;
   for(let k=0;k<n;k++){
    const a=(k*.93+nebula.rotation*Math.PI/180),direction=unit([Math.sin(a),Math.cos(a*1.3)*.55,Math.cos(a)]),q=cpuProject(plus(f.observer,scale(direction,100)),f,w,h);if(!q)continue;
    const radius=w*.36*nebula.scale,g=ctx.createRadialGradient(q.x,q.y,0,q.x,q.y,Math.max(1,radius));
    g.addColorStop(0,cpuColor(nebula.color,s.spectrum,'nebula',Math.min(.3,nebula.intensity*.13)));g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
   }
  }
  if(!s.stars)return;
  if(!starDirections)starDirections=Array.from({length:1600},(_,k)=>{const z=seeded(k*3+1)*2-1,a=seeded(k*3+2)*TAU,r=Math.sqrt(1-z*z);return [r*Math.cos(a),z,r*Math.sin(a),Math.floor(seeded(k*3+3)*15),seeded(k+7)>.96?1.4:.8,seeded(k+8043)];});
  if(this.cpuStarBand!==s.spectrum){this.cpuStarBand=s.spectrum;this.cpuStarColors=Array.from({length:16},(_,i)=>cpuColor('#c8defa',s.spectrum,'star',.25+i/20));this.cpuSourceColors=Array.from({length:16},(_,i)=>cpuColor('#c8defa',s.spectrum,'source',.25+i/20));}
  const count=Math.min(starDirections.length,Math.floor(280*s.starDensity)),pixels=h/(.83*Math.max(1,1.35/(w/h)));
  for(let k=0;k<count;k++){
   const d=starDirections[k],depth=dot(d,f.forward);if(depth<=0)continue;const x=w/2+dot(d,f.right)*pixels/depth,y=h/2-dot(d,f.up)*pixels/depth;if(x<0||y<0||x>w||y>h)continue;
   const source=d[5]>(s.spectrum==='gamma'?.997:s.spectrum==='radio'?.987:s.spectrum==='xray'?.978:1);
   ctx.fillStyle=(source?this.cpuSourceColors:this.cpuStarColors)[d[3]];ctx.fillRect(x,y,d[4],d[4]);
  }
 }
 grid(){for(const _ of this.gridStages()){} }
 *gridStages(){
  const s=this.state;if(!s.grid)return;
  const m=this.massScale,holes=s.binary?2:1,f=this.cameraFrame,ctx=this.context2d,viewDistance=Math.hypot(...f.observer),localScale=s.bridge?this.configCache.bridgeRadius:s.blackHole?m:Math.max(1/REFERENCE_RG_METERS,viewDistance/30),spacing=Math.max(localScale,viewDistance/22),extent=spacing*16,samples=this.cpuGeometry===0?16:24,lines=this.cpuGeometry===0?12:16,w=this.canvas.width,h=this.canvas.height,pixels=h/(.83*Math.max(1,1.35/(w/h)));
  for(let axis=0;axis<2;axis++)for(let j=-lines;j<=lines;j++){
   ctx.beginPath();let drawing=false;for(let i=-samples;i<=samples;i++){
    let px=axis===0?j*spacing:i*extent/samples,pz=axis===0?i*extent/samples:j*spacing,visible=true;
    for(let k=0;k<holes&&s.blackHole;k++){
     const cx=this.holeData[k*4],cy=this.holeData[k*4+1],cz=this.holeData[k*4+2],qx=px-cx,qz=pz-cz,r=Math.hypot(qx,cy,qz),scaled=Math.max(r/m,.1),inward=s.whiteHole?-1:1;
     const flow=inward*(this.time*.7%(spacing/m))*Math.sqrt(2/scaled)/(1+scaled/35),a=(k?s.secondarySpin:s.spin)*this.time*.6/(1+scaled**3),c=Math.cos(a),sn=Math.sin(a),shrink=Math.max(.2,1-flow/scaled);
     px=cx+(qx*c-qz*sn)*shrink;pz=cz+(qx*sn+qz*c)*shrink;
     if(r<this.configCache.horizon[k]){visible=false;break;}
    }
    const dx=px-f.observer[0],dy=-f.observer[1],dz=pz-f.observer[2],depth=dx*f.forward[0]+dy*f.forward[1]+dz*f.forward[2];if(!visible||depth<=1e-14){drawing=false;continue;}const x=w/2+(dx*f.right[0]+dy*f.right[1]+dz*f.right[2])*pixels/depth,y=h/2-(dx*f.up[0]+dy*f.up[1]+dz*f.up[2])*pixels/depth;if(!Number.isFinite(x+y)||Math.abs(x)>1e6||Math.abs(y)>1e6){drawing=false;continue;}if(drawing)ctx.lineTo(x,y);else{ctx.moveTo(x,y);drawing=true;}
   }
   ctx.strokeStyle='rgba(83,161,207,.3)';ctx.lineWidth=.65;ctx.stroke();yield;
  }
 }
 hole(k){for(const _ of this.holeStages(k)){} }
 *holeStages(k){
  const s=this.state,ctx=this.context2d,m=this.holeData[k*4+3],center=Array.from(this.holeData.slice(k*4,k*4+3)),q=cpuProject(center,this.cameraFrame,this.canvas.width,this.canvas.height);if(!q)return;
  const horizon=this.configCache.horizon[k],r=horizon*q.pixels,axis=k?this.configCache.secondaryAxis:this.configCache.primaryAxis,bx=unit(cross(axis,Math.abs(axis[2])>.9?[1,0,0]:[0,0,1])),bz=cross(bx,axis);
  if(s.disk){
   const inner=Math.max(horizon*1.03,this.configCache.isco[k]*m),outer=this.configCache.diskOuter[k];
   const cold=s.diskStyle==='dust'||s.diskStyle==='nebula',bandWeight=cold?(s.spectrum==='gamma'?.015:s.spectrum==='radio'?.18:s.spectrum==='xray'?.12:s.spectrum==='infrared'?1.7:1):1;
   for(let ring=0;ring<18;ring++){
    const radius=inner+(outer-inner)*(ring+.5)/18,points=[];for(let j=0;j<=72;j+=this.cpuGeometry===0?2:1){const c=circle[j];points.push([center[0]+(bx[0]*c[0]+bz[0]*c[1])*radius,center[1]+(bx[1]*c[0]+bz[1]*c[1])*radius,center[2]+(bx[2]*c[0]+bz[2]*c[1])*radius]);}
    this.drawLine(points,cpuColor(s.diskColor,s.spectrum,'hot',Math.min(.9,(1-ring/22)*.65*s.diskDensity)*bandWeight,1-ring/18),Math.min(12,Math.max(.8,(outer-inner)*q.pixels/19)));yield;
   }
  }
  if(s.jets)for(const sign of [-1,1]){
   const points=[];for(let j=0;j<=25;j++){const h=(horizon*1.04+j/25*38*m*s.jetLength)*sign;points.push(plus(center,scale(axis,h)));}
   const width=Math.min(10,Math.max(.7,m*q.pixels*.18*s.jetSpread));
   if(s.spectrum==='radio'||s.spectrum==='gamma'){
    for(let j=0;j<25;j+=3){const stream=.65+.35*Math.sin(j*.7-this.time*4),heat=s.spectrum==='gamma'?stream:Math.exp(-j*.12),alpha=.5*s.jetIntensity*(s.spectrum==='gamma'?Math.exp(-j*.06):1);this.drawLine(points.slice(j,Math.min(26,j+4)),cpuColor(s.jetColor,s.spectrum,'jet',alpha,heat),width);yield;}
   }else{this.drawLine(points,cpuColor(s.jetColor,s.spectrum,'jet',.5*s.jetIntensity),width);yield;}
  }
  if(!(r>0)||r>100000)return;
  const radius=Math.max(.5,r*(s.lensing?1.6:1));
  if(s.lensing&&s.disk){ctx.strokeStyle=cpuColor(s.diskColor,s.spectrum,'hot',.65);ctx.lineWidth=Math.max(1,Math.min(15,r*.17));ctx.beginPath();ctx.arc(q.x,q.y,radius*1.08,0,TAU);ctx.stroke();}
  ctx.fillStyle=s.whiteHole?cpuColor('#d8eff7',s.spectrum,'white-hole'):'#000';ctx.beginPath();ctx.arc(q.x,q.y,radius,0,TAU);ctx.fill();
  if(s.whiteHole){const g=ctx.createRadialGradient(q.x,q.y,radius*.8,q.x,q.y,radius*2.1);g.addColorStop(0,cpuColor('#ccebff',s.spectrum,'white-hole',.35));g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(q.x-radius*2.1,q.y-radius*2.1,radius*4.2,radius*4.2);}
  if(s.horizonGuide){ctx.strokeStyle='#7dcaee';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(q.x,q.y,Math.max(.4,r),0,TAU);ctx.stroke();}
 }
 body(body){
  if(body.index===this.cameraFrame.hideIndex)return;
  const q=cpuProject(body.position,this.cameraFrame,this.canvas.width,this.canvas.height);if(!q)return;
  const r=body.radius*q.pixels;if((r<.15&&body.type!=='probe')||r>20000)return;
  const ctx=this.context2d,s=this.state,type=body.type;
  ctx.save();ctx.translate(q.x,q.y);if(type==='probe'){const intensity=Math.max(1,body.luminosity||1),power=Math.log10(intensity)+1,halo=Math.min(this.canvas.width*2,Math.max(.4,r)*(2+power*3)),glow=ctx.createRadialGradient(0,0,0,0,0,halo);glow.addColorStop(0,cpuColor('#e5f8ff',s.spectrum,'probe',Math.min(.95,power*.18)));glow.addColorStop(.25,cpuColor('#94cfff',s.spectrum,'probe',Math.min(.7,power*.08)));glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.fillRect(-halo,-halo,2*halo,2*halo);}const c=cpuColor(type==='star'?s.starColor:type==='planet'?s.planetColor:'#c5cfdb',s.spectrum,type==='star'?'star':'surface');ctx.fillStyle=c;ctx.strokeStyle=c;ctx.lineWidth=Math.max(.5,r*.025);
  if(type==='enterprise'){
   ctx.beginPath();ctx.ellipse(r*.25,-r*.13,r*.57,r*.15,0,0,TAU);ctx.fill();ctx.fillRect(-r*.15,0,r*.16,r*.27);ctx.fillRect(-r*.48,r*.2,r*.72,r*.15);ctx.fillRect(-r*.7,-r*.35,r*.73,r*.12);ctx.fillRect(-r*.45,-r*.28,r*.07,r*.5);ctx.fillStyle=cpuColor('#d7723e',s.spectrum);ctx.fillRect(-r*.02,-r*.35,r*.06,r*.12);
  }else if(type==='shuttle'){
   ctx.beginPath();ctx.moveTo(0,-r*.86);ctx.lineTo(r*.18,-r*.15);ctx.lineTo(r*.64,r*.55);ctx.lineTo(r*.13,r*.35);ctx.lineTo(0,r*.65);ctx.lineTo(-r*.13,r*.35);ctx.lineTo(-r*.64,r*.55);ctx.lineTo(-r*.18,-r*.15);ctx.closePath();ctx.fill();ctx.fillStyle=cpuColor('#18232b',s.spectrum);ctx.fillRect(-r*.12,-r*.35,r*.24,r*.15);
  }else if(type==='iss'){
   ctx.fillRect(-r*.5,-r*.08,r,r*.16);ctx.fillRect(-r*.08,-r*.37,r*.16,r*.74);ctx.fillStyle=cpuColor('#a89250',s.spectrum);for(const x of [-.78,.48])for(const y of [-.65,.08])ctx.fillRect(r*x,r*y,r*.3,r*.55);
  }else if(type==='astronaut'){
   ctx.beginPath();ctx.arc(0,-r*.46,r*.22,0,TAU);ctx.fill();ctx.fillRect(-r*.22,-r*.2,r*.44,r*.55);ctx.fillRect(-r*.18,r*.3,r*.13,r*.48);ctx.fillRect(r*.05,r*.3,r*.13,r*.48);ctx.fillRect(-r*.42,-r*.14,r*.22,r*.17);ctx.fillRect(r*.2,-r*.14,r*.22,r*.17);ctx.fillStyle=cpuColor('#dbad46',s.spectrum);ctx.beginPath();ctx.ellipse(0,-r*.46,r*.17,r*.12,0,0,TAU);ctx.fill();
  }else{const g=ctx.createRadialGradient(-r*.3,-r*.3,0,0,0,r);g.addColorStop(0,c);g.addColorStop(1,type==='star'?cpuColor('#a74413',s.spectrum,'star'):cpuColor('#020710',s.spectrum));ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();}
  if(s.warp&&body.id===this.warpObjectId&&s.warpField){ctx.strokeStyle='rgba(104,183,241,.55)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,r*s.warpRadius,r*s.warpRadius*.6,0,0,TAU);ctx.stroke();}
  ctx.restore();
 }
 bridge(){
  if(!this.state.bridge)return;
  const ctx=this.context2d,radius=this.configCache.bridgeRadius;
  const q=cpuProject([0,0,0],this.cameraFrame,this.canvas.width,this.canvas.height);if(!q)return;
  const r=Math.min(4000,radius*q.pixels);if(!(r>.2))return;
  const other=Math.hypot(...this.cameraFrame.observer)>=radius/2,far=other?this.state.bridgeOtherColor:this.state.nebulaColor,hasNebula=other?this.state.bridgeOtherNebula!==false:this.state.nebula;
  ctx.fillStyle=hasNebula?cpuColor(far,this.state.spectrum,'nebula',.75):'#02050b';ctx.beginPath();ctx.arc(q.x,q.y,r*.72,0,TAU);ctx.fill();
  if(!hasNebula&&this.state.stars){ctx.fillStyle=cpuColor('#c8defa',this.state.spectrum,'star',.75);for(let n=0;n<38;n++){const a=seeded(n+901)*TAU,d=Math.sqrt(seeded(n+540))*r*.68;ctx.fillRect(q.x+Math.cos(a)*d,q.y+Math.sin(a)*d,1,1);}}
  const glow=ctx.createRadialGradient(q.x,q.y,r*.7,q.x,q.y,r*1.4);glow.addColorStop(0,cpuColor('#200c38',this.state.spectrum,'nebula',.6));glow.addColorStop(.55,cpuColor('#6dc3eb',this.state.spectrum,'nebula',.7));glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.fillRect(q.x-r*1.4,q.y-r*1.4,r*2.8,r*2.8);
  if(this.state.grid){ctx.strokeStyle='rgba(132,209,245,.5)';ctx.lineWidth=.7;for(let n=0;n<10;n++){ctx.beginPath();ctx.ellipse(q.x,q.y,r*(.5+n*.09),r*.7,0,0,TAU);ctx.stroke();}}
 }
 cockpit(){
  if(this.focusMode!=='onboard'||this.getFocusFrame()?.type!=='shuttle')return;
  const c=this.cameraFrame,frame={observer:c.inspectCamera,forward:c.inspectForward,right:c.inspectRight,up:c.inspectUp},ctx=this.context2d,w=this.canvas.width,h=this.canvas.height;
  // Small fixed geometry in the shuttle's frame: looking around rotates these
  // windows with the cabin, while orbital motion leaves the flight deck stable.
  const pane=(points,color)=>{const projected=points.map(p=>cpuProject(p,frame,w,h));if(projected.some(p=>!p))return;ctx.beginPath();projected.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=cpuColor(color,this.state.spectrum);ctx.fill();ctx.strokeStyle=cpuColor('#536264',this.state.spectrum);ctx.lineWidth=1;ctx.stroke();};
  const panel=(x1,x2,y1,y2,z,color)=>pane([[x1,y1,z],[x2,y1,z],[x2,y2,z],[x1,y2,z]],color);
  for(const z of [.62,.315]){
   panel(-.112,.112,-.055,.03,z,'#252d2e');panel(-.112,.112,.122,.133,z,'#364041');
   for(const x of [-.112,-.062,0,.062,.112])panel(x-.003,x+.003,.03,.124,z,'#3b4748');
  }
  for(const side of [-1,1]){const x=.112*side;for(const z of [.315,.455,.522,.59,.62])pane([[x,.03,z-.003],[x,.03,z+.003],[x,.133,z+.003],[x,.133,z-.003]],'#3b4748');pane([[x,-.055,.315],[x,-.055,.62],[x,.03,.62],[x,.03,.315]],'#232c2e');}
  for(const x of [-.085,-.023,.039]){panel(x,x+.045,-.003,.025,.618,'#123b2b');panel(x+.003,x+.042,.01,.011,.617,'#70c797');}
 }
 *paintStages(){
  this.fillHoles();this.protectObserver();this.fillObjects();this.updateCameraFrame();
  // A scene with no emitting objects can legitimately be black. Validate the
  // actual geometry before painting, rather than guessing from its pixels.
  if(!this.validateFrameGeometry())return false;
  this.sky();yield;
  yield* this.gridStages();
  if(this.state.blackHole){if(this.state.binary)yield* this.holeStages(1);yield* this.holeStages(0);}this.bridge();yield;
  const bodies=[...this.objectFrames].sort((a,b)=>Math.hypot(...b.position.map((v,i)=>v-this.cameraFrame.observer[i]))-Math.hypot(...a.position.map((v,i)=>v-this.cameraFrame.observer[i])));
  for(const body of bodies){this.body(body);yield;}this.cockpit();yield;return true;
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

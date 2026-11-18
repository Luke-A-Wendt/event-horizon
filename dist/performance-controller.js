/* Adaptive targets completed frames at 30 FPS, within a 25–35 FPS band.
 * Its internal ladder changes resolution and sampling in small increments;
 * the controls still expose only Low, Medium, High and Ultra. */
export const QUALITY_PROFILES=Object.freeze({
 low:Object.freeze({scale:.28,dpr:1,steps:64,pixels:120000,detail:0}),
 medium:Object.freeze({scale:.5,dpr:1,steps:112,pixels:450000,detail:1}),
 high:Object.freeze({scale:.8,dpr:1.25,steps:192,pixels:1300000,detail:2}),
 ultra:Object.freeze({scale:1.25,dpr:2,steps:768,pixels:16000000,detail:3})
});
export const ADAPTIVE_NAMES=Object.freeze(['low','medium','high','ultra']);
export const ADAPTIVE_LEVELS=Object.freeze(ADAPTIVE_NAMES.map(name=>QUALITY_PROFILES[name]));
export const LOW_PIXEL_SCALES=Object.freeze([1,.87,.76,.66,.57,.5,.43,.38,.33,.29,.25,.22,.19,.165,.145,.125]);
const lowProfiles=LOW_PIXEL_SCALES.map(factor=>Object.freeze({...QUALITY_PROFILES.low,scale:QUALITY_PROFILES.low.scale*factor,pixels:Math.round(QUALITY_PROFILES.low.pixels*factor*factor)}));
const ladder=lowProfiles.map(profile=>({level:0,profile})).reverse();
const endpoints=[ladder.length-1];
for(let level=1;level<ADAPTIVE_LEVELS.length;level++){
 const before=ADAPTIVE_LEVELS[level-1],after=ADAPTIVE_LEVELS[level];
 const count=level===3?12:6;
 for(let n=1;n<=count;n++){
  const t=n/count,blend=(a,b)=>a*Math.pow(b/a,t);
  const profile=n===count?after:Object.freeze({scale:blend(before.scale,after.scale),dpr:blend(before.dpr,after.dpr),steps:Math.round(before.steps+(after.steps-before.steps)*t),pixels:Math.round(blend(before.pixels,after.pixels)),detail:before.detail+(after.detail-before.detail)*t});
  ladder.push({level,profile});
 }
 endpoints.push(ladder.length-1);
}
export const ADAPTIVE_STEPS=Object.freeze(ladder.map(step=>Object.freeze(step)));
export const STARTUP_PROFILE=ADAPTIVE_STEPS[0].profile;
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,Math.floor(Number(value)||0)));

export class RenderBudget {
 constructor(){
  this.quality='adaptive';this.step=0;this.maximumStep=ADAPTIVE_STEPS.length-1;this.webgl2=true;this.generation=0;
  this.lastDrop=-Infinity;this.interactionUntil=0;this.lastInteractionDrop=-Infinity;
  this.probing=false;this.lastChange=0;this.slowStep=Infinity;this.resetTiming();
 }
 // Preserve the public tier/floor fields used by renderer telemetry and saves.
 get level(){return ADAPTIVE_STEPS[this.step].level;}
 set level(value){this.step=endpoints[clamp(value,0,3)];}
 get safety(){return this.level===0?endpoints[0]-this.step:0;}
 set safety(value){if(this.level===0)this.step=endpoints[0]-clamp(value,0,endpoints[0]);}
 get effectiveQuality(){return this.quality==='adaptive'?ADAPTIVE_NAMES[this.level]:this.quality;}
 get profile(){return this.quality==='adaptive'?ADAPTIVE_STEPS[this.step].profile:QUALITY_PROFILES[this.quality];}
 get pixelScale(){return this.quality==='adaptive'?this.profile.scale/QUALITY_PROFILES[this.effectiveQuality].scale:1;}
 clearWindow(now=0,settle=60){
  this.generation++;this.lastCompletion=null;this.windowStart=null;this.completions=0;
  this.fastMs=0;this.goodMs=0;this.badMs=0;this.settleUntil=now+settle;
 }
 resetTiming(now=0,reason='Measuring render cadence'){
  this.frameMs=33.3;this.submitMs=0;this.gpuMs=0;this.renderFps=0;this.lastLongGap=-Infinity;this.previousGap=0;
  this.clearWindow(now);this.adaptiveStatus=this.quality==='adaptive'?'warming':'manual';
  this.adaptiveReason=this.quality==='adaptive'?reason:'Selected quality stays fixed';
 }
 setQuality(quality,now=0){
  if(quality!=='adaptive'&&!QUALITY_PROFILES[quality]||quality===this.quality)return false;
  const previous=this.quality;this.quality=quality;this.probing=false;
  if(quality==='adaptive'){this.step=Math.min(this.maximumStep,endpoints[ADAPTIVE_NAMES.indexOf(previous)]??this.step);this.beginScene(now);}else this.resetTiming(now);return true;
 }
 setContext(webgl2,now=0){this.webgl2=webgl2;this.maximumStep=ADAPTIVE_STEPS.length-1;this.beginScene(now,{cold:true});}
 beginScene(now=0,{cold=false}={}){
  // Keep the current fidelity through scene/target/Drive changes. Only an
  // actual renderer start needs the emergency preview floor.
  if(cold&&this.quality==='adaptive')this.step=0;
  this.probing=false;this.lastDrop=-Infinity;this.lastChange=now;this.slowStep=Infinity;
  this.interactionUntil=0;this.lastInteractionDrop=-Infinity;
  this.resetTiming(now,cold?'Starting at Low; refining from completed frames':'Keeping current detail; measuring this view');
 }
 changeStep(step,now,probe){
  step=clamp(step,0,this.maximumStep);if(step===this.step)return false;
  this.step=step;this.lastChange=now;this.probing=probe;this.clearWindow(now);
  this.adaptiveStatus=probe?'probing':'limited';
  this.adaptiveReason=probe?'Above 35 FPS; increasing resolution':'Below 25 FPS; reducing resolution';
  return true;
 }
 changeLevel(level,now,probe){return this.changeStep(endpoints[clamp(level,0,3)],now,probe);}
 limitUltra(now){this.maximumStep=endpoints[2];const changed=this.changeStep(Math.min(this.step,this.maximumStep),now,false);this.adaptiveReason='Ultra unavailable on this graphics context; using High';return changed;}
 changePixels(safety,now,probe){return this.changeStep(endpoints[0]-clamp(safety,0,endpoints[0]),now,probe);}
 drop(now,count=1){
  if(this.quality!=='adaptive'||now-this.lastDrop<80)return false;
  if(this.step===0)return false;
  this.slowStep=this.step;this.lastDrop=now;return this.changeStep(this.step-count,now,false);
 }
 noteInteraction(now=0){
  const newGesture=now>=this.interactionUntil;this.interactionUntil=now+200;
  if(this.quality!=='adaptive'||!newGesture)return false;
  // Do not reuse cheaper pre-input frame timings after the warp workload or
  // camera changes. Existing quality is retained until actual pressure falls.
  this.clearWindow(now,0);
  // Movement inhibits promotions; only measured pressure lowers fidelity.
  return false;
 }
 noteFrame(now,gap){
  if(gap>0)this.frameMs+=.15*(Math.min(gap,1000)-this.frameMs);
  // Tab suspension is handled by resetTiming; a repeated slow callback must
  // still count as low achieved FPS rather than an endless measurement reset.
  if(gap>120&&this.previousGap<=120&&now-this.lastLongGap>1500){this.clearWindow(now,0);this.lastLongGap=now;}
  else if(gap>120)this.lastLongGap=now;
  this.previousGap=gap;
  return gap>250?this.drop(now,this.pressureSteps(gap)):false;
 }
 noteSubmit(now,ms){this.submitMs=.5*this.submitMs+.5*Math.max(0,ms);return false;}
 noteGpu(now,ms,complete,{eligible=true,polls=0}={}){
  if(complete)this.gpuMs=.5*this.gpuMs+.5*Math.max(0,ms);
  // Never wait on the GPU. An unfinished >40ms draw already misses 25 FPS;
  // reduce the *following* draw while the current one retires.
  if(eligible&&!complete&&polls>=2&&ms>40)return this.drop(now,this.pressureSteps(ms));
  return false;
 }
 pressureSteps(ms){return ms>=1000?this.step:Math.min(10,Math.max(1,Math.ceil(Math.log(Math.max(1,ms/(1000/30)))/Math.log(1.35))));}
 noteWorkloadProbe(now,{ms,pixels,steps}){
  if(this.quality!=='adaptive'||!(pixels>0&&steps>0))return false;
  // Measure a newly enabled warp field in a bounded image before spending a
  // budget earned by the cheaper field-off image. This can only reduce work.
  const work=pixels*steps*(1000/30)/Math.max(1000/60,ms||0);
  let next=this.step;
  while(next>0&&ADAPTIVE_STEPS[next].profile.pixels*ADAPTIVE_STEPS[next].profile.steps>work)next--;
  if(next===this.step)return false;
  this.slowStep=this.step;
  return this.changeStep(next,now,false);
 }
 noteCompletion(now,{eligible=true}={}){
  if(!eligible||now<this.settleUntil){this.lastCompletion=now;this.windowStart=now;this.completions=0;return false;}
  if(this.lastCompletion===null||this.windowStart===null){this.lastCompletion=now;this.windowStart=now;return false;}
  if(now<=this.lastCompletion)return false;
  this.lastCompletion=now;this.completions++;
  const elapsed=now-this.windowStart;if(elapsed<100)return false;
  const fps=this.completions*1000/elapsed;
  if(fps>=15&&fps<50&&elapsed<250)return false;
  this.renderFps=fps;this.windowStart=now;this.completions=0;
  if(this.quality!=='adaptive')return false;
  // Tiny tolerance removes floating-point boundary noise, not an FPS margin.
  if(fps<25-1e-6){
   this.badMs+=elapsed;this.goodMs=this.fastMs=0;
   this.adaptiveStatus='limited';this.adaptiveReason=this.step===0?'Minimum resolution; preserving scene objects':'Below 25 FPS; reducing resolution';
   return this.drop(now,this.pressureSteps(1000/Math.max(fps,.001)));
  }
  this.badMs=0;this.goodMs+=elapsed;this.fastMs=fps>35+1e-6?this.fastMs+elapsed:0;
  if(this.probing&&this.goodMs>=500)this.probing=false;
  if(!this.probing){this.adaptiveStatus='stable';this.adaptiveReason=this.step===this.maximumStep?'Maximum available detail; targeting 30 FPS':'Holding 25–35 FPS';}
  // Large headroom reacts in about 100ms; a marginal gain needs 500ms.
  // Several small ladder steps can be crossed together, including into Ultra.
  const wait=fps>=55?100:fps>=45?200:500,jump=fps>=55?4:fps>=45?2:1;
  if(this.fastMs>=wait&&now>=this.interactionUntil){
   // 60FPS is enough evidence for roughly twice the work, not a several-fold
   // Ultra pixel-and-ray jump. Probe within that headroom before rising again.
   const work=profile=>profile.pixels*profile.steps,current=work(this.profile),limit=current*Math.max(1,fps/30);
   let next=this.step+1;
   while(next<this.maximumStep&&next<this.step+jump&&work(ADAPTIVE_STEPS[next+1].profile)<=limit)next++;
   return this.changeStep(Math.min(next,Math.max(this.step+1,this.slowStep-1)),now,true);
  }
  return false;
 }
}

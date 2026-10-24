/* Adaptive is a selector over the same named presets exposed by the UI.
 * No hidden resolution floor, fractional mode, or automatic Ultra selection. */
export const QUALITY_PROFILES=Object.freeze({
 low:Object.freeze({scale:.55,dpr:1,steps:96,pixels:600000,detail:0}),
 medium:Object.freeze({scale:.8,dpr:1.25,steps:160,pixels:1400000,detail:1}),
 high:Object.freeze({scale:1,dpr:1.5,steps:256,pixels:2800000,detail:2}),
 ultra:Object.freeze({scale:1.25,dpr:2,steps:768,pixels:16000000,detail:3})
});
export const ADAPTIVE_NAMES=Object.freeze(['low','medium','high']);
export const ADAPTIVE_LEVELS=Object.freeze(ADAPTIVE_NAMES.map(name=>QUALITY_PROFILES[name]));

export class RenderBudget {
 constructor(){
  this.quality='adaptive';this.level=0;this.safety=0;this.webgl2=true;this.generation=0;
  this.retryAfter=[0,0,0];this.failedAttempts=[0,0,0];this.lastDrop=-Infinity;
  this.probing=false;this.lastChange=0;this.resetTiming();
 }
 get effectiveQuality(){return this.quality==='adaptive'?ADAPTIVE_NAMES[this.level]:this.quality;}
 get profile(){return QUALITY_PROFILES[this.effectiveQuality];}
 clearWindow(now=0,settle=200){
  this.generation++;this.lastCompletion=null;this.windowStart=null;this.completions=0;
  this.fastMs=0;this.goodMs=0;this.badMs=0;this.settleUntil=now+settle;
 }
 resetTiming(now=0,reason='Measuring render cadence'){
  this.frameMs=16.7;this.submitMs=0;this.gpuMs=0;this.renderFps=0;this.lastLongGap=-Infinity;
  this.clearWindow(now);this.adaptiveStatus=this.quality==='adaptive'?'warming':'manual';
  this.adaptiveReason=this.quality==='adaptive'?reason:'Selected quality stays fixed';
 }
 setQuality(quality,now=0){
  if(quality!=='adaptive'&&!QUALITY_PROFILES[quality])return false;
  if(quality==='adaptive'&&this.quality!=='adaptive')this.level=Math.max(0,ADAPTIVE_NAMES.indexOf(this.quality==='ultra'?'high':this.quality));
  this.quality=quality;this.probing=false;this.retryAfter=[0,0,0];this.failedAttempts=[0,0,0];this.resetTiming(now);return true;
 }
 setContext(webgl2,now=0){this.webgl2=webgl2;this.level=0;this.probing=false;this.resetTiming(now);}
 changeLevel(level,now,probe){
  if(level===this.level)return false;
  this.level=level;this.lastChange=now;this.probing=probe;this.clearWindow(now);
  this.adaptiveStatus=probe?'probing':'limited';
  this.adaptiveReason=probe?`Trying ${ADAPTIVE_NAMES[level]}; keeping it if motion stays at 30 FPS`:`Below 30 FPS; using ${ADAPTIVE_NAMES[level]} and checking for recovery`;
  return true;
 }
 drop(now){
  if(this.quality!=='adaptive'||this.level===0||now-this.lastDrop<500)return false;
  const failed=this.level;this.failedAttempts[failed]=Math.min(3,this.failedAttempts[failed]+1);
  this.retryAfter[failed]=now+12000*Math.pow(2,this.failedAttempts[failed]-1);
  this.lastDrop=now;return this.changeLevel(failed-1,now,false);
 }
 noteFrame(now,gap){
  if(gap>0)this.frameMs+=.15*(Math.min(gap,250)-this.frameMs);
  // A lone main-thread interruption is not evidence that the GPU mode is bad.
  // Repeated long frames remain in cadence measurements, including WebGL1.
  if(gap>120&&now-this.lastLongGap>1500){this.clearWindow(now,0);this.lastLongGap=now;}
  else if(gap>120)this.lastLongGap=now;
  return false;
 }
 noteSubmit(now,ms){this.submitMs=.5*this.submitMs+.5*Math.max(0,ms);return false;}
 noteGpu(now,ms,complete,{eligible=true,polls=0}={}){
  if(complete)this.gpuMs=.5*this.gpuMs+.5*Math.max(0,ms);
  // Fence age is quantized by RAF and must never be treated as a GPU timer.
  // Only a genuinely unfinished frame observed across several polls triggers
  // this watchdog. Ordinary 16/33ms polling cannot reduce quality.
  if(eligible&&!complete&&polls>=2&&ms>=250&&now-this.lastChange>=200)return this.drop(now);
  return false;
 }
 noteCompletion(now,{eligible=true}={}){
  if(!eligible||now<this.settleUntil){this.lastCompletion=now;this.windowStart=now;this.completions=0;return false;}
  if(this.lastCompletion===null||this.windowStart===null){this.lastCompletion=now;this.windowStart=now;return false;}
  if(now<=this.lastCompletion)return false;
  this.lastCompletion=now;this.completions++;
  const elapsed=now-this.windowStart;
  if(elapsed<500)return false;
  const fps=this.completions*1000/elapsed;this.renderFps=fps;
  this.windowStart=now;this.completions=0;
  if(this.quality!=='adaptive')return false;
  // A half-FPS tolerance accepts a stable 30Hz display/fallback cadence despite
  // fractional timestamps and frame-window boundaries.
  if(fps<29.5){
   this.badMs+=elapsed;this.goodMs=0;this.fastMs=0;
   this.adaptiveStatus='limited';this.adaptiveReason=this.level===0?'Low is the minimum preset; motion is below 30 FPS':'Checking a sustained dip below 30 FPS';
   return this.badMs>=750?this.drop(now):false;
  }
  this.badMs=0;this.goodMs+=elapsed;this.fastMs=fps>=45?this.fastMs+elapsed:0;
  if(this.probing&&this.goodMs>=1500){this.probing=false;this.failedAttempts[this.level]=0;this.retryAfter[this.level]=0;}
  if(!this.probing){this.adaptiveStatus='stable';this.adaptiveReason=this.level===2?'High is holding at least 30 FPS':'Motion is healthy; checking whether more detail fits';}
  if(this.level<2&&now>=this.retryAfter[this.level+1]&&(this.fastMs>=1500||this.goodMs>=8000))return this.changeLevel(this.level+1,now,true);
  return false;
 }
}

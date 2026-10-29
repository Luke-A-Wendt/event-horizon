/* Adaptive targets a completed-frame band of 15–30 FPS. Named presets share
 * the same scene geometry; only sampling and pixels change. At the Low floor,
 * emergency pixel reductions preserve the scene and recover when it is faster. */
export const QUALITY_PROFILES=Object.freeze({
 low:Object.freeze({scale:.28,dpr:1,steps:64,pixels:120000,detail:0}),
 medium:Object.freeze({scale:.5,dpr:1,steps:112,pixels:450000,detail:1}),
 high:Object.freeze({scale:.8,dpr:1.25,steps:192,pixels:1300000,detail:2}),
 ultra:Object.freeze({scale:1.25,dpr:2,steps:768,pixels:16000000,detail:3})
});
export const ADAPTIVE_NAMES=Object.freeze(['low','medium','high']);
export const ADAPTIVE_LEVELS=Object.freeze(ADAPTIVE_NAMES.map(name=>QUALITY_PROFILES[name]));
export const LOW_PIXEL_SCALES=Object.freeze([1,.75,.5,.35,.25,.18]);
const LOW_PROFILES=Object.freeze(LOW_PIXEL_SCALES.map(factor=>Object.freeze({...QUALITY_PROFILES.low,scale:QUALITY_PROFILES.low.scale*factor,pixels:QUALITY_PROFILES.low.pixels*factor*factor})));

export class RenderBudget {
 constructor(){
  this.quality='adaptive';this.level=0;this.safety=0;this.webgl2=true;this.generation=0;
  this.retryAfter=[0,0,0];this.failedAttempts=[0,0,0];this.lastDrop=-Infinity;this.pixelRetryAfter=0;
  this.probing=false;this.lastChange=0;this.resetTiming();
 }
 get effectiveQuality(){return this.quality==='adaptive'?ADAPTIVE_NAMES[this.level]:this.quality;}
 get pixelScale(){return this.quality==='adaptive'&&this.level===0?LOW_PIXEL_SCALES[this.safety]:1;}
 get profile(){return this.quality==='adaptive'&&this.level===0?LOW_PROFILES[this.safety]:QUALITY_PROFILES[this.effectiveQuality];}
 clearWindow(now=0,settle=200){
  this.generation++;this.lastCompletion=null;this.windowStart=null;this.completions=0;
  this.fastMs=0;this.goodMs=0;this.badMs=0;this.settleUntil=now+settle;
 }
 resetTiming(now=0,reason='Measuring render cadence'){
  this.frameMs=16.7;this.submitMs=0;this.gpuMs=0;this.renderFps=0;this.lastLongGap=-Infinity;this.previousGap=0;
  this.clearWindow(now);this.adaptiveStatus=this.quality==='adaptive'?'warming':'manual';
  this.adaptiveReason=this.quality==='adaptive'?reason:'Selected quality stays fixed';
 }
 setQuality(quality,now=0){
  if(quality!=='adaptive'&&!QUALITY_PROFILES[quality])return false;
  if(quality==='adaptive'&&this.quality!=='adaptive')this.level=Math.max(0,ADAPTIVE_NAMES.indexOf(this.quality==='ultra'?'high':this.quality));
  this.quality=quality;this.safety=0;this.pixelRetryAfter=0;this.probing=false;this.retryAfter=[0,0,0];this.failedAttempts=[0,0,0];this.resetTiming(now);return true;
 }
 setContext(webgl2,now=0){this.webgl2=webgl2;this.level=0;this.safety=0;this.probing=false;this.pixelRetryAfter=0;this.resetTiming(now);}
 changeLevel(level,now,probe){
  if(level===this.level)return false;
  this.level=level;this.safety=0;this.lastChange=now;this.probing=probe;this.clearWindow(now);
  this.adaptiveStatus=probe?'probing':'limited';
  this.adaptiveReason=probe?`Above 30 FPS; trying ${ADAPTIVE_NAMES[level]}`:`Below 15 FPS; using ${ADAPTIVE_NAMES[level]} and checking for recovery`;
  return true;
 }
 changePixels(safety,now,probe){
  if(safety===this.safety)return false;
  this.safety=safety;this.lastChange=now;this.probing=probe;this.clearWindow(now);
  this.adaptiveStatus=probe?'probing':'limited';
  this.adaptiveReason=probe?'Above 30 FPS; restoring Low resolution':'Below 15 FPS; reducing Low resolution while preserving scene objects';
  return true;
 }
 drop(now){
  if(this.quality!=='adaptive'||now-this.lastDrop<400)return false;
  if(this.level===0){
   if(this.safety===LOW_PIXEL_SCALES.length-1)return false;
   this.lastDrop=now;this.pixelRetryAfter=now+6000;return this.changePixels(this.safety+1,now,false);
  }
  const failed=this.level;this.failedAttempts[failed]=Math.min(3,this.failedAttempts[failed]+1);
  this.retryAfter[failed]=now+8000*Math.pow(2,this.failedAttempts[failed]-1);
  this.lastDrop=now;return this.changeLevel(failed-1,now,false);
 }
 noteFrame(now,gap){
  if(gap>0)this.frameMs+=.15*(Math.min(gap,1000)-this.frameMs);
  // Ignore one isolated scheduling interruption, never a repeated slow cadence.
  if(gap>120&&this.previousGap<=120&&now-this.lastLongGap>1500){this.clearWindow(now,0);this.lastLongGap=now;}
  else if(gap>120)this.lastLongGap=now;
  this.previousGap=gap;
  return false;
 }
 noteSubmit(now,ms){this.submitMs=.5*this.submitMs+.5*Math.max(0,ms);return false;}
 noteGpu(now,ms,complete,{eligible=true,polls=0}={}){
  if(complete)this.gpuMs=.5*this.gpuMs+.5*Math.max(0,ms);
  // Fence/query polling never blocks. An unfinished frame at 100ms is already
  // outside the target band; reduce the next frame while this one retires.
  if(eligible&&!complete&&polls>=2&&ms>=100&&now-this.lastChange>=200)return this.drop(now);
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
  // Half-frame tolerance prevents a real 15Hz display cadence oscillating at
  // timestamp/window boundaries. Persistently lower cadence reduces promptly.
  if(fps<14.5){
   this.badMs+=elapsed;this.goodMs=0;this.fastMs=0;
   this.adaptiveStatus='limited';this.adaptiveReason=this.level===0?'Low resolution is adapting to protect 15 FPS':'Checking a sustained dip below 15 FPS';
   return this.badMs>=500?this.drop(now):false;
  }
  this.badMs=0;this.goodMs+=elapsed;this.fastMs=fps>30.5?this.fastMs+elapsed:0;
  if(this.probing&&this.goodMs>=1500){this.probing=false;this.failedAttempts[this.level]=0;this.retryAfter[this.level]=0;}
  if(!this.probing){this.adaptiveStatus='stable';this.adaptiveReason=this.level===2?'High is holding at least 15 FPS':this.safety?'Low is using fewer pixels; waiting for headroom to restore detail':'Holding 15–30 FPS; checking for headroom above 30';}
  if(this.fastMs<2000)return false;
  if(this.level===0&&this.safety)return now>=this.pixelRetryAfter?this.changePixels(this.safety-1,now,true):false;
  if(this.level<2&&now>=this.retryAfter[this.level+1])return this.changeLevel(this.level+1,now,true);
  return false;
 }
}

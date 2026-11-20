import {AdaptiveCadence} from './performance-controller.js';

// Canvas profiles have their own geometry/pixel budgets; these are not GPU
// ray-tracing tiers. Adaptive starts cheaply and targets a 25–35 FPS capacity band around 30 FPS.
// The object budgets are unchanged: degrade decoration before scene contents.
export const CPU_QUALITY_PROFILES=Object.freeze({
 low:Object.freeze({width:224,height:148,stars:60,gridLines:3,gridSamples:4,weakBodies:2,diskRings:4,circleStep:4,ringBands:2,ringSegments:16,shadowRows:16,bodies:8,dysonCells:144,craters:3,detailPixels:18}),
 medium:Object.freeze({width:320,height:212,stars:110,gridLines:4,gridSamples:6,weakBodies:3,diskRings:6,circleStep:3,ringBands:3,ringSegments:24,shadowRows:28,bodies:12,dysonCells:320,craters:6,detailPixels:12}),
 high:Object.freeze({width:448,height:296,stars:180,gridLines:6,gridSamples:8,weakBodies:5,diskRings:10,circleStep:2,ringBands:5,ringSegments:40,shadowRows:48,bodies:20,dysonCells:720,craters:10,detailPixels:8}),
 ultra:Object.freeze({width:720,height:472,stars:360,gridLines:12,gridSamples:16,weakBodies:8,diskRings:16,circleStep:1,ringBands:9,ringSegments:72,shadowRows:96,bodies:32,dysonCells:1800,craters:22,detailPixels:3})
});
// Small internal steps avoid the old 224 → 320 → 448 pixel jumps. These
// profiles never add public quality choices and retain Low's object budget.
const low=CPU_QUALITY_PROFILES.low;
export const CPU_STARTUP_PROFILE=Object.freeze({...low,width:64,height:42,stars:16,gridLines:2,gridSamples:3,diskRings:2,circleStep:6,ringBands:1,ringSegments:8,shadowRows:6,dysonCells:64,craters:1,detailPixels:24});
const widths=[64,73,83,95,108,123,140,159,181,203,224,246,270,296,320,350,382,416,448,493,542,596,655,720];
export const CPU_LIVE_FLOOR=widths.indexOf(140);
const anchor={low:10,medium:14,high:18,ultra:23};
function interpolate(a,b,t,width,level){
 const result={};for(const key of Object.keys(a))result[key]=Math.round(a[key]+(b[key]-a[key])*t);
 // Emergency resolution reduces decoration, never the number of body slots.
 if(width<=low.width)result.bodies=low.bodies;
 return Object.freeze({...result,width,level});
}
export const CPU_ADAPTIVE_PROFILES=Object.freeze(widths.map(width=>{
 const [a,b,level]=width<=224?[CPU_STARTUP_PROFILE,low,'low']:width<=320?[low,CPU_QUALITY_PROFILES.medium,'medium']:width<=448?[CPU_QUALITY_PROFILES.medium,CPU_QUALITY_PROFILES.high,'high']:[CPU_QUALITY_PROFILES.high,CPU_QUALITY_PROFILES.ultra,'ultra'];
 return interpolate(a,b,Math.log(width/a.width)/Math.log(b.width/a.width),width,level);
}));
export class CpuQualityBudget{
 constructor(){this.cadence=new AdaptiveCadence();this.mode='adaptive';this.rung=0;this.startup=true;this.cost=0;this.samples=0;this.changedAt=-Infinity;this.fastSince=null;this.slowSince=null;this.retryAfter=0;this.interactionUntil=0;this.reason='Starting with a lightweight CPU preview';this.slowRung=Infinity;}
 get level(){return this.startup?'low':this.mode==='adaptive'?CPU_ADAPTIVE_PROFILES[this.rung].level:this.mode;}
 set level(value){this.rung=anchor[value]??anchor.low;this.startup=false;if(this.mode!=='adaptive')this.mode=value;}
 get relief(){return this.rung<anchor.low?2*(anchor.low-this.rung)/anchor.low:0;}
 set relief(value){this.rung=Math.max(0,Math.min(anchor.low,Math.round(anchor.low*(1-Math.max(0,Math.min(2,value))/2))));}
 select(value){
  const mode=value==='adaptive'||Object.hasOwn(CPU_QUALITY_PROFILES,value)?value:'adaptive';
  if(mode===this.mode)return false;
  this.cadence.reset();this.mode=mode;this.startup=false;if(mode!=='adaptive')this.rung=anchor[mode];this.reset();this.changedAt=-Infinity;this.interactionUntil=0;
  if(mode==='adaptive')this.beginScene();else this.reason='Selected CPU quality';return true;
 }
 reset(){this.cost=0;this.samples=0;this.fastSince=null;this.slowSince=null;this.retryAfter=0;}
 beginScene(now=0,{cold=false}={}){
  // Scene/Drive transitions retain their actual profile. Only initial setup or
  // a renderer restart explicitly asks for the inexpensive first preview.
  if(cold){this.rung=0;this.startup=true;}
  this.reset();this.cadence.reset();this.emergencyUsed=false;this.changedAt=now;this.interactionUntil=0;this.slowRung=Infinity;
  this.reason=this.startup?'Starting with a lightweight CPU preview':'Measuring the new view at current CPU detail';return true;
 }
 noteInteraction(now){
  this.interactionUntil=now+250;if(this.rung>=anchor.low)this.fastSince=null;
  // Camera input blocks refinement; measured work determines any reduction.
  return false;
 }
 note(cost,now,{complete=true}={}){
  if(!Number.isFinite(cost)||cost<0||!Number.isFinite(now))return false;
  // Preparation or state transport is not evidence that a first frame exists.
  if(this.startup){
   if(!complete)return false;
   this.startup=false;this.reset();this.changedAt=now;this.reason=this.mode==='adaptive'?'Measuring CPU frame capacity':'Selected CPU quality';
   if(this.mode!=='adaptive')return true;
  }
  this.cost=this.samples?this.cost*.35+cost*.65:cost;this.samples++;
  if(this.mode!=='adaptive')return false;
  // This renderer deliberately paces at 30Hz. Measure full-frame work
  // capacity, excluding deliberate idle; unfinished work may still downshift.
  const slowCost=Math.max(cost,this.cost);
  const fps=1000/Math.max(.01,slowCost);
  if(complete)this.cadence.sample(now,fps,this.rung<=anchor.low);
  const relaxed=this.cadence.target===15,lower=relaxed?13:25,upper=relaxed?18:35;
  if(!complete&&slowCost>=1000&&!this.emergencyUsed&&this.rung>=CPU_LIVE_FLOOR){
   this.emergencyUsed=true;return this.move(0,now,'Preparing a lightweight recovery frame');
  }
  if(this.rung<CPU_LIVE_FLOOR){
   if(complete&&now-this.changedAt>=100)return this.move(Math.min(CPU_LIVE_FLOOR,this.rung+2),now,'Refining the first CPU frames');
   return false;
  }
  if(fps<lower-1e-6){
   this.fastSince=null;
   const delay=Math.max(0,120-2*(slowCost-1000/lower));
   if(now-this.changedAt>=delay&&this.rung>CPU_LIVE_FLOOR){
    const decrement=Math.max(1,Math.ceil(3*Math.log2(slowCost/(1000/this.cadence.target))));
    this.slowRung=this.rung;return this.move(Math.max(CPU_LIVE_FLOOR,this.rung-decrement),now,'Reducing CPU resolution');
   }
   this.reason='Holding live CPU resolution';return false;
  }
  this.slowSince=null;
  const refiningLow=this.rung<anchor.low&&fps>=25-1e-6;
  if(relaxed&&(this.rung>=anchor.low||!this.cadence.paced(now))){this.reason='Targeting 15 FPS at live CPU resolution';return false;}
  if((fps>upper+1e-6||refiningLow)&&complete&&(now>=this.interactionUntil||this.rung<anchor.low)){
   this.fastSince??=now;
   // Near the target, make small measured adjustments. At 60FPS, a brief
   // confirmation permits the five internal steps from full High to Ultra.
   const delay=Math.max(60,500-17.6*(fps-upper));
   const increment=Math.min(5,Math.max(1,Math.floor((fps-this.cadence.target+1e-6)/6)));
   // A failed large step brackets the useful range. Try its intermediate
   // rung instead of repeatedly skipping it; this is not a lasting ceiling.
   const next=Math.min(this.rung+increment,relaxed?anchor.low:CPU_ADAPTIVE_PROFILES.length-1,Math.max(this.rung+1,this.slowRung-1));
   if(this.samples>=2&&now-this.fastSince>=delay&&now-this.changedAt>=delay&&this.rung<CPU_ADAPTIVE_PROFILES.length-1)return this.move(next,now,'Increasing CPU resolution');
  }else this.fastSince=null;
  if(fps>=lower-1e-6&&fps<=upper+1e-6)this.reason=`Targeting ${this.cadence.target} FPS`;
  else if(this.rung===CPU_ADAPTIVE_PROFILES.length-1)this.reason='Ultra; targeting 30 FPS';
  return false;
 }

 move(rung,now,reason){
  if(rung===this.rung)return false;
  this.rung=Math.max(0,Math.min(CPU_ADAPTIVE_PROFILES.length-1,rung));this.changedAt=now;this.reason=reason;this.reset();return true;
 }
 change(level,now,reason){this.startup=false;return this.move(anchor[level]??0,now,reason);}
 setRelief(value,now){this.startup=false;const rung=Math.round(anchor.low*(1-Math.max(0,Math.min(2,value))/2));return this.move(rung,now,value?'Reducing CPU resolution':'Restoring CPU Low detail');}
 get profile(){return this.startup?CPU_STARTUP_PROFILE:this.mode==='adaptive'?CPU_ADAPTIVE_PROFILES[this.rung]:CPU_QUALITY_PROFILES[this.mode];}
}

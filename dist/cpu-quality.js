// Canvas profiles have their own geometry/pixel budgets; these are not GPU
// ray-tracing tiers. Adaptive starts cheaply and targets 15–30 displayed FPS.
// The object budgets are unchanged: degrade decoration before scene contents.
export const CPU_QUALITY_PROFILES=Object.freeze({
 low:Object.freeze({width:224,height:148,stars:60,gridLines:3,gridSamples:4,weakBodies:2,diskRings:4,circleStep:4,ringBands:2,ringSegments:16,shadowRows:16,bodies:8,dysonCells:144,craters:3,detailPixels:18}),
 medium:Object.freeze({width:320,height:212,stars:110,gridLines:4,gridSamples:6,weakBodies:3,diskRings:6,circleStep:3,ringBands:3,ringSegments:24,shadowRows:28,bodies:12,dysonCells:320,craters:6,detailPixels:12}),
 high:Object.freeze({width:448,height:296,stars:180,gridLines:6,gridSamples:8,weakBodies:5,diskRings:10,circleStep:2,ringBands:5,ringSegments:40,shadowRows:48,bodies:20,dysonCells:720,craters:10,detailPixels:8}),
 ultra:Object.freeze({width:720,height:472,stars:360,gridLines:12,gridSamples:16,weakBodies:8,diskRings:16,circleStep:1,ringBands:9,ringSegments:72,shadowRows:96,bodies:32,dysonCells:1800,craters:22,detailPixels:3})
});
const levels=['low','medium','high'];
export class CpuQualityBudget{
 constructor(){this.mode='adaptive';this.level='low';this.cost=0;this.samples=0;this.changedAt=0;this.fastSince=null;this.slowSince=null;this.retryAfter=0;this.relief=0;this.reliefProfile=null;this.reason='Starting with a lightweight CPU preview';}
 select(value){
  const mode=value==='adaptive'||Object.hasOwn(CPU_QUALITY_PROFILES,value)?value:'adaptive';
  if(mode===this.mode)return false;
  this.mode=mode;this.level=mode==='adaptive'?'low':mode;this.cost=0;this.samples=0;this.fastSince=null;this.slowSince=null;this.changedAt=0;this.retryAfter=0;this.relief=0;this.reliefProfile=null;this.reason=mode==='adaptive'?'Measuring CPU frame time':'Selected CPU quality';return true;
 }
 note(cost,now){
  if(!Number.isFinite(cost)||cost<0||!Number.isFinite(now))return false;
  this.cost=this.samples?this.cost*.75+cost*.25:cost;this.samples++;
  if(this.mode!=='adaptive')return false;
  const index=levels.indexOf(this.level);
  if(cost>100||this.cost>1000/15){
   this.fastSince=null;this.slowSince??=now;
   if(cost>100||now-this.slowSince>=500){
    if(index>0){this.retryAfter=now+12000;return this.change(levels[index-1],now,'Reducing CPU detail below 15 FPS');}
    if(this.relief<2){this.retryAfter=now+12000;return this.setRelief(this.relief+1,now);}
    this.reason='Minimum CPU detail; this device is below 15 FPS';
   }
  }else this.slowSince=null;
  // Rendering is paced at 30 Hz, so use measured available frame capacity
  // rather than expecting a deliberately capped presentation to exceed 30 Hz.
  if(this.cost<31&&cost<1000/30&&this.samples>=8){
   this.fastSince??=now;
   if(now>=this.retryAfter&&now-this.fastSince>=4000&&now-this.changedAt>=5000){
    if(this.relief>0)return this.setRelief(this.relief-1,now);
    if(index<levels.length-1)return this.change(levels[index+1],now,'Testing CPU detail with more than 30 FPS of headroom');
   }
  }else this.fastSince=null;
  if(this.cost>=1000/30&&this.cost<=1000/15)this.reason='Holding CPU detail within 15–30 FPS';
  return false;
 }
 change(level,now,reason){this.level=level;this.changedAt=now;this.reason=reason;this.fastSince=null;this.slowSince=null;this.samples=0;return true;}
 setRelief(value,now){
  this.relief=value;
  const base=CPU_QUALITY_PROFILES.low,ratio=value===1?.75:.5;
  this.reliefProfile=value?Object.freeze({...base,width:Math.round(base.width*ratio),height:Math.round(base.height*ratio),stars:Math.max(24,Math.round(base.stars*ratio)),gridLines:2,diskRings:3,shadowRows:Math.max(8,Math.round(base.shadowRows*ratio)),dysonCells:Math.max(64,Math.round(base.dysonCells*ratio)),craters:2}):null;
  return this.change('low',now,value?'Reducing CPU resolution and decoration below 15 FPS':'Restoring CPU Low detail with available headroom');
 }
 get profile(){return this.mode==='adaptive'&&this.level==='low'&&this.reliefProfile||CPU_QUALITY_PROFILES[this.level];}
}

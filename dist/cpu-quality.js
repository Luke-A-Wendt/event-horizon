// Canvas profiles have their own geometry/pixel budgets; these are not GPU
// ray-tracing tiers. Adaptive begins cheaply before probing higher detail.
export const CPU_QUALITY_PROFILES=Object.freeze({
 low:Object.freeze({width:288,height:192,stars:90,gridLines:4,gridSamples:6,weakBodies:2,diskRings:5,circleStep:3,ringBands:3,ringSegments:24,shadowRows:24,bodies:8,dysonCells:240,craters:4,detailPixels:14}),
 medium:Object.freeze({width:416,height:276,stars:160,gridLines:6,gridSamples:8,weakBodies:3,diskRings:8,circleStep:3,ringBands:4,ringSegments:36,shadowRows:40,bodies:12,dysonCells:480,craters:8,detailPixels:10}),
 high:Object.freeze({width:560,height:368,stars:240,gridLines:8,gridSamples:12,weakBodies:5,diskRings:12,circleStep:2,ringBands:6,ringSegments:48,shadowRows:64,bodies:20,dysonCells:1000,craters:14,detailPixels:6}),
 ultra:Object.freeze({width:720,height:472,stars:360,gridLines:12,gridSamples:16,weakBodies:8,diskRings:16,circleStep:1,ringBands:9,ringSegments:72,shadowRows:96,bodies:32,dysonCells:1800,craters:22,detailPixels:3})
});
const levels=['low','medium','high'];
export class CpuQualityBudget{
 constructor(){this.mode='adaptive';this.level='low';this.cost=0;this.samples=0;this.changedAt=0;this.fastSince=null;this.slowSince=null;this.reason='Starting with a lightweight CPU preview';}
 select(value){
  const mode=value==='adaptive'||Object.hasOwn(CPU_QUALITY_PROFILES,value)?value:'adaptive';
  if(mode===this.mode)return false;
  this.mode=mode;this.level=mode==='adaptive'?'low':mode;this.cost=0;this.samples=0;this.fastSince=null;this.slowSince=null;this.changedAt=0;this.reason=mode==='adaptive'?'Measuring CPU frame time':'Selected CPU quality';return true;
 }
 note(cost,now){
  if(!Number.isFinite(cost)||cost<0||!Number.isFinite(now))return false;
  this.cost=this.samples?this.cost*.75+cost*.25:cost;this.samples++;
  if(this.mode!=='adaptive')return false;
  const index=levels.indexOf(this.level);
  if(cost>66.7||this.cost>33.3){
   this.fastSince=null;this.slowSince??=now;
   if(index>0&&(cost>100||now-this.slowSince>350))return this.change(levels[index-1],now,'Reducing CPU detail to preserve frame rate');
  }else this.slowSince=null;
  if(this.cost<17&&cost<23&&this.samples>=8){
   this.fastSince??=now;
   if(index<levels.length-1&&now-this.fastSince>6000&&now-this.changedAt>8000)return this.change(levels[index+1],now,'Testing the next CPU detail level');
  }else this.fastSince=null;
  return false;
 }
 change(level,now,reason){this.level=level;this.changedAt=now;this.reason=reason;this.fastSince=null;this.slowSince=null;this.samples=0;return true;}
 get profile(){return CPU_QUALITY_PROFILES[this.level];}
}

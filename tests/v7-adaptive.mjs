// Observable rendering policy, using simulated RAF clocks and GPU retirement.
// No test here claims browser or physical-device benchmark results.
import assert from 'node:assert/strict';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { QUALITY_PROFILES } from '../dist/performance-controller.js';
import { fixture } from './render-fixture.mjs';

function simulation(options={}){
 const f=fixture({width:1200,height:800,dpr:2,gpuLatencyMs:4,...options});
 const statistics=[],r=new BlackHoleRenderer(f.canvas,{onStats:s=>statistics.push(s)});
 let now=1000;
 const history=[];
 function tick(interval=1000/60){
  now+=interval;f.step(r,now);
  const s=r.getState();history.push({time:now,quality:s.effectiveQuality,status:s.adaptiveStatus});
  if(s.quality==='adaptive'){
   assert(['low','medium','high'].includes(s.effectiveQuality),'Adaptive may select only visible non-Ultra presets');
   assert.deepEqual(r.budget.profile,QUALITY_PROFILES[s.effectiveQuality],'Adaptive must never use a hidden scale/detail budget');
  }
 }
 function run(duration,interval=1000/60){const end=now+duration;while(now<end-.001)tick(typeof interval==='function'?interval():interval);}
 return {f,r,statistics,history,tick,run,get now(){return now}};
}

// Regression reported by the user: a desktop delivering 50–60 FPS at High
// must reach and retain exactly High, not become blurrier than manual Low.
{
 const s=simulation();s.run(6000);
 assert.equal(s.r.getState().effectiveQuality,'high','A healthy desktop should reach High within six seconds');
 assert(s.history.find(h=>h.quality==='medium'),'Adaptive must evaluate Medium on its way to High');
 const firstHigh=s.history.find(h=>h.quality==='high');assert(firstHigh.time-1000<=6000);
 const chosen={width:s.f.canvas.width,height:s.f.canvas.height,steps:s.r.steps,detail:s.r.detail};
 s.r.setQuality('high');s.run(100);
 assert.deepEqual({width:s.f.canvas.width,height:s.f.canvas.height,steps:s.r.steps,detail:s.r.detail},chosen,'Adaptive High must be pixel-for-pixel the same rendering budget as manual High');
 s.r.setQuality('adaptive');s.run(6000);
 let index=0;s.run(30000,()=>[1000/60,20,1000/60,20][index++%4]);
 assert.equal(s.r.getState().effectiveQuality,'high');
 assert(s.history.filter(h=>h.time>14000).every(h=>h.quality==='high'),'50–60 FPS is sufficient; never demand a locked 60 FPS');
 assert(s.statistics.at(-1).fps>=49&&s.statistics.at(-1).fps<=61);
 s.run(5000,25);assert.equal(s.r.getState().effectiveQuality,'high','A stable 40 FPS is above the requested cutoff');
 s.run(3500,1000/29);assert.notEqual(s.r.getState().effectiveQuality,'high','A sustained 29 FPS is below the requested cutoff');
 s.r.dispose();
}

// The important distinction is retired frames, not smooth RAF callbacks.
// A 20 ms GPU frame sampled on 60 Hz RAF retires every 33.33 ms: that is an
// acceptable 30 FPS stream, not an overload on every fence poll.
{
 const s=simulation({gpuLatencyMs:20});let interval=0;s.run(28000,()=>[16,17,16,18,16.3333,16.6667][interval++%6]);
 assert.equal(s.r.getState().effectiveQuality,'high','A 30 FPS stream must be allowed to test and retain higher modes');
 const lastHigh=s.history.findLastIndex(h=>h.quality!=='high');
 assert(s.history.length-lastHigh>120,'High should remain stable for several seconds at a 30 FPS retirement cadence');
 assert(s.statistics.at(-1).fps>=29&&s.statistics.at(-1).fps<=31);
 assert(s.f.calls.wait>s.f.draws,'This case must actually skip alternate RAF submissions');
 assert.equal(s.f.calls.finish,0);s.r.dispose();
}

// Sub-30 FPS work must step down, stop at the published Low profile, and
// recover later. Manual settings, including a slow Ultra, remain explicit.
{
 const s=simulation();s.run(6000);assert.equal(s.r.getState().effectiveQuality,'high');
 s.f.control.gpuLatencyMs=70;s.run(6000);
 assert.equal(s.r.getState().effectiveQuality,'low');
 assert.deepEqual(s.r.budget.profile,QUALITY_PROFILES.low);assert.equal(s.r.steps,QUALITY_PROFILES.low.steps);
 assert(s.statistics.at(-1).fps<30,'The slowdown must be measured from completed work');
 s.f.control.gpuLatencyMs=4;s.run(55000);assert.equal(s.r.getState().effectiveQuality,'high','Quality should recover after load improves, even after failed probes');
 for(const quality of ['low','medium','high','ultra']){
  s.r.setQuality(quality);s.f.control.gpuLatencyMs=90;s.run(1800,100);
  assert.equal(s.r.getState().effectiveQuality,quality);
  assert.deepEqual(s.r.budget.profile,QUALITY_PROFILES[quality],'Manual quality must not silently become a different profile');
  assert.equal(s.r.steps,QUALITY_PROFILES[quality].steps);
 }
 s.r.dispose();
}

// A failed upgrade must settle on Medium without repeatedly toggling High;
// a later improvement still gets another opportunity to use High.
{
 const s=simulation({gpuLatencyMs:uniforms=>uniforms.get('uSteps')?.args[0]>=256?40:4});s.run(12000);
 assert.equal(s.r.getState().effectiveQuality,'medium');
 const highEntries=s.history.filter((h,i)=>h.quality==='high'&&s.history[i-1]?.quality!=='high');
 assert.equal(highEntries.length,1,'A failed High probe needs a cooldown, not rapid oscillation');
 s.f.control.gpuLatencyMs=4;s.run(30000);assert.equal(s.r.getState().effectiveQuality,'high');
 s.r.dispose();
}

// An occasional UI pause and shader warmup are not a reason to stay blurry.
{
 const s=simulation({parallelCompile:true});s.run(6000);assert.equal(s.r.getState().effectiveQuality,'high');
 s.tick(140);s.run(2000);assert.equal(s.r.getState().effectiveQuality,'high');
 s.f.control.compileComplete=false;s.r.addObject('iss',14,0,1);const draws=s.f.draws;s.run(2000);
 assert.equal(s.f.draws,draws,'Wait for complete new model geometry');
 s.f.control.compileComplete=true;s.run(3000);
 assert.equal(s.r.getState().effectiveQuality,'high','Compilation time must not count as sustained slow rendering');
 document.hidden=true;document.emit('visibilitychange');s.run(5000);
 document.hidden=false;document.emit('visibilitychange');s.run(2000);
 assert.equal(s.r.getState().effectiveQuality,'high','Returning from a hidden tab must not be mistaken for a multi-second render stall');
 s.r.dispose();
}

// The intentional WebGL1 30 FPS submission ceiling must not force Adaptive
// downward forever or prevent it from testing higher preset budgets.
{
 const s=simulation({webgl2:false});s.run(28000);
 assert.equal(s.r.getState().effectiveQuality,'high');
 assert(s.statistics.at(-1).fps>=29&&s.statistics.at(-1).fps<=31);
 assert.equal(s.f.calls.fence,0);s.r.dispose();
}
{
 const s=simulation({webgl2:false});s.run(28000,1000/144);
 assert.equal(s.r.getState().effectiveQuality,'high','A high-refresh display must not alias the WebGL1 deadline into a below-30 FPS trap');
 assert(s.statistics.at(-1).fps>=29&&s.statistics.at(-1).fps<=31);
 assert.equal(s.f.calls.fence,0);s.r.dispose();
}

console.log('PASS: exact named adaptive presets, rapid healthy startup to High, stable 30–60 FPS, below-30 reduction, bounded Low floor, recovery and failed-probe cooldown, manual Ultra, compilation/visibility exclusions, and WebGL1 cadence.');

// Dialogs may pause GPU presentation without changing the user's play/pause
// choice or making their rendering quality look overloaded after they return.
{
 const s=simulation();s.run(6000);const paused=s.r.state.paused,draws=s.f.draws;
 s.r.setPresentationPaused(true);s.run(6000);
 assert.equal(s.f.draws,draws);assert.equal(s.r.state.paused,paused);
 await assert.rejects(s.r.captureImage());
 s.r.setPresentationPaused(false);s.run(2000);
 assert(s.f.draws>draws);assert.equal(s.r.getState().effectiveQuality,'high');
 assert.equal(s.r.state.paused,paused);s.r.dispose();
}

// Saving Ultra waits for its real shader and a fresh draw, even while an old
// High image remains visible or its GPU fence has not completed yet.
{
 const s=simulation({parallelCompile:true});s.run(6000);
 s.f.control.compileComplete=false;s.r.setQuality('ultra');
 let captured=false;const capture=s.r.captureImage().then(blob=>{captured=true;return blob;});
 s.run(100);await Promise.resolve();assert.equal(s.f.calls.capture,0);assert.equal(captured,false);
 s.f.control.compileComplete=true;s.f.control.gpuLatencyMs=90;
 s.run(300);const blob=await capture;
 assert(blob instanceof Blob&&blob.type==='image/png'&&blob.size>0);
 assert.equal(s.f.calls.capture,1);assert.equal(s.f.control.lastCapture.steps,768,'Do not save the compatible High preview while Ultra compiles');
 assert.equal(s.f.control.lastCapture.time,s.f.control.lastCapture.drawTime,'Call toBlob in the task that submitted the fresh frame before the browser may clear its drawing buffer');
 assert.equal(s.r.quality,'ultra');s.r.dispose();
}

// Pending exports must settle when graphics can no longer complete them.
for(const termination of ['dispose','context lost','quality changed','shader failure','hidden']){
 const s=simulation({parallelCompile:true});s.run(2000);s.f.control.compileComplete=false;s.r.setQuality('ultra');
 const capture=s.r.captureImage();const rejected=assert.rejects(capture);
 if(termination==='dispose')s.r.dispose();
 else if(termination==='context lost')s.f.canvas.emit('webglcontextlost');
 else if(termination==='quality changed')s.r.setQuality('low');
 else if(termination==='shader failure'){s.f.control.linkSuccess=false;s.f.control.compileComplete=true;s.run(100);}
 else {document.hidden=true;document.emit('visibilitychange');}
 await rejected;if(termination!=='dispose')s.r.dispose();
}
console.log('PASS: dialog presentation suspension, Ultra export waits for the selected shader and fresh draw, and export promises settle after quality changes, context loss, shader failure, hiding, or disposal.');

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLoadingIndicator} from '../dist/loading-indicator.js';
import {SceneLoadLifecycle} from '../dist/render-state.js';
import {installRenderWorker} from '../dist/render-worker.js';

let now=0,nextId=0;const timers=new Map();
const clock={performance:{now:()=>now},setTimeout(fn,ms){const id=++nextId;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
function advance(ms){const end=now+ms;for(;;){const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>end)break;now=entry[1].at;timers.delete(entry[0]);entry[1].fn();}now=end;}
const elapsed={textContent:'',setAttribute(){}},stage={textContent:''},choose={hidden:true},title={textContent:''},element={hidden:true,classList:{add(){},remove(){}},querySelector:selector=>({'#loadingElapsed':elapsed,'#loadingStage':stage,'#loadingChooseScene':choose}[selector]||null)};
const indicator=createLoadingIndicator(element,title,clock);
indicator.update(true,'Caladan to Arakas',true,{revision:1,elapsedMs:0,phase:'compiling'});
assert(!element.hidden);assert.equal(title.textContent,'Caladan to Arakas');assert.equal(elapsed.textContent,'0 s elapsed');
assert.equal(stage.textContent,'Preparing graphics…');assert(choose.hidden);
advance(15000);assert.equal(elapsed.textContent,'15 s elapsed','UI timer advances without render-thread telemetry');assert.equal(stage.textContent,'Still preparing graphics…');assert(!choose.hidden);
indicator.update(true,'Caladan to Arakas',false,{revision:1,elapsedMs:14900});assert.equal(elapsed.textContent,'15 s elapsed','Old monitor samples do not move elapsed time backwards');
indicator.update(true,'Caladan to Arakas',false,{revision:1,elapsedMs:15000,suspended:true});advance(120000);assert.equal(elapsed.textContent,'15 s elapsed','Gallery/background suspension does not spend the wait limit');
indicator.update(true,'Black hole cluster',true,{revision:2,elapsedMs:0});assert.equal(elapsed.textContent,'0 s elapsed');advance(60000);assert.equal(elapsed.textContent,'60 s elapsed');advance(1000);assert.equal(elapsed.textContent,'61 s elapsed','Elapsed time never pretends to be completion');
indicator.update(false);advance(500);assert(element.hidden);assert.equal(timers.size,0);indicator.dispose();

for(const cpu of [false,true]){
 let time=0;const load=new SceneLoadLifecycle({cpu,now:()=>time});
 time=59999;assert.equal(load.check(),false);time=60000;assert(load.check());assert.equal(load.state,'failed');
 load.begin();load.complete(load.revision);assert.equal(load.timeout,cpu?15000:30000,'Post-ready watchdog stays shorter than initial loading');
}

// Slow command transfer/presentation is real frame cost; a short Canvas batch
// alone must not make the CPU controller promote a renderer delivering 6 FPS.
let workerTime=0;const messages=[],costs=[];
class CpuRecorder{
 constructor(canvas){this.canvas=canvas;this.ready=true;this.cpu=true;this.state={};this.objects=[];this.quality='adaptive';this.budget={noteFrame(){return false;}};}
 now(){return workerTime;}getState(){return {fps:6,effectiveQuality:'low',cpu:true};}setPresentationPaused(){}dispose(){}
 render(){const c=this.canvas.getContext('2d');c.fillRect(0,0,2,2);return true;}
 noteCpuCost(...args){costs.push(args);}
}
const worker=installRenderWorker({postMessage:m=>messages.push(m),addEventListener(){},close(){}},{CpuRenderer:CpuRecorder});
await worker.handle({type:'init',cpu:true,commandMode:true,viewport:{width:320,height:200,dpr:1},signature:'cpu'});
worker.renderer.render(0);let command=messages.find(m=>m.type==='cpu-frame');assert(command);
workerTime=160;await worker.handle({type:'cpu-presented',serial:command.serial,costMs:4});
assert.deepEqual(costs[0],[160,160,'frame']);
worker.renderer.render(160);command=messages.filter(m=>m.type==='cpu-frame').at(-1);await worker.handle({type:'cpu-presented',serial:command.serial,costMs:4,cancelled:true});assert.equal(costs.length,1);
await worker.handle({type:'dispose'});
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const loader=html.match(/<div class="scene-loading[^"]*"[\s\S]*?<\/div><\/div>/)?.[0]||'';
assert(loader.includes('loading-orbit.gif'));assert(loader.includes('loadingElapsed'));assert(loader.includes('loadingReason'));assert(loader.includes('loadingStage'));assert(loader.includes('loadingChooseScene'));assert(!loader.includes('loadingDiagnostics'));assert(!/\d+%/.test(loader));
console.log('PASS: independent elapsed loading time/stages/escape action, suspension/revision/reset/disposal, GPU+CPU 60s initial limits, retained live stall deadlines, actual CPU command roundtrip cost.');

import assert from 'node:assert/strict';
import {CpuCommandCanvas,CpuCommandPlayer} from '../dist/cpu-commands.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {fixture} from './render-fixture.mjs';

// Check the transport against actual Canvas path semantics and presentation
// backpressure. An invalid face must never reach the visible buffer.
const wire=new CpuCommandCanvas(),tasks=[],calls=[];
const back=new Proxy({},{get:(_,name)=>(...args)=>calls.push([name,...args])});
let blits=0;
const player=new CpuCommandPlayer({getContext:()=>({drawImage(){blits++;}})},{
 createCanvas:()=>({getContext:()=>back}),now:()=>0,
 schedule:fn=>(tasks.push(fn),tasks.length),cancel(){}
});
const triangle=[[1,2],[3,4],[5,6]];
for(let i=0;i<80;i++)wire.context.fillMeshPolygon(triangle);
const packet=wire.takeFrame();
assert.equal(packet.commands.length,80);
let result;
player.present(packet,value=>result=value);
while(tasks.length){
 const start=calls.length;tasks.shift()();
 assert(calls.length-start<=193,'At most 192 drawing operations plus the initial transform per slice');
 if(tasks.length)assert.equal(blits,0);
}
assert(!result.error);assert.equal(blits,1);
const path=[['beginPath'],['moveTo',1,2],['lineTo',3,4],['lineTo',5,6],['closePath'],['fill']];
assert.deepEqual(calls.slice(1),Array.from({length:80},()=>path).flat());
for(const command of [['fillPolygon',0,1,2,3,4],['fillPolygon',0,0,1,2,3,NaN],['fillPolygon',...Array(130).fill(1)]]){
 player.present({...packet,commands:[command]},value=>result=value);
 while(tasks.length)tasks.shift()();
 assert(result.error);assert.equal(blits,1);
}
player.dispose();

// The old representation overflowed the command budget in the overview and
// in close views. Exercise the same renderer and generator used by the worker.
const f=fixture({width:390,height:700}),canvas=new CpuCommandCanvas();
canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
const renderer=new CpuRenderer(canvas,{autoStart:false,bindControls:false});
function checkFrame(){
 renderer.resize();canvas.beginFrame();
 for(const _ of renderer.paintStages()){}
 const frame=canvas.takeFrame();
 assert(frame.commands.length>0&&frame.commands.length<=20000);
}
try{
 renderer.loadScene('shuttle-space');
 for(const tier of ['adaptive','low','medium','high','ultra']){
  renderer.setQuality(tier);renderer.showVehicleLineup();checkFrame();
  for(const ship of renderer.objects){
   assert(renderer.setNavigationMode(ship.id,'manual'));checkFrame();
   assert(renderer.showVehicleLineup());
  }
 }
 // Detailed gate faces, Earth infrastructure and collector arrays share
 // this transport. Their warm frames previously overflowed the recorder.
 for(const scene of ['bridge','kardashev-1','dyson-swarm']){
  renderer.loadScene(scene);
  for(const tier of ['high','ultra']){
   renderer.setQuality(tier);
   for(const grid of [false,true]){renderer.update({grid});checkFrame();}
  }
 }
}finally{renderer.dispose();}
console.log('PASS: CPU mesh transport preserves canvas paths, bounded slices and complete frames for all five helms, bridge hardware and infrastructure with grid on/off.');

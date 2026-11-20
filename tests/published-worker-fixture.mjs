import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fixture} from './render-fixture.mjs';
import {CpuCommandPlayer} from '../dist/cpu-commands.js';
import {RENDER_WORKER_SOURCE} from '../dist/render-worker-bundle.js';

// Unlike tests that import installRenderWorker, this executes the unmodified
// generated production worker. Drive its public message protocol through the
// same first-frame handshake used by the UI; the GL stub records genuine
// uniforms and submitted GLSL while the CPU worker records canvas operations.
const script=new vm.Script(RENDER_WORKER_SOURCE,{filename:'published-render-worker.js'});
export function publishedWorker(cpu,width,height){
 // Present the commands through the UI's actual bounded replay code before
 // acknowledging the worker, so unsupported gradients and budgets fail here.
 const jobs=[],gradient=(...xy)=>{assert(xy.every(Number.isFinite));return {addColorStop(){}};};
 const surface=new Proxy({createLinearGradient:gradient,createRadialGradient:gradient},{get:(o,k)=>k in o?o[k]:(()=>{})});
 const canvas=()=>({width:2,height:2,getContext:()=>surface});
 const player=cpu?new CpuCommandPlayer(canvas(),{createCanvas:canvas,now:()=>0,schedule:fn=>(jobs.push(fn),jobs.length),cancel(){}}):null;
 const hardware=fixture({width,height}),frames=new Map(),messages=[];let recv,serial=0,t=1000,token=0;
 script.runInNewContext({performance:{now:()=>t},AbortController,console,setTimeout,clearTimeout,structuredClone,
  addEventListener:(e,fn)=>{if(e==='message')recv=fn;},postMessage:m=>messages.push(m),
  requestAnimationFrame:cb=>(frames.set(++token,cb),token),cancelAnimationFrame:id=>frames.delete(id)});
 const send=data=>recv({data}),viewport={width,height,dpr:1};
 function present(snapshot,label){
  // A fresh signature requires an actual frame for this exact pose. An 'ack'
  // alone only means the worker accepted a message, not that it drew it.
  const signature='published '+(++serial)+' '+label;messages.length=0;
  if(serial===1)send({type:'init',cpu,commandMode:cpu,canvas:hardware.canvas,viewport,snapshot,signature});
  else send({type:'state',serial,viewport,snapshot,signature});
  for(let i=0;i<100;i++){
   t+=40;const batch=Array.from(frames.values());frames.clear();for(const cb of batch)cb(t);
   const issue=messages.find(m=>m.type==='error'||m.type==='render-error'&&m.message);assert(!issue,(cpu?'CPU ':'GPU ')+label+': '+issue?.message);
   const frame=messages.find(m=>m.type==='cpu-frame'&&m.signature===signature);
   if(frame){let result;player.present(frame.frame,s=>{result=s;});while(jobs.length)jobs.shift()();assert(result&&!result.error,label+': '+result?.error);send({type:'cpu-presented',serial:frame.serial,costMs:2});}
   if(messages.some(m=>m.type==='status'&&m.stats.frameReady&&m.stats.renderedSignature===signature)){
    if(!cpu){
     assert(hardware.draws>0);
     for(const x of hardware.sources)assert(!/\b(?:undefined|NaN)\b/.test(x.source),label+' submitted an unresolved shader value');
     for(const {args} of hardware.uniforms.values())for(const v of args.flat(Infinity))if(typeof v==='number')assert(Number.isFinite(v),label+' submitted nonfinite GL data');
    }
    return;
   }
  }
  throw Error(label+' did not present a matching frame ('+JSON.stringify(messages.map(m=>m.type))+')');
 }
 return {hardware,present,dispose(){player?.dispose();send({type:'dispose'});}};
}

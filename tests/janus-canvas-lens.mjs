import assert from 'node:assert/strict';
import {applyJanusCanvasLens,janusPixelBounds} from '../dist/janus-canvas-lens.js';
import {janusLensSample} from '../dist/janus-lens.js';
import {CpuCommandCanvas,CpuCommandPlayer} from '../dist/cpu-commands.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {advanceJanusExchanges} from '../dist/janus-exchange.js';
import {fixture} from './render-fixture.mjs';

const width=126,height=92,cx=51.5,cy=47.5,radius=16,p=.5;
const surface=()=>{
 const pixels=new Uint8ClampedArray(width*height*4);
 const ctx={
  fillRect(){
   if(this.fillStyle==='foreground'){pixels.set([255,255,255,255],4*(47*width+51));return;}
   const peer=this.fillStyle==='remote';
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    if(peer&&Math.hypot(x+.5-cx,y+.5-cy)>1.12*radius)continue;
    pixels.set([x*2,y*2,peer?220:10,255],4*(y*width+x));
   }
  },
  createImageData(w,h){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)};},
  getImageData(x,y,w,h){const tile=this.createImageData(w,h);for(let j=0;j<h;j++)tile.data.set(pixels.subarray(4*((y+j)*width+x),4*((y+j)*width+x+w)),4*j*w);return tile;},
  putImageData(tile,x,y){this.writes=(this.writes||0)+1;for(let j=0;j<tile.height;j++)pixels.set(tile.data.subarray(4*j*tile.width,4*(j+1)*tile.width),4*((y+j)*width+x));},
  setTransform(){}
 };
 const canvas={width,height,getContext:()=>ctx};ctx.canvas=canvas;return {canvas,ctx,pixels};
};
for(const charge of [true,false]){
 const direct=surface(),back=surface(),wire=new CpuCommandCanvas(),jobs=[];
 wire.width=width;wire.height=height;
 const optical=(op,...args)=>{applyJanusCanvasLens(direct.ctx,width,height,op,...args);wire.context.janusOptics(op,...args);};
 const draw=color=>{for(const ctx of [direct.ctx,wire.context]){ctx.fillStyle=color;ctx.fillRect(0,0,width,height);}};
 draw('resident');optical('capture',cx,cy,radius,p,Number(charge));if(charge){draw('remote');optical('peer');}
 const bound=janusPixelBounds(width,height,cx,cy,radius);
 assert(bound.w*bound.rows<=2048);
 for(let y=0;y<bound.h;y+=bound.rows)optical('strip',y);
 assert.equal(direct.ctx.writes,1);
 // Native and peer colors encode their source pixel coordinates. Check both
 // sides of the critical curve, which includes a negative source radius.
 for(const dx of [-24,-14,13,16,21,24]){
  const x=51+dx,q=Math.abs(dx)/radius,s=janusLensSample(q,p,charge,.85/radius),mix=s.transmission;
  const expected=2*(51+dx*((s.resident/q)*(1-mix)+(s.remote/q)*mix));
  const at=4*(47*width+x);assert(Math.abs(direct.pixels[at]-expected)<=1.2,`sample at ${x}`);
  assert(Math.abs(direct.pixels[at+2]-(10*(1-mix)+220*mix))<=1.2);
 }
 draw('foreground');assert.equal(direct.pixels[4*(47*width+51)],255);
 let presented=0,result;
 const player=new CpuCommandPlayer({getContext:()=>({drawImage(){presented++;}})},{createCanvas:()=>back.canvas,now:()=>0,schedule:fn=>(jobs.push(fn),jobs.length),cancel(){}});
 player.present(wire.takeFrame(),s=>result=s);while(jobs.length)jobs.shift()();
 assert.ifError(result?.error);assert.equal(presented,1);assert.deepEqual(direct.pixels,back.pixels);player.dispose();
}
// Loss of the optional second sample must preserve the destination already in
// the opening. The next frame always starts with fresh source pixels.
{
 const target=surface(),ctx=target.ctx;
 ctx.fillStyle='resident';ctx.fillRect();applyJanusCanvasLens(ctx,width,height,'capture',cx,cy,radius,p,1);
 ctx.fillStyle='remote';ctx.fillRect();ctx.getImageData=()=>{throw new Error('read unavailable');};
 const before=new Uint8ClampedArray(target.pixels);applyJanusCanvasLens(ctx,width,height,'peer');
 const b=janusPixelBounds(width,height,cx,cy,radius);for(let y=0;y<b.h;y+=b.rows)applyJanusCanvasLens(ctx,width,height,'strip',y);
 assert.deepEqual(target.pixels,before);assert(!ctx.writes);
}
for(const scene of ['earth-andromeda-bridge','janus-solar-tour']){
 const f=fixture(),canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new CpuRenderer(canvas,{autoStart:false,bindControls:false});r.loadScene(scene);r.sceneLoad=null;r.state.paused=false;r.camera={...r.target};
 const pod=r.objects.find(o=>o.hullModel==='janusPod');
 if(scene==='janus-solar-tour')assert(r.startJanusExchange(pod.id,r.objects.find(o=>o.catalogId==='301').id));
 else advanceJanusExchanges(r,7.5);
 advanceJanusExchanges(r,1.4);r.setQuality('high');
 for(const lensing of [true,false]){
  r.update({lensing});canvas.beginFrame();r.render(1000,false,true);
  const commands=canvas.takeFrame().commands,last=commands.findLastIndex(c=>c[0]==='janusOptics');
  assert.equal(last>=0,lensing,scene);
  assert(commands.length<20000&&commands.findLastIndex(c=>c[0]==='fillPolygon')>last,'Hull paints after the refracted charts');
 }
 r.dispose();
}
console.log('PASS: CPU bridge rays bend both charts, preserve foreground, replay the same pixels in bounded strips, and respect lensing in both Janus routes.');

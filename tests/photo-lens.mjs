import assert from 'node:assert/strict';
import {applyPhotoLens} from '../dist/photo-lens.js';
async function expose(mean,w,h,check){
 const pixels=new Uint8ClampedArray(w*h*4),ctx={
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
  putImageData:(im,x,y)=>pixels.set(im.data,(y*w+x)*4)
 };
 await applyPhotoLens(mean,w,h,ctx,check);
 return (x,y,k=0)=>pixels[((h-1-y)*w+x)*4+k];
}
const w=256,h=128,m=new Uint16Array(w*h*3);
for(let y=70;y<86;y++)for(let x=58;x<64;x++)m.set([65535,46000,22000],3*(y*w+x));
const prev=m.slice(),p=await expose(m,w,h);
assert.deepEqual(m,prev,'Resolve never mutates progressive samples');
assert(p(63,78)>225&&p(63,78)<255,'Bright cores redistribute some of their light');
assert(p(64,78)>20&&p(64,78)>p(68,78)&&p(68,78)>p(82,78),'Warm halo falls smoothly across a 64px GPU tile boundary');
assert(p(64,78)>p(64,78,1)&&p(64,78,1)>p(64,78,2),'Scattered illumination retains source color');
assert(p(244,20)<2,'Distant black sky remains black');
assert(p(63,78)>p(63,h-1-78)+100,'GL rows are upright when assembled');
const flat=new Uint16Array(103*43*3).fill(54820),f=await expose(flat,103,43);
assert.equal(f(1,1),f(99,40));assert.equal(f(52,12),Math.round(255*(1.055*(54820/65535)**(1/2.4)-.055)),'A uniform bright field gains no energy');
const black=await expose(new Uint16Array(31*7*3),31,7);
assert.equal(black(15,3),0);
let checks=0;await assert.rejects(expose(m,w,h,()=>{if(++checks===3)throw Error('cancelled');}),/cancelled/);
console.log('PASS: bounded whole-frame camera response, warm cross-tile halos, energy balance, untouched black, image orientation and cancellation.');

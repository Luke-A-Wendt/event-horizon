import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Validate the shipped GIF using its actual container. The generator is an
// optional Pillow development tool; npm tests/builds require only Node.
const gif=readFileSync(new URL('../dist/assets/loading-orbit.gif',import.meta.url));
assert.equal(gif.subarray(0,6).toString(),'GIF89a');
const width=gif.readUInt16LE(6),height=gif.readUInt16LE(8);
assert.deepEqual([width,height],[192,128]);
assert(gif.length<150_000,'A decorative loader must remain small on slow phones');
let p=13,frames=0,delay=null,total=0,loop=null;
if(gif[10]&128)p+=3*(1<<((gif[10]&7)+1));
const blocks=()=>{const values=[];for(;;){const size=gif[p++];if(!size)break;assert(p+size<=gif.length);values.push(gif.subarray(p,p+size));p+=size;}return Buffer.concat(values);};
while(p<gif.length){
 const kind=gif[p++];
 if(kind===0x3b)break;
 if(kind===0x21){
  const label=gif[p++];
  if(label===0xf9){assert.equal(gif[p++],4);assert.equal((gif[p]>>2)&7,1,'Delta frames must retain the previous image');delay=gif.readUInt16LE(p+1);p+=4;assert.equal(gif[p++],0);}
  else if(label===0xff){const size=gif[p++],name=gif.subarray(p,p+size).toString();p+=size;const data=blocks();if(name==='NETSCAPE2.0'){assert.equal(data[0],1);loop=data.readUInt16LE(1);}}
  else blocks();
 }else if(kind===0x2c){
  const x=gif.readUInt16LE(p),y=gif.readUInt16LE(p+2),w=gif.readUInt16LE(p+4),h=gif.readUInt16LE(p+6),flags=gif[p+8];p+=9;
  assert(w>0&&h>0&&x+w<=width&&y+h<=height,'Every delta frame stays within its canvas');
  if(flags&128)p+=3*(1<<((flags&7)+1));
  assert(gif[p]>=2&&gif[p]<=8);p++;blocks();assert.equal(delay,5);frames++;total+=delay*10;delay=null;
 }else assert.fail(`Unexpected GIF block ${kind}`);
}
assert.equal(frames,80);assert.equal(total,4000);assert.equal(loop,0,'Loader loops indefinitely');
const still=readFileSync(new URL('../dist/assets/loading-orbit-still.svg',import.meta.url),'utf8');
assert.match(still,/viewBox="0 0 192 128"/);
assert(!/<(?:script|animate|animateMotion|animateTransform|image)\b/.test(still),'Reduced-motion still must have no animation or image dependency');
assert(!/\b(?:href|src)=/.test(still));
assert.match(still,/fill="#010408"/,'The central shadow occludes the rear source image');
console.log(`PASS: ${frames}-frame, ${total/1000}s looping lensed-orbit GIF (${gif.length} bytes), bounded delta frames, and self-contained reduced-motion SVG.`);

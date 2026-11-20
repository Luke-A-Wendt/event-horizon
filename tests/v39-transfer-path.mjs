import assert from 'node:assert/strict';
import {captureTransferPath,renderTransferPath} from '../dist/transfer-path.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
const context={origin:[0,0,0],observer:[0,0,10],forward:[0,0,-1],right:[1,0,0],up:[0,1,0],aspect:1.5,fov:1,width:900,height:600,bodies:[],holes:[],occluders:[],lensing:false,height:600,hideIndex:-1};
const renderer={cameraFrame:context,travelPreview:{craftId:'ship',pathPoints:[[2,0,0],[3,1,0],[4,2,0]].map(p=>p.map(x=>x*RG))}};
const path=captureTransferPath(renderer,context);assert(path?.segments.length);assert(!path.active);assert.match(renderTransferPath(path,900,600),/<path/);assert.doesNotMatch(renderTransferPath(path,900,600),/<circle|stroke-dasharray/);
renderer.transfer={active:true};renderer.getTravelState=()=>({...renderer.travelPreview,progress:.5});assert(captureTransferPath(renderer,context).active);
const clipped=renderTransferPath({active:true,segments:[[{x:-200,y:0},{x:0,y:0},{x:200,y:0}]]},900,600,1.5);assert.equal((clipped.match(/<path/g)||[]).length,2,'One clipped curve and its outline');assert.doesNotMatch(clipped,/NaN|Infinity|<circle/);
const body={id:'planet',center:[0,0,5],radius:4,mass:0,index:0};assert.equal(captureTransferPath(renderer,{...context,bodies:[body],occluders:[body]}),null,'Bodies occlude the route instead of drawing it on top');
// Adding a camera-sized displacement to this chart coordinate loses it in a
// double. The guide must keep its shape, including near a far-away lens.
const far=2**60,chartOrigin=[far,0,0],ship={id:'ship',position:chartOrigin,radius:.1};
const hole={id:'primary',center:[0,0,1e7],radius:1,mass:1,index:-1},local={...context,origin:chartOrigin,observer:[0,0,10],lensing:true,bodies:[],holes:[hole],occluders:[hole]};
const lost=chartOrigin.map(v=>v*RG),offsets=[-1,0,1].map(x=>[x*RG,0,0]);
const distant={cameraFrame:{...context,observer:[far,0,10]},getFocusFrame:()=>ship,travelPreview:{craftId:'ship',pathPoints:offsets.map(()=>lost),pathOffsets:offsets}};
const line=captureTransferPath(distant,local)?.segments.flat();
assert.deepEqual(line?.map(p=>p.x),[-.1,0,.1],'projection preserves local guide offsets despite identical global doubles and a distant lens');
const covered={...local,bodies:[body],occluders:[hole,body]};
assert.equal(captureTransferPath(distant,covered),null,'locally projected samples retain foreground occlusion');
// A skipped turn never becomes a visible chord, even when both screen points are valid.
const gaps=[0,.1,.2,Math.PI,Math.PI+.1],circle=gaps.map(a=>[Math.cos(a)*RG,Math.sin(a)*RG,0]);
const broken=captureTransferPath({cameraFrame:context,travelPreview:{craftId:'ship',pathPoints:circle,pathAngles:gaps}},context);
assert.deepEqual(broken.segments.map(s=>s.length),[3,2]);
renderer.travelPreview=null;renderer.transfer=null;assert.equal(captureTransferPath(renderer,context),null);
console.log('PASS: frame-aligned transfer path, preview/active curves, offscreen curve clipping, occlusion, and inactive zero-work behavior.');

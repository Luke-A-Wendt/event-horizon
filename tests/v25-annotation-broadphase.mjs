import assert from 'node:assert/strict';
import {prepareDirectOcclusion,projectDirectVisible} from '../dist/optical-projection.js';
import {captureAnnotationFrame,installAnnotations} from '../dist/annotations.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';

// Compare against the exact intersection path, without a projected broadphase.
// Every case retains the same sphere/ellipsoid/cap intersection implementation.
let seed=25;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const frame={origin:[0,0,0],observer:[0,0,0],forward:[0,0,1],right:[1,0,0],up:[0,1,0],aspect:1.5,fov:.83,hideIndex:-1};
const bodies=Array.from({length:517},(_,i)=>({id:`body-${i}`,index:i,center:[(random()-.5)*40,(random()-.5)*30,random()*70-15],radius:.00001+random()*.6,opacity:i%13===0?.4:1}));
bodies.push(
 {id:'near-plane',center:[2,0,0],radius:1},
 {id:'inside',center:[1.4,0,0],radius:1.5,opacity:.4},
 {id:'cutaway',center:[0,0,10],radius:2,opacity:.3,cutaway:true},
 {id:'water',center:[-4,0,10],radius:1.425,coreRadius:1,waterCap:{direction:[1,0,0],radiusRatio:.85,offsetRatio:.575}},
 {id:'ellipsoid',center:[4,0,10],radius:2,shapeAxes:[1,.4,.7],shapeBasis:[[1,0,0],[0,1,0],[0,0,1]]},
 {id:'contact',center:[0,4,10],radius:2,shapeAxes:[1,.4,.7],shapeBasis:[[1,0,0],[0,1,0],[0,0,1]],shapeStyle:'contact'},
 {id:'tiny-distant',center:[1,0,1e9],radius:1}
);
let checked=0;
function compare(context,targets){
 const exact={...context,directOcclusion:undefined},indexed=prepareDirectOcclusion({...context});
 for(const {position,id} of targets){assert.deepEqual(projectDirectVisible(indexed,position,id),projectDirectVisible(exact,position,id),`Conservative rejection changed ${id||position}`);checked++;}
}
for(let pose=0;pose<12;pose++){
 const angle=pose*.13,c=Math.cos(angle),s=Math.sin(angle),context={...frame,observer:[pose*.17,pose*.07,pose*.15],forward:[s,0,c],right:[c,0,-s],occluders:bodies,hideIndex:pose===4?1:-1};
 const targets=bodies.map(b=>({position:b.center,id:b.id}));
 for(let i=0;i<400;i++)targets.push({position:[(random()-.5)*70,(random()-.5)*60,random()*200]});
 // Tangencies, near-plane crossings and objects with enormous distance/radius ratios.
 for(const b of bodies.slice(-7))for(const sign of [-1,0,1])targets.push({position:[b.center[0]+b.radius*sign,b.center[1],b.center[2]*2]});
 compare(context,targets);
}
// Rebuild per submitted pose: camera motion, a moved body and opacity changes
// are never hidden behind a stale index. Replacing the list also fails open.
for(const opacity of [0,.4,1]){const body={id:'test',center:[0,0,4],radius:1,opacity},context={...frame,occluders:[body]};compare(context,[{position:[0,0,8]},{position:[1.2,0,8]}]);body.center=[3,0,4];compare(context,[{position:[0,0,8]},{position:[6,0,8]}]);}
const replacement=prepareDirectOcclusion({...frame,occluders:[{id:'away',center:[5,0,4],radius:1}]});replacement.occluders=[{id:'front',center:[0,0,4],radius:1}];assert.equal(projectDirectVisible(replacement,[0,0,8]),null);

const f=fixture(),renderer=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
renderer.loadScene('solar-system');renderer.render();assert.equal(renderer.objectFrames.length,517);
for(const name of [null,'Sun','Earth','Saturn']){
 if(name){renderer.focusTarget(renderer.objects.find(b=>b.name===name).id,'track');renderer.render();}
 for(const moving of [false,true]){
  if(moving){renderer.time+=.25;renderer.fillObjects();renderer.updateCameraFrame();renderer.render();}
  renderer.annotationSolvedPose=null;const current=captureAnnotationFrame(renderer),paused=captureAnnotationFrame(renderer);
  const anchors=payload=>payload.objectFrames.map(b=>[b.id,b.anchor,b.screenRadius]);
  assert.deepEqual(anchors(paused),anchors(current),'A paused pose preserves every current anchor');
  assert.equal(current.projection.rays,0);assert.equal(current.projection.weak,true);
  assert.equal(renderer.objectFrames.length,517,'The broadphase does not remove catalog targets');
 }
}
renderer.dispose();

// Every logical anchor remains eligible for double-tap selection. Neither the
// index nor GPU object packing changes label placement or hit testing.
globalThis.document={createElementNS:()=>({style:{},setAttribute(){},remove(){},innerHTML:''})};
const surface={getBoundingClientRect:()=>({left:0,top:0,width:900,height:650})},scene={append(){},querySelector:()=>surface,getBoundingClientRect:surface.getBoundingClientRect};
const annotations=installAnnotations(scene,()=>null),payload={kind:'annotation-frame',annotations:false,sceneRevision:1,cameraFrame:frame,holes:[],projection:{aspect:900/650,fov:.83},objectFrames:[]};
for(let i=0;i<517;i++){
 const anchor={x:(i%22-10.5)*.055,y:(Math.floor(i/22)-11.5)*.038,z:100+i},body={id:`catalog-${i}`,name:`Catalog ${i}`,type:'moon',radius:1e-9,screenRadius:1e-11,anchor};payload.objectFrames.push(body);
}
annotations.update(payload);
for(const body of payload.objectFrames){const {x,y}=body.anchor;assert.equal(annotations.pick(450+x/payload.projection.aspect*900,325-y*650)?.id,body.id);}
annotations.dispose();
console.log(`PASS: ${checked} exhaustive/indexed occultation comparisons, near-plane and inside observers, moving/paused poses, translucent cores, water caps, triaxial/contact shapes, 517 retained catalog bodies and picks.`);

import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';

const f=fixture({width:600,height:400}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.loadScene('empty-space');r.state.lensing=false;
const camera={observer:[0,0,0],forward:[0,0,1],right:[1,0,0],up:[0,1,0]};
const make=(id,type,diameter)=>({id,type,radius:1,position:[0,0,800/(.83*diameter)],tint:[.5,.6,.7],headingAngle:0,massSolar:type==='star'?1:0,bodyParams:[0,0,0,0]});
const tiny=make('tiny','planet',.8),edge=make('edge','moon',1),visible=make('visible','planet',1.5),star=make('star','star',.01),hole=make('hole','blackhole',.01);
r.objectFrames=[tiny,edge,visible,star,hole];r.frameById=new Map(r.objectFrames.map(o=>[o.id,o]));
r.focusId=tiny.id;r.objects=r.objectFrames.map(o=>({id:o.id,type:o.type,parentId:o.id===tiny.id?edge.id:'space'}));r.objectById=new Map(r.objects.map(o=>[o.id,o]));
r.packRenderObjects(camera,400);
assert.equal(tiny.index,-1,'A tracked subpixel planet is not forced into the surface loop');
assert.equal(edge.index,-1,'Its subpixel parent is not forced into the surface loop');
for(const body of [visible,star,hole])assert(body.index>=0,body.id+' remains renderable');
assert.equal(r.objectFrames.length,5,'Logical hierarchy/frame list is retained');
assert.equal(r.objectCount,3,'Small scenes are filtered too, even below the slot limit');
r.packRenderObjects(camera,2000);assert(tiny.index>=0&&edge.index>=0,'More output pixels restore resolvable surfaces');
r.packRenderObjects({...camera,observer:[0,0,tiny.position[2]]},400);assert(tiny.index>=0,'An observer inside a body must not cull its surface');

// The physical diameter of a compact object is not its lens footprint.
r.focusId=null;r.objects=[];r.objectById=new Map();r.state.lensing=true;
const lens={...make('lens','blackhole',.01),position:[0,0,10],radius:.01,massSolar:4300000};
const magnified={...make('behind','planet',.01),position:[0,0,10000],radius:.1};
r.objectFrames=[lens,magnified];r.frameById=new Map(r.objectFrames.map(o=>[o.id,o]));r.packedView=null;r.packRenderObjects(camera,400);
assert(magnified.index>=0,'A potential Einstein-ring image survives straight-line size culling');
assert(lens.index>=0&&lens.lensingActive,'Compact lens remains in the active gravity prefix');

// Dense authored systems retain their complete catalog and become detailed
// again on inspection. No preset/parent relationships are pruned.
r.loadScene('solar-system');const count=r.objects.length,earth=r.objects.find(o=>o.name==='Earth'),moon=r.objects.find(o=>o.name==='Moon');
r.focusTarget(earth.id,'track');r.packRenderObjects(r.cameraFrame,200);
const culled=r.objectFrames.filter(o=>o.surfaceCulled);
assert(culled.length>100,'Distant small bodies are rejected before ray intersection work');
assert(culled.every(o=>o.index<0));assert.equal(r.objects.length,count);
r.focusTarget(moon.id,'track');r.packRenderObjects(r.cameraFrame,400);assert(r.frameById.get(moon.id).index>=0,'Selecting and approaching a moon restores its surface');
assert.equal(r.objects.length,count);assert(r.getObjectTree());r.dispose();
console.log('PASS: strict rendered-pixel planetary cutoff, focus/parent handling, retained luminous/compact lenses, magnified planets, resolution recovery, and dense catalog preservation.');

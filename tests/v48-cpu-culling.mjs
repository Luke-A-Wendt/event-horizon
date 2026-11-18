import assert from 'node:assert/strict';
import {CpuRenderer,cpuVisibleBodies,cpuPlanetSubpixel,cpuCompactImageRadius} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {fixture} from './render-fixture.mjs';

const frame={observer:[0,0,0],forward:[0,0,1],right:[1,0,0],up:[0,1,0]},width=800,height=500,z=100;
const radiusForDiameter=pixels=>pixels*z*.83/(height*2);
const make=(id,type,diameter,extra={})=>({id,type,position:[0,0,z],radius:radiusForDiameter(diameter),...extra});
const tiny=make('tiny','planet',.99),one=make('one','moon',1),visible=make('visible','moon',1.01);
assert(cpuPlanetSubpixel(tiny,frame,width,height));assert(cpuPlanetSubpixel(one,frame,width,height));
assert(!cpuPlanetSubpixel(visible,frame,width,height));
assert(!cpuPlanetSubpixel({...tiny,position:[0,0,0]},frame,width,height),'Observer inside a body is never size-culled');
assert(!cpuPlanetSubpixel(tiny,frame,width*2,height*2),'Surface becomes visible as actual render resolution increases');
assert(!cpuPlanetSubpixel({...tiny,position:[0,0,50]},frame,width,height),'Approaching a distant body makes it resolvable');
for(const type of ['star','blackhole','whitehole'])assert(!cpuPlanetSubpixel(make(type,type,.01),frame,width,height));
assert(!cpuPlanetSubpixel({...tiny,collapsed:true},frame,width,height),'A collapsed world keeps its compact geometry');

const star=make('star','star',.01,{massSolar:1}),hole=make('hole','blackhole',.01,{massSolar:430000}),white=make('white','whitehole',.01,{massSolar:430000});
const bodies=[tiny,one,visible,star,hole,white];
const selected=cpuVisibleBodies(bodies,frame,width,height,tiny.id,20);
assert(!selected.includes(tiny)&&!selected.includes(one),'Focus priority does not force unresolved planet surfaces');
assert(selected.includes(visible)&&selected.includes(star)&&selected.includes(hole)&&selected.includes(white));
assert(cpuCompactImageRadius(hole.radius,hole.massSolar/4300000)>hole.radius,'Compact-source selection includes the lens footprint');
assert.equal(bodies.length,6,'Candidate filtering never edits the logical source list');

fixture();const canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=()=>({width,height});
const renderer=new CpuRenderer(canvas,{autoStart:false,bindControls:false});
renderer.loadScene('solar-system');const logicalCount=renderer.objects.length,ids=renderer.objects.map(o=>o.id);
renderer.fillObjects();renderer.updateCameraFrame();
const solarVisible=cpuVisibleBodies(renderer.objectFrames,renderer.cameraFrame,renderer.canvas.width,renderer.canvas.height,renderer.focusId,renderer.cpuProfile.bodies);
for(const body of solarVisible)assert(!cpuPlanetSubpixel(body,renderer.cameraFrame,renderer.canvas.width,renderer.canvas.height));
assert(logicalCount>200&&solarVisible.length<=renderer.cpuProfile.bodies);
assert.deepEqual(renderer.objects.map(o=>o.id),ids,'Nested bodies remain available to the tree, map and labels');

canvas.width=width;canvas.height=height;renderer.cameraFrame=frame;renderer.objectFrames=bodies;
canvas.beginFrame();for(const stage of renderer.bodyStages(tiny)){}assert.equal(canvas.takeFrame().commands.length,0,'Direct paint calls also skip tiny surfaces before detail work');
const opaque=renderer.geometryOpaqueBodies();
assert(!opaque.some(b=>b.id==='tiny'||b.id==='one'),'Subpixel planets are excluded from expensive geometry occlusion loops');
for(const id of ['visible','star','hole','white'])assert(opaque.some(b=>b.id===id));
renderer.dispose();
console.log('PASS: CPU one-pixel planet/moon cutoff, focus/zoom/resolution behavior, compact/luminous preservation, bounded painting/occlusion, and intact nested objects.');

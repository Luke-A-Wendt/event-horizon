import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {snapshotRenderer,restoreRenderer,renderSignature} from '../dist/render-state.js';
import {fixture} from './render-fixture.mjs';

const setup=()=>{const f=fixture({width:390,height:700,parallelCompile:true});const errors=[];const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false,deferProgram:true,onError:e=>{if(e)errors.push(e);}});return {f,r,errors};};
const {f,r,errors}=setup();
r.loadScene('solar-system');
const features=r.shaderFeatures(),count=r.objects.length;
assert(features.weakField,'Traveling our Solar System uses the compact analytic renderer');
assert.equal(features.objectSlots,6,'Ordinary systems bound the cold shader independently of catalog size');
assert(count>100,'Catalog is retained; only drawing is bounded');
for(let i=0;i<5;i++)f.step(r,100+i*50);
assert(r.ready&&f.draws>0,'A complete initial frame is produced');
assert.deepEqual(errors,[]);

// Repeated camera changes, subpixel culling and changing targets must not
// repeatedly compile a variant for every visible selection of moons/ships.
const key=r.programKey(features),programCount=f.programs.length;
r.camera.yaw+=1;r.target.yaw=r.camera.yaw;r.camera.focusDistance*=4;r.target.focusDistance=r.camera.focusDistance;
for(let i=0;i<4;i++)f.step(r,500+i*50);
assert.equal(r.programKey(r.shaderFeatures()),key);
assert.equal(f.programs.length,programCount);
assert.equal(r.objects.length,count);

const worker=setup();restoreRenderer(worker.r,snapshotRenderer(r));
assert.equal(renderSignature(worker.r),renderSignature(r),'Host and worker agree on readiness identity');
assert(worker.r.shaderFeatures().weakField);

// This is an actual feature boundary, not a scene-name special case: editing
// a star into a compact source must restore strong-field integration.
const sun=r.objects.find(o=>o.type==='star');assert(sun);
sun.radiusMeters=1000;sun.scale=1;r.refreshConfiguration();
assert.equal(r.shaderFeatures().weakField,false);
assert(!r.programSupports(r.shaderFeatures(),{features}));
for(const scene of ['disk','warp-lab','bridge']){r.loadScene(scene);assert.equal(r.shaderFeatures().weakField,false,scene);}
r.dispose();worker.r.dispose();
console.log('PASS: compact solar startup, stable camera shader identity, worker parity, and strong-field exclusions.');

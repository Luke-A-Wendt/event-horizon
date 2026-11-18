import assert from 'node:assert/strict';
import {planetAtmosphereProfile,PLANET_ATMOSPHERES} from '../dist/planet-profiles.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {fixture} from './render-fixture.mjs';

for(const id of [1,3,4,5,6,8,9,16])assert(planetAtmosphereProfile(id)?.strength>0);
for(const id of [2,7,11,12,13,14,15,17,19,20,21,22,23,24])assert.equal(planetAtmosphereProfile(id,'gas'),null,'Known airless profile overrides generic style');
assert(planetAtmosphereProfile(0,'ocean'));assert.equal(planetAtmosphereProfile(0,'ice'),null);
for(const p of Object.values(PLANET_ATMOSPHERES)){assert(p.height>0&&p.height<.02);assert(p.color.every(Number.isFinite));}

const f=fixture({width:800,height:500}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.loadScene('prism-disc');r.render(1000);
assert.equal(r.state.diskStyle,'ribbons');assert.equal(f.uniforms.get('uDiskParams').args[0],6);
assert.equal(r.state.diskThickness,.7);assert.equal(r.state.nebulaIntensity,.65,'Aurora restores its original thin teal ribbons and magenta sky');
assert(!f.activeSources.find(s=>s.type===35632).source.includes('planetAtmosphereSegment'),'Black-hole scenes do not compile unused planet-atmosphere work');
r.loadScene('solar-system');r.render(1100);
const shader=f.activeSources.find(s=>s.type===35632).source;
assert(shader.includes('planetAtmosphereSegment(p,end)'),'Weak-field planets integrate their halo on the clipped visible segment');
assert(shader.includes('namedPlanetSurface('));r.dispose();

fixture();const canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=()=>({width:800,height:500});
const cpu=new CpuRenderer(canvas,{autoStart:false,bindControls:false});
cpu.cameraFrame={observer:[0,0,10],forward:[0,0,-1],right:[1,0,0],up:[0,1,0]};
cpu.objectFrames=[{type:'star',position:[-10,4,0]}];cpu.state.spectrum='visible';
const earth={type:'planet',surfaceId:1,position:[0,0,0]},q={x:200,y:200};
canvas.beginFrame();cpu.planetAtmosphere(earth,q,100);const earthCommands=canvas.takeFrame().commands;
assert(earthCommands.length>0&&earthCommands.length<30,'CPU rim is a bounded gradient and arc');
for(const band of ['geometry','radio','xray','gamma']){cpu.state.spectrum=band;canvas.beginFrame();cpu.planetAtmosphere(earth,q,100);assert.equal(canvas.takeFrame().commands.length,0);}
cpu.state.spectrum='visible';canvas.beginFrame();cpu.planetAtmosphere({...earth,surfaceId:2},q,100);assert.equal(canvas.takeFrame().commands.length,0);
cpu.dispose();
console.log('PASS: atmospheric/airless profiles, restored aurora ribbons, cold-scene specialization, analytic solar integration, and bounded CPU spectrum-aware limb.');

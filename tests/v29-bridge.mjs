import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {SCENE_PRESETS,makePreset} from '../dist/config.js';
import {bridgeJourney,bridgeConformal} from '../dist/bridge-math.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {fixture} from './render-fixture.mjs';
import {createFragment,VERTEX} from '../dist/shaders.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
const stage=t=>bridgeJourney(t,1,'open-transit-close');
assert.equal(stage(0).open,0);assert.equal(stage(1).open,0);assert(stage(4).open>0&&stage(4).open<1);assert.equal(stage(7).open,1);
assert.equal(stage(0).r,stage(7).r);assert(stage(16).r>stage(22).r);assert.equal(stage(50).open,0);assert(stage(50).far);assert.equal(stage(50).r,stage(100).r);assert.equal(stage(50).open,0,'Closed gate returns the arrival side to a flat local view');
const previous=bridgeJourney(12,1);assert.equal(previous.open,1);
const cases=[];
for(const Cls of [BlackHoleRenderer,CpuRenderer])for(const id of ['bridge','bridge-blackhole','bridge-planets','bridge-earth-proxima']){
 const f=fixture(),canvas=Cls===CpuRenderer?new CpuCommandCanvas():f.canvas;if(Cls===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Cls(canvas,{autoStart:false,bindControls:false});r.loadScene(id);assert.equal(r.state.bridgeGridOrientation,'perpendicular');
 if(id==='bridge-planets'){assert.equal(r.getFocusFrame().type,'heighliner');assert.equal(r.focusMode,'chase');assert.equal(r.getState().bridgePhase,'Preparing passage');}
 if(id==='bridge-earth-proxima'){assert.equal(r.getFocusFrame().type,'shuttle');assert(r.state.nebulaIntensity<.2&&r.state.bridgeOtherIntensity<.2);}
 for(const t of id==='bridge-planets'?[0,4,12,22,35,50]:[0]){r.time=t;r.fillObjects();r.updateCameraFrame();assert(r.validateFrameGeometry());if(Cls===CpuRenderer){canvas.beginFrame();for(const _ of r.paintStages()){} }else r.render();}
 const before=[...r.getFocusFrame().position];r.update({bridgeGridOrientation:'parallel'});assert.equal(r.state.bridgeGridOrientation,'parallel');assert.deepEqual(r.getFocusFrame().position,before,'Grid orientation cannot move the traveler');r.update({bridgeGridOrientation:'perpendicular'});
 const saved=parseScene(serializeScene(r));assert.equal(saved.state.bridgeGridOrientation,'perpendicular');assert.equal(saved.state.bridgeLifecycle,r.state.bridgeLifecycle);
 if(Cls===BlackHoleRenderer&&['bridge-planets','bridge-blackhole'].includes(id))for(const webgl2 of [false,true]){let vertex=VERTEX,fragment=createFragment({...r.shaderFeatures(),derivativeExtension:!webgl2});if(webgl2){vertex='#version 300 es\n'+vertex.replace('attribute','in');fragment='#version 300 es\n'+fragment.replace('precision highp float;','precision highp float;\nout vec4 outColor;').replaceAll('gl_FragColor','outColor');}cases.push({name:id+(webgl2?' ES3':' ES1'),vertex,fragment});}
 r.dispose();
}
assert.equal(makePreset('bridge').bridgeMode,'single','Default perpendicular grid must not imply a second throat');
const result=spawnSync('python3',['tests/native-glsl.py'],{input:JSON.stringify(cases),encoding:'utf8',timeout:90000});if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);assert(!result.error);assert([0,77].includes(result.status));
console.log('PASS: independent bridge grid orientations, closed→opening→crossing→closed journey, far-side arrival, Heighliner/Shuttle scenes, CPU/GPU frame validity, YAML retention, four affected native shader variants.');

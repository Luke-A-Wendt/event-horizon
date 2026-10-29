import assert from 'node:assert/strict';
import fs from 'node:fs';
import {serializeScene,parseScene,SCENE_FILE_VERSION,MAX_SCENE_FILE_BYTES,SceneFileError} from '../dist/scene-file.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {fixture} from './render-fixture.mjs';
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});
const normalize=s=>{s=structuredClone(s);delete s.sceneRevision;for(const o of s.objects)for(const [k,v]of Object.entries(o))if(v===undefined)delete o[k];return s;};
let totalBytes=0,maxBytes=0;
for(const preset of SCENE_PRESETS){r.loadScene(preset.id);r.time=17.25;r.fillHoles();r.fillObjects();r.updateCameraFrame();const before=normalize(snapshotRenderer(r));const text=serializeScene(r);totalBytes+=text.length;maxBytes=Math.max(maxBytes,text.length);assert(text.startsWith('# Event Horizon'));assert(text.includes('children:'));assert(!/data:image|PLANET_TEXTURE_DATA/.test(text));const result=parseScene(text);assert.deepEqual(result,before,`${preset.id} full state roundtrip`);assert.deepEqual(normalize(snapshotRenderer(r)),before,'Serializing never mutates the current scene');restoreRenderer(r,result);assert(r.validateFrameGeometry(),`${preset.id} restored camera remains finite`);}
r.loadScene('solar-system');let solar=serializeScene(r);assert(solar.includes('name: "Pluto"'));assert(solar.includes('name: "Charon"'));assert.equal(parseScene(solar).objects.length,518);assert(maxBytes<MAX_SCENE_FILE_BYTES);
r.loadScene('empty-space');const star=r.addChildObject('space','star',{name:'A: # sun',massSolar:1}),planet=r.addChildObject(star.id,'planet',{name:'World "one"',orbitMeters:1.5e11}),ship=r.addChildObject(planet.id,'shuttle',{orbitMeters:1e7}),pilot=r.addChildObject(ship.id,'astronaut',{name:"O'Brien",orbitMeters:100});r.setFreeDrive(ship.id,true);r.moveForward(.0001);r.fillObjects();r.updateCameraFrame();
let text=serializeScene(r),before=normalize(snapshotRenderer(r));assert.deepEqual(parseScene(text),before,'Active free drive and names roundtrip');r.setFreeDrive(ship.id,false);text=serializeScene(r);assert.deepEqual(parseScene(text),normalize(snapshotRenderer(r)),'Smooth return transition roundtrips');
assert.match(text,/type: "star"[\s\S]*children:\n\s+- id: [\s\S]*type: "planet"/,'Hierarchy is explicit nesting');
const bad=(file,pattern)=>{const unchanged=normalize(snapshotRenderer(r));assert.throws(()=>parseScene(file),pattern||SceneFileError);assert.deepEqual(normalize(snapshotRenderer(r)),unchanged,'Invalid file never mutates renderer');};
bad(text.replace(`version: "${SCENE_FILE_VERSION}"`,'version: "0.0.0"'),/Cannot load: Scene version .* does not match/);
bad(text.replace('format: "event-horizon-scene"','format: "other"'),/not an Event Horizon/);
bad(text+'constructor: {}\n',/unsafe/);bad(text+'__proto__: {}\n',/unsafe/);bad(text+'version: "1.14.0"\n',/Duplicate/);
bad(text.replace('speed: 1','speed: .inf'),/Unsupported/);bad(text.replace('speed: 1','speed: 1e999'),/Non-finite/);bad(text.replace('speed: 1','speed: 100'),/between/);
bad(text.replace('speed: 1','speed: !!js/function "x"'),/Unsupported/);bad(text.replace('speed: 1','speed: &x 1'),/Unsupported/);bad(text.replace('speed: 1','speed: *x'),/Unsupported/);
bad(text.replace('  quality:', '\tquality:'),/tabs/);bad(text+'---\nother: true\n',/one YAML/);bad('x'.repeat(MAX_SCENE_FILE_BYTES+1),/larger/);
bad(text.replace('type: "astronaut"','type: "star"'),/cannot orbit/);
bad(text.replace('spectrum: "visible"','spectrum: "ultraviolet"'),/supported/);
bad(text.replace('orbitMeters:', 'unknownRadius:'),/Unknown/);
const firstId=ship.id;bad(text.replace(`id: "${pilot.id}"`,`id: "${firstId}"`),/Duplicate object/);
// Conventional YAML comments, plain scalar strings, optional document marker,
// single quotes, scientific notation, CRLF and BOM are all valid safe syntax.
const friendly='\uFEFF---\r\n'+text.replace('format: "event-horizon-scene"','format: event-horizon-scene # format').replace('quality: "adaptive"',"quality: 'adaptive'").replace('speed: 1','speed: 1e0').replace(/\n/g,'\r\n');assert.deepEqual(parseScene(friendly),parseScene(text));
// Scene-local binary phase continuity uses the same exact-version save contract.
r.loadScene('binary');r.orbitOverrides={secondary:{phase:2.1,epoch:4}};text=serializeScene(r);assert.deepEqual(parseScene(text).orbitOverrides,r.orbitOverrides);
assert.equal(parseScene(text).quality,'adaptive');r.setQuality('ultra');assert.equal(parseScene(serializeScene(r)).quality,'ultra');
// Runtime source imports are all local modules. Serialized files contain no code.
assert(!/https?:|fetch\(|XMLHttpRequest|import\(/.test(fs.readFileSync(new URL('../dist/scene-file.js',import.meta.url),'utf8')));
// CPU is a local backend, never a portable quality tier. Its scenes reopen
// adaptively on GPU devices and retain CPU on an already opted-in CPU renderer.
const cpuFixture=fixture(),context=new Proxy({createRadialGradient(){return {addColorStop(){}};}},{get:(object,key)=>key in object?object[key]:(()=>{})});cpuFixture.canvas.getContext=type=>type==='2d'?context:null;
const cpu=new CpuRenderer(cpuFixture.canvas,{autoStart:false,bindControls:false});cpu.loadScene('bridge');cpu.fillHoles();cpu.fillObjects();cpu.updateCameraFrame();assert.equal(cpu.quality,'adaptive');const cpuBefore=normalize(snapshotRenderer(cpu)),cpuSaved=parseScene(serializeScene(cpu));assert.equal(cpuSaved.quality,'adaptive');assert.deepEqual(cpuSaved,{...cpuBefore,quality:'adaptive'});assert.equal(cpu.quality,'adaptive','Saving does not change the current CPU backend');restoreRenderer(cpu,cpuSaved);assert.equal(cpu.quality,'adaptive');assert.equal(cpu.getState().cpu,true);restoreRenderer(r,cpuSaved);assert.equal(r.quality,'adaptive');assert(r.validateFrameGeometry(),'CPU scene is portable to the GPU renderer');cpu.dispose();
r.dispose();console.log(`PASS: ${SCENE_PRESETS.length} exact-version hierarchical YAML roundtrips, full 518-body catalog (${maxBytes} bytes maximum), camera/free-drive restoration, editable syntax, bounded parsing, enum/range/tree checks, and atomic rejection of invalid files.`);

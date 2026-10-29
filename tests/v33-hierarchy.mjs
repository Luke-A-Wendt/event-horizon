import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer,cpuVisibleBodies} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {REFERENCE_RG_METERS,compactSatellite} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';
const f=fixture({width:960,height:632}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.loadScene('horizon-hierarchy');r.fillHoles();r.fillObjects();r.updateCameraFrame();r.packRenderObjects(r.cameraFrame);
assert.equal(r.objects.filter(o=>o.type==='blackhole').length,18);assert.equal(r.objects.length,36);assert.equal(r.orbitPairs.size,0);
const majors=r.objects.filter(o=>o.type==='blackhole'&&o.parentId==='primary');assert.equal(majors.length,6);
const rendered=r.objectFrames.filter(o=>o.index>=0);assert.equal(rendered.length,12);
for(const major of majors){assert(rendered.some(o=>o.id===major.id));for(const type of ['disk'])assert(rendered.some(o=>o.parentId===major.id&&o.type===type));}
assert.equal(parseScene(serializeScene(r)).objects.length,36);
for(const time of [0,7.5]){r.time=time;r.fillObjects();for(const child of r.objects.filter(o=>o.type==='blackhole')){const frame=r.getFocusFrame(child.id),parent=r.getFocusFrame(child.parentId),distance=Math.hypot(...frame.position.map((v,i)=>v-parent.position[i]))*REFERENCE_RG_METERS;assert(Math.abs(distance/child.orbitMeters-1)<1e-8);assert(compactSatellite(child.type,child.massSolar,child.parentId==='primary'?'blackhole':parent.type,r.compactNodeMass(child.parentId)));}}
const nested=r.objects.find(o=>o.name==='Aurelia 1'),before=r.getObjects().find(o=>o.id===nested.id).renderRadiusMeters;
assert(r.updateObject(nested.id,{massSolar:nested.massSolar*1.01}));assert(Math.abs(r.getObjects().find(o=>o.id===nested.id).renderRadiusMeters/before-1.01)<1e-12);
const initialMajorMass=majors[0].massSolar;assert(r.updateObject(majors[0].id,{massSolar:9e7}),'One comparable-mass partner is allowed');assert.equal(r.updateObject(majors[1].id,{massSolar:8e7}),false,'A mass edit cannot introduce a third comparable-mass body');assert(r.updateObject(majors[0].id,{massSolar:initialMajorMass}));
const originalMass=r.state.mass;r.update({mass:1});assert.equal(r.state.mass,originalMass,'Invalid comparable-mass sibling hierarchy is rejected atomically');
assert.equal(parseScene(serializeScene(r)).objects.length,36);
for(const object of r.objects.filter(o=>o.type==='blackhole')){assert(r.focusTarget(object.id,'track'));r.updateCameraFrame();assert(r.validateFrameGeometry());assert(r.getFocusFrame(object.id).index>=0);}
const branchIds=new Set([majors[0].id]);for(const obj of r.objects)if(branchIds.has(obj.parentId))branchIds.add(obj.id);r.removeTreeObject(majors[0].id);assert(r.objects.every(o=>!branchIds.has(o.id)));r.dispose();
const canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;const c=new CpuRenderer(canvas,{autoStart:false,bindControls:false});c.loadScene('horizon-hierarchy');c.setQuality('low');c.fillObjects();c.updateCameraFrame();const visible=cpuVisibleBodies(c.objectFrames,c.cameraFrame,c.canvas.width,c.canvas.height,null,c.cpuProfile.bodies);assert(visible.length<=c.cpuProfile.bodies);for(const body of visible)if(['disk','jets'].includes(body.type))assert(visible.some(parent=>parent.id===body.parentId));canvas.beginFrame();for(const ignored of c.paintStages()){}const commands=canvas.takeFrame().commands;assert(commands.length<2000);for(const command of commands)for(const value of command)if(typeof value==='number')assert(Number.isFinite(value));c.dispose();
console.log(`PASS:19-hole cluster, physical nested orbits,12-slot compact families, mass/pair restrictions, editable tracked nodes, cascade deletion, YAML roundtrip, bounded CPU (${commands.length} commands).`);

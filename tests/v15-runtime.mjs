import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CpuRenderer,cpuSpectrum} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {fixture} from './render-fixture.mjs';
const f=fixture({width:390,height:700}),canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
const renderer=new CpuRenderer(canvas,{autoStart:false,bindControls:false});let maxCommands=0,maxStage=0;
function record(){canvas.beginFrame();const iterator=renderer.renderStages(100000,false,true);let result,previous=0;do{result=iterator.next();maxStage=Math.max(maxStage,canvas.commands.length-previous);previous=canvas.commands.length;}while(!result.done);assert.equal(result.value,true,renderer.sceneId+': '+renderer.geometryError);const frame=canvas.takeFrame();maxCommands=Math.max(maxCommands,frame.commands.length);assert(!JSON.stringify(frame).includes('null'),'Finite CPU canvas commands');return frame;}
for(const preset of SCENE_PRESETS){renderer.loadScene(preset.id);renderer.update({spectrum:'geometry',metrics:true,grid:true,warpGrid:true});for(const time of [0,20,70]){renderer.time=time;const frame=record();assert(frame.commands.some(c=>c[0]==='property'&&c[1]==='fillStyle'&&c[2]==='#000'),'Geometry background is pure black');const s=renderer.state,whiteCount=(s.blackHole?Number(s.whiteHole)+Number(s.binary&&s.secondaryWhiteHole):0)+renderer.objectFrames.filter(b=>b.whiteHole).length;const solids=renderer.objectFrames.filter(b=>['star','planet','moon'].includes(b.type)&&!b.collapsed).length+Number(s.bridge&&s.bridgeSurfaces);assert(frame.gradients.length<=whiteCount+solids,`Geometry ${preset.id} permits compact white-hole glows and neutral solid shading (${frame.gradients.length}/${whiteCount+solids})`);}}
assert(maxCommands<20000);assert(maxStage<500,'CPU geometry yields bounded work between UI tasks');
assert.deepEqual(cpuSpectrum([1,.5,.2],'geometry','hot'),[0,0,0]);
renderer.loadScene('geometry-orbit');renderer.update({spectrum:'geometry',grid:true,metrics:false});renderer.render();const geometry=record();assert(geometry.gradients.some(g=>g.stops.some(stop=>stop[1]==='#aeaeae')),'Geometry bodies use neutral solid shading');
renderer.loadScene('geometry');renderer.update({gravitationalWaves:true,binary:true,secondaryWhiteHole:true});renderer.time=3;const waves=record();renderer.update({gravitationalWaves:false});const plain=record();assert.notDeepEqual(waves.commands,plain.commands,'Wave illustration deforms the connected grid');
renderer.loadScene('merger');renderer.update({spectrum:'geometry',metrics:true});renderer.time=100;const merged=record();assert(merged.commands.filter(c=>c[0]==='lineTo').length>100,'An inactive zero-mass secondary cannot erase the post-merger grid');
const host=fs.readFileSync(new URL('../dist/render-host.js',import.meta.url),'utf8');for(const method of ['updateStellar','setFlightInput','resetFlight'])assert(host.includes("'"+method+"'"),'Host invalidates changes from '+method);
renderer.dispose();console.log(`PASS: ${SCENE_PRESETS.length} CPU geometry scenes across three times, black background, neutral gray solids and selective compact glows, wave grid, bounded work (${maxCommands} commands, ${maxStage} maximum stage), stellar/flight invalidation.`);

import assert from 'node:assert/strict';
import {CpuRenderer,cpuNebulaColor,cpuNebulaCloudLimit,cpuVisibleBodies} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {fixture} from './render-fixture.mjs';
const f=fixture({width:900,height:650}),canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
const r=new CpuRenderer(canvas,{autoStart:false,bindControls:false});
const finite=v=>{if(typeof v==='number')assert(Number.isFinite(v));else if(Array.isArray(v))v.forEach(finite);else if(v&&typeof v==='object')Object.values(v).forEach(finite);else if(typeof v==='string')assert(!v.includes('NaN'));};
function frame(){canvas.beginFrame();const stages=r.renderStages(100000,false,true);let step,previous=0,max=0;do{step=stages.next();max=Math.max(max,canvas.commands.length-previous);previous=canvas.commands.length;}while(!step.done);assert.equal(step.value,true);const value=canvas.takeFrame();finite(value);assert(value.commands.length<20000);assert(max<500,`Bounded stage: ${max}`);return value;}
const palette={nebulaColor:'#ff0000',bridgeOtherColor:'#00ff00',nebulaSecondaryColor:'#0000ff',nebulaMulticolor:true,nebulaColorMix:1};assert.equal(cpuNebulaColor(palette,false,0),'#ff0000');assert.equal(cpuNebulaColor(palette,true,0),'#00ff00');assert.equal(cpuNebulaColor(palette,true,1),'#0000ff');
for(const [width,count] of [[64,2],[224,4],[320,6],[448,8],[720,12]])assert.equal(cpuNebulaCloudLimit({width}),count);
r.loadScene('dust-cathedral');
for(const quality of ['low','medium','high','ultra']){r.setQuality(quality);frame();const clouds=r.nebulaClouds();assert(clouds.length<=cpuNebulaCloudLimit(r.cpuProfile));assert(clouds.length>0,quality+' cloud preview');clouds.forEach(finite);}
r.state.spectrum='geometry';assert.equal(r.nebulaClouds().length,0);r.state.spectrum='visible';r.state.nebulaVolume=false;assert.equal(r.nebulaClouds().length,0);
let clusterCount=0;
r.loadScene('horizon-hierarchy');
const base=r.bodyStages;r.bodyStages=function*(body){if(['blackhole','whitehole','disk'].includes(body.type))clusterCount++;yield* base.call(this,body);};
for(const quality of ['low','ultra']){r.setQuality(quality);clusterCount=0;frame();const expected=cpuVisibleBodies(r.objectFrames,r.cameraFrame,canvas.width,canvas.height,r.focusId,38,{lensing:r.state.lensing}).filter(b=>['blackhole','whitehole','disk'].includes(b.type)).length;assert.equal(clusterCount,expected);assert(clusterCount>8,'Cluster survives the normal low body limit');}
r.loadScene('bridge-blackhole');r.state.grid=true;r.fillHoles();r.fillObjects();r.updateCameraFrame();
canvas.beginFrame();for(const _ of r.gridStages()){}const withMass=canvas.takeFrame();const objects=r.objectFrames;r.objectFrames=objects.map(o=>({...o,massSolar:0}));canvas.beginFrame();for(const _ of r.gridStages()){}assert.deepEqual(canvas.takeFrame(),withMass,'Bridge Cartesian grid is not weak-body deformed');r.objectFrames=objects;
r.dispose();console.log('PASS: bounded depth cloud previews, shared multicolor palettes, geometry suppression, full visible CPU cluster and clean bridge Cartesian grid.');

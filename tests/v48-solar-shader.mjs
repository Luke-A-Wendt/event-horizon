import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {createFragment,VERTEX} from '../dist/shaders.js';
import {fixture} from './render-fixture.mjs';

// The dense solar scene is a useful compiler stress case: mapped planets,
// rings, stellar surfaces, body gravity, and the tour's selected spacecraft.
const f=fixture({width:390,height:700,webgl2:false}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.loadScene('solar-system');r.setQuality('low');
const features=r.shaderFeatures();
assert(features.planetary&&features.stellar&&features.rings&&features.bodyGravity);
assert.equal(features.craftMask,2,'The shuttle tour compiles the shuttle model');
r.loadScene('enterprise-solar-tour');const warpTour=r.shaderFeatures();
assert(warpTour.craftMask===8&&warpTour.warp&&warpTour.planetary&&warpTour.stellar&&warpTour.rings,'The warp tour keeps its Enterprise and the surrounding solar system');
const sources=[12,8,6,4,2].map(objectSlots=>createFragment({...features,objectSlots}));
for(let i=0;i<sources.length;i++){
 const slots=[12,8,6,4,2][i],source=sources[i];
 assert(source.includes(`uObjects[${slots}],uColors[${slots}],uBodyParams[${slots}]`));
 assert(source.includes(`uBodyMasses[${slots}]`));
 assert(source.includes(`uBodyShape[${slots}]`));
 assert(source.includes(`uHeadings[${slots}]`));
 if(slots<12)assert(!source.includes('j<12')&&!source.includes('k<12'),'Compatibility limits bound every body loop');
 assert(source.includes('CraftSurface')&&source.includes('uPlanetAtlas'),'Reducing slots retains scene features');
}
r.dispose();

// Optional native compilation checks grammar/linkage on this host, not the
// resources or behavior of the user's mobile graphics driver.
if(process.env.NATIVE_SOLAR==='1'){
 const es3=source=>'#version 300 es\n'+source.replace('precision highp float;','precision highp float;\nout vec4 outColor;').replaceAll('gl_FragColor','outColor');
 const cases=[
  {name:'solar/WebGL1/slots12',vertex:VERTEX,fragment:sources[0]},
  {name:'solar/WebGL1/slots4',vertex:VERTEX,fragment:sources[3]},
  {name:'solar/WebGL2/slots4',vertex:'#version 300 es\n'+VERTEX.replace('attribute','in'),fragment:es3(sources[3])}
 ];
 const result=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:1024*1024,timeout:45000});
 if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
 assert(!result.error,result.error?.message);assert([0,77].includes(result.status));
}
console.log('PASS: dense solar shader retains body/ship features with progressively smaller uniform arrays and loop bounds.');

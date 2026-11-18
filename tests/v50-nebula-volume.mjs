import assert from 'node:assert/strict';
import {createFragment} from '../dist/shaders.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';

// Exercise the separate entry points. A feature only wired into the ordinary
// ray marcher would silently disappear from the solar, warp or bridge scene.
const variants=[{},
 {weakField:true,bodyGravity:true,stellar:true,planetary:true},
 {warp:true,warpOnly:true,warpLocal:true,craftMask:8},
 {bridge:true,bodyGravity:true,attachments:true},
 {cluster:true,bodyGravity:true,attachments:true}];
for(const base of variants){
 const off=createFragment(base),on=createFragment({...base,nebulaVolume:true});
 assert(!off.includes('nebulaVolumeSegment(')&&!off.includes('uNebulaVolumeWorld'),'Disabled clouds do not enter the compiled program');
 assert(on.includes('void nebulaVolumeSegment(')&&on.includes('for(int bin=0;bin<12;bin++)'));
 assert(on.includes('uSpectrum!=5')&&on.includes('if(index!=sampleIndex)'),'Geometry rejects clouds; gravity steps reuse the bin cache');
 assert(!on.includes('${'),'All shader template expressions resolve');
 assert.equal([...on].filter(x=>x==='{').length,[...on].filter(x=>x==='}').length);
 if(base.bridge){assert(on.includes('bridgeNebulaChart'));assert(on.includes('other?uBridgeSkyColor:uNebulaColor'));}
 if(base.cluster){assert(on.includes('surfaceDistance,backgroundRay)'));assert(!on.includes('for(int i=0;i<288'));}
}
// Added focused craft and mapped worlds retain the bounded foreground pass.
for(const craft of [false,true])for(const planetary of [false,true])for(const nebulaVolume of [false,true]){
 const source=createFragment({cluster:true,craft,craftMask:2,planetary,nebulaVolume,objectSlots:2});
 assert(!source.includes('j<12')&&!source.includes('for(int i=0;i<288'));
 if(craft||planetary)assert(source.includes('vec4 body=objectHit('));
}
const f=fixture({width:320,height:200}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.update({nebula:true,nebulaVolume:true});r.render(1000);
assert.equal(r.shaderFeatures().nebulaVolume,true);
assert(f.uniforms.has('uNebulaVolumeWorld')&&f.uniforms.has('uNebulaVolumeStyle'));
assert([3,4,8,12].includes(f.uniforms.get('uNebulaVolumeStyle').args[3]));
r.update({spectrum:'geometry'});assert.equal(r.shaderFeatures().nebulaVolume,false);
r.update({spectrum:'visible',nebulaVolume:false});assert.equal(r.shaderFeatures().nebulaVolume,false);
r.dispose();
console.log('PASS: bounded volumetric clouds cover ordinary, weak, warp, bridge and cluster paths; disabled and Geometry modes omit their shader work.');

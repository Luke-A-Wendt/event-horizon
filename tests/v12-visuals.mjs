import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {createFragment} from '../dist/shaders.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';

const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false});
r.loadScene('empty-space');
const star=r.addChildObject('space','star',{name:'Test star',starStyle:'main',spots:.7,corona:1.2,color:'#ffd499',massSolar:1,radiusMeters:695700000});
assert(star);const planet=r.addChildObject(star.id,'planet',{planetStyle:'gas',color:'#c1915c',radiusMeters:69911000,orbitMeters:149597870700});assert(planet);
const ring=r.addChildObject(planet.id,'ring',{material:'icy',innerRadiusRatio:.52,thicknessRatio:.01,radiusMeters:130000000});assert(ring);
r.fillHoles();r.fillObjects();r.render();
assert(r.shaderFeatures().stellar&&r.shaderFeatures().rings&&r.shaderFeatures().bodyGravity);
const params=f.uniforms.get('uBodyParams[0]').args[0],frames=r.objectFrames;
const si=frames.find(x=>x.id===star.id).index,pi=frames.find(x=>x.id===planet.id).index,ri=frames.find(x=>x.id===ring.id).index;
assert.equal(params[si*4+1],Math.fround(.7));assert.equal(params[si*4+2],Math.fround(1.2));assert.equal(params[pi*4],1);assert.equal(params[ri*4],1);assert.equal(params[ri*4+1],Math.fround(.52));
assert.equal(f.uniforms.get('uBodyMasses[0]').args[0][si],1);
for(const spectrum of ['visible','infrared','xray','radio','gamma']){
 r.update({spectrum});r.render();const frozen=r.beginPhotoCapture();r.endPhotoCapture();assert(frozen.features.stellar&&frozen.features.rings&&frozen.features.bodyGravity);
 assert(frozen.uniforms.some(x=>x.name==='uBodyParams[0]'));
}
r.loadScene('bridge');r.update({stars:false,bridgeOtherStars:true,bridgeOtherStarDensity:2,starBrightness:.4,starVariety:.2,bridgeOtherStarBrightness:1.8,bridgeOtherStarVariety:.9});r.render();
assert.deepEqual(f.uniforms.get('uBridgeStars').args,[0,2]);assert.deepEqual(f.uniforms.get('uSkyParams').args,[.4,.2,1.8,.9]);
r.loadScene('binary');r.update({disk:false,secondaryDisk:true,jets:false,secondaryJets:true,secondaryDiskColor:'#88ccff',secondaryJetSpread:2.5});r.render();assert.equal(f.uniforms.get('uFlags').args[1],0);assert.equal(f.uniforms.get('uFlags').args[3],0);assert.equal(f.uniforms.get('uDiskSecondaryParams').args[3],1);assert.equal(f.uniforms.get('uJetSecondaryParams').args[0],2.5);assert.equal(f.uniforms.get('uJetSecondaryParams').args[3],1);
r.loadScene('disk');assert(!r.shaderFeatures().stellar&&!r.shaderFeatures().rings&&!r.shaderFeatures().bodyGravity);r.dispose();
const plain=createFragment(),full=createFragment({stellar:true,rings:true,bodyGravity:true,grid:true,bridge:true,craft:true,craftMask:15});
assert(!plain.includes('vec3 coronaRay(')&&!plain.includes('vec4 annulusHit('),'Default scenes do not compile stellar and ring work');
assert(full.includes('uBodyMasses[j]/4300000.0'),'Weak-body lensing uses physical solar masses');
assert(full.includes('spinFor(k)*pow(1.0-along'),'The automatic stream angular term vanishes at zero spin');
assert(full.includes('starHash(seed')&&full.includes('rot(float(j)*1.934)'),'Independent jittered sky layers avoid the previous correlated trigonometric cell hash');
assert(full.includes('other?uBridgeStars.y:uBridgeStars.x'),'Bridge ends independently select stars');
assert(full.includes('j==uDriveIndex?'),'Free-drive spacecraft use their actual orientation');
assert(full.includes('coordinateGridScale()'),'Weak-field scenes have a continuous scale-appropriate grid');
const c=new CpuCommandCanvas();c.getBoundingClientRect=f.canvas.getBoundingClientRect;const cpu=new CpuRenderer(c,{autoStart:false,bindControls:false});cpu.loadScene('empty-space');const body=cpu.addChildObject('space','planet',{planetStyle:'rocky',radiusMeters:6371000});cpu.focusTarget(body.id,'track');
function frame(style){cpu.updateObject(body.id,{planetStyle:style});c.beginFrame();assert(cpu.render(1000,false,true));return JSON.stringify(c.takeFrame());}
assert.notEqual(frame('rocky'),frame('gas'));assert.notEqual(frame('ice'),frame('ocean'));cpu.dispose();
console.log('PASS: hierarchical surface/material uniforms, physical weak-field masses, stellar/ring feature specialization, snapshot spectra, independent bridge skies, jittered sky code, free-drive transforms, and distinct CPU planet appearances.');

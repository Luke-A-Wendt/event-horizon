import assert from 'node:assert/strict';
import {createFragment} from '../dist/shaders.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';

// Public renderer state must reach the actual uniforms used by live, worker,
// photo, and stereo paths. The GL fixture records calls; it does not render.
const f=fixture(),r=new BlackHoleRenderer(f.canvas);
const photoSnapshot=()=>{const s=r.beginPhotoCapture();r.endPhotoCapture();return {...s,uniforms:Object.fromEntries(s.uniforms.map(u=>[u.name,u]))};};
r.loadScene('disk');r.update({paused:true});r.render();
assert.equal(r.state.diskStyle,'thermal');
assert.equal(r.shaderFeatures().probe,false);
assert(!createFragment(r.shaderFeatures()).includes('vec3 probeEmissionRay('),'Ordinary scenes do not compile the additional glow integrator');
for(const [style,index] of [['radiant',5],['ribbons',6]]){
 r.update({diskStyle:style});r.render();
 assert.equal(f.uniforms.get('uDiskParams').args[0],index);
 assert.equal(photoSnapshot().uniforms.uDiskParams.args[0],index,'Picture snapshots preserve the emission style');
}

r.loadScene('bridge');r.render();
assert.equal(r.state.nebula,false,'The near bridge end starts with a plain starfield');
assert.equal(r.state.bridgeOtherNebula,true);
assert.equal(f.uniforms.get('uFlags2').args[0],1,'Stars remain enabled');
assert.equal(f.uniforms.get('uFlags2').args[1],0,'Near-side nebula is independently disabled');
assert.equal(f.uniforms.get('uBridgeOtherNebula').args[0],1);
r.update({bridgeOtherNebula:false,nebula:true});r.render();
assert.equal(f.uniforms.get('uFlags2').args[1],1);
assert.equal(f.uniforms.get('uBridgeOtherNebula').args[0],0);

r.loadScene('empty-space');const probe=r.addObject('probe');
const referenceRadius=r.objectRadius(probe);
assert.equal(r.shaderFeatures().probe,true);
for(const logarithm of [0,2,5,8]){
 r.updateObject(probe.id,{logLuminosity:logarithm});r.render();
 assert.equal(f.uniforms.get('uLuminosities[0]').args[0][0],10**logarithm);
 assert.equal(r.objectRadius(r.objects[0]),referenceRadius,'Brightness must not enlarge the physical body');
 const snapshot=photoSnapshot();
 assert.equal(snapshot.features.probe,true);
 assert.equal(snapshot.uniforms['uLuminosities[0]'].args[0][0],10**logarithm);
}
r.removeObject(probe.id);assert.equal(r.shaderFeatures().probe,false);
r.dispose();

for(const features of [{probe:true},{probe:true,bridge:true},{probe:true,ultra:true},{probe:true,photo:true,photoSteps:1024}]){
 const source=createFragment(features);
 assert(source.includes('vec3 probeEmissionRay('));
 assert(source.includes('probeEmissionSegment(previous,p)'));
 assert(source.includes('clamp(luminosity,1.0,100000000.0)'),'Extreme emission remains finite and bounded');
 if(features.bridge)assert(source.includes('probeEmissionSegment(previous*throat,p*throat)'),'Bridge optical rays carry the glow too');
}
const plain=createFragment(),photo=createFragment({photo:true});
assert(plain.includes('sheetPhase=r*1.05+drift*5.4'),'Ribbon bands use coherent phase distortion instead of uniform concentric spacing');
assert(plain.includes('arcStrength'),'The flow varies around each band instead of drawing closed uniform rings');
assert(plain.includes('lineWidth=clamp(.45+pixelWidth*2.5'),'Thin distant strands are band limited by their pixel footprint');
assert(photo.includes('photoPlasma('),'Still rendering retains higher procedural detail');
console.log('PASS: radiant/ribbon shader uniforms and photo snapshots, independent bridge nebula switches, feature-gated logarithmic probe emission without size changes, and finite live/bridge/photo glow variants.');

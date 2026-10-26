// Fidelity and feature contracts; native image comparisons are recorded in QA.
import assert from 'node:assert/strict';
import {createFragment} from '../dist/shaders.js';
import {PHOTO_PRESETS,PHOTO_TILE_SIZE,photoBatchSize} from '../dist/photo-renderer.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';

const live=createFragment({ultra:true}),picture=createFragment({ultra:true,photo:true});
assert(!live.includes('photoOctaves('),'Live quality must not pay for still-only procedural turbulence');
assert(live.includes('i<768'),'The live Ultra integration budget remains separate');
assert(picture.includes('i<3072')&&picture.includes('uniform float uPhotoDetail;'));
assert(picture.includes('emit*=')&&picture.includes('photoPlasma('),'Still detail must affect emission, not just export pixel dimensions');
assert(picture.includes('footprint*frequency'),'Unresolved detail must fade rather than alias into a moiré');
for(const preset of PHOTO_PRESETS.filter(p=>p.id!=='quick')){
 assert(preset.steps>768&&preset.steps<=3072);
 assert(createFragment({ultra:true,photo:true,photoSteps:preset.steps}).includes(`i<${preset.steps}`),'Each picture compiles only its own integration ceiling');
 assert(PHOTO_TILE_SIZE**2*preset.steps*photoBatchSize(preset)<=26*1024*1024,'Higher detail cannot silently queue a larger GPU batch');
}
assert.deepEqual(PHOTO_PRESETS.map(p=>[p.steps,p.detail,p.samples]),[[0,0,1],[1024,1,4],[3072,3,16]]);
assert(!createFragment({craft:true,craftMask:8}).includes('vec4 shuttleCockpit('),'Unrelated ships do not compile the interior');
const shuttle=createFragment({craft:true,craftMask:2});
assert(shuttle.includes('uniform int uCockpitMode;'),'The ordinary renderer exposes the cockpit mode flag');
assert(!shuttle.includes('if(uCockpitMode==1'),'No cabin branch remains in observing spectra');
assert(!shuttle.includes('vec4 cabin=shuttleCockpit'),'No cockpit overlay is generated');
{
 const f=fixture(),r=new BlackHoleRenderer(f.canvas);r.loadScene('bridge');
 for(let i=0;i<8;i++)f.step(r,1000+i*17);
 r.render();
 const near=f.uniforms.get('uNebulaColor').args[0],far=f.uniforms.get('uBridgeSkyColor').args[0];
 assert.notDeepEqual(near,far,'The two bridge regions start with clearly distinct emission colors');
 const nearParameters=[...f.uniforms.get('uNebulaParams').args];
 r.update({bridgeOtherColor:'#3faa5e',bridgeOtherShape:'spiral',bridgeOtherScale:2.4,bridgeOtherIntensity:.7,bridgeOtherRotation:90});r.render();
 assert.deepEqual(f.uniforms.get('uNebulaParams').args,nearParameters,'Editing the far region does not edit the near nebula');
 assert.deepEqual(f.uniforms.get('uBridgeSkyParams').args,[3,2.4,.7,Math.PI/2]);
 assert.deepEqual(f.uniforms.get('uBridgeSkyColor').args[0],[63/255,170/255,94/255]);
 const source=f.activeSources.find(s=>s.type===35632).source;
 assert(source.includes('skyWithEnvironment(d,parameters,hue,other?uBridgeStars.y:uBridgeStars.x,other?uSkyParams.z:uSkyParams.x,other?uSkyParams.w:uSkyParams.y)'),'Both sides use the full nebula morphology renderer');
 r.dispose();
}
console.log('PASS: independent bridge skies, shuttle-only cabin compilation, photo-only procedural emission and filtered spatial detail, distinct integration budgets, and bounded GPU work at every picture preset.');

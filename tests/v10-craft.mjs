// Verify that the geometry/cockpit reaches the actual scene shader, including
// lower quality presets. Native GLES renders separately verify its appearance.
import assert from 'node:assert/strict';
import { fixture } from './render-fixture.mjs';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { SHUTTLE_COCKPIT_EYE } from '../dist/cockpit-glsl.js';
import { snapshotRenderer, restoreRenderer } from '../dist/render-state.js';
import { OBJECT_DIMENSIONS, objectRadiusMeters } from '../dist/objects.js';
import { CRAFT_GLSL } from '../dist/craft-glsl.js';

for(const quality of ['low','medium','high','ultra']){
 const f=fixture(),r=new BlackHoleRenderer(f.canvas);
 r.loadScene('orbital-expedition');r.setQuality(quality);
 const shuttle=r.getObjects().find(x=>x.type==='shuttle'),astronaut=r.getObjects().find(x=>x.type==='astronaut');
 r.focusObject(shuttle.id,'track');r.render();
 let shader=f.activeSources.find(x=>x.type===f.gl.FRAGMENT_SHADER).source;
 assert(shader.includes('shuttleCabinHit'),'The active scene shader contains the rounded flight deck');
 assert(shader.includes('Compound-delta planform'),'The active scene shader contains the revised wing geometry');
 assert(shader.includes('mirrored sun visor'),'Astronaut detail must not exist only in a disconnected fixture');
 const normalized=objectRadiusMeters('shuttle');
 assert.equal(OBJECT_DIMENSIONS.shuttle.normalizedExtent*normalized,37.24);
 r.focusObject(shuttle.id,'onboard');r.render();
 assert.equal(f.uniforms.get('uCockpitMode').args[0],1);
 assert.deepEqual(f.uniforms.get('uInspectCamera').args[0],SHUTTLE_COCKPIT_EYE);
 assert.equal(f.uniforms.get('uHideObjectIndex').args[0],1,'Only the ridden shuttle is removed from exterior ray tests');
 const snapshot=snapshotRenderer(r),before=f.uniforms.get('uInspectForward').args[0];
 const g=fixture(),copy=new BlackHoleRenderer(g.canvas);restoreRenderer(copy,snapshot);copy.render();
 assert.equal(g.uniforms.get('uCockpitMode').args[0],1,'Worker/VR state transfer preserves cockpit selection');
 assert.deepEqual(g.uniforms.get('uInspectForward').args[0],before);
 r.focusObject(astronaut.id,'onboard');r.render();
 assert.equal(f.uniforms.get('uCockpitMode').args[0],0,'The cabin never leaks into an astronaut camera');
 r.dispose();copy.dispose();
}

// Changes to fundamental silhouettes must not disappear at Low. Extra seams,
// fittings and folds are allowed to cost more only at higher detail levels.
const shuttle=CRAFT_GLSL.slice(CRAFT_GLSL.indexOf('// Shuttle: nose-to-engine'),CRAFT_GLSL.indexOf('// EMU-inspired articulated pressure suit.'));
const basic=shuttle.slice(0,shuttle.indexOf('if(uDetail>=1.0)'));
assert(basic.includes('shuttleCabinHit'));
assert(basic.includes('Compound-delta planform'));
assert(basic.includes('Trapezoidal stabilizer'));
assert.equal(OBJECT_DIMENSIONS.astronaut.normalizedExtent,1.72);
assert.equal(objectRadiusMeters('astronaut')*1.72,1.9);
assert(!/sampler2D|texture2D|https?:/.test(CRAFT_GLSL));
console.log('PASS: upgraded craft in active shaders at every quality, physical dimensions, cockpit local camera/host mask, snapshot transfer, and unchanged astronaut onboard semantics.');

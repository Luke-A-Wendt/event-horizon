import assert from 'node:assert/strict';
import {BlackHoleRenderer,bodyLensingSignificant} from '../dist/renderer.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {createFragment} from '../dist/shaders.js';
import {fixture} from './render-fixture.mjs';

const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.loadScene('solar-system');r.render();
assert.equal(r.objects.length,517);assert.equal(r.objectFrames.length,517);
assert.equal(r.gravityCount,0,'Ordinary Solar System limb deflections are below the pixel error budget');
assert(r.objectCount<=r.gpuObjectLimit);
const sun=r.objects.find(o=>o.name==='Sun'),earth=r.objects.find(o=>o.name==='Earth'),moon=r.objects.find(o=>o.parentId===earth.id&&o.type==='moon');
const sunRadius=r.getFocusFrame(sun.id).radius;
for(const object of [sun,earth,moon]){
 r.focusTarget(object.id,'track');r.render();
 const frame=r.getFocusFrame(object.id),index=frame.index;
 assert(index>=0,'Every catalog target retains a rendered inspection surface');
 assert.equal(r.gravityCount,0);assert.equal(r.objects.length,517);
 assert.equal(r.bodyMassData[index],Math.fround(frame.massSolar),'Culling gravity preserves physical masses');
 assert.equal(r.getFocusFrame(sun.id).radius,sunRadius);
 assert(r.validateFrameGeometry());
}
assert.equal(f.uniforms.get('uGravityCount').args[0],0);
assert.equal(r.annotationOptics.gravityCount,0);
assert(!bodyLensingSignificant({type:'star',massSolar:1,radius:696340000/REFERENCE_RG_METERS},.83/650));
assert(bodyLensingSignificant({type:'star',massSolar:1,radius:696340000/REFERENCE_RG_METERS},.83/20000),'Larger output restores a resolvable stellar lens');
assert(bodyLensingSignificant({type:'star',massSolar:1.4,radius:12000/REFERENCE_RG_METERS},.83/320),'Compact stars always retain their strong field at ordinary resolutions');

// Inserting a compact object after an ordinary body must still put its gravity
// in the prefix, while every surface and focus reference follows its new index.
r.loadScene('empty-space');
const ordinary=r.addChildObject('space','planet',{name:'Test planet',radiusMeters:6371000,massSolar:3e-6,x:1e9});
const compact=r.addChildObject('space','star',{name:'Compact star',radiusMeters:12000,massSolar:1.4,x:0,collapseEnabled:false});
r.focusTarget(ordinary.id,'track');r.render();
assert.equal(r.gravityCount,1);assert.equal(r.renderObjects[0].id,compact.id);
assert.equal(r.getFocusFrame(ordinary.id).index,r.cameraFrame.inspectIndex);
assert.equal(f.uniforms.get('uGravityCount').args[0],1);
r.update({lensing:false});r.render();assert.equal(r.gravityCount,0);

const shader=createFragment({bodyGravity:true,diagnostics:true,derivatives:true});
assert.match(shader,/if\(j>=uGravityCount\)break/);
assert.match(shader,/uGravityCount==0&&uWarpFlags\.w<\.5&&uWarpFlags\.x<\.5/);
assert.doesNotMatch(shader,/captureMask|captureEdge|shadowDistance/,'Geometry uses the visible ray capture, without a separate contour overlay');
r.dispose();
console.log('PASS: 517-body catalog retention, focused physical surfaces and masses, pixel-bounded gravity selection, compact-object prefix, straight-ray fast path, and visible ray capture without a contour overlay.');

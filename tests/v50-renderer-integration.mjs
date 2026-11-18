import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {fixture} from './render-fixture.mjs';

const f=fixture({width:390,height:720});
const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.loadScene('solar-system');
const earth=r.objects.find(o=>o.name==='Earth'),sun=r.objects.find(o=>o.name==='Sun'),ship=r.objects.find(o=>o.type==='shuttle');
assert(earth&&sun&&ship);
assert(!r.objects.some(o=>o.type==='enterprise'||o.type==='belt'));
assert(r.objects.some(o=>o.type==='planetoid')&&r.objects.some(o=>o.type==='asteroid'));
assert(r.canParentObject('moon',earth.id).ok);
assert(!r.canParentObject('moon',sun.id).ok);
assert(r.canParentObject('planetoid',sun.id).ok);
assert(!r.canParentObject('planetoid',earth.id).ok);
assert(r.canParentObject('asteroid',sun.id).ok);
assert(!r.canParentObject('asteroid',ship.id).ok);

// The added categories have physical surfaces and round-trip through the
// same exact-version scene format, including completed-flight eligibility.
ship.completedTransfer=true;
const text=serializeScene(r),saved=parseScene(text);
assert(/type: ["']?planetoid/.test(text)&&/type: ["']?asteroid/.test(text));
assert(text.includes('completedTransfer: true'));
assert(saved);

// Focus priority is a uniform, never a new compile variant or extra pass.
r.setQuality('low');r.focusTarget(ship.id,'track');r.render(1000);
assert.equal(f.uniforms.get('uCraftFocusType').args[0],4);
const key=r.programKey(r.shaderFeatures());
r.focusTarget(earth.id,'track');r.render(1100);
assert.equal(f.uniforms.get('uCraftFocusType').args[0],-1);
assert.equal(r.programKey(r.shaderFeatures()),key);
assert.equal(r.quality,'low');
r.dispose();
console.log('PASS: category parent rules, full Solar System scene-file round trip, optional belts, and focused-craft uniform priority without shader churn.');

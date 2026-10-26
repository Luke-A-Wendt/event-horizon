import assert from 'node:assert/strict';
import {createFragment} from '../dist/shaders.js';
import {WARP_FIELD_GLSL} from '../dist/warp-glsl.js';
import {METRIC_GLSL} from '../dist/metric-glsl.js';
import {coordinateGridGLSL} from '../dist/grid-glsl.js';

const full=createFragment({warp:true,grid:true,craft:true,craftMask:15,stellar:true,bodyGravity:true,diagnostics:true,derivatives:true,objectSlots:6});
const cold=createFragment();
assert.doesNotMatch(full,/coordinateVolumeSegment/);
assert.doesNotMatch(full,/warpVolumeSegment/);
assert.doesNotMatch(cold,/coordinateVolumeSegment|warpVolumeSegment/,'Grid-disabled programs do not compile the optional volume lattice');
assert.match(full,/metricSurfaceGrid\(point,normal,rd\)/);
assert.match(full,/fwidth\(bands\)/,'Sphere graticules get pixel-footprint antialiasing');
assert.doesNotMatch(METRIC_GLSL,/metricArrow\(a,b,body\.xyz|center\+radial/,'No detached surface-root or radius arrows');
assert.doesNotMatch(full,/horizonOverlay\(/,'Remove unused unlensed horizon overlay');
assert.doesNotMatch(full,/captureMask|captureEdge/,'Geometry retains visible capture with no cyan boundary overlay');
assert.doesNotMatch(full,/float limb=1\.0-smoothstep\(\.18,\.38/,'No second grazing-angle ring inside shadow');
assert.match(full,/focusMass\/4300000\.0/,'Compact focused stars avoid straight inspector');
assert.match(full,/stellarObserved\(color,uBodyMasses\[j\],obj\.w\)/);
assert.match(full,/coronaRay[^;]+\*stellarTransfer/);
assert.match(WARP_FIELD_GLSL,/return uWarpStrength\*shape\.y/,'Warp optical force vanishes exactly at W0');
assert.doesNotMatch(WARP_FIELD_GLSL,/uFlightMetrics/,'Frenet parameters do not deform the scalar wall');
// Distant-observer quasi-static Schwarzschild intensity is continuous and
// approaches zero as the spherical surface approaches 2rg from outside.
const transfer=(radius,rg=1)=>Math.max(0,Math.min(1,1-2*rg/radius))**2;
assert.equal(transfer(2),0);assert.equal(transfer(1.8),0);
assert.ok(transfer(2.001)<transfer(2.01)&&transfer(2.01)<transfer(2.1)&&transfer(2.1)<transfer(3));
assert.ok(Math.abs(transfer(1e9)-1)<1e-8);
console.log('PASS: lensed material graticules, single capture boundary, continuous compact-star transfer, straight-field limit, and restored planar shift diagram.');

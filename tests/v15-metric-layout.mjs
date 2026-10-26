import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {captureAnnotationFrame} from '../dist/annotations.js';
const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.loadScene('disk');r.update({metrics:true,annotations:true});r.render();
assert.equal(r.state.metrics,false);const frame=captureAnnotationFrame(r);assert(frame.annotations);assert(!('metricValues' in frame));assert.equal(f.uniforms.get('uMetricOptions').args[0],0);
r.update({spectrum:'geometry',grid:false});r.render();assert(r.state.grid);assert(r.shaderFeatures().diagnostics);assert.equal(f.uniforms.get('uSpectrum').args[0],5);r.dispose();
console.log('PASS: removed metric overlay cannot be enabled; object locators and pure geometry boundaries remain available.');

import assert from 'node:assert/strict';
import {protectiveWarpStrength} from '../dist/warp-physics.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
const holes=[0,0,0,1],h=[2];assert(protectiveWarpStrength([0,0,5],holes,h)>protectiveWarpStrength([0,0,50],holes,h));assert(Number.isFinite(protectiveWarpStrength([0,0,0],holes,h)));assert.equal(protectiveWarpStrength([0,0,5],holes,[0]),0);
const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene('warp-orbit');r.state.warpFactor=0;r.fillObjects();r.updateCameraFrame();r.setDrawUniforms();assert(f.uniforms.get('uWarpStrength').args[0]>0);r.dispose();console.log('PASS: protective orbital bubble at zero travel warp, monotonic proximity and finite horizon strength');

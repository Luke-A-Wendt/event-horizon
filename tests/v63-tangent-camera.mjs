import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {parkedOrbitGeometry,parkedCameraFraming} from '../dist/orbit-path.js';
import {beginRoute,advanceRoute} from '../dist/travel-routes.js';
import {transferCurveDerivative} from '../dist/travel-math.js';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),unit=a=>a.map(v=>v/Math.hypot(...a)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene('shuttle-earth-moon-loop');
const ship=r.objects.find(o=>o.type==='shuttle'),moon=r.objects.find(o=>o.name==='Moon');r.selectedId=ship.id;r.fillObjects();r.updateCameraFrame();
const orbit=parkedOrbitGeometry(r,ship.id),fit=parkedCameraFraming(r,orbit);assert(fit.eye.every(Number.isFinite));assert.equal(fit.compositionY,0);
const entryForward=[...r.cameraFrame.forward];assert(beginRoute(r,moon.id));advanceRoute(r,0);r.fillObjects();r.updateCameraFrame();assert(dot(entryForward,r.cameraFrame.forward)>.99999,'No camera rotation at the orbit-to-transfer handoff');let tangentAlignment;
for(const fraction of [.21,.12,.17,.2,.12]){advanceRoute(r,fraction*r.transfer.wallSeconds);r.fillObjects();r.updateCameraFrame();const tangent=unit(transferCurveDerivative(r.transfer.points,r.transfer.curveParameter));const alignment=dot(r.cameraFrame.forward,tangent);tangentAlignment??=alignment;assert(Math.abs(alignment-tangentAlignment)<1e-5,'Camera preserves entry-relative tangent alignment through braking flip');assert.equal(r.transfer.cameraCompositionY,0);}
r.dispose();console.log('PASS: orbit and transfer tangent camera, including midpoint flip');

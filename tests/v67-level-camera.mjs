import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {beginRoute,advanceRoute} from '../dist/travel-routes.js';
import {transferCurveDerivative} from '../dist/travel-math.js';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),unit=a=>a.map(v=>v/Math.hypot(...a)),sub=(a,b)=>a.map((v,i)=>v-b[i]);
function level(r){const up=r.configCache.primaryBasis[1],view=r.cameraFrame;assert(Math.abs(dot(view.right,up))<1e-7,'Horizontal screen axis remains in disk plane');assert(dot(view.up,up)>0,'No inversion');}
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene('warp-orbit');const ship=r.objects.find(o=>o.type==='enterprise'),parent=r.getFocusFrame(ship.parentId);
r.focusTarget(ship.id,'track');for(let i=0;i<=24;i++){r.time+=Math.PI/(12*r.orbitalOmega(ship));r.fillHoles();r.fillObjects();r.updateCameraFrame();level(r);const view=r.cameraFrame,ray=sub(parent.position,view.observer),rangeAlong=dot(ray,view.forward),miss=Math.hypot(...sub(ray,view.forward.map(v=>v*rangeAlong)));assert(dot(ray,view.right)<0);assert(miss>parent.radius*2.7&&rangeAlong>0,'Shadow remains to port of the center sightline through a full orbit');}
r.rotate(.32,.17);r.camera.yaw=r.target.yaw;r.camera.pitch=r.target.pitch;r.camera.lookYaw=r.target.lookYaw=.17;r.updateCameraFrame();level(r);
r.loadScene('shuttle-earth-moon-loop');const shuttle=r.objects.find(o=>o.type==='shuttle'),moon=r.objects.find(o=>o.name==='Moon');r.focusTarget(shuttle.id,'track');r.updateCameraFrame();const initial=[...r.cameraFrame.forward];assert(beginRoute(r,moon.id));advanceRoute(r,0);r.updateCameraFrame();assert(dot(initial,r.cameraFrame.forward)>.99999);const duration=r.transfer.wallSeconds;
for(let i=1;i<60;i++){advanceRoute(r,duration/60);r.fillObjects();r.updateCameraFrame();level(r);if(i>=12&&i<=50){const t=r.transfer,vel=unit(transferCurveDerivative(t.points,t.curveParameter));assert(dot(vel,r.cameraFrame.forward)>Math.cos(3*Math.PI/180),'Camera follows path tangent through braking flip');}}
r.dispose();console.log('PASS: full warp orbit composition, constant disk-relative roll, level offset view and tangent transfer camera');

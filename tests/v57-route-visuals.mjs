import './fixtures/shuttle-bridge.mjs';
import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {captureTransferPath,renderTransferPath} from '../dist/transfer-path.js';
import {captureParkedOrbit,updateParkedCamera} from '../dist/orbit-path.js';
import {captureAnnotationFrame} from '../dist/annotations.js';
import {beginRoute,advanceRoute} from '../dist/travel-routes.js';
const basis=[[1,0,0],[0,1,0],[0,0,1]],dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),close=(a,b,e=1e-7)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
const optics={origin:[0,0,0],observer:[0,0,10000/RG],forward:[0,0,-1],right:[1,0,0],up:[0,1,0],aspect:1.5,fov:1,width:900,height:600,bodies:[],holes:[],occluders:[],lensing:false,hideIndex:-1};
const craft={id:'ship',type:'shuttle',frame:basis,position:[0,0,0],radius:25/RG},fake={state:{annotations:true},cameraFrame:optics,focusMode:'track',focusId:'ship',getFocusFrame:()=>craft,travelPreview:{craftId:'ship',pathPoints:[[-10000,0,0],[0,0,0],[10000,0,0]]}};
let path=captureTransferPath(fake,optics);assert(path?.segments.length);assert(path.segments.flat().length<=192);assert(path.craftSilhouette.length>=7);const markup=renderTransferPath(path,900,600);assert.match(markup,/transfer-craft-silhouette/);assert.match(markup,/<path d="[^"]*C/);assert.doesNotMatch(markup,/<circle|stroke-dasharray/);assert.doesNotMatch(markup,/clearance/);
fake.state.annotations=false;assert.equal(captureTransferPath(fake,optics),null,'Labels controls every guide path');fake.state.annotations=true;
fake.travelPreview.pathPoints=[[-1e18,0,0],[0,0,0],[1e18,0,0]];path=captureTransferPath(fake,optics);assert(path.segments.flat().length<=192,'Interstellar guides stay bounded');assert(path.segments.flat().every(p=>p.opacity>=.34),'Far route remains readable');
// The silhouette is a union of separate pieces: empty space between nacelles
// is not swallowed by one broad spacecraft bounding circle.
craft.type='enterprise';path=captureTransferPath(fake,optics);assert(path.craftSilhouette.length>=8);assert(path.craftSilhouette.every(p=>p.length<40));

const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene('shuttle-earth-moon-loop');r.state.annotations=true;const ship=r.objects.find(o=>o.type==='shuttle');r.selectedId=ship.id;
// This fixture needs a parked circle. The scene now opens with a queued arc.
r.stopFlightSequence(ship.id);
const orbit=captureParkedOrbit(r,ship.id);assert(orbit&&orbit.pathPoints.length<=190);close(Math.hypot(...orbit.pathPoints[0].map((v,i)=>v-orbit.pathPoints.at(-1)[i]))/orbit.orbit.radius,0);assert.equal(captureAnnotationFrame(r).transferPath,null);r.state.plannedPath=true;const frame=captureAnnotationFrame(r);assert.equal(frame.transferPath?.kind,'orbit');assert.equal(frame.travelCraftId,ship.id);
r.setNavigationMode(ship.id,'manual');assert.equal(captureAnnotationFrame(r).travelCraftId,null,'Manual labels retain normal inspection behavior');r.state.annotations=false;assert.equal(captureAnnotationFrame(r).transferPath,null);
r.setNavigationMode(ship.id,'auto');r.state.annotations=true;r.now=()=>1000;assert(beginRoute(r,r.objects.find(o=>o.name==='Moon').id));advanceRoute(r,59.99);r.fillObjects();r.updateCameraFrame();const beforeArrival=[...r.cameraFrame.forward];advanceRoute(r,.01);r.fillObjects();r.updateCameraFrame();assert(r.parkedCamera);close(dot(beforeArrival,r.cameraFrame.forward),1,2e-6);assert.equal(captureAnnotationFrame(r).transferPath.kind,'orbit');const beforeManual=[...r.cameraFrame.forward];r.setNavigationMode(ship.id,'manual');r.updateCameraFrame();close(dot(beforeManual,r.cameraFrame.forward),1,2e-6);assert(!ship.flight.orbitHold,'Manual takeover coasts along the tangent');r.setFlightPower(1);r.updateCameraFrame();assert.equal(r.parkedCamera,null);
r.loadScene('test-shuttle-bridge');r.focusTarget('bridge','track');r.selectedId=r.bridgeObjectId;r.state.annotations=true;const bridge=captureAnnotationFrame(r),waypoint=bridge.objectFrames.find(o=>o.id==='bridge-throat');assert(waypoint?.anchor&&waypoint.virtual&&waypoint.waypoint&&waypoint.labelEligible);assert(bridge.travelTargetIds.includes('bridge-throat'));r.dispose();

console.log('PASS: smooth solid transfer/orbit guides, bounded optical samples, projected hull masks, labels gating, and waypoint labels.');

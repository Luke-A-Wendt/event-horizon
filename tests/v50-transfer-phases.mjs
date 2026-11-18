import assert from 'node:assert/strict';
import {transferPlayback,estimateTransfer,sampleTransferAtDistance,buildTransferCurve,orbitTransferPath,transferCurveFraction} from '../dist/travel-math.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {beginRoute,advanceRoute,routeState} from '../dist/travel-routes.js';
import {captureTransferPath,renderTransferPath} from '../dist/transfer-path.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
const near=(a,b,t=1e-8)=>assert(Math.abs(a-b)<t*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const points=orbitTransferPath({start:[1,0,0],end:[999,0,0],startCenter:[0,0,0],startTangent:[0,0,1],endCenter:[1000,0,0],endTangent:[0,0,-1]});
const curve=buildTransferCurve(points);
near(transferPlayback(curve,.29).distanceFraction,transferCurveFraction(curve,points.departureEndParameter));
near(transferPlayback(curve,.71).distanceFraction,transferCurveFraction(curve,points.arrivalStartParameter));
let previous=-1;
for(let i=0;i<=1000;i++){const s=transferPlayback(curve,i/1000);assert(s.distanceFraction>=previous);previous=s.distanceFraction;assert.equal(s.phaseIndex,[290,390,610,710].filter(boundary=>i>=boundary).length);assert.equal(s.commandedThrustG,i===1000||s.phaseIndex===2?0:1);}
for(const x of [.29,.39,.61,.71]){const h=1e-6,f=u=>transferPlayback(curve,u).distanceFraction,left=(f(x)-f(x-h))/h,right=(f(x+h)-f(x))/h;near(left,right,2e-4);}
for(const type of ['shuttle','enterprise']){const plan=estimateTransfer(1.496e11,type,1);let last=0;for(let i=0;i<=100;i++){const s=sampleTransferAtDistance(plan,i/100);near(s.distanceFraction,i/100);assert(s.properSeconds>=last);last=s.properSeconds;}near(last,plan.properSeconds);near(sampleTransferAtDistance(plan,1).dilationSeconds,plan.dilationSeconds);}

// Actual control telemetry: compressed curved segments and visible flip, engines off and RCS on
// during the middle turn; user camera gestures are retained during guidance.
const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene('shuttle-earth-moon-loop');const shuttle=r.objects.find(o=>o.type==='shuttle'),moon=r.objects.find(o=>o.name==='Moon');assert(shuttle&&moon);r.selectedId=shuttle.id;assert(beginRoute(r,moon.id));
advanceRoute(r,3);assert.equal(routeState(r).phaseIndex,1);near(routeState(r).wallElapsedSeconds,3);
r.target.yaw+=.2;r.target.pitch+=.1;r.target.focusDistance*=1.3;const requested=[r.target.yaw,r.target.pitch,r.target.focusDistance];
advanceRoute(r,1.5);assert.equal(routeState(r).phaseIndex,2);assert.equal(shuttle.flight.thrust,0);
advanceRoute(r,.5);const middle=routeState(r);assert(middle.autopilot);assert.equal(middle.commandedThrustG,0);assert.notEqual(middle.turningSign,0);assert(Math.abs(shuttle.flight.angularVelocity)>0);assert.deepEqual([r.target.yaw,r.target.pitch,r.target.focusDistance],requested);
advanceRoute(r,1.5);assert.equal(routeState(r).phaseIndex,3);assert.equal(shuttle.flight.thrust,1);
advanceRoute(r,1.5);assert.equal(routeState(r).phaseIndex,3);assert.equal(shuttle.flight.thrust,1);
advanceRoute(r,2);assert.equal(routeState(r).phase,'Arrived');assert.equal(routeState(r).autopilot,false);assert.equal(shuttle.completedTransfer,true);assert.equal(shuttle.parentId,moon.id);r.dispose();

const optics={origin:[0,0,0],observer:[0,0,10],forward:[0,0,-1],right:[1,0,0],up:[0,1,0],aspect:1.5,fov:1,width:900,height:600,bodies:[],holes:[],occluders:[],lensing:false,hideIndex:-1};
const renderer={cameraFrame:optics,focusMode:'track',focusId:'ship',getFocusFrame:()=>({id:'ship',type:'shuttle',frame:[[1,0,0],[0,1,0],[0,0,1]],position:[0,0,0],radius:.2}),travelPreview:{craftId:'ship',pathPoints:[[-1,0,0],[0,0,0],[1,0,0]].map(p=>p.map(v=>v*RG))}};
const overlay=captureTransferPath(renderer,optics);assert(overlay.craftSilhouette);const svg=renderTransferPath(overlay,900,600);assert(svg.includes('transfer-craft-silhouette'));assert(!/NaN|Infinity/.test(svg));
console.log('PASS: curvature-paced flight phases, monotone smooth playback, retained clock estimates, midpoint idle/RCS telemetry, unrestricted camera, completed-transfer state, and vehicle-clearance path mask.');

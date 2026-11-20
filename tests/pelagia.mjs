import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {observedBodyMeasurements} from '../dist/body-measurements.js';
import {pelagiaCanvasStages} from '../dist/pelagia-canvas.js';
import {pelagiaSurface,pelagiaTide,pelagiaRayDistance} from '../dist/pelagia-tide.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';

const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});
const near=(a,b,max)=>assert(Math.abs(a-b)<=max,`${a} not within ${max} of ${b}`);
r.loadScene('planet');r.fillObjects();r.updateCameraFrame();
const planet=r.objects.find(o=>o.catalogId==='pelagia-ocean'),star=r.objects.find(o=>o.type==='star'),frame=r.getFocusFrame(planet.id),t=frame.oceanTide;
assert.equal(r.focusId,planet.id);assert(star&&star.radius>5*planet.radius);assert.equal(t.issue,'');
const d=t.separationMeters,period=2*Math.PI/r.orbitalOmega(planet)*(18*RG/299792458);
near(d/RG,65,1e-10);near(d/t.rocheMeters,2.36,.01);near(period/3600,19.37,.02);assert(period>planet.rotationPeriodSeconds);
assert(!frame.waterCap);assert(t.crestMeters>.075*t.radiusMeters&&t.crestMeters<.095*t.radiusMeters,'Both physical crests are visibly raised above the displayed rocky surface');
const inputs={radiusMeters:t.radiusMeters,planetSolar:planet.massSolar,holeSolar:r.state.mass*1e6,spinPeriod:planet.rotationPeriodSeconds,separationMeters:d};
const baseline=pelagiaTide({...inputs,holeSolar:0,rockPhase:0}),weak=pelagiaTide({...inputs,separationMeters:2*d});
near(t.relativeMeters/weak.relativeMeters,8,1e-8);
near(t.rockMeters,20131,2);near(t.relativeMeters,23486,2);
const p0=pelagiaTide({...inputs,rockPhase:0});
const rise=n=>pelagiaSurface(p0,n).depth-pelagiaSurface(baseline,n).depth;
near(rise([1,0,0]),rise([-1,0,0]),1e-8);near(rise([1,0,0])-rise([0,0,1]),35229,2);
// Independent, finer area quadrature; allow a few metres of sampling error
// in a 3 km mean inventory, while the local shoreline moves by kilometres.
const N=22000,tides=[baseline,p0,pelagiaTide({...inputs,rockPhase:1.3})],vol=tides.map(()=>0),wet=tides.map(()=>0);
for(let i=0;i<N;i++){const y=1-2*(i+.5)/N,phi=i*Math.PI*(Math.sqrt(5)-1)+.2,rs=Math.sqrt(1-y*y),n=[rs*Math.cos(phi),y,rs*Math.sin(phi)];
 tides.forEach((s,j)=>{const h=pelagiaSurface(s,n).depth;vol[j]+=Math.max(0,h)/N;wet[j]+=+(h>0)/N;});}
near(vol[1],vol[0],8);near(vol[2],vol[0],8);assert(wet[0]>.6&&wet[0]<.85&&wet.slice(1).every(f=>f>.27&&f<.38),'Water concentrates on two opposite faces and exposes low ground elsewhere');
const rows=Object.fromEntries(observedBodyMeasurements(r).rows.map(row=>[row.key,row.value]));
assert.equal(rows.seaTide,'35.2 km');assert.equal(rows.rockTide,'30.2 km');assert.equal(rows.tidalOrbit,'2.76 AU');assert(rows.belowCamera);assert.equal(rows.crestScale,'65×');
for(const dir of [[1,0,0],[-1,0,0],[0,1,0],[0,0,-1]]){
 const h=pelagiaSurface(t,dir);near(h.drawMeters-h.surfaceMeters,dir[0]?t.crestMeters:0,.001);const surface=h.drawMeters,hit=pelagiaRayDistance(t,dir.map(x=>x*3),dir.map(x=>-x),5);
 near((3-hit)*t.boundMeters,surface,2);assert.equal(pelagiaRayDistance(t,dir.map(x=>3*x),dir,1),null);
}
// Check the actual fallback geometry, not just the scalar formula. From a
// broadside view both wet tips must project beyond the solid rock limb.
const B=[[1,0,0],[0,1,0],[0,0,1]],eyeDistance=3*t.radiusMeters/RG,
 ctx={beginPath(){this.pts=[];},moveTo(x,y){this.pts.push(x);},lineTo(x,y){this.pts.push(x);},closePath(){},lo:Infinity,hi:-Infinity,fill(){this.lo=Math.min(this.lo,...this.pts);this.hi=Math.max(this.hi,...this.pts);}};
const fake={context2d:ctx,cameraFrame:{observer:[0,0,eyeDistance],forward:[0,0,-1],right:[1,0,0],up:[0,1,0]},state:{spectrum:'visible'},canvas:{width:640,height:422},cpuProfile:{ringSegments:72}};
for(const step of pelagiaCanvasStages(fake,{position:[0,0,0],oceanTide:t,tidalBasis:B})){}
const rockLimb=(422/.83)/Math.sqrt(8);assert(320-ctx.lo>rockLimb*1.065&&ctx.hi-320>rockLimb*1.065,'Canvas resolves separate wet protrusions on both limbs');
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const underObserver=()=>{const f=r.getFocusFrame(),off=r.cameraFrame.observer.map((x,i)=>x-f.position[i]),v=f.tidalBasis.map(k=>dot(k,off));return Math.atan2(v[2],v[0])-f.oceanTide.rockPhase;};
const longitude=underObserver(),screenAxis=dot(r.cameraFrame.right,frame.tidalBasis[0]);
r.time+=2*Math.PI/r.orbitalOmega(planet);r.fillObjects();r.updateCameraFrame();
const later=r.getFocusFrame(planet.id).oceanTide;near(later.relativeMeters,t.relativeMeters,1e-7);
assert(Math.abs(Math.sin(later.rockPhase-t.rockPhase))>.5,'Asynchronous spin carries geography across the tidal highs');
// Sample exactly the same bed point: its tide-frame azimuth rotates while
// its bed elevation does not, so wet/dry changes are not painted longitude.
const phi=t.rockPhase,crustAt=u=>[Math.cos(phi-u.rockPhase),0,Math.sin(u.rockPhase-phi)];
const coast=[t,later].map(u=>pelagiaSurface(u,crustAt(u)));near(coast[0].bed,coast[1].bed,.001);
assert(coast[0].depth>10000&&coast[1].depth<0,'A single site drains from a deep sea to dry seabed');
near(Math.cos(underObserver()-longitude),1,1e-10);
assert(Math.abs(screenAxis-dot(r.cameraFrame.right,frame.tidalBasis[0]))>.1,'With the camera following the same coast, the high-water axis sweeps across the screen');
assert(serializeScene(r).includes('pelagia-ocean'));assert(parseScene(serializeScene(r)));
r.updateObject(planet.id,{radius:11,orbitMeters:11*RG});r.fillObjects();
assert.equal(r.getFocusFrame(planet.id).oceanTide.issue,'Inside fluid Roche estimate');
assert(!observedBodyMeasurements(r).rows.some(x=>x.key==='seaTide'),'No invalid ocean predictions inside the fluid Roche benchmark');
r.dispose();
console.log('PASS: stable orbit, inverse-cube forcing, paired tidal highs, rock and relative ocean range, conserved water, moving coasts, reported distances and close-orbit model limits.');

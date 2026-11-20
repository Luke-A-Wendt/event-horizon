import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';
const close=(a,b,eps=2e-8)=>assert(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=eps*Math.max(1e-10,Math.abs(b)),a+' vs '+b);
const c=299792458,g=9.80665;
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
try{
 r.loadScene('orbital-expedition');const added=r.addObject('iss',16,1.25,1);r.fillObjects();const iss=r.objects.find(o=>o.id===added.id),id=iss.id;
 const rg=r.massScale*RG,chart=18*RG/c,spin=r.state.spin;
 const rho=iss.orbitMeters||iss.radius*rg;
 const a=r.getObjectClock(id),x=a.referenceDistanceMeters/rg,st=rho/(x*rg),ct=Math.sqrt(1-st*st);
 const sigma=x*x+spin**2*ct*ct,delta=x*x-2*x+spin**2,area=(x*x+spin**2)**2-spin**2*delta*st*st;
 const alpha=Math.sqrt(sigma*delta/area),hphi=rg*Math.sqrt(area/sigma)*st,drag=c/rg*2*spin*x/area;
 const phi0=r.currentPhase(iss);
 r.time+=.25;
 const omega=(phi0-r.currentPhase(iss))/(.25*chart);
 close(a.distantSpeedMetersPerSecond,Math.abs(rho*omega));
 close(a.speedMetersPerSecond,Math.abs((omega-drag)*hphi/alpha));
 close(a.rateFactor,1/alpha/Math.sqrt(1-(a.speedMetersPerSecond/c)**2));
 assert(a.crewLoadG>1,'Station follows a supported circle above the equatorial plane.');
 const before=a;r.advanceClocks(.25,.25);const after=r.getObjectClock(id);
 close(after.coordinateSeconds-before.coordinateSeconds,.25*chart);
 close(after.properSeconds-before.properSeconds,.25*chart/a.rateFactor);
 r.update({disk:false});r.fillHoles();r.fillObjects();const free=r.getObjectClock(id);
 close(free.rateFactor,(1+spin/(rho/rg)**1.5)/Math.sqrt(1-3*rg/rho+2*spin/(rho/rg)**1.5));
 assert.equal(free.crewLoadG,0,'Station in a stable equatorial free orbit.');
 // Coordinate-fixed on the equator outside a Schwarzschild hole.
 r.update({spin:0});r.fillHoles();r.fillObjects();
 const p=r.configCache.primaryBasis[0],point=x=>Object.fromEntries(p.map((v,i)=>['xyz'[i],v*x*rg]));
 const fixed=r.addChildObject('space','astronaut',point(8));const h=r.getObjectClock(fixed.id);
 close(h.rateFactor,1/Math.sqrt(1-2/8));close(h.crewLoadG,c*c/(g*rg*64*Math.sqrt(1-2/8)));
 assert.equal(h.speedMetersPerSecond,0);assert.equal(h.feltParallel,null);
 r.update({spin:.9});r.updateObject(fixed.id,point(1.8));r.fillHoles();r.fillObjects();const impossible=r.getObjectClock(fixed.id);
 assert(impossible.unavailableStationaryClock&&Number.isNaN(impossible.rateFactor)&&Number.isNaN(impossible.crewLoadG));
 r.advanceClocks(1,.25);assert.equal(r.getObjectClock(fixed.id).properSeconds,impossible.properSeconds);
}finally{r.dispose();}
console.log('PASS: station speed and proper time from its drawn orbit; supported vs geodesic orbit; static Schwarzschild support; no massive stationary clock inside the ergoregion.');

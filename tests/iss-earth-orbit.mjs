import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';

const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const unit=a=>a.map(x=>x/Math.hypot(...a)),near=(a,b,e)=>assert.ok(Math.abs(a-b)<e,`${a} differs from ${b}`);
try{
 r.loadScene('iss-earth-orbit');
 const byName=name=>r.objects.find(o=>o.name===name),earth=byName('Earth'),sun=byName('Sun'),moon=byName('Moon'),iss=byName('International Space Station');
 assert.equal(r.objects.length,4);assert.equal(iss.type,'iss');
 assert.equal(earth.parentId,sun.id);assert.equal(moon.parentId,earth.id);assert.equal(iss.parentId,earth.id);
 assert.equal(r.focusId,iss.id);assert.equal(r.focusMode,'track');
 const period=2*Math.PI/r.orbitalOmega(iss),secondsPerTick=18*RG/299792458;
 near(period*secondsPerTick/60,92.4,.2);
 const angle=earth.axialTilt*Math.PI/180,basis=r.configCache.primaryBasis;
 const pole=basis[1].map((v,i)=>v*Math.cos(angle)+basis[2][i]*Math.sin(angle));
 let previous;
 for(let i=0;i<=4;i++){
  r.time=i*period/4;r.fillObjects();
  const station=r.frameById.get(iss.id),world=r.frameById.get(earth.id);
  const radial=sub(station.position,world.position),velocity=sub(station.velocity,world.velocity);
  near(Math.hypot(...radial)*RG-earth.radiusMeters,400000,.02);
  near(Math.hypot(...velocity)*299792458/18,7671,2);
  // Truss crosses the ground track, local zenith stays up and the pressurized modules follow the velocity vector.
  near(dot(station.frame[0],pole),Math.cos(51.6*Math.PI/180),1e-8);
  near(dot(station.frame[1],unit(radial)),1,1e-8);near(dot(station.frame[2],unit(velocity)),1,1e-8);
  if(previous)near(dot(unit(radial),previous),0,1e-7);
  previous=unit(radial);assert.equal(r.getObjectClock(iss.id).crewLoadG,0);
 }
}finally{r.dispose();}
console.log('PASS: ISS, Earth, Moon and Sun hierarchy; 400 km inclined free orbit; Earth-relative attitude, speed and period.');

import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {REFERENCE_RG_METERS} from '../dist/objects.js';

const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const first=type=>r.objects.find(o=>o.type===type);
function reading(id,mode){
 const q=r.getObjectClock(id);assert.equal(q.accelerationMode,mode,id+' should report '+mode);
 if(mode==='unavailable')assert(!Number.isFinite(q.crewLoadG));
 else assert(Number.isFinite(q.crewLoadG)&&q.crewLoadG>=0);
 return q;
}
try{
 // v²/r and the frame speed are nonzero for the Earth parking arc. Turning
 // the velocity or changing the playback/view must not register a seat force.
 r.loadScene('shuttle-earth-moon-loop');const earthShip=first('shuttle');
 for(const t of [0,1,3]){
  r.time=t;r.fillObjects();const q=reading(earthShip.id,'free-fall');
  assert(q.distantSpeedMetersPerSecond>0&&q.accelerationG>0&&q.crewLoadG===0);
 }
 r.loadScene('orbital-expedition');const habitat=first('habitat');
 assert.equal(reading(habitat.id,'free-fall').crewLoadG,0);assert.equal(r.getHabitatSpin(habitat.id).rimAccelerationG,1);
 // Manually adding an elevated station is a physically different hold.
 const iss=r.addObject('iss',16,1.25,1);r.fillObjects();assert(reading(iss.id,'support').crewLoadG>5);
 r.update({disk:false});r.fillHoles();r.fillObjects();assert.equal(reading(iss.id,'free-fall').crewLoadG,0);
 r.loadScene('radiant-descent');const who=first('astronaut');
 for(const t of [0,4,10]){r.time=t;r.fillObjects();assert.equal(reading(who.id,'free-fall').crewLoadG,0);}
 r.loadScene('horizon-watch');assert(reading(first('astronaut').id,'support').crewLoadG>5);
 r.loadScene('shuttle-space');const ship=first('shuttle');r.setNavigationMode(ship.id,'manual');r.state.paused=false;
 assert.equal(reading(ship.id,'coast').crewLoadG,0);
 r.setFlightPower(1);assert.equal(reading(ship.id,'thrust').crewLoadG,1);
 r.lastTime=1000;r.advanceSimulation(1100);r.setFlightPower(0);
 const coast=reading(ship.id,'coast');assert(coast.distantSpeedMetersPerSecond>0&&coast.crewLoadG===0);
 r.nudgeFlightTurn(5);assert.equal(reading(ship.id,'coast').crewLoadG,0);
 // A static massive observer cannot sit in the ergoregion, even at zero
 // throttle, and no GR force solver is defined for arbitrary binary tracks.
 r.loadScene('disk');r.update({spin:.9});r.fillHoles();r.fillObjects();
 const rg=r.massScale*REFERENCE_RG_METERS,point=r.configCache.primaryBasis[0].map(v=>v*1.8*rg);
 const invalid=r.addChildObject('space','astronaut',Object.fromEntries(point.map((v,i)=>['xyz'[i],v])));
 assert(reading(invalid.id,'unavailable').unavailableStationaryClock);
 r.loadScene('binary');const b=r.addObject('iss',16,0,1);r.fillObjects();reading(b.id,'unavailable');
}finally{r.dispose();}
console.log('PASS: physically classified proper accelerations for Kepler/Kerr orbits, free fall, hover, station hub vs rim, powered and unpowered drive, and unsupported tracks.');

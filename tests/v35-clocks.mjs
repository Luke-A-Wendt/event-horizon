import assert from 'node:assert/strict';
import {createObjectClock,clockRate,advanceObjectClock,objectClockReading,formatClockDuration,formatClockRate,CLOCK_LIGHT_SPEED,CLOCK_SOLAR_GM,compactExteriorRadius} from '../dist/object-clocks.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {RenderHost} from '../dist/render-host.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';
import {serializeScene,parseScene} from '../dist/scene-file.js';
const near=(a,b,t=1e-10)=>assert(Math.abs(a-b)<=Math.max(1,Math.abs(a),Math.abs(b))*t,`${a} != ${b}`);
const rs=2*CLOCK_SOLAR_GM/(CLOCK_LIGHT_SPEED**2),source={id:'hole',massSolar:1,horizonMeters:rs,positionMeters:[0,0,0]};
for(const radius of [1.00001,1.001,2,10,1e6]){const q=clockRate({positionMeters:[radius*rs,0,0],sources:[source]});near(q.rateFactor,1/Math.sqrt(1-1/radius));const clock=createObjectClock();advanceObjectClock(clock,10,q);near(clock.coordinateSeconds,10*q.rateFactor);near(clock.properSeconds,10);}
for(const r of [0,rs,rs*(1+1e-12)])assert(Number.isFinite(clockRate({positionMeters:[r,0,0],sources:[source]}).rateFactor));
const acceleration=CLOCK_LIGHT_SPEED*.1,clock=createObjectClock();
for(let i=0;i<10;i++)advanceObjectClock(clock,1,clockRate({rapidityVector:clock.rapidityVector}),[acceleration,0,0]);
near(clock.coordinateSeconds,10*Math.sinh(1));near(clock.properSeconds,10);near(clockRate({rapidityVector:clock.rapidityVector}).rateFactor,Math.cosh(1));
const atBurnEnd=clock.coordinateSeconds;advanceObjectClock(clock,2,clockRate({rapidityVector:clock.rapidityVector}));near(clock.coordinateSeconds-atBurnEnd,2*Math.cosh(1));
for(let i=0;i<10;i++)advanceObjectClock(clock,1,clockRate({rapidityVector:clock.rapidityVector}),[-acceleration,0,0]);near(Math.hypot(...clock.rapidityVector),0);
const coarse=createObjectClock();advanceObjectClock(coarse,10,clockRate(),[acceleration,0,0]);near(coarse.coordinateSeconds,10*Math.sinh(1));
const fine=createObjectClock(),one=createObjectClock();for(let i=0;i<100;i++)advanceObjectClock(fine,.01,clockRate({rapidityVector:fine.rapidityVector}),[acceleration,0,0]);advanceObjectClock(one,1,clockRate(),[acceleration,0,0]);near(one.coordinateSeconds,fine.coordinateSeconds);
const enormous=createObjectClock();enormous.rapidityVector=[300,0,0];advanceObjectClock(enormous,1e300,clockRate({rapidityVector:enormous.rapidityVector}));assert(Number.isFinite(enormous.coordinateSeconds));assert(Object.values(enormous).flat().every(Number.isFinite));
const combined=createObjectClock(),g=clockRate({positionMeters:[2*rs,0,0],sources:[source]});advanceObjectClock(combined,10,g,[acceleration,0,0]);near(combined.coordinateSeconds,Math.sqrt(2)*10*Math.sinh(1));
assert.equal(formatClockDuration(0),'0 s');assert.equal(formatClockDuration(1e-9),'1.0 ns');assert.equal(formatClockDuration(99999),'1.2 d');assert.equal(formatClockRate(1),'1.0×');assert.equal(formatClockRate(1800),'1,800×');
class LogicHost extends RenderHost{startBackend(){}queueSnapshot(){}resize(){}}
for(const Class of [BlackHoleRenderer,CpuRenderer,LogicHost]){
 const f=fixture(),canvas=Class===CpuRenderer?new CpuCommandCanvas():f.canvas;if(Class===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Class(canvas,{autoStart:false,bindControls:false});r.loadScene('disk');const actors=['astronaut','shuttle','iss'].map(type=>{const id=r.addObject(type,12,0,1).id;return r.objects.find(o=>o.id===id);});
 for(const actor of actors){r.updateObject(actor.id,{height:0,radius:r.minimumObjectRadiusRg(actor)});const rate=r.getObjectClock(actor.id);assert(rate.rateFactor>900&&Number.isFinite(rate.rateFactor));assert(rate.horizonGapMeters>0);r.updateObject(actor.id,{radius:5});}
 // Full active elapsed wall-time, independent of animation speed and its .1s cap.
 r.sceneLoad?.complete(r.sceneLoad.revision);r.lastTime=1000;r.state.paused=false;r.state.speed=10;r.advanceSimulation(3000);
 for(const actor of actors){near(actor.clock.properSeconds,2);assert(actor.clock.coordinateSeconds>2);}
 const ship=actors.find(o=>o.type==='shuttle');const before=structuredClone(ship.clock);r.setFreeDrive(ship.id,true);assert.deepEqual(ship.clock,before);r.advanceSimulation(3500);near(ship.clock.properSeconds,2.5);const beforeHome=structuredClone(ship.clock);r.setFreeDrive(ship.id,false);assert.deepEqual(ship.clock,beforeHome);assert(ship.clock.coordinateSeconds>before.coordinateSeconds);
 for(const speed of [.25,1,4]){r.state.speed=speed;const tau=ship.clock.properSeconds;r.advanceSimulation(r.lastTime+1000);near(ship.clock.properSeconds-tau,1);}
 r.state.paused=true;const frozen=structuredClone(ship.clock);r.advanceSimulation(r.lastTime+1000);assert.deepEqual(ship.clock,frozen);
 const serialized=serializeScene(r);assert.equal(parseScene(serialized).objects.find(o=>o.id===ship.id).clock.coordinateSeconds,ship.clock.coordinateSeconds);
 // Guard all eligible bodies, including forced/manual positions at a center.
 for(const actor of actors){actor.drivePosition=[0,0,0];r.fillObjects();const frame=r.getFocusFrame(actor.id);assert(Math.hypot(...frame.position)>=compactExteriorRadius(r.configCache.horizon[0],frame.radius)*(1-1e-12));assert(Number.isFinite(r.getObjectClock(actor.id).rateFactor));delete actor.drivePosition;}
 r.loadScene('radiant-descent');r.time=100;r.fillObjects();const fall=r.objects.find(o=>o.type==='astronaut');assert(r.getObjectClock(fall.id).horizonGapMeters>0);assert(Number.isFinite(r.getObjectClock(fall.id).rateFactor));
 r.loadScene('empty-space');
 const collapsed=r.addChildObject('space','star',{massSolar:10,radiusMeters:1,angularVelocity:0,collapseEnabled:false});assert(r.getFocusFrame(collapsed.id).collapsed);
 const tiny=r.addChildObject(collapsed.id,'astronaut',{orbitMeters:1});const actor=r.objectById.get(tiny.id);actor.drivePosition=[...r.getFocusFrame(collapsed.id).position];r.refreshConfiguration();r.fillObjects();
 const host=r.getFocusFrame(collapsed.id),guarded=r.getFocusFrame(tiny.id);assert(Math.hypot(...guarded.position.map((v,i)=>v-host.position[i]))>host.horizonRadius+guarded.radius);assert(Number.isFinite(r.getObjectClock(tiny.id).rateFactor));
 const testShip=r.addChildObject(collapsed.id,'shuttle',{orbitMeters:1e6});r.setFreeDrive(testShip.id,true);const shuttle=r.objectById.get(testShip.id),horizon=r.getFocusFrame(collapsed.id).horizonRadius,start=[10*horizon,0,0];shuttle.drivePosition=[-10*horizon,0,0];r.clockSweepStarts=new Map([[shuttle.id,start]]);r.fillObjects();assert(r.getFocusFrame(shuttle.id).position[0]>horizon,'A single long flight step cannot tunnel through a compact horizon');assert.equal(r.clockSweepStarts.size,0);const clearStart=[10*horizon,4*horizon,0],clearEnd=[-10*horizon,4*horizon,0];shuttle.drivePosition=[...clearEnd];r.clockSweepStarts.set(shuttle.id,clearStart);r.fillObjects();assert.deepEqual(r.getFocusFrame(shuttle.id).position,clearEnd,'A clear segment remains unchanged');r.setFreeDrive(testShip.id,false);
 r.loadScene('binary');const nearby=r.addChildObject('secondary','iss',{orbitMeters:1});assert(nearby.id);r.fillObjects();const secondary=r.getObjectClock(nearby.id);assert(Number.isFinite(secondary.rateFactor));assert(secondary.horizonGapMeters>0);
 r.loadScene('warp-lab');assert.equal(r.getObjectClock(r.objects.find(o=>o.type==='enterprise').id),null);r.dispose();
}
console.log('PASS: exact supplied Schwarzschild/constant-proper-acceleration equations and integrated t, coasting/reverse burns, full active wallτ independent of FPS/playrate, finite exterior guards, lifetime persistence, 2sig readable formatting, GPU/CPU/host consistency.');

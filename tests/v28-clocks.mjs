// Basic clock contracts; active wall-τ integration replaced the former
// distant-wall-clock/lag policy in v35. Renderer coverage is in v35-clocks.
import assert from 'node:assert/strict';
import {CLOCK_LIGHT_SPEED as c,CLOCK_SOLAR_GM as mu,supportsObjectClock,createObjectClock,clockRate,advanceObjectClock,objectClockReading,formatClockDuration,formatClockRate} from '../dist/object-clocks.js';
const near=(a,b,t=1e-11)=>assert(Math.abs(a-b)<=t*Math.max(1,Math.abs(a),Math.abs(b)),`${a} ≠ ${b}`);
for(const type of ['astronaut','shuttle','iss'])assert(supportsObjectClock(type));
for(const type of ['enterprise','planet','star','dyson'])assert(!supportsObjectClock(type));
const rs=2*mu/(c*c),source={id:'sun',massSolar:1,positionMeters:[0,0,0],radiusMeters:696340000},hole={...source,id:'hole',radiusMeters:rs,horizonMeters:rs};
const flat=clockRate();near(flat.properRate,1);near(flat.rateFactor,1);
const eta=Math.atanh(.6),sr=clockRate({rapidityVector:[eta,0,0]});near(sr.properRate,.8);near(sr.rateFactor,1.25);
const gravity=clockRate({positionMeters:[rs*5,0,0],sources:[hole]});near(gravity.properRate,Math.sqrt(.8));
const combined=clockRate({positionMeters:[rs*5,0,0],rapidityVector:[eta,0,0],sources:[hole]});near(combined.properRate,Math.sqrt(.8)*.8);
const insideStar=clockRate({positionMeters:[0,0,0],sources:[source]});near(insideStar.properRate,Math.sqrt(1-rs/source.radiusMeters));assert(!insideStar.horizonLimit);
near(clockRate({id:'sun',positionMeters:[0,0,0],sources:[source]}).properRate,1);
const second={...hole,id:'other',positionMeters:[10*rs,0,0]};near(clockRate({positionMeters:[5*rs,0,0],sources:[hole,second]}).properRate,.8);
const horizon=clockRate({positionMeters:[rs,0,0],sources:[hole]});assert(horizon.horizonLimit);assert(Number.isFinite(horizon.rateFactor)&&horizon.rateFactor>999);
const clock=createObjectClock();clock.rapidityVector=[eta,0,0];advanceObjectClock(clock,10,sr);near(clock.coordinateSeconds,12.5);near(clock.properSeconds,10);
const reading=objectClockReading(clock,sr,{id:'astronaut',type:'astronaut'});near(reading.lagSeconds,2.5);assert.equal(reading.type,'astronaut');
const before=structuredClone(clock);for(const dt of [0,-1,NaN,Infinity])advanceObjectClock(clock,dt,sr);assert.deepEqual(clock,before);
let previous=1;for(const gap of [1,.1,.001,.000001]){const rate=clockRate({positionMeters:[rs*(1+gap),0,0],sources:[hole]});assert(rate.rateFactor>previous);previous=rate.rateFactor;}
assert.equal(formatClockDuration(0),'0 s');assert.equal(formatClockDuration(1e-9),'1.0 ns');assert.equal(formatClockRate(1),'1.0×');assert.equal(formatClockRate(1e6),'1.0 million×');assert.equal(formatClockRate(NaN),'—');
console.log('PASS: two-model proper-wall-clock contracts, finite horizon comparison, exempt types, readable two-significant-figure units.');

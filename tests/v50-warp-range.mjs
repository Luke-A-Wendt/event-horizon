import assert from 'node:assert/strict';
import {warpStarVisuals,speedForWarp,FLIGHT_LIGHT_SPEED as C} from '../dist/flight-dynamics.js';
const points=Array.from({length:11},(_,w)=>warpStarVisuals(speedForWarp(w)/C));
assert(Math.abs(points[10].rate-.85)<1e-6,'Warp10 scrolls at the former warp8 rate');
for(let w=1;w<points.length;w++)assert(points[w].rate>points[w-1].rate,'Everylevel remains distinct');
assert(points[2].rate<=.0081&&points[5].rate>.08&&points[8].rate>.45);
assert(points[10].trailRadians>.29&&points[10].whiteness>.99,'Reduced scrollrate keeps nearwhite longstreaks');
for(let w=.05;w<10;w+=.05){const a=warpStarVisuals(speedForWarp(w-.001)/C),b=warpStarVisuals(speedForWarp(w+.001)/C);assert(b.rate>=a.rate&&b.rate-a.rate<.002);}
console.log('PASS: newwarp10 matches formerwarp8 scrolling, smooth distinct intermediatelevels, full streaklength and contrast range.');

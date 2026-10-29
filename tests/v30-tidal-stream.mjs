import assert from 'node:assert/strict';
import {tidalStreamBend,TIDAL_STREAM_GLSL} from '../dist/tidal-stream.js';
import {createFragment} from '../dist/shaders.js';

// The encounter has decreasing orbital angle. Its freshly stripped wake
// must lie behind that motion, while remaining attached at the star.
for(const spin of [0,.7,.998]){
 assert.equal(tidalStreamBend(0,spin),0);
 const wake=tidalStreamBend(.025,spin);
 assert(wake>0,'The near-star wake must lag decreasing-angle motion');
 const velocity=[0,-1],wakeOffset=[Math.cos(wake)-1,Math.sin(wake)];
 assert(velocity[0]*wakeOffset[0]+velocity[1]*wakeOffset[1]<0);
 for(let i=0;i<=100;i++)assert(Number.isFinite(tidalStreamBend(i/100,spin)));
}
assert.equal(tidalStreamBend(1,0),0,'Zero-spin inner fallback becomes radial');
assert(tidalStreamBend(.9,.998)<tidalStreamBend(.9,0),'Inner stream retains spin-dependent winding');
const fragment=createFragment({stellar:true});
assert(fragment.includes(TIDAL_STREAM_GLSL));
assert(fragment.includes('angle-uTidal.y-bend'));
assert(fragment.includes('-tidalStreamBend((separation-along)'));
assert(!fragment.includes('smoothstep(2.2,3.5,r)'),'Tail envelope follows the actual horizon');
console.log('Tidal wake attachment, lag direction, radial fallback and spin winding passed.');

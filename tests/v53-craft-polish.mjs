import assert from 'node:assert/strict';
import {CRAFT_GLSL,createCraftGLSL} from '../dist/craft-glsl.js';

// Evaluate the actual model coordinates: a decal can be valid GLSL yet be
// clipped by the triangular silhouette; a pylon can similarly miss its hull.
const shuttle=CRAFT_GLSL.slice(CRAFT_GLSL.indexOf('// Shuttle: nose-to-engine'),CRAFT_GLSL.indexOf('// EMU-inspired'));
const wings=[...shuttle.matchAll(/vec2\(([-.\d]+)\*x,([-.\d]+)\),vec2\(([-.\d]+)\*x,([-.\d]+)\),vec2\(([-.\d]+)\*x,([-.\d]+)\),([-.\d]+)\)/g)].slice(0,2).map(m=>m.slice(1,7).map(Number));
const inside=(x,z,t)=>{const cross=(a,b,c,d,e,f)=>(c-a)*(f-b)-(d-b)*(e-a),v=[cross(...t.slice(0,4),x,z),cross(...t.slice(2,6),x,z),cross(t[4],t[5],t[0],t[1],x,z)];return v.every(n=>n>0)||v.every(n=>n<0);};
const decal=CRAFT_GLSL.match(/shuttleNasaMark\(vec2\(-\(hit\.x-([.\d]+)\)\/([.\d]+),\(hit\.z\+([.\d]+)\)\/([.\d]+)\)\)/);
assert(decal);const [cx,sx,cz,sz]=decal.slice(1).map(Number);
for(const x of [-.81,.87])for(const z of [-.332,.332])assert(wings.some(t=>inside(cx-x*sx,-cz+z*sz,t)),'Full NASA decal bounding box stays inside the wing');
// Decal right (-X) crossed with decal up (+Z) must face the visible upper
// surface (+Y). The previous +X,+Z map had negative handedness and mirrored NASA.
assert(sx*sz>0,'Upper-wing decal basis faces +Y, matching its surface normal');

const enterprise=CRAFT_GLSL.slice(CRAFT_GLSL.indexOf('// TOS studio-model silhouette.'),CRAFT_GLSL.indexOf('// Guild Heighliner:'));
const pylon=enterprise.match(/vec3 pr=ro-vec3\(0,0,([-.\d]+)\);\s*part=wingHit\(pr\.xzy,rd\.xzy,vec2\(([-.\d]+)\*x,([-.\d]+)\),vec2\(([-.\d]+)\*x,([-.\d]+)\),vec2\(([-.\d]+)\*x,([-.\d]+)\),([-.\d]+)\)/);
assert(pylon);const [z,x1,y1,x2,y2,topX,topY,thickness]=pylon.slice(1).map(Number);
const secondary=enterprise.match(/frustumHit\(ro,rd,vec3\(0,([-.\d]+),([-.\d]+)\),([-.\d]+),([-.\d]+),([-.\d]+)\)/);
const [cy,centerZ,halfLength,rearRadius,frontRadius]=secondary.slice(1).map(Number);
for(const atZ of [z-thickness,z+thickness]){
 const radius=rearRadius+(frontRadius-rearRadius)*(atZ-centerZ+halfLength)/(2*halfLength);
 for(const [x,y]of [[x1,y1],[x2,y2]])assert(Math.hypot(x,y-cy)<radius-.005,'Pylon roots overlap the hull through their complete longitudinal thickness');
}
assert(Math.hypot(topX-.292,topY-.132)<.052,'Pylon upper joint overlaps the nacelle');
assert(shuttle.includes('shuttleAftHit(ro,rd)')&&!shuttle.includes('vec3(.028,.045,.005)'));
assert(!shuttle.includes('wingHit(flap'),'No detached body flap under the engine cluster');
assert.match(shuttle,/engine<3[\s\S]*frustumHit\(ro,rd,center,.08,.058,.033\)/,'All three main engine bells remain');
assert(!createCraftGLSL({mask:8}).includes('shuttleAftHit('));
console.log('PASS: complete wing-decal containment, embedded Enterprise pylon joints, and rounded shuttle tail with three unobstructed engine bells.');

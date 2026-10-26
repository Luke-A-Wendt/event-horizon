import assert from 'node:assert/strict';
import {CRAFT_GLSL,createCraftGLSL} from '../dist/craft-glsl.js';
import {OBJECT_DIMENSIONS,objectRadiusMeters} from '../dist/objects.js';
import {SHUTTLE_COCKPIT_EYE} from '../dist/cockpit-glsl.js';

// The expanded cabin still contains the pilot/right-seat eye, retains its
// frame, and does not increase physical size to make the model easier to see.
const cabin=CRAFT_GLSL.slice(CRAFT_GLSL.indexOf('vec4 shuttleCabinHit'),CRAFT_GLSL.indexOf('// Closed tapered engine bell'));
const cabinShape=cabin.match(/center=vec3\(([^)]+)\),radii=vec3\(([^)]+)\)/);
assert(cabinShape,'Cabin geometry exposes the tested analytic ellipsoid');
const center=cabinShape[1].split(',').map(Number),radii=cabinShape[2].split(',').map(Number);
assert(SHUTTLE_COCKPIT_EYE.reduce((sum,value,i)=>sum+((value-center[i])/radii[i])**2,0)<1);
assert(SHUTTLE_COCKPIT_EYE[1]<.150&&Math.abs(SHUTTLE_COCKPIT_EYE[0])<.132);
assert(SHUTTLE_COCKPIT_EYE[1]+SHUTTLE_COCKPIT_EYE[2]<.714);
assert.equal(OBJECT_DIMENSIONS.shuttle.normalizedExtent,1.72);
assert.equal(objectRadiusMeters('shuttle')*1.72,37.24);
const noseFront=.46+.40,engineAft=-.78-.08;
assert(Math.abs(noseFront-engineAft-1.72)<1e-12);
// NASA's double-delta planform has a steep inner glove and a shallower outer
// panel. Read the actual shader points so a later silhouette edit cannot leave
// a stale duplicate test fixture passing.
const shuttle=CRAFT_GLSL.slice(CRAFT_GLSL.indexOf('// Shuttle: nose-to-engine'),CRAFT_GLSL.indexOf('// EMU-inspired articulated pressure suit.'));
const wings=[...shuttle.matchAll(/vec2\(([-.\d]+)\*x,([-.\d]+)\),vec2\(([-.\d]+)\*x,([-.\d]+)\),vec2\(([-.\d]+)\*x,([-.\d]+)\),([-.\d]+)\)/g)].slice(0,2).map(m=>m.slice(1).map(Number));
assert.equal(wings.length,2);const [ax,az,bx,bz,dx,dz,halfThickness]=wings[0],cx=wings[1][2],cz=wings[1][3];
assert.deepEqual(wings[1].slice(0,2),[bx,bz]);assert.deepEqual(wings[1].slice(4,6),[dx,dz],'Both triangles meet at the inner kink and rear root, preserving concavity');
const insideTriangle=(x,z,t)=>{const cross=(a,b,c,d,e,f)=>(c-a)*(f-b)-(d-b)*(e-a);const signs=[cross(t[0],t[1],t[2],t[3],x,z),cross(t[2],t[3],t[4],t[5],x,z),cross(t[4],t[5],t[0],t[1],x,z)];return signs.every(v=>v>=0)||signs.every(v=>v<=0);};
assert(!wings.some(t=>insideTriangle(.27,-.10,t)),'The swept leading-edge notch is empty, not filled by a diagonal triangle');
const sweep=(dx,dz)=>Math.atan2(Math.abs(dz),Math.abs(dx))*180/Math.PI;
assert(Math.abs(sweep(bx-ax,bz-az)-81)<2,'Inner glove is steeply swept');
assert(Math.abs(sweep(cx-bx,cz-bz)-45)<3,'Outer wing retains the double-delta break');
assert(Math.abs(cx*2*objectRadiusMeters('shuttle')-23.79)<.1,'Physical wingspan remains close to 23.79 m');
assert(halfThickness*objectRadiusMeters('shuttle')*2<.6,'Wing thickness does not become a solid slab');
const fin=shuttle.match(/vec4 fin=wingHit[^\n]+vec2\(([-.\d]+),([-.\d]+)\),([-.\d]+)\)/);
assert(fin);const tailHeight=(Number(fin[1])+.132)*objectRadiusMeters('shuttle');
assert(tailHeight>13.5&&tailHeight<14.6,'Stowed vertical extent stays near the NASA orbiter dimension');
// A conservative sphere must contain each revised analytic part, preventing
// broadphase clipping at low quality or in locally tracked meter-scale views.
for(const [c,r] of [ [[0,-.025,.46],[.137,.115,.400]],[[.142,.086,-.535],[.065,.074,.195]] ]){
 let maximum=0;
 for(let latitude=0;latitude<=40;latitude++)for(let longitude=0;longitude<80;longitude++){
  const p=latitude*Math.PI/40,a=longitude*Math.PI*2/80;
  maximum=Math.max(maximum,Math.hypot(c[0]+r[0]*Math.sin(p)*Math.cos(a),c[1]+r[1]*Math.sin(p)*Math.sin(a),c[2]+r[2]*Math.cos(p)));
 }
 assert(maximum<1,'Revised geometry remains in the unchanged unit broadphase sphere');
}
for(let mask=0;mask<16;mask++){
 const shader=createCraftGLSL({mask});
 assert.equal(shader.includes('Full cylindrical payload bay'),!!(mask&2));
 if(mask&2){assert(shader.includes('short nose cap'));assert(shader.includes('Compound-delta planform'));assert(shader.includes('Three dummy main-engine bells'));assert(shader.includes('Twin pod nozzles'));}
}
assert(CRAFT_GLSL.includes('bool blackNose='));assert(CRAFT_GLSL.includes('Black frames surround glass panes'));
assert(!/sampler2D|texture2D|https?:/.test(CRAFT_GLSL));
console.log('PASS: shuttle physical extent and conservative bounds, original cockpit containment, model specialization, black nose/glazing and complete procedural silhouette. Native GLES views checked separately.');

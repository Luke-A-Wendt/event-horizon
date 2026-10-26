import assert from 'node:assert/strict';
import {renderMathGuide,renderWormholeGuide} from '../dist/math.js';
import {renderWarpGuide} from '../dist/warp-math.js';
const sink=()=>({innerHTML:'',querySelector(){return {addEventListener(){}};}});
const black=sink(),warp=sink(),bridge=sink();renderMathGuide(black);renderWarpGuide(warp);renderWormholeGuide(bridge);
assert.match(black.innerHTML,/massive traveler does <strong>not<\/strong> move through space at c/);
assert.match(black.innerHTML,/invariant timelike norm −c²/);assert.match(black.innerHTML,/equation of state/);
assert.match(black.innerHTML,/angular velocity Ω in radians per second/);assert.match(black.innerHTML,/explicitly fictional reset/);
assert.match(black.innerHTML,/can still receive light from outside/);assert.match(black.innerHTML,/not a visible material ring/);
assert.match(black.innerHTML,/twice the orbital frequency/);assert.match(black.innerHTML,/or a calibrated detector strain/);
assert.match(black.innerHTML,/Geometry suppresses surfaces/);
assert.match(warp.innerHTML,/Planar flight controls/);assert.match(warp.innerHTML,/no torsion input/);
assert.match(warp.innerHTML,/transverse-deflection law/);assert.match(warp.innerHTML,/time-dependent null-geodesic solution/);
assert.match(bridge.innerHTML,/does not back-react/);assert.match(bridge.innerHTML,/not an exact spacetime with two intersecting/);
assert.match(bridge.innerHTML,/marker-end="url\(#wormhole-guide-infall-arrow\)"/);
assert(!bridge.innerHTML.includes('M203 50L209 40L216 50'),'No hand-drawn arrowhead with mismatched curve tangent');
// Every segment of the infall Bezier is future timelike in the shown 45-degree light-cone chart.
const P=[[259,190],[251,159],[220,124],[209,43]];
for(let i=0;i<=100;i++){
 const t=i/100,u=1-t,dx=3*(u*u*(P[1][0]-P[0][0])+2*u*t*(P[2][0]-P[1][0])+t*t*(P[3][0]-P[2][0]));
 const dT=-3*(u*u*(P[1][1]-P[0][1])+2*u*t*(P[2][1]-P[1][1])+t*t*(P[3][1]-P[2][1]));
 assert(dT>Math.abs(dx),'Traveler tangent stays within the future light cone');
}
for(const html of [black.innerHTML,warp.innerHTML,bridge.innerHTML])for(const match of html.matchAll(/<math\b[^>]*>([\s\S]*?)<\/math>/g)){
 const stack=[{name:'math',count:0}];
 for(const token of match[1].matchAll(/<(\/)?([a-z]+)(?:\s[^>]*)?(\/?)>/g)){
  const [,close,name,self]=token;
  if(close){const item=stack.pop();assert.equal(item.name,name);const arity={mfrac:2,msub:2,msup:2,msqrt:1,mroot:2,msubsup:3,mover:2}[name];if(arity)assert.equal(item.count,arity,`${name} groups all operands`);}
  else{stack.at(-1).count++;if(!self&&!token[0].endsWith('/>'))stack.push({name,count:0});}
 }
 assert.equal(stack.length,1);
 assert(!match[1].includes('<mi></mi>'),'No blank mathematical base');
}
console.log('PASS: timelike physics, collapse and interior limits, GW equations, Frenet units, wormhole causal tangent and arrowheads, and grouped native MathML across all three guides.');

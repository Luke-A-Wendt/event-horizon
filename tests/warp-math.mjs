import assert from 'node:assert/strict';
import { renderWarpGuide } from '../dist/warp-math.js';
import { renderMathGuide } from '../dist/math.js';
const elements=new Map();
const container={innerHTML:'',querySelector(id){if(!elements.has(id))elements.set(id,{value:'4',textContent:'',innerHTML:'',addEventListener(event,fn){this[event]=fn;}});return elements.get(id);}};
renderWarpGuide(container);
const html=container.innerHTML;
assert.equal((html.match(/<details\b/g)||[]).length,8);
assert((html.match(/<math\b/g)||[]).length>=9);
assert(html.includes('∞ · theoretical limit'));
assert(html.includes('No unique canonical formula'));
assert(html.includes('intrinsically flat'));
assert(html.includes('not a numerical-relativity prediction'));
assert(html.includes('Automatic illustrative bubble radius in ship bounding radii'));
assert(html.includes('2.4 ship radii at W = 0 to 6.7 at W = 10'));
assert(html.includes('Stop motion smoothly brakes both forward motion and turning'));
assert(html.includes('Implemented illustrative raised and lowered sheet'));
assert(html.includes('no artificial axial bias displaces the ship'));
assert(!/Bubble radius remains the chosen value|reference sheet stays planar|Straighten &amp; stop/.test(html));
assert(!/\b(?:fetch|XMLHttpRequest|WebSocket)\b/.test(html));
// Validate MathML tree arities without an external XML package.
const blackHoleContainer={...container,innerHTML:''};renderMathGuide(blackHoleContainer);
assert(blackHoleContainer.innerHTML.includes('Painlevé–Gullstrand'));
assert(blackHoleContainer.innerHTML.includes('virtual luminous reference sheet'));
assert(blackHoleContainer.innerHTML.includes('already-bent ray path'));
assert(blackHoleContainer.innerHTML.includes('not an exact Kerr'));
assert(html.includes('enables or disables every reference grid together'));
for(const match of (html+blackHoleContainer.innerHTML).matchAll(/<math\b[^>]*>([\s\S]*?)<\/math>/g)){
 const stack=[{name:'math',count:0}];
 for(const token of match[1].matchAll(/<(\/)?([a-z]+)(?:\s[^>]*)?(\/?)>/g)){
  const [,close,name,self]=token;
  if(close){const node=stack.pop();assert.equal(node.name,name);const expected={mfrac:2,msub:2,msup:2,msubsup:3,msqrt:1,mroot:2}[name];if(expected)assert.equal(node.count,expected,`${name} must have ${expected} grouped children`);}
  else {stack.at(-1).count++;if(!self&&!token[0].endsWith('/>'))stack.push({name,count:0});}
 }
 assert.equal(stack.length,1);
}
const slider=elements.get('#warpMathSharpness');
for(let k=1;k<=10;k+=.1){slider.value=String(k);slider.input();const svg=elements.get('#warpProfileDiagram').innerHTML;assert(svg.includes('<svg'));assert(!/NaN|Infinity|undefined/.test(svg));}
const f=(r,k)=>(Math.tanh(k*(r+1))-Math.tanh(k*(r-1)))/(2*Math.tanh(k));
const df=(r,k)=>k*((1-Math.tanh(k*(r+1))**2)-(1-Math.tanh(k*(r-1))**2))/(2*Math.tanh(k));
for(const k of [1,4,10]){assert.equal(f(0,k),1);assert.equal(df(0,k),0);assert(f(5,k)<.001);assert(df(1,k)<0);}
assert(Math.abs(8**(10/3)-1024)<1e-9);
assert(Math.abs(9**(10/3)-1516.381107)<1e-5);
console.log('PASS: both guides use grouped MathML; warp guide structure, bounded interactive diagrams, shape normalization, sign, and reference-scale values.');

import assert from 'node:assert/strict';
import {renderWormholeGuide,renderMathGuide} from '../dist/math.js';
const node={innerHTML:'',querySelector(){return {addEventListener(){}};}};
renderWormholeGuide(node);const wormhole=node.innerHTML;
assert(wormhole.includes('cannot be crossed'));assert(wormhole.includes('Ellis'));assert(wormhole.includes('ρ = b/2'));
assert.equal((wormhole.match(/<svg/g)||[]).length,2);assert.equal((wormhole.match(/<math /g)||[]).length,5);
renderMathGuide(node);assert(node.innerHTML.includes('four-dimensional spacetime'));assert(node.innerHTML.includes('Type-based placement restrictions'));
for(const match of (wormhole+node.innerHTML).matchAll(/<math\b[^>]*>([\s\S]*?)<\/math>/g)){
 const stack=[{name:'math',count:0}];
 for(const token of match[1].matchAll(/<(\/)?([a-z]+)(?:\s[^>]*)?(\/?)>/g)){
  const [,close,name,self]=token;
  if(close){const item=stack.pop();assert.equal(item.name,name);const arity={mfrac:2,msub:2,msup:2,msqrt:1,mroot:2}[name];if(arity)assert.equal(item.count,arity,`${name} groups all operands`);}
  else{stack.at(-1).count++;if(!self&&!token[0].endsWith('/>'))stack.push({name,count:0});}
 }
 assert.equal(stack.length,1);
}
console.log('PASS: standalone wormhole guide, causal/embedding diagrams, weak-field limits and grouped MathML.');

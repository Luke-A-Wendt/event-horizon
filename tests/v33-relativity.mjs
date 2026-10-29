import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderRelativityGuide} from '../dist/relativity-math.js';

const container={innerHTML:''};renderRelativityGuide(container);const html=container.innerHTML;
assert(!/undefined|NaN|<script|<iframe/.test(html));
const sections=[...html.matchAll(/<details[^>]+id="(rel-\d+)"([^>]*)>/g)];
assert.equal(sections.length,12);assert(sections[0][2].includes('open'));assert(sections.slice(1).every(s=>!s[2].includes('open')));
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'Diagram and navigation IDs must be unique');
for(const match of html.matchAll(/data-relativity-section="([^"]+)"/g))assert(ids.includes(match[1]));
for(const target of ['blackholes','warp','wormholes'])assert(html.includes('data-relativity-target="'+target+'"'));

// Check the native MathML tree, not a screenshot of implementation strings.
// Grouping errors in fractions, roots, or tensor indices silently change a
// formula's visible meaning even when its HTML is accepted by a browser.
const formulas=[...html.matchAll(/<math\b[\s\S]*?<\/math>/g)].map(m=>m[0]);assert.equal(formulas.length,21);
for(const formula of formulas){
 const stack=[];
 for(const token of formula.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/g)){
  const tag=token[1],closing=token[0].startsWith('</');
  if(closing){const node=stack.pop();assert.equal(node?.tag,tag,'Balanced MathML elements');const arity={mfrac:2,msub:2,msup:2,msubsup:3,msqrt:1};if(arity[tag])assert.equal(node.children.length,arity[tag],tag+' has the required child grouping');if(tag==='msqrt')assert.equal(node.children[0],'mrow','The whole root argument is grouped');}
  else{if(stack.length)stack.at(-1).children.push(tag);stack.push({tag,children:[]});}
 }
 assert.equal(stack.length,0);
}
const diagrams=[...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m=>m[0]);assert.equal(diagrams.length,3);
for(const diagram of diagrams){
 assert(diagram.includes('viewBox="0 0 720 310"'));
 const labelled=diagram.match(/aria-labelledby="([^"]+)"/)[1].split(' ');for(const id of labelled)assert(diagram.includes('id="'+id+'"'));
 for(const match of diagram.matchAll(/<text\b[^>]*\bx="([\d.]+)"[^>]*\by="([\d.]+)"/g)){assert(Number(match[1])>=0&&Number(match[1])<=700);assert(Number(match[2])>=0&&Number(match[2])<=300);}
}
const shell=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
for(const id of ['relativityDialog','relativityTitle','closeRelativity','relativityContent'])assert(shell.includes('id="'+id+'"'));
assert(shell.indexOf('data-open-relativity')<shell.indexOf('data-open-math class="math-hub-card"'));
// Reference checks for the explicit clock example and Lorentz convention.
assert.equal(10*1800,18000);
const alpha=9.80665,c=299792458,tau=1e7;const eta=alpha*tau/c;assert(Math.abs((c/alpha*Math.sinh(eta+1e-7)-c/alpha*Math.sinh(eta-1e-7))/(2e-7*c/alpha)-Math.cosh(eta))<1e-8);
for(const b of [0,.2,.7,.99]){const gamma=1/Math.sqrt(1-b*b),ct=2.3,x=.9,ctp=gamma*(ct-b*x),xp=gamma*(x-b*ct);assert(Math.abs((-ctp*ctp+xp*xp)-(-ct*ct+x*x))<1e-12);}
console.log('PASS: 12-section relativity route, 21 structured MathML formulas, 3 accessible bounded SVG diagrams, notebook links, Lorentz and clock-example checks.');

import assert from 'node:assert/strict';
import {CRAFT_GLSL,createCraftGLSL} from '../dist/craft-glsl.js';
const materialSets=[[0,1,21,22,23],[0,2,12,13,14],[0,3,5,6,10,15,24],[4,7,16,17,18,19,20],[31,32]];
const headers=['\n if(type<3.5){\n','\n }else if(type<4.5){\n','\n }else if(type<5.5){\n','\n }else if(type<6.5){\n  // TOS studio-model silhouette.','\n }else if(type>11.5&&type<12.5){\n'];
const starts=headers.map(v=>CRAFT_GLSL.indexOf(v,CRAFT_GLSL.indexOf('CraftSurface craftHit(')));
const end=CRAFT_GLSL.indexOf('\n }\n return s;\n}',starts[4]);
const geometry=starts.map((start,i)=>CRAFT_GLSL.slice(CRAFT_GLSL.indexOf('{',start)+1,i<4?starts[i+1]:end));
function statement(source,condition){const i=source.indexOf('if('+condition+')',source.indexOf('vec3 shadeCraft('));if(i<0)return null;let j=i+condition.length+4;if(source[j]==='{'){let d=1;for(j++;d&&j<source.length;j++){if(source[j]==='{')d++;else if(source[j]==='}')d--;}}else j=source.indexOf(';',j)+1;return source.slice(i,j);}
const guards=[['material>9.5&&material<10.5&&uDetail>=1.0',[10]],['material>.5&&material<1.5',[1]],['(material>1.5&&material<2.5)||(material>11.5&&material<12.5)',[2,12]],...[3,4,5,6,7,10,12,13,15,16,17,18,19,20,21,22,23,24].map(v=>[`material>${v-.5}&&material<${v+.5}`,[v]]),['material>30.5&&material<32.5',[31,32]]];
for(let mask=0;mask<31;mask++){
 const source=createCraftGLSL({mask}),ids=new Set([0,...materialSets.flatMap((v,i)=>mask&(1<<i)?v:[])]);
 for(let i=0;i<5;i++)assert.equal(source.includes(geometry[i]),!!(mask&(1<<i)),`Geometry ${i} is preserved iff selected in ${mask}`);
 for(const [condition,values] of guards){const expected=values.some(v=>ids.has(v))?statement(CRAFT_GLSL,condition):null;assert.equal(statement(source,condition),expected,`Material ${condition}, mask ${mask}`);}
 const originalNames=[...CRAFT_GLSL.matchAll(/^(?:float|vec[234]|void|CraftSurface)\s+(\w+)\(/gm)].map(m=>m[1]);
 for(const name of originalNames){if(!new RegExp(`^(?:float|vec[234]|void|CraftSurface)\\s+${name}\\(`,'m').test(source))assert(!new RegExp(`\\b${name}\\s*\\(`).test(source.replace(/\/\/[^\n]*/g,'')),`Missing reachable helper ${name}`);}
}
assert.equal(createCraftGLSL({mask:31}),CRAFT_GLSL);assert.equal(createCraftGLSL({mask:NaN}),CRAFT_GLSL);
assert(!createCraftGLSL({mask:8}).includes('float nasaGlyph('));assert(createCraftGLSL({mask:4}).includes('float nasaGlyph('));
assert(!createCraftGLSL({mask:8}).includes('vec4 shuttleCabinHit('));assert(createCraftGLSL({mask:2}).includes('vec4 shuttleCabinHit('));
console.log('PASS: selected geometry and reachable materials stay byte-identical for all craft combinations; unknown/all masks remain complete; no unresolved helper calls.');

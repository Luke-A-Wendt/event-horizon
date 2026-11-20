import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CRAFT_GLSL,createCraftGLSL} from '../dist/craft-glsl.js';
import {createFragment,VERTEX} from '../dist/shaders.js';
const craft=createCraftGLSL({mask:2|8});
assert(craft.includes('float detail=max(uDetail,abs(type-uCraftFocusType)<.25?2.0:0.0);'));
assert(craft.includes('s.detail=detail;')&&craft.includes('detail=surface.detail;'),'The same local quality follows the hit from geometry to material');
assert.equal((CRAFT_GLSL.match(/\buDetail\b/g)||[]).length,1,'Only the local craft quality selector reads global detail; all craft gates use hit-local detail');
for(const weakField of [false,true]){
 const source=createFragment({weakField,craft:true,craftMask:2|8,bodyGravity:true,stellar:true});
 assert(source.includes('uniform float uWhiteHole,uCraftFocusType;'));
 assert(source.includes('s.detail=detail;'));
 assert(source.includes('if(uDetail>.5)n=n*.88'),'Background quality remains tied to Adaptive rather than the focused craft');
}
assert(!createCraftGLSL({mask:2}).includes('material>9.5&&material<10.5&&detail>=1.0'),'Priority metadata does not resurrect an unused suit material');
if(process.env.NATIVE_CRAFT_PRIORITY==='1'){
 const fragment=`precision highp float;
uniform float uDetail,uCraftFocusType,uType;
const float PI=3.141592653589793;
vec3 unit(vec3 v){return v/max(length(v),1e-20);}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
${craft}
void main(){vec3 ro=vec3(0,0,3),rd=vec3(0,0,-1);CraftSurface s=craftHit(ro,rd,10.0,uType,0.0);gl_FragColor=vec4(shadeCraft(s,ro+rd*s.t,rd,unit(vec3(1,1,1)),vec3(.1)),1);}`;
 const result=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify([{name:'focused-craft/WebGL1',vertex:VERTEX,fragment}]),encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
 if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
 assert(!result.error,result.error?.message);assert([0,77].includes(result.status));
}
console.log('PASS: focused craft geometry/material detail stays independent of global adaptive quality, in weak/full shaders with existing signatures.');

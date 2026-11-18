import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {createFragment} from '../dist/shaders.js';
import {pruneUnreachableGLSL} from '../dist/weak-field-glsl.js';
import {fixture} from './render-fixture.mjs';
const native=[];
for(const webgl2 of process.env.NATIVE_WEAK==='1'?[process.env.WEBGL2!=='0']:[false,true]){
 const f=fixture({width:390,height:700,webgl2}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
 r.loadScene('solar-system');r.setQuality('low');r.render(1000);
 const features=r.shaderFeatures(),source=f.activeSources.find(s=>s.type===35632).source;
 assert(features.weakField);assert(source.includes('weakFieldBackgroundRay'));
 assert(!source.includes('for(int i=0;i<288')&&!source.includes('for(int i=0;i<768'),'No compact ray marcher is parsed for a planetary system');
 assert(!/vec3 force\(|vec4 discAt\(|vec3 jetField\(/.test(source),'Unreachable expensive helpers are removed before driver parsing');
 assert(source.includes('uInspectRight*dot(rd,uRight)'),'Focused craft keeps the double-precision local inspector frame');
 assert(source.includes('craftHit(')&&source.includes('namedPlanetSurface(')&&source.includes('annulusHit('),'Mapped planets, rings and spacecraft keep their surface code');
 assert(source.includes('4.0*mass/max(impact2'),'Background retains bounded analytic weak lensing');
 assert(source.length<createFragment({...features,weakField:false}).length*.87,'Cold compiler receives materially less source');
 native.push({...(process.env.WEAK_SNAPSHOT?{snapshot:{path:process.env.WEAK_SNAPSHOT,width:390,height:700}}:{}),name:'solar/weak/WebGL'+(webgl2?2:1),vertex:f.activeSources.find(s=>s.type===35633).source,fragment:source,firstFrameUniforms:[...f.uniforms].map(([name,value])=>({name,...value}))});
 r.dispose();
}
const overloads='float used(float x){return x;}\nvec3 used(vec3 x){return x;}\nfloat unused(float x){return x*x;}\nvoid main(){float x=used(1.0);}';
const pruned=pruneUnreachableGLSL(overloads);assert(pruned.includes('float used')&&pruned.includes('vec3 used'));assert(!pruned.includes('float unused'));
if(process.env.NATIVE_WEAK==='1'){
 if(process.env.NATIVE_WEAK_LINK_ONLY==='1')for(const entry of native)delete entry.firstFrameUniforms;
 const result=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify(native),encoding:'utf8',maxBuffer:1024*1024,timeout:60000});
 if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
 assert(!result.error,result.error?.message);assert([0,77].includes(result.status));
 if(result.status===0&&process.env.NATIVE_WEAK_LINK_ONLY!=='1')assert.equal((result.stdout.match(/FIRST FRAME:/g)||[]).length,native.length);
}
console.log('PASS: weak-field solar path uses bounded analytic intersections, keeps mapped surfaces and lens cues, and prunes unreachable strong-field helpers.');

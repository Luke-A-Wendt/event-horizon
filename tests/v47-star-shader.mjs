import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createFragment} from '../dist/shaders.js';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';

const source=createFragment({warp:true,warpOnly:true,warpLocal:true,warpLocalOnlyCraft:true,craftMask:8,objectSlots:2});
const streak=source.slice(source.indexOf('vec3 warpStreakSky('),source.indexOf('vec3 skyWithEnvironmentChart('));
assert(source.includes('uniform vec4 uWarpFlags,uWarpMotion,uWarpStarStyle;'));
assert(streak.includes('layer<2')&&streak.includes('candidate<3'),'Exactly six analytic candidates, independent of speed or quality');
assert(streak.includes('row+float(candidate)-1.0'),'Neighboring radial cells contribute long trails across cell boundaries');
assert(streak.includes('uWarpStarStyle.y'),'Trails have angular length rather than tiny source-cell length');
assert(streak.includes('exp(-.5*(shortAxis*shortAxis+longAxis*longAxis))'),'Soft Gaussian transverse/longitudinal profile');
assert(!streak.includes('uTime')&&!streak.includes('texture2D'),'Stars use shared bounded phase, no extra texture asset or temporal sampling');
assert(source.includes('smoothstep(3.5,7.0,uWarpStarStyle.w)'),'Original field blends gradually into the long-trail chart');
assert(source.includes('if(streakBlend<.9999){'),'Full high-warp streaks skip the original star loop');
assert(source.includes('uWarpMotion.w>.00001&&uBridge.x<.5'),'Only the existing enabled cinematic sky changes');
for(const band of [1,2,3,4])assert(streak.includes(`uSpectrum==${band}`),'All spectral modes retain their existing weighting');
assert(streak.includes('uWarpStarStyle.z'),'Near-ten white trails use the same style as CPU');
assert(!createFragment().includes('vec3 warpStreakSky('),'Non-warp shaders do not grow the cinematic sky code');

if(process.env.NATIVE_STAR==='1'){
 const cases=[];
 for(const webgl2 of [false,true]){
  const f=fixture({width:390,height:700,webgl2}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
  r.loadScene('warp-lab');r.setQuality('high');r.scenePreview=false;
  r.setFreeDrive(r.warpObjectId,true);r.setFlightPower(9.9999);r.render(1000);
  const uniforms=[...f.uniforms].map(([name,value])=>({name,...value}));
  for(const uniform of uniforms){if(uniform.name==='uWarpMotion')uniform.args=[.2,1.5,199516,1];if(uniform.name==='uWarpStarStyle')uniform.args=[1,.30,1,9.9999];}
  cases.push({name:'Warp10 streaks/WebGL'+(webgl2?2:1),vertex:f.activeSources.find(s=>s.type===35633).source,fragment:f.activeSources.find(s=>s.type===35632).source,firstFrameUniforms:uniforms});r.dispose();
 }
 const result=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:1024*1024,timeout:45000});
 if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
 assert(!result.error,result.error?.message);assert([0,77].includes(result.status));
 if(result.status===0)assert.equal((result.stdout.match(/FIRST FRAME:/g)||[]).length,2);
}
console.log('PASS: bounded Gaussian cone trails, real angular length, gradual low-warp continuity, spectral modes, and unchanged non-warp shaders.');

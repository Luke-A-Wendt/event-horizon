const SHUTTLE_COCKPIT_EYE=[0,.28,.65];
// Procedural asset contracts and an optional exact-GLSL image fixture.
// Native rendering via v6_shader_check.py checks actual primitive intersections;
// the recording renderer here checks local camera frames, not browser speed.
import assert from 'node:assert/strict';
import { CRAFT_GLSL, createCraftGLSL } from '../dist/craft-glsl.js';
import { COCKPIT_GLSL, SHUTTLE_COCKPIT_EYE as LEGACY_COCKPIT_EYE } from '../dist/cockpit-glsl.js';
import { OBJECT_DIMENSIONS, objectRadiusMeters } from '../dist/objects.js';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { fixture } from './render-fixture.mjs';

if(process.argv[2]==='--dump'){
 const type=Number(process.argv[3]||4),view=process.argv[4]||'three-quarter',detail=Number(process.argv[5]||2);
 const onboard=view.startsWith('cockpit'),eye=onboard?SHUTTLE_COCKPIT_EYE:view==='front'?[0,.10,3]:view==='side'?[3,.08,0]:view==='back'?[0,.15,-3]:[2.2,1.7,2.6];
 const look=onboard?(view==='cockpit-back'?[0,0,-1]:view==='cockpit-side'?[1,0,0]:[0,0,1]):eye.map(x=>-x);
 const fragment=`precision highp float;
 uniform float uDetail;uniform vec3 uEye,uLook;uniform vec2 uResolution;
 const float PI=3.141592653589793;
 vec3 unit(vec3 v){return normalize(v);}
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
 ${createCraftGLSL({mask:1<<(type-3)})}
 ${onboard?COCKPIT_GLSL:''}
 void main(){
 vec2 p=(gl_FragCoord.xy-.5*uResolution)/uResolution.y;
 vec3 forward=normalize(uLook),right=normalize(cross(forward,vec3(0,1,0))),up=cross(right,forward);
 vec3 ro=uEye,rd=normalize(forward+right*p.x*1.4+up*p.y*1.4);
 vec3 sky=vec3(.012,.023,.035)+vec3(.04,.05,.08)*max(rd.y,0.0);
 sky+=vec3(.25)*step(.998,hash(floor(gl_FragCoord.xy/2.0)));
 vec3 color=sky;
 ${onboard?'vec4 cabin=shuttleCockpit(ro,rd,sky);color=mix(sky,cabin.rgb,cabin.a);':`CraftSurface s=craftHit(ro,rd,100.0,${type.toFixed(1)});if(s.t<100.0){vec3 hit=ro+rd*s.t;color=shadeCraft(s,hit,rd,normalize(vec3(-.5,1,1)),vec3(.20,.28,.35));}`}
 color=pow(max(vec3(0),color/(color+vec3(1.0))),vec3(.454545));
 gl_FragColor=vec4(color,1);
 }`;
 console.log(JSON.stringify({width:900,height:650,sources:[{type:35633,source:'attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0,1);}'},{type:35632,source:fragment}],uniforms:{uDetail:{method:'uniform1f',args:[detail]},uEye:{method:'uniform3fv',args:[eye]},uLook:{method:'uniform3fv',args:[look]},uResolution:{method:'uniform2f',args:[900,650]}}}));
 process.exit(0);
}

// Physical dimensions remain independent of detail and inspection distance.
for(const [type,extent,length] of [['iss',1.64,109],['shuttle',1.72,37.24],['astronaut',1.72,1.9]]){
 assert.equal(OBJECT_DIMENSIONS[type].normalizedExtent,extent);
 assert(Math.abs(objectRadiusMeters(type)*extent-length)<1e-9);
 assert.equal(objectRadiusMeters(type,2),objectRadiusMeters(type)*2);
}
assert.equal(createCraftGLSL(),CRAFT_GLSL);
for(let mask=0;mask<16;mask++){
 const source=createCraftGLSL({mask});
 for(const [bit,anchor] of [[1,'// ISS: x extent'],[2,'// Shuttle: nose-to-engine'],[4,'// EMU-inspired articulated pressure suit.'],[8,'// TOS studio-model silhouette.']])assert.equal(source.includes(anchor),Boolean(mask&bit));
 assert.equal((source.match(/{/g)||[]).length,(source.match(/}/g)||[]).length);
}
assert(CRAFT_GLSL.includes('dummy main-engine bells'));
assert(CRAFT_GLSL.includes('no operational OMS/RCS'));
assert(CRAFT_GLSL.includes('nasaLetters')&&CRAFT_GLSL.includes('nasaPatch'));
assert(CRAFT_GLSL.includes('vec3 conductor=vec3(1.0,.71,.25)'));
assert(CRAFT_GLSL.includes('if(uDetail>=1.0)')&&CRAFT_GLSL.includes('if(uDetail>=2.0)'));
assert(!/https?:|sampler2D|texture2D/.test(CRAFT_GLSL+COCKPIT_GLSL),'The procedural assets require no remote or raster assets');
const [x,y,z]=LEGACY_COCKPIT_EYE;
assert((x/.133)**2+((y-.075)/.072)**2+((z-.46)/.205)**2<1,'Pilot eye must be within raised cabin');
assert(Math.abs(x)<.112&&y>-.055&&y<.133&&z>.315&&z<.620);

// Turning or advancing the orbit changes the world frame, not the cabin eye.
{
 const f=fixture(),r=new BlackHoleRenderer(f.canvas);
 const shuttle=r.addObject('shuttle',16,.7,1);assert(shuttle);
 r.focusObject(shuttle.id,'onboard');r.render();
 assert.equal(f.uniforms.get('uCockpitMode').args[0],0);
 const before=f.uniforms.get('uInspectCamera').args[0];
 assert.deepEqual(before,SHUTTLE_COCKPIT_EYE);
 const worldBefore=[...f.uniforms.get('uForward').args[0]];
 r.time+=500;r.render();
 assert.deepEqual(f.uniforms.get('uInspectCamera').args[0],before);
 assert.notDeepEqual(f.uniforms.get('uForward').args[0],worldBefore,'Orbit carries the cockpit frame with the shuttle');
 r.focusObject(shuttle.id,'track');r.render();assert.equal(f.uniforms.get('uCockpitMode').args[0],0);
 r.dispose();
}
console.log('PASS: craft dimensions, complete model specialization, procedural NASA markings/gold visor, local cockpit eye and frame attachment.');

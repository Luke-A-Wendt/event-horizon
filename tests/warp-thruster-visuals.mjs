import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inflateSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {createFragment} from '../dist/shaders.js';
import {createCraftGLSL} from '../dist/craft-glsl.js';
import {WARP_JET_GLSL,WARP_MAIN_PORTS,WARP_STERN_PORT} from '../dist/warp-plumes.js';
import {warpExhaustMesh,warpShipMesh} from '../dist/nasa-warp-mesh.js';
const max=(pts,i)=>Math.max(...pts.map(p=>p[i])),min=(pts,i)=>Math.min(...pts.map(p=>p[i]));
assert.equal(warpExhaustMesh(0,0).vertices.length,0);
const low=warpExhaustMesh(1,0),left=warpExhaustMesh(0,1),right=warpExhaustMesh(0,-1),both=warpExhaustMesh(1,-.8);
assert.equal(max(low.vertices,2)<-.89,true);assert(min(low.vertices,2)<-1.1);
assert(min(left.vertices,0)>WARP_STERN_PORT[0]-.007&&max(right.vertices,0)<-WARP_STERN_PORT[0]+.007);
assert(max(left.vertices,2)<-.60&&min(left.vertices,2)>-.69);
assert(both.faces.length===low.faces.length+left.faces.length);
assert(left.faces.every(f=>f.alpha>0&&f.alpha<1));
for(const lod of [6,8,16,24]){
 const points=warpShipMesh(lod).vertices;
 for(const sign of [-1,1])assert(points.some(p=>Math.abs(p[0]-sign*WARP_STERN_PORT[0])<.00001&&Math.abs(p[2]-WARP_STERN_PORT[2])<.031));
}
assert.equal(WARP_MAIN_PORTS.length,4);
const cases=[
 ...[-1,1].flatMap(h=>[
  ['rear view clear of old lateral linkage','craftHit(vec3('+h*.12+',0,-1.),vec3(0,0,1),2.,6.,0.,0.).t>.251'],
  ['rear view clear of old vertical linkage','craftHit(vec3(0,'+h*.12+',-1.),vec3(0,0,1),2.,6.,0.,0.).t>.251'],
  ['yaw port has recessed floor','abs(craftHit(vec3('+h*.5+',0,-.641),vec3('+(-h)+',0,0),2.,6.,0.,0.).t-.331)<.0001'],
  ['pitch port has recessed floor','abs(craftHit(vec3(0,'+h*.5+',-.641),vec3(0,'+(-h)+',0),2.,6.,0.,0.).t-.354)<.0001']
 ]),
 ...WARP_MAIN_PORTS.map(([x,y])=>['aft corner lit','lum(vec3('+x+','+y+',-1.5),vec3(0,0,1),1.,vec2(1,0))>.3']),
 ...[-1,1].map(h=>['vertical steering rim','abs(craftHit(vec3(.009,'+(h*.5)+',-.641),vec3(0,'+(-h)+',0),2.,6.,0.,0.).t-.349)<.0005']),
 ['dark after shutdown', 'lum(vec3(-2.,-.090,-.98),vec3(1,0,0),5.,vec2(0))<.00001'],
 ['visible aft plume beside the bell','lum(vec3(-2.,-.090,-.98),vec3(1,0,0),5.,vec2(1,0))>.15'],
 ['exhaust fades astern','lum(vec3(-2.,-.090,-1.054),vec3(1,0,0),5.,vec2(1,0))<lum(vec3(-2.,-.090,-.98),vec3(1,0,0),5.,vec2(1,0))'],
 ['no exhaust before foreground obstruction','lum(vec3(-2.,-.090,-.98),vec3(1,0,0),1.,vec2(1,0))==0.'],
 ['positive yaw lights starboard nozzle','lum(vec3(.199,-1.,-.641),vec3(0,1,0),2.,vec2(0,1))>.12'],
 ['positive yaw leaves port dark','lum(vec3(-.199,-1.,-.641),vec3(0,1,0),2.,vec2(0,1))<.00001'],
 ['braking switches to port','lum(vec3(-.199,-1.,-.641),vec3(0,1,0),2.,vec2(0,-1))>.12'],
 ['integration independent of ray segment count','abs(lum(vec3(.199,-1.,-.641),vec3(0,1,0),2.,vec2(0,1))-lum(vec3(.199,-1.,-.641),vec3(0,1,0),1.,vec2(0,1))-lum(vec3(.199,0.,-.641),vec3(0,1,0),1.,vec2(0,1)))<.0001'],
 ['opaque hull occludes far-side nozzle','hullClip(vec3(-.7,0,-.641),vec3(1,0,0),vec2(0,1))<.00001'],
 ['looking into lit near nozzle','hullClip(vec3(.7,0,-.641),vec3(-1,0,0),vec2(0,1))>.12'],
 ['metal rim matches exhaust position','abs(craftHit(vec3(-.50,.009,-.641),vec3(1,0,0),2.,6.,0.,0.).t-.326)<.0005'],
 ['no emissive paint when gas off','hullClip(vec3(.7,0,-.641),vec3(-1,0,0),vec2(0))==0.'],
];
const shader=`precision highp float;const float PI=3.14159265359;const int uSpectrum=0;uniform float uDetail,uCraftFocusType;
vec3 unit(vec3 n){return n/max(length(n),1e-20);}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
${WARP_JET_GLSL.split('vec3 warpJetSegment(')[0]}
${createCraftGLSL({mask:8})}
float lum(vec3 p,vec3 n,float m,vec2 f){return length(warpJetRay(p,n,m,f));}
float hullClip(vec3 p,vec3 n,vec2 f){CraftSurface s=craftHit(p,n,2.,6.,0.,0.);return lum(p,n,s.t,f);}
void main(){int x=int(gl_FragCoord.x);bool ok=false;
${cases.map((c,i)=>'if(x=='+i+')ok='+c[1]+';').join('\n')}
gl_FragColor=vec4(ok?1.:0.,0,0,1);}`;
const dir=mkdtempSync(join(process.cwd(),'.warp-impulse-'));
try{
 const probes=[0,2].map((uDetail,i)=>({name:'Warp nozzles at LOD '+i,vertex:'attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0,1);}',fragment:shader,firstFrameUniforms:[{name:'uDetail',method:'uniform1f',args:[uDetail]}],snapshot:{width:cases.length,height:1,path:join(dir,i+'.png')}}));
 for(const features of [{warp:true,warpLocal:true,warpOnly:true},{warp:true,photo:true,objectSlots:4},{craft:true,weakField:true},{craft:true,bridge:true,objectSlots:2}]){
  const f=createFragment({...features,craftMask:8});
  probes.push({name:'Propulsion program '+JSON.stringify(features),vertex:probes[0].vertex,fragment:f});
 }
 const run=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify(probes),encoding:'utf8',timeout:90000,maxBuffer:1024*1024});
 assert(!run.error,run.error?.message);if(run.status===77)console.log('SKIP: native EGL unavailable');else{
  assert.equal(run.status,0,run.stdout+run.stderr);
  for(const p of probes.filter(c=>c.snapshot)){
   const png=readFileSync(p.snapshot.path),parts=[];for(let j=8;j<png.length;){const n=png.readUInt32BE(j);if(png.toString('ascii',j+4,j+8)==='IDAT')parts.push(png.subarray(j+8,j+8+n));j+=n+12;}
   const bytes=inflateSync(Buffer.concat(parts));assert.equal(bytes[0],0);
   cases.forEach((c,i)=>assert.equal(bytes[1+i*4],255,p.name+' / '+c[0]));
  }
 }
}finally{rmSync(dir,{recursive:true,force:true});}
console.log('PASS: four corner-mounted aft plumes, signed port/starboard yaw jets, correctly clipped emissive volumes, CPU fallback and isolated, curved, weak-field and photo programs.');

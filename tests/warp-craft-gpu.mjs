// Probe actual selected-shader intersections: an open ring must not turn into
// a solid slab and finer geometry must never alter the registered meter scale.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {inflateSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {JANUS_EYE} from '../dist/janus-hull.js';
import {createCraftGLSL} from '../dist/craft-glsl.js';
import {createFragment} from '../dist/shaders.js';
import {HABITAT_HUB_RADIUS_UNITS as hub,HABITAT_DOCK_FACE_UNITS as pole,HABITAT_HATCH_DEPTH_UNITS as recess} from '../dist/habitat-spin.js';
import {MERIDIAN_LOUNGE_GLSL} from '../dist/cockpit-glsl.js';
import {LEGACY_ENTERPRISE_GEOMETRY} from '../dist/legacy-enterprise-glsl.js';
const model=createCraftGLSL({mask:8});
assert(model.includes('coilRingHit(')&&model.includes('shuttleNasaMark('));
assert(!model.includes('TOS studio-model')&&!model.includes('float registryGlyph('));
assert(LEGACY_ENTERPRISE_GEOMETRY.includes('TOS studio-model'));
const probes=[
 ['pilot looks through the flush bow pane',JANUS_EYE,[0,0,1],null,0,-104],
 ['console is an opaque physical surface below the pane',JANUS_EYE,[0,-.4,.916515],null,1,-104],
 ['copilot headrest is solid inside the cabin',JANUS_EYE,[.905,0,-.425],null,1,-104],
 ['bulkhead behind the seats is solid',JANUS_EYE,[0,.30,-.953939],null,1,-104],
 ['positive pitch lights the bottom +Y axial jet',[-1,.473,.307],[1,0,0],null,1,-100],
 ['positive pitch leaves the upper +Y axial jet dark',[-1,.473,.70],[1,0,0],null,0,-100],
 ['positive roll exhausts toward -Y at +X',[.473,-.061,-1],[0,0,1],null,1,-101],
 ['positive roll leaves counter-facing nozzle cold',[.473,.080,-1],[0,0,1],null,0,-101],
 ['RCS forward thrust fires at bottom rim',[.473,-1,.30],[0,1,0],null,1,-99],
 ['RCS forward thrust leaves top rim dark',[.473,-1,.70],[0,1,0],null,0,-99],
 ['heritage upper bell drives forward',[-1,.078,-.89],[1,0,0],null,1,-102],
 ['heritage lower bells drive forward',[-1,-.0465,-.89],[1,0,0],null,1,-102],
 ['heritage has no corner bell gap emission',[-1,-.18,-.89],[1,0,0],null,0,-102],
 ['Proximity interlock keeps main bells dark',[.13,-1,-.94],[0,1,0],null,0,-99],
 ['Extended collar meets station face',[.052,0,2],[0,0,-1],1.02,62,4,0,1],
 ['Permanent pressure hatch at stowed roof apex',[0,0,2],[0,0,-1],1.15,62,4],
 ['Same hatch remains through extended bore',[.021,0,2],[0,0,-1],1.15,62,4,0,1],
 ['Seated metal roof flange under retracted collar',[.070,0,2],[0,0,-1],1.143,62,4],
 ['Extended bellows sidewall behind the mating face',[.090,0,.952],[-1,0,0],null,65,4,0,1],
 ['retracted iris leaves peripheral glass unchanged',[.39,0,2],[0,0,-1],null,60,4,0],
 ['partial iris covers the rim',[.39,0,2],[0,0,-1],null,66,4,.5],
 ['partial iris leaves crown glass outside the flange exposed',[.083,0,2],[0,0,-1],null,60,4,.5],
 ['grazing ray crosses the crown opening and meets the opposite lip',[-0.102282375,0.000000000,0.986396154],[0.912252648,0.000000000,-0.409628009],0.460107003,66,4,.5],
 ['sealed iris covers crown near the fixed mount',[.083,0,2],[0,0,-1],null,66,4,1],
 ['closed leaves never obscure the fixed pressure hatch',[0,0,2],[0,0,-1],1.15,62,4,1],
 ['lounge sees permanent flange beside lift',[.06,.012,.78],[0,0,1],null,1,-4,0],
 ['lounge sees opaque shaft wall',[.09,.012,.79],[-1,0,0],null,1,-4,0],
 // Negative types dispatch real passenger-view rays from inside the lounge.
 ['open lounge sees sky near crown',[.10,.02,.756],[0,0,1],null,0,-4,0],
 ['partial lounge sees sky near crown',[.10,.02,.756],[0,0,1],null,0,-4,.5],
 ['sealed lounge blocks the same ray',[.10,.02,.756],[0,0,1],null,1,-4,1],
 ['partial lounge blocks edge of sky',[.10,.02,.756],[.985,.165,0],null,1,-4,.5],
 ['open lounge sees sky at same edge',[.10,.02,.756],[.985,.165,0],null,0,-4,0],
 ['continuous 360-degree deck rim',[2,0,.50],[-1,0,0],1.51,61,4],
 ['broadside gap below the disk',[.44,-2,-.28],[0,1,0],null,0,4],
 ['Meridian engine bell lip',[.215,.13,-2],[0,0,1],1.14,62,4],
 ['original Shuttle open wingtip sky',[.43,-2,.39],[0,1,0],null,0,16],
 ['original Shuttle delta wing',[.34,-2,-.51],[0,1,0],null,2,16],
 ['bow', [0,0,2],[0,0,-1],1.080,43],
 ['clear aperture through both rings',[.32,0,2],[0,0,-1],null,0],
 ['forward coil face',[.48,0,2],[0,0,-1],1.484,40],
 ['outer rolling surface',[2,0,.43],[-1,0,0],1.470,40],
 ...[-.090,.090].flatMap(x=>[-.090,.090].map(y=>['engine exhaust lip '+x+','+y,[x+.063,y,-2],[0,0,1],1.080,41])),
 ['central pressure hull between rings',[2,0,0],[-1,0,0],null,null],
 ['diagonal bracing',[.22,.22,2],[0,0,-1],null,41],
 ['aft coil face from inside the pair',[.48,0,0],[0,0,-1],.344,40],
 ['station clear bay',[.26,2,.32],[0,-1,0],null,0,14],
 ['greenhouse viewed from inside',[0,0,.24],[0,0,1],.525,50,14],
 ['walking-deck exterior rim',[0,0,2],[0,0,-1],1.03,51,14],
 ['structural spoke',[.55,2,0],[0,-1,0],1.967,52,14],
 // A chord away from the port follows the sphere on both sides; there is
 // no intervening pressure cylinder or raised end deck in the flight corridor.
 ...[-1,1].flatMap(side=>[
  ['spherical hub shoulder '+side,[.06,side*.27,0],[0,-side,0],.27-Math.sqrt(hub*hub-.06**2),53,14],
  ['flush polar hatch surround '+side,[.006,side*.27,0],[0,-side,0],.27-pole,54,14],
  ['polar capture seal '+side,[.001,side*.27,0],[0,-side,0],.27-pole,54,14],
  ['recessed pressure hatch '+side,[0,side*.27,0],[0,-side,0],.27-pole+recess,54,14]
 ]),
 ['Janus cockpit is glazing', [0,.186,2],[0,0,-1],2-Math.sqrt(.8**2-.186**2),71,18],
 ['Janus service hatch is opaque shell', [0,-.18,2],[0,0,-1],2-Math.sqrt(.8**2-.18**2),70,18],
 ['Janus true sphere spans 5.4 m',[2,0,0],[-1,0,0],1.2,70,18],
 ['Janus has no outboard service packs',[.84,.027,2],[0,0,-1],null,0,18],
 ['classic Enterprise saucer',[0,.056,2],[0,0,-1],null,7,15],
];
const vec=a=>'vec3('+a.map(n=>n.toFixed(6)).join(',')+')';
const cameraShader=createFragment({craft:true,craftMask:2});
const jets=cameraShader.slice(cameraShader.indexOf('vec3 thrusterRay('),cameraShader.indexOf('vec3 thrusterInspectorEmission('));
const fragment=`precision highp float;
const int uSpectrum=0;vec3 uDockTorque;const vec4 uFlightMetrics=vec4(1,0,0,1);vec4 uDockJets;
${jets}
uniform float uDetail,uCraftFocusType;const float PI=3.14159265359;
vec3 unit(vec3 p){return p/max(1e-20,length(p));}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
${createCraftGLSL({mask:2|8|32|64|128|256})}
vec3 surfaceSpectrum(vec3 c,float a,float b,float d){return c;}
${MERIDIAN_LOUNGE_GLSL}
void main(){int p=int(gl_FragCoord.x);vec3 ro,rd;float distance,material,type,closure,extension;
${probes.map(([,origin,ray,d,m,kind=6,travel=0,e=0],i)=>`${i?'else ':''}if(p==${i}){type=${kind.toFixed(1)};closure=${travel.toFixed(3)};extension=${e.toFixed(3)};ro=${vec(origin)};rd=${vec(ray)};distance=${(d??-1).toFixed(5)};material=${(m??-1).toFixed(1)};}`).join('\n')}
if(type< -103.5){gl_FragColor=vec4(janusCabin(ro,rd).a==material?1.0:0.0,0,0,1);return;}
if(type< -101.5){uDockTorque=vec3(0);uDockJets=vec4(0);float lum=length(thrusterRay(ro,rd,10.0,true));gl_FragColor=vec4(((material>.5&&lum>.1)||(material<.5&&lum<.00001))?1.0:0.0,0,0,1);return;}
if(type< -98.0){uDockTorque=type< -100.5?vec3(0,0,1):type< -99.5?vec3(1,0,0):vec3(0);uDockJets=type< -99.5?vec4(0,0,0,1):vec4(0,0,1,1);float lum=length(thrusterRay(ro,rd,10.0,false));gl_FragColor=vec4(((material>.5&&lum>.1)||(material<.5&&lum<.00001))?1.0:0.0,0,0,1);return;}
if(type<0.0){gl_FragColor=vec4(meridianLounge(ro,rd,closure).a==material?1.0:0.0,0,0,1);return;}
CraftSurface s=craftHit(ro,rd,10.0,type,closure,extension);
bool ok=material==0.0?s.t>10.0:material<0.0?(s.t>1.80&&s.t<1.86):s.material==material&&(distance<0.0||abs(s.t-distance)<.0002);
gl_FragColor=vec4(ok?1.0:0.0,0.0,0.0,1.0);}`;
const dir=mkdtempSync(join(process.cwd(),'.warp-gpu-'));
try{
 const cases=[0,2].map(detail=>({name:'Warp Explorer LOD '+detail,vertex:'attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0,1);}',fragment,
 firstFrameUniforms:[{name:'uDetail',method:'uniform1f',args:[detail]}],snapshot:{width:probes.length,height:1,path:join(dir,detail+'.png')}}));
 const run=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify(cases),encoding:'utf8',timeout:45000});
 assert(!run.error,run.error?.message);
 if(run.status===77){console.log('SKIP: native EGL/GLES unavailable.');}
 else{
  assert.equal(run.status,0,run.stdout+run.stderr);
  for(const c of cases){
   const png=readFileSync(c.snapshot.path);let idat=[];
   for(let off=8;off<png.length;){let len=png.readUInt32BE(off);if(png.toString('ascii',off+4,off+8)==='IDAT')idat.push(png.subarray(off+8,off+8+len));off+=len+12;}
   const row=inflateSync(Buffer.concat(idat));assert.equal(row[0],0);
   probes.forEach(([name],i)=>assert.equal(row[1+i*4],255,c.name+': '+name));
  }
  console.log('PASS: native rays resolve the warp coils, station bays, clear/partially shielded/sealed Meridian exterior and lounge, docks, classic Enterprise and calibrated hull extents at low and high detail.');
 }
}finally{rmSync(dir,{recursive:true,force:true});}

import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {inflateSync} from 'node:zlib';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {createFragment,VERTEX} from '../dist/shaders.js';
import {fixture} from './render-fixture.mjs';

const f=fixture({width:800,height:600}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.loadScene('solar-system');r.update({blackHole:true,mass:4.3,grid:true});
const sun=r.objects.find(o=>o.name==='Sun');r.reparentObject(sun.id,'primary');r.updateObject(sun.id,{radius:10000000});r.focusTarget(sun.id,'track');
const mod=(v,b)=>((v%b)+b)%b;
for(const frequency of [.5,1,1.25,2,3]){
 r.state.sceneGridDensity=frequency;r.state.warpGridDensity=1.5;r.render();
 assert.deepEqual(f.uniforms.get('uGridDensity').args,[frequency,1.5]);
 const world=f.uniforms.get('uWorldOrigin').args[0],anchor=f.uniforms.get('uGridAnchor').args,high=f.uniforms.get('uGridHigh').args[0];
 const base=.75/frequency,axes=[r.configCache.primaryBasis[0],r.configCache.primaryBasis[2]];
 for(let i=0;i<2;i++)for(const multiple of [1,2,8,1024,2048]){
  const absolute=axes[i].reduce((v,x,k)=>v+x*world[k],0)/anchor[3];
  const spacing=base*multiple,local=mod(anchor[i]+mod(high[i],multiple)*base,spacing),target=mod(absolute,spacing);
  const diff=Math.abs(local-target);
  assert(Math.min(diff,spacing-diff)<1e-5,'Remote chart keeps its world-space phase at every screen LOD and density');
 }
 const still=r.beginPhotoCapture();
 assert.deepEqual(still.uniforms.find(x=>x.name==='uGridDensity').args,[frequency,1.5]);r.endPhotoCapture();
}
r.loadScene('gravity-anomaly');r.render();
const axis=r.configCache.primaryAxis,nearSheetAngle=Math.abs(r.cameraFrame.forward.reduce((sum,x,i)=>sum+x*axis[i],0));
assert(r.state.grid&&!r.state.warpGridOnly&&r.state.sceneGridDensity>1);
assert(nearSheetAngle>.35,'The opening eye looks down onto the anomaly sheet instead of edge-on');
assert.equal(r.cameraGuide,'warp-side','The entire protective bubble remains fitted at this oblique angle');
r.dispose();

const recorder=new CpuCommandCanvas();recorder.getBoundingClientRect=f.canvas.getBoundingClientRect;
const cpu=new CpuRenderer(recorder,{autoStart:false,bindControls:false});
cpu.loadScene('warp-lab');cpu.update({grid:true});cpu.fillHoles();cpu.fillObjects();cpu.updateCameraFrame();
recorder.width=1600;recorder.height=900;
const count=(scene,warp)=>{
 cpu.state.sceneGridDensity=scene;cpu.state.warpGridDensity=warp;
 let host=0,patch=0;
 cpu.drawHostGridLine=()=>host++;
 cpu.drawLine=()=>patch++;
 cpu.grid();
 return [host,patch];
};
const lo=count(1,1),hd=count(2,1),wd=count(1,2);
assert(lo.every(x=>x>0));assert(hd[0]>=lo[0]*1.8);assert.equal(hd[1],lo[1]);
assert.equal(wd[0],lo[0]);assert(wd[1]>lo[1]*1.5);
cpu.dispose();

// Read the actual GLSL line masks along an unobstructed horizontal scan.
// The red channel is the native scene sheet, green the flat warp interior.
const fragment=createFragment({grid:true,warp:true,craftMask:8,objectSlots:2,photo:true});
const body=fragment.slice(0,fragment.lastIndexOf('void main(){'))+`void main(){
 float x=gl_FragCoord.x/uResolution.x;
 vec3 topDown=vec3(0.,-1.,0.);
 float host=coordinateGridStroke(vec3(.060+3.*x,.12,1.),topDown,0.,.0001).a;
 float warp=warpGridAt(vec3(-.698+.64*x,0.,.037),vec3(0.,1.,0.),topDown,0.).a;
 gl_FragColor=vec4(step(.013,host),step(.017,warp),0.,1.);
}`;
const dir=mkdtempSync(join(process.cwd(),'.grid-density-'));
try{
 const cases=[[1,1],[2,1],[1,2]].map(([a,b])=>({name:'Density '+a+' '+b,vertex:VERTEX,fragment:body,
  firstFrameUniforms:[{name:'uPrimaryAxis',method:'uniform3f',args:[0,1,0]},{name:'uWarpGridRotation',method:'uniform2f',args:[1,0]},
   {name:'uGridAnchor',method:'uniform4f',args:[0,0,0,1]},{name:'uGridDensity',method:'uniform2f',args:[a,b]}],
  snapshot:{width:1024,height:1,path:join(dir,a+'-'+b+'.png')}}));
 const run=spawnSync('python3',['tests/native-glsl.py'],{input:JSON.stringify(cases),encoding:'utf8',timeout:45000});
 assert(!run.error,run.error?.message);if(run.status===77)console.log('SKIP: native GPU not available.');
 else {
  assert.equal(run.status,0,run.stderr+run.stdout);
  const counts=cases.map(c=>{
   const png=readFileSync(c.snapshot.path),chunks=[];for(let i=8;i<png.length;){const n=png.readUInt32BE(i);if(png.toString('ascii',i+4,i+8)==='IDAT')chunks.push(png.subarray(i+8,i+8+n));i+=12+n;}
   const row=inflateSync(Buffer.concat(chunks));assert.equal(row[0],0);
   return [0,1].map(channel=>{let peaks=0,prev=0;for(let i=1+channel;i<row.length;i+=4){if(row[i]>prev)peaks++;prev=row[i];}return peaks;});
  });
  assert.deepEqual(counts,[[4,4],[8,4],[4,8]],'Each slider doubles only its own rendered spatial frequency');
 }
}finally{rmSync(dir,{recursive:true,force:true});}
console.log('PASS: independent warp and world grid line counts in Canvas and native GLSL, fractional-density astronomical anchors, and frozen still settings.');

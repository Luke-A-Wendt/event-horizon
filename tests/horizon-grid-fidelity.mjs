import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {inflateSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {compactGridLineSamples} from '../dist/grid-glsl.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {createFragment,VERTEX} from '../dist/shaders.js';
import {fixture} from './render-fixture.mjs';

// CPU schematic: do not spend vertices on the flat far field, or let
// a coarse chord join opposite sides of the capture radius.
const near=compactGridLineSamples(30,5,.5,0,1,2,0),far=compactGridLineSamples(30,5,18,0,1,2,0);
assert.equal(far.length,11);assert(near.length>far.length&&near.length<200);
assert(near.every((x,i)=>!i||x>near[i-1]));
assert(near.some((x,i)=>i&&x>1.8&&x<2.3&&x-near[i-1]<.25));
const dir=mkdtempSync(join(process.cwd(),'.horizon-grid-test-')),w=400,h=264,cases=[];
try{
 for(const scene of ['geometry','grid-kerr']){
  const f=fixture({width:w,height:h}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
  r.loadScene(scene);r.setQuality('high');r.sceneLoad=null;r.camera={...r.target};r.fillObjects();r.updateCameraFrame();
  const options={...r.shaderFeatures(),ultra:false,derivatives:true,derivativeExtension:true};
  for(const [time,angle,steps] of [[0,0,192],[8,.69,76]]){
   r.time=time;
   if(angle){r.camera.pitch=r.target.pitch=angle;r.camera.yaw=r.target.yaw=.3;}
   r.fillHoles();r.updateCameraFrame();r.drawScene(r.cameraFrame,{width:w,height:h,steps,detail:2});
   const name=scene+'-'+time;cases.push({name,vertex:VERTEX,fragment:createFragment(options),firstFrameUniforms:[...f.uniforms].map(([name,uniform])=>({name,...uniform})),snapshot:{width:w,height:h,path:join(dir,name+'.png')}});
  }
  if(scene==='geometry'){
   r.loadScene(scene);r.sceneLoad=null;r.camera={...r.target};r.getFocusFrame();
   const planet=r.addChildObject('space','planet',{x:8*RG,y:12*RG,z:0,radiusMeters:1.8*RG,massSolar:.000003});
   assert(planet);r.fillObjects();r.updateCameraFrame();
   const opts={...r.shaderFeatures(),ultra:false,derivatives:true,derivativeExtension:true};assert(opts.horizonGrid);
   r.drawScene(r.cameraFrame,{width:w,height:h,steps:192,detail:2});
   const u=[...f.uniforms].map(([name,uniform])=>({name,...uniform}));
   for(const visible of [true,false]){const uniforms=structuredClone(u);if(!visible)uniforms.find(x=>x.name==='uFlags').args[0]=0;
    const name=visible?'foreground-grid':'foreground-no-grid';cases.push({name,vertex:VERTEX,fragment:createFragment(opts),firstFrameUniforms:uniforms,snapshot:{width:w,height:h,path:join(dir,name+'.png')}});}
   r.update({binary:true});assert(!r.shaderFeatures().horizonGrid,'binary rendering retains its existing compositor');
  }
  r.dispose();
 }
 const result=spawnSync('python3',['tests/native-glsl.py'],{input:JSON.stringify(cases),encoding:'utf8',timeout:180000,maxBuffer:1000000});
 if(result.status===77)console.log('SKIP: native GL unavailable');
 else{
  assert.equal(result.status,0,String(result.error||'')+result.stderr+result.stdout);
  const photos={};for(const c of cases){
   const png=readFileSync(c.snapshot.path),chunks=[];
   for(let i=8;i<png.length;){const n=png.readUInt32BE(i);if(png.toString('ascii',i+4,i+8)==='IDAT')chunks.push(png.subarray(i+8,i+8+n));i+=n+12;}
   const raw=inflateSync(Buffer.concat(chunks)),stride=4*w+1;
   if(c.name.startsWith('foreground-')){photos[c.name]=raw;continue;}
   function blue(x,y){return raw[y*stride+1+4*x+2];}
   // Compare isolated pixel contrast to brightness in the lensed annulus.
   // A blank or globally blurred diagram must not pass these checks.
   let energy=0,mean=0,count=0,farPeak=0;
   for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const d=Math.hypot(x+.5-w/2,y+.5-h/2)/h;
    if(d>.28&&d<.60)farPeak=Math.max(farPeak,blue(x,y));
    if(d<.13||d>.161||Math.abs(x-w/2)<2||Math.abs(y-h/2)<2)continue;
    const px=blue(x,y),q=[];for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)q.push(blue(x+i,y+j));
    energy+=(px-q.sort((a,b)=>a-b)[4])**2;mean+=px;count++;
   }
   const contrast=energy*count/(mean*mean);console.log(c.name,'annular pixel contrast',contrast.toFixed(3),'mean',Math.round(mean/count));
   assert(farPeak>60&&mean/count>9,'keep visible outer lines and secondary light');
   assert(contrast<(c.name.endsWith('-0')?.63:.19),'subpixel grid crossings must not turn into disconnected bright samples');
  }
  // Where an opaque foreground planet covers the sheet, toggling the grid
  // leaves the neutral surface unchanged; the nearby exposed lines do change.
  const on=photos['foreground-grid'],off=photos['foreground-no-grid'];let surface=0,covered=0,open=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*(4*w+1)+1+4*x;const neutral=off[i]>25&&Math.abs(off[i]-off[i+2])<3;
   const delta=Math.abs(on[i+2]-off[i+2]);if(neutral){surface++;if(delta<2)covered++;}else if(delta>12)open++;
  }
  assert(surface>70&&covered>surface*.97&&open>500,'foreground actually occludes the refined grid');
 }
}finally{rmSync(dir,{force:true,recursive:true});}
console.log('PASS: near-horizon sampling preserves the rectangular chart in native Low and High frames and the CPU mesh.');

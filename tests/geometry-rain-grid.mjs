import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inflateSync} from 'node:zlib';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {geometryRainChart,geometryRainPeriod,geometryRainPose,geometryRainRadius,geometryRainLabel,geometryRainTwist,RAIN_PRIMITIVES_GLSL} from '../dist/geometry-rain.js';
import {coordinateGridGLSL} from '../dist/grid-glsl.js';
import {fixture} from './render-fixture.mjs';

const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
const cases=[],temp=mkdtempSync(join(process.cwd(),'.grid-rain-check-'));
const vs='attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0,1);}';
const sheet=coordinateGridGLSL().split('vec4 rainGridAt(')[1].split('vec4 coordinateGridAt(')[0];
try{
 for(const [id,density] of [['geometry-freefall',.5],['geometry-freefall-kerr',2]]){
  r.loadScene(id);r.update({sceneGridDensity:density});
  const init=geometryRainChart(r),P=geometryRainPeriod(init.startRadius,init.endRadius,init.mass,init.spin);
  for(const cycles of [.15,.68,.995,1,12.87]){
   r.time=cycles*P;r.render();const body=r.objectFrames.find(o=>o.rainChart),c=geometryRainChart(r);
   const origin=f.uniforms.get('uRainOrigin').args,flow=f.uniforms.get('uRainFlow').args;
   const loc=body.position.map((v,i)=>v-r.renderOrigin[i]),R=Math.hypot(...body.position.map((v,i)=>v-c.center[i]));
   // Construct a control point midway between adjacent material lines. Both
   // it and the tracer are fed through the actual fragment function, below.
   const rings=2*Math.max(1,Math.round(2*density)),spokes=4*Math.round(5*density),end=flow[0];
   const hh=geometryRainLabel(R,c.startRadius,c.mass,c.spin)+.5*(1-end)/rings,rr=geometryRainRadius(hh,c.startRadius,c.endRadius,c.mass,c.spin)/c.startRadius;
   const phi=flow[3]+Math.PI/spokes+6*geometryRainTwist(rr*c.startRadius,c.startRadius,c.mass,c.spin);
   const x=c.startRadius*rr*Math.cos(phi),z=c.startRadius*rr*Math.sin(phi);
   const clear=c.center.map((v,i)=>v-r.renderOrigin[i]+r.configCache.primaryBasis[0][i]*x+r.configCache.primaryBasis[2][i]*z);
   const near=(a,b,tol=1e-7)=>assert(Math.abs(a-b)<tol,`${a} vs ${b}`);
   const cpuPaths=[],context={state:r.state,configCache:r.configCache,cameraFrame:r.cameraFrame,drawLine:points=>cpuPaths.push(points)};
   for(const _ of CpuRenderer.prototype.rainGridStages.call(context,c)){}
   const radius=point=>Math.hypot(...point.map((v,i)=>v-c.center[i]));
   // Rendered CPU rings include a complete circle at the tracer radius, and
   // its center is also on the drawn curved material spoke (within tessellation).
   assert(cpuPaths.some(line=>line.length===73&&line.every(point=>Math.abs(radius(point)/R-1)<1e-7)));
   const distToSegment=(p,a,b)=>{const ab=b.map((x,i)=>x-a[i]),ap=p.map((x,i)=>x-a[i]),dot=(v,w)=>v.reduce((sum,x,i)=>sum+x*w[i],0);
    const t=Math.max(0,Math.min(1,dot(ab,ap)/dot(ab,ab)));return Math.hypot(...ap.map((x,i)=>x-t*ab[i]));};
   assert(cpuPaths.some(line=>line.length===37&&line.some((p,i)=>i&&distToSegment(body.position,line[i-1],p)<.003*R)));
   if(cycles===1){near(R/c.startRadius,1);assert.equal(flow[2],0);}
   if(cycles!==1){
    const eps=1e-6*P,before=geometryRainPose(c.elapsed-eps,c.startRadius,c.endRadius,c.mass,c.spin),after=geometryRainPose(c.elapsed+eps,c.startRadius,c.endRadius,c.mass,c.spin);
    const current=geometryRainPose(c.elapsed,c.startRadius,c.endRadius,c.mass,c.spin);
    near((after.radius-before.radius)/(2*eps*current.radialSpeed),1);
    if(c.spin)near((after.angle-before.angle)/(2*eps*current.angularSpeed),1);
   }
   const frag=`precision highp float;
   const float PI=3.141592653589793;uniform vec4 uRainOrigin,uRainFlow,uRainKerr;uniform vec2 uGridDensity;
   uniform vec3 aTracer,aGap;vec3 coordinateGridChart(vec3 p){return p;}vec3 coordinateGridNormal(){return vec3(0,1,0);}
   ${RAIN_PRIMITIVES_GLSL}
   vec4 rainGridAt(${sheet}
   void main(){vec3 q=gl_FragCoord.x<1.0?aTracer:aGap;gl_FragColor=vec4(rainGridAt(q,vec3(0,-1,0),uRainOrigin.w,0.0004).rgb,1);}`;
   cases.push({name:id+' @ '+cycles,vertex:vs,fragment:frag,snapshot:{path:join(temp,cases.length+'.png'),width:2,height:1},
    firstFrameUniforms:[{name:'uRainKerr',method:'uniform4f',args:f.uniforms.get('uRainKerr').args},{name:'uRainOrigin',method:'uniform4f',args:origin},{name:'uRainFlow',method:'uniform4f',args:flow},{name:'uGridDensity',method:'uniform2f',args:[density,1]},{name:'aTracer',method:'uniform3fv',args:[loc]},{name:'aGap',method:'uniform3fv',args:[clear]}]});
  }
 }
 r.loadScene('disk');r.render();assert.equal(f.uniforms.get('uRainOrigin').args[3],0,'The moving teaching chart does not leak into later scenes.');
 const run=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify(cases),encoding:'utf8',timeout:45000});
 assert(!run.error,run.error?.message);if(run.status===77)console.log('SKIP: no native EGL/GLES context.');else{
  assert.equal(run.status,0,run.stderr+run.stdout);
  for(const c of cases){const png=readFileSync(c.snapshot.path),blocks=[];for(let i=8;i<png.length;){const n=png.readUInt32BE(i);if(png.toString('ascii',i+4,i+8)==='IDAT')blocks.push(png.subarray(i+8,i+8+n));i+=n+12;}
   const row=inflateSync(Buffer.concat(blocks));assert(row[3]>190,c.name+' tracer stays on a luminous crossing');assert(row[7]<10,c.name+' control remains between material lines');}
 }
 console.log('PASS: falling grid and tracer share actual rendered intersections across infall, frame dragging, different densities and replay boundaries.');
}finally{r.dispose();rmSync(temp,{force:true,recursive:true});}

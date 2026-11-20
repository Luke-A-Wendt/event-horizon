import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {restoreRenderer} from '../dist/render-state.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {captureAnnotationFrame} from '../dist/annotations.js';
import {geometryRainPeriod,geometryRainPose} from '../dist/geometry-rain.js';
import {fixture} from './render-fixture.mjs';
const near=(x,y,tol=1e-8)=>assert(Math.abs(x-y)<=tol*Math.max(1e-20,Math.abs(x),Math.abs(y)),`${x} ≠ ${y}`);
const mk=(width=1296,height=789)=>new BlackHoleRenderer(fixture({width,height}).canvas,{autoStart:false,bindControls:false,deferProgram:true});
const sample=(r,t)=>{r.time=t;r.fillHoles();r.fillObjects();r.updateCameraFrame();return r.objectFrames.find(f=>f.type==='probe');};
const r=mk(),restored=mk();
for(const scene of ['geometry-freefall','geometry-freefall-kerr']){
 r.loadScene(scene);
 const f=sample(r,0),{startRadius,endRadius,mass}=f.rainChart,T=geometryRainPeriod(startRadius,endRadius,mass,f.rainChart.spin);
 near(T/r.simulationTimeScale(),12,1e-6);near(Math.hypot(...f.position),startRadius);
 let last=startRadius;for(let i=1;i<100;i++){
  const q=sample(r,T*i/100),radius=Math.hypot(...q.position);
  assert(radius<last&&radius>endRadius);last=radius;
  assert.deepEqual(q.gridRelativeVelocity,[0,0,0]);assert(q.index>=0&&q.drawRadius>q.radius);
  if(scene==='geometry-freefall')near(q.position[2],0);else assert(q.position[2]<0,'drag must have prograde handedness');
 }
 const before=sample(r,T*(1-1e-8));near(Math.hypot(...before.position),endRadius,1e-6);
 near(Math.hypot(...sample(r,T).position),startRadius);
 const mid=T*.68;let q=sample(r,mid);const expected=q.position.slice(),vel=q.velocity.slice(),step=T*1e-6;
 const left=sample(r,mid-step).position.slice(),right=sample(r,mid+step).position.slice();
 for(let j=0;j<3;j++)near((right[j]-left[j])/(2*step),vel[j],1e-7);
 sample(r,mid);restoreRenderer(restored,parseScene(serializeScene(r)));
 assert.deepEqual(restored.objectFrames.find(b=>b.type==='probe').position,expected,'saved mid-fall pose');
 assert.deepEqual(restored.objectFrames.find(b=>b.type==='probe').gridRelativeVelocity,[0,0,0]);
}
// Check the computed path, not merely the ODE that generated it. Differentiate
// positions, return to BL coordinates outside the horizon, then contract with
// the exact Kerr metric. Geometric units M=c=1 (c=18 in the renderer).
for(const a of [-.998,-.5,0,.5,.998]){
 const rp=1+Math.sqrt(1-a*a),start=8,P=geometryRainPeriod(start,rp,1,a),step=2e-5*P;
 const pose=t=>geometryRainPose(t,start,rp,1,a);
 let simpson=0;
 for(let j=0;j<=1024;j++){
  const R=rp+(start-rp)*j/1024;
  simpson+=(j===0||j===1024?1:j%2?4:2)*Math.sqrt(R**3/(2*(R*R+a*a)));
 }
 near(P*18,simpson*(start-rp)/3072,1e-9);
 for(const phase of [.01,.19,.5,.8,.97]){
  const t=P*phase,R=pose(t).radius,prev=pose(t-step),next=pose(t+step);
  const ur=(next.radius-prev.radius)/(2*step*18),psi=-(next.angle-prev.angle)/(2*step*18);
  const B=R*R+a*a,delta=B-2*R,w=Math.sqrt(2*R/B);
  const ut=1-B*w*ur/delta,uphi=psi-2*a*R/(B*delta)*ur;
  const gtt=-(1-2/R),gtp=-2*a/R,gpp=B+2*a*a/R;
  assert(Math.abs(-(gtt*ut+gtp*uphi)-1)<5e-7,'E=1');
  assert(Math.abs(gtp*ut+gpp*uphi)<5e-7,'Lz=0');
  assert(Math.abs(gtt*ut*ut+2*gtp*ut*uphi+gpp*uphi*uphi+R*R/delta*ur*ur+1)<2e-6,'u.u=-1 in Kerr');
 }
}
for(const [width,height] of [[1296,789],[390,600]]){
 const orbit=mk(width,height);orbit.loadScene('geometry-orbit');const f=sample(orbit,0),mag=Math.hypot(...f.gridRelativeVelocity);
 for(let i=0;i<24;i++){
  const q=sample(orbit,i*20*orbit.simulationTimeScale()/24);
  near(Math.hypot(...q.gridRelativeVelocity),mag);assert(q.drawRadius>q.radius&&q.index>=0);
  assert(captureAnnotationFrame(orbit).objectFrames.some(b=>b.id===q.id&&b.anchor&&b.labelEligible));
 }
 orbit.update({annotations:false,velocityArrows:false});assert(sample(orbit,0).drawRadius>f.radius,'bead survives without either overlay');
 orbit.dispose();
}
restored.dispose();r.dispose();console.log('PASS: resolved orbit marker and label, constant grid-relative orbital speed, comoving falls, Kerr handedness, chart velocities, exact boundary loops and saved mid-fall poses.');

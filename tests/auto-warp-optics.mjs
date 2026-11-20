import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {fixture} from './render-fixture.mjs';

const close=(a,b,e=1e-6)=>assert(Math.abs(a-b)<e,`${a} ≠ ${b}`);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const rect={width:960,height:632};
function setup(id){
 const gl=fixture(rect),r=new BlackHoleRenderer(gl.canvas,{autoStart:false,bindControls:false});
 r.loadScene(id);r.setQuality('high');r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
 const tick=()=>{r.advanceSimulation(r.lastTime+50);r.fillHoles();r.fillObjects();r.updateCameraFrame();};
 const draw=()=>{r.requestProgram();r.drawScene(r.cameraFrame);};
 const uniform=name=>gl.uniforms.get(name).args.flat();
 return {r,tick,draw,uniform};
}
const lab=setup('warp-lab');for(let i=0;i<200;i++)lab.tick();
lab.draw();
for(const id of ['earth-vulcan','warp-proxima-direct','warp-sgra-direct']){
 const {r,tick,draw,uniform}=setup(id);
 let last,cruise=false;
 for(let i=0;i<1600;i++){
  tick();
  if(r.transfer?.distanceMeters>1e14){
   const frame=r.cameraFrame,now={ray:frame.forward,range:frame.subjectRange};
   if(last){assert(dot(now.ray,last.ray)>Math.cos(.095),'no cuts on the cruise camera move');assert(Math.abs(Math.log(now.range/last.range))<.04,'continuous dolly');}
   last=now;
   if(r.transfer.progress>=.51){cruise=true;break;}
  }
 }
 assert(cruise,'reached cruise on '+id);draw();
 const ship=r.getFocusFrame(),motion=r.warpMotionState();
 close(r.state.warpFactor,4);close(motion.rate,lab.r.warpMotionState().rate,1e-6);
 close(motion.blend,1);assert(motion.phase>.01);
 const style=uniform('uWarpStarStyle');style.forEach((v,i)=>close(v,lab.uniform('uWarpStarStyle')[i],3e-4));
 close(uniform('uWarpStrength')[0],lab.uniform('uWarpStrength')[0]);
 close(uniform('uWarpRadius')[0]/ship.radius,lab.uniform('uWarpRadius')[0]/lab.r.getFocusFrame().radius);
 assert.deepEqual(uniform('uWarpFlags').slice(0,3),[1,1,1]);
 uniform('uDriveForward').forEach((v,i)=>close(v,ship.frame[2][i]));
 assert(Math.abs(dot(r.cameraFrame.forward,ship.frame[2]))<.01);
 close(r.cameraFrame.subjectRange/ship.radius,lab.r.cameraFrame.subjectRange/lab.r.getFocusFrame().radius,1e-5);
 const workerCanvas=new CpuCommandCanvas();workerCanvas.getBoundingClientRect=r.canvas.getBoundingClientRect;
 const cpu=new CpuRenderer(workerCanvas,{autoStart:false,bindControls:false});
 restoreRenderer(cpu,snapshotRenderer(r));assert.deepEqual(cpu.warpMotionState(),motion);
 function stars(){workerCanvas.beginFrame();cpu.sky();return workerCanvas.takeFrame().commands.filter(c=>c[0]==='ellipse'||c[0]==='arc');}
 const a=stars(),phase=r.warpLocalGridPhase;tick();
 restoreRenderer(cpu,snapshotRenderer(r,{includeObjects:false,objectIds:[r.driveId]}));
 assert(a.length>0);assert.notDeepEqual(a,stars(),'the CPU sky advances with host pose packets');
 close((r.warpMotionState().phase-motion.phase)/.05,lab.r.warpMotionState().rate,1e-6);
 const labPhase=lab.r.warpLocalGridPhase;lab.tick();close(r.warpLocalGridPhase-phase,lab.r.warpLocalGridPhase-labPhase);
 r.state.speed=.5;const before=r.warpMotionState().phase;tick();close((r.warpMotionState().phase-before)/.05,.5*lab.r.warpMotionState().rate,1e-6);
 const paused=r.warpMotionState();r.state.paused=true;tick();assert.deepEqual(r.warpMotionState(),paused);
 cpu.dispose();r.dispose();
}
lab.r.dispose();
console.log('PASS: Enterprise and both NASA Auto routes share the laboratory warp exposure, field, sky and grid speed; CPU worker poses, pauses and cruise framing agree.');

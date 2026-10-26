import assert from 'node:assert/strict';
import {createOpticalContext,opticalForce,traceProjection,projectShadow,prepareDirectOcclusion,projectDirectVisible} from '../dist/optical-projection.js';

const frame={observer:[0,0,10],forward:[0,0,-1],right:[1,0,0],up:[0,1,0],inspectIndex:-1,hideIndex:-1};
const renderer={state:{blackHole:true,binary:true,lensing:true,spectrum:'geometry'},configCache:{horizon:[0,0],bounds:100,primaryAxis:[0,1,0],secondaryAxis:[0,1,0]},cameraFrame:frame,holeData:[0,0,0,0,0,0,0,0],canvas:{getBoundingClientRect:()=>({width:900,height:650})},objectFrames:[],massScale:1,steps:144,mergerComplete:true};
const context=createOpticalContext(renderer);
assert.deepEqual(context.holes,[],'Zero sources vanish from optical and occlusion contexts');
assert.deepEqual(opticalForce(context,[0,0,0],[0,0,-1]),[0,0,0]);
assert.deepEqual(opticalForce({...context,holes:[{mass:0,center:[0,0,0],axis:[0,1,0],spin:.9}]},[0,0,0],[0,0,-1]),[0,0,0],'An explicit zero source never makes a 0/0 force');
const ray=traceProjection(context,{x:0,y:0},[0,0,0]);assert(ray);assert.deepEqual(ray.point,[0,0,0]);assert.equal(ray.blocked,null);
assert.equal(projectShadow(context,{id:'primary',radius:0,position:[0,0,0]}),null,'No phantom zero-radius shadow label');
renderer.holeData[7]=2;renderer.configCache.horizon[1]=3;
const residual=createOpticalContext(renderer);assert.equal(residual.holes.length,1);assert.equal(residual.holes[0].id,'secondary','An unequal white-hole residual is not dropped merely because the prescribed merger finished');

// A shell is not a solid globe. Its star is visible through the removed cap
// and from the interior, but is blocked by an intact exterior wall.
const shell={id:'shell',index:0,type:'dyson',center:[0,0,0],radius:2,dysonCutaway:.38,opacity:1};
const base={origin:[0,0,0],observer:[0,0,4],forward:[0,0,-1],right:[1,0,0],up:[0,1,0],fov:.83,aspect:1.5,hideIndex:-1,occluders:[shell]};
for(const indexed of [false,true]){
 const prepare=c=>indexed?prepareDirectOcclusion(c):c;
 assert(projectDirectVisible(prepare({...base}),[0,0,0],'star'),'Central star visible through +Z cutaway');
 assert.equal(projectDirectVisible(prepare({...base,observer:[0,0,-4],forward:[0,0,1],right:[-1,0,0]}),[0,0,0],'star'),null,'Closed rear shell blocks the star');
 assert(projectDirectVisible(prepare({...base,observer:[0,0,1]}),[0,0,0],'star'),'Observer inside the shell can see central star');
 assert.equal(projectDirectVisible(prepare({...base,occluders:[{...shell,dysonCutaway:0}]}),[0,0,0],'star'),null,'A fully closed shell blocks exterior view');
}
console.log('PASS: exact-zero compact sources have no optical force, occlusion or shadow; unequal residual remains; hollow Dyson shell/cutaway visibility matches inside and outside observers with and without broadphase.');

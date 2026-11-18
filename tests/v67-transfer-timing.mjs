import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>a.map(v=>v/Math.hypot(...a)),dist=(a,b)=>Math.hypot(...sub(a,b));
for(const scene of ['shuttle-earth-moon-loop','shuttle-earth-mars-loop']){
 const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene(scene);r.sceneLoad=null;r.state.paused=false;
 const craft=r.objects.find(o=>o.type==='shuttle'),up=r.configCache.primaryBasis[1];let flight=null,legs=0,plane=null,originBefore;
 const body=id=>r.getFocusFrame(id).position.map(v=>v*RG);
 const ship=()=>body(craft.id);
 for(let i=0;i<=900;i++){
  const t0=1000+i*1000/30;r.now=()=>t0;r.advanceSimulation(t0);r.fillObjects();
  const t=r.transfer;
  if(!flight&&t){
    flight=t;assert.equal(t.wallSeconds,10);assert(t.straight);
    const leg=t.tangentLeg;originBefore=body(leg.sourceId);
    assert(Math.abs(i/30-(legs*15+5))<.035,`line launched at ${i/30}`);
    for(const [p,id,rad] of [[leg.start,leg.sourceId,leg.departureRadius],[leg.end,leg.targetId,leg.arrivalRadius]]){
      const v=sub(p,body(id)),radial=v.map((x,j)=>x-up[j]*dot(v,up));
      assert(Math.abs(Math.hypot(...radial)/rad-1)<1e-9);
      assert(dot(unit(cross(up,radial)),leg.tangent)>1-1e-10);
    }
    if(plane!=null)assert(Math.abs(dot(leg.start,up)-plane)<.02);plane=dot(leg.start,up);
  }
  if(t){
   assert(dist(originBefore,body(t.tangentLeg.sourceId))<.02);
   const offset=sub(ship(),t.points[0]),axis=t.tangent;
   assert(Math.hypot(...cross(offset,axis))<.05,'Ship is collinear with the exact contact line');assert(Math.abs(dot(ship(),up)-plane)<.05);
  }
  if(flight&&!t){
   assert(Math.abs(i/30-(legs+1)*15)<.035);assert(dist(ship(),flight.points[1])<.1,'No arrival teleport');
   assert.equal(craft.parentId,flight.targetId);flight=null;legs++;
  }
 }
 assert.equal(legs,2,scene+' completes two distinct arcs and two transfers in 30 s');r.dispose();
}
console.log('PASS Earth–Moon and Earth–Mars full 30-second round trips: five-second arcs, ten-second straight legs, coplanar external tangency and continuous arrival.');

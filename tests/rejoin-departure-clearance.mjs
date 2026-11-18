import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});r.loadScene('shuttle-earth-mars-loop');r.sceneLoad=null;r.state.paused=false;
const ship=r.objects.find(o=>o.type==='shuttle'),earth=r.objects.find(o=>o.name==='Earth'),mars=r.objects.find(o=>o.name==='Mars');
r.setNavigationMode(ship.id,'manual');r.lastTime=1000;for(let i=1;i<=8;i++)r.advanceSimulation(1000+50*i);
assert.equal(r.setNavigationMode(ship.id,'auto').mode,'auto');const stage=r.transfer;assert(stage.capture&&stage.tangentLeg.clearanceStage);
function clearsEarth(t){
 const body=r.getFocusFrame(earth.id),rel=body.position.map((v,i)=>v*RG-t.points[0][i]);
 const along=Math.max(0,Math.min(t.tangentLeg.length,rel.reduce((s,v,i)=>s+v*t.tangent[i],0)));
 assert(Math.hypot(...rel.map((v,i)=>v-along*t.tangent[i]))>(body.radius+r.getFocusFrame(ship.id).radius)*RG);
}
clearsEarth(stage);r.advanceTravel(100);const route=r.transfer;assert(route&&!route.tangentLeg.rejoinStage);assert.equal(route.targetId,mars.id);assert.equal(route.initialSpeed,0);clearsEarth(route);
r.advanceTravel(100);assert.equal(ship.parentId,mars.id);assert.equal(r.getFlightSequence(ship.id).error,'');r.dispose();
console.log('PASS: a coasting Earth→Mars shuttle stops, clears Earth on both legs, and joins Mars orbit.');

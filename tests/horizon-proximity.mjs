import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});
for(const [scene,type] of [['nasa-shuttle','shuttle'],['radiant-descent','astronaut'],['orbital-expedition','habitat'],['warp-orbit','enterprise']]){
 r.loadScene(scene);const o=r.objects.find(o=>o.type===type);
 if(type==='astronaut'){r.time=10;r.fillObjects();}
 const near=r.getHorizonProximity(o.id);assert(near?.gapMeters>0,scene);if(type==='astronaut')assert(Math.abs(near.gapMeters-15)<.001);
}
r.loadScene('warp-orbit');
const ship=r.focusId;r.setNavigationMode(ship,'manual');
assert.equal(r.getNavigationState(ship).mode,'manual');
assert.equal(r.getHorizonProximity(ship).noticeable,true);
const craft=r.objects.find(o=>o.id===ship),f=craft.flight;
craft.drivePosition=[1e9,0,0];f.position=craft.drivePosition.map(v=>v*RG);f.orbitHold=false;r.time+=.01;r.fillObjects();
assert.equal(r.getHorizonProximity(ship).noticeable,false,'Enterprise at the helm retains the distance outside the alert zone');
assert(r.getHorizonProximity(ship).gapMeters>1e18);
r.setNavigationMode(ship,'auto');assert.equal(r.getHorizonProximity(ship),null);
r.loadScene('warp-lab');assert.equal(r.getNavigationState(r.focusId).mode,'manual');assert.equal(r.getHorizonProximity(r.focusId),null);r.dispose();
// Nearest surface differs from nearest center, strongest field and last rendered object.
const id='pilot',pilot={type:'shuttle',position:[0,0,0]};
const make=(id,center,h,mass)=>({id,position:[center,0,0],collapsed:true,horizonRadius:h,massSolar:mass,spinParameter:0});
const a=make('primary',10,2,2e5),b=make('secondary',12,6,1e5),white={...make('white',3,2.9,1e8),whiteHole:true};
const mock={frameById:new Map([[id,pilot]]),state:{blackHole:true,binary:true},configCache:{},getFocusFrame:k=>k==='primary'?a:b,objectFrames:[white,{...white,whiteHole:false,collapsed:false}]};
const read=()=>BlackHoleRenderer.prototype.getHorizonProximity.call(mock,id);
assert.equal(read().id,'secondary');assert.equal(read().gapMeters,6*RG);
b.whiteHole=true;assert.equal(read().id,'primary');
const star=make('collapsed-star',3,1.5,1e6);mock.objectFrames.push(star);assert.equal(read().id,star.id);
mock.state.blackHole=false;mock.objectFrames=[star];pilot.position=[1e9,0,0];assert.equal(read(),null);
pilot.position=[0,0,0];star.position=[51*star.horizonRadius,0,0];star.massSolar=1;assert.equal(read(),null);
star.position=[50*star.horizonRadius,0,0];assert.equal(read().id,star.id,'one-percent gravitational clock effect activates with negligible acceleration');
star.position=[1e6,0,0];star.massSolar=2e12;assert.equal(read().id,star.id,'external-field threshold works independently');
console.log('PASS: four observers, no horizon in open space, closest surface, white holes and uncollapsed stars excluded, both notice thresholds.');

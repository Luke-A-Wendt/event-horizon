import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS as M} from '../dist/objects.js';
import {meridianRadiationSources as sources,meridianIrisDemand as demand} from '../dist/meridian-radiation.js';

const near=(a,b)=>assert(Math.abs(a-b)<1e-12),r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});
const load=id=>{r.loadScene(id);r.fillHoles();r.fillObjects();};
load('solar-system');
const solar=sources(r),sun=r.frameById.get(r.objects.find(o=>o.type==='star').id);
const at=(range,units=sun.radius)=>[sun.position[0]+range*units,sun.position[1],sun.position[2]];
assert.equal(demand(at(3.7e9,1/M),solar),1,'peri-Sun tour stop');
assert.equal(demand(at(4.77e10,1/M),solar),0,'Mercury');
assert.equal(demand(at(1.5e11,1/M),solar),0,'Earth');
const closing=[45,35,30,25,20,15,10].map(x=>demand(at(x),solar));
assert.equal(closing[0],0);assert.equal(closing.at(-1),1);
assert(closing.every((x,i)=>!i||x>closing[i-1]),'continuous graded closure as the ship approaches');
const midway=at(25);
assert(demand(midway,[...solar,...solar])>demand(midway,solar),'radiation from multiple sources adds');

load('nasa-shuttle');
const onDisc=[r.configCache.diskOuter[0],0,0];
assert.equal(demand(onDisc,sources(r)),1);
r.update({disk:false,jets:false});
assert.equal(demand(onDisc,sources(r)),0,'the bare hole itself emits no light');

load('binary');r.update({disk:false,jets:false,secondaryDisk:true,secondaryJets:false});
const secondary=sources(r);assert.equal(secondary.length,1);assert.deepEqual(secondary[0].position,Array.from(r.holeData.slice(4,7)));
assert.equal(demand(secondary[0].position,secondary),1);
r.update({secondaryDiskDensity:0});assert.equal(sources(r).length,0);
r.update({secondaryDisk:false,secondaryJets:true});
const jet=sources(r)[0],along=jet.position.map((p,i)=>p+Math.sqrt(jet.reach2)*.5*jet.axis[i]);
assert.equal(demand(along,[jet]),1);assert.equal(demand([jet.position[0]+Math.sqrt(jet.reach2)*.5,jet.position[1],jet.position[2]],[jet]),0);

const scene={state:{},configCache:{},objects:[{type:'star',id:'s'},{type:'disk',id:'d'}],frameById:new Map([
 ['s',{type:'star',radius:100,position:[0,0,0],collapsed:true}],
 ['d',{type:'disk',radius:2,position:[20,0,0],diskDensity:1}]
])};
let lights=sources(scene);assert.equal(lights.length,1);assert.equal(demand([20,0,0],lights),1);
scene.frameById.get('d').position=[200,0,0];scene.frameById.get('d').diskDensity=.25;
lights=sources(scene);near(lights[0].reach2,1.6**2);assert.equal(demand([20,0,0],lights),0,'live emitting disk moved');
scene.frameById.get('d').diskDensity=0;assert.deepEqual(sources(scene),[]);
r.dispose();console.log('PASS: Meridian iris solar and disc ranges, combined exposure, dark holes, density, binary emitters, directed jets, and live source positions.');

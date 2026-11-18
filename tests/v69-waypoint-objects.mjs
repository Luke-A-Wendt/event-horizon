import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {annotationLabelContext,annotationLabelVisible,DEFAULT_MAP_FILTERS} from '../dist/object-taxonomy.js';
import {mapModel,renderOrbitMap} from '../dist/orbit-map.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
import {fixture} from './render-fixture.mjs';
const create=()=>new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const r=create(),loaded=create();
try{
 r.loadScene('solar-system');r.sceneLoad=null;
 const craft=r.objects.find(o=>o.type==='shuttle'),earth=r.objects.find(o=>o.name==='Earth');
 const wp=r.addChildObject('space','waypoint',{name:'Departure marker'}),wp2=r.addChildObject('space','waypoint',{name:'Survey stop'});
 assert(wp&&wp2);
 const find=id=>r.getFocusFrame(id),getPos=id=>find(id).position.map(x=>x*RG);
 assert.notDeepEqual(find(wp.id).position,find(wp2.id).position);
 assert.deepEqual(find(wp.id).velocity,[0,0,0]);assert.equal(find(wp.id).massSolar,0);
 assert(!r.canParentObject('waypoint',earth.id).ok);assert(!r.canParentObject('probe',wp.id).ok);
 assert(!r.renderObjects.some(o=>o.id===wp.id));
 assert(annotationLabelVisible(find(wp.id),annotationLabelContext(r)));
 assert(!mapModel(r,earth.id).children.some(o=>o.id===wp.id));const map=mapModel(r,'space',{filters:DEFAULT_MAP_FILTERS});assert(map.children.some(o=>o.id===wp.id));assert(renderOrbitMap(map).svg.includes('data-map-object="'+wp.id+'"'));
 r.updateObject(wp.id,{name:'Rest A',x:wp.x+10});r.fillObjects();assert(Math.abs(getPos(wp.id)[0]-(wp.x+10))<.1);
 const frozen=find(wp.id).position.slice();r.time+=.0001;r.fillObjects();assert.deepEqual(find(wp.id).position,frozen);
 const marker=r.getTravelTargets({craftId:craft.id}).find(t=>t.id===wp.id);assert(marker.waypoint);assert.equal(marker.name,'Rest A');
 assert(r.validateFrameGeometry(),r.geometryError);
 // Fly to the ordinary waypoint, then save the actual finished spacecraft rather than a mocked parking state.
 r.selectedId=craft.id;r.focusTarget(craft.id,'track');r.sceneLoad=null;
 const leg=r.previewTravel(wp.id,{craftId:craft.id});assert(!leg.error,leg.error);
 assert(r.startTravel(wp.id,{craftId:craft.id,fromSequence:true,tangentLeg:leg.tangentLeg}));r.advanceTravel(10);r.fillObjects();
 assert.equal(craft.waypointHoldId,wp.id);assert.equal(craft.flight.speed,0);
 r.setFlightSequence(craft.id,[{targetId:wp.id,kind:'waypoint'},{targetId:wp2.id,kind:'waypoint'}],{loop:false});
 const saved=parseScene(serializeScene(r));restoreRenderer(loaded,saved);
 const stopped=loaded.objects.find(o=>o.id===craft.id);
 assert.equal(stopped.waypointHoldId,wp.id);assert.deepEqual(stopped.waypointHoldBasis,craft.waypointHoldBasis);
 assert.deepEqual(loaded.getFocusFrame(craft.id).position,loaded.getFocusFrame(wp.id).position);
 assert.deepEqual(loaded.getFlightSequence(craft.id).nodes.map(n=>n.targetId),[wp.id,wp2.id]);
 // Changing a coordinate must not drag the spacecraft along or leave it holding the old location.
 const oldPose=[...loaded.getFocusFrame(craft.id).position],forward=[...loaded.getFocusFrame(craft.id).frame[2]];
 const at=loaded.objects.find(o=>o.id===wp.id);
 loaded.updateObject(wp.id,{x:at.x+200});assert.equal(stopped.waypointHoldId,undefined);
 assert.deepEqual(loaded.getFocusFrame(craft.id).position,oldPose);
 assert(Math.hypot(...forward.map((v,i)=>v-loaded.getFocusFrame(craft.id).frame[2][i]))<1e-9);
 // Revising a point during its approach drops the stale flight solution and leaves velocity and position continuous.
 const next=loaded.previewTravel(wp2.id,{craftId:craft.id});assert(!next.error,next.error);
 loaded.startTravel(wp2.id,{craftId:craft.id,fromSequence:true,tangentLeg:next.tangentLeg});loaded.advanceTravel(4);
 const inFlight=stopped.flight.position.slice(),velocity=stopped.flight.velocity.slice();
 loaded.updateObject(wp2.id,{x:wp2.x+200});assert(!loaded.transfer);assert.deepEqual(stopped.flight.position,inFlight);
 assert.deepEqual(stopped.flight.velocity,velocity);assert.equal(stopped.flight.thrust,0);assert(!stopped.waypointHoldId);
 loaded.removeObject(wp.id);assert.equal(stopped.waypointHoldId,undefined);assert.equal(stopped.waypointHoldBasis,undefined);assert(!loaded.getFlightSequence(craft.id).nodes.some(n=>n.targetId===wp.id));
 assert.doesNotThrow(()=>serializeScene(loaded));
}finally{r.dispose();loaded.dispose();}
console.log('PASS: fixed point objects, zero geometry and gravity, default map visibility, saving and reopening an actual rest arrival, and deletion cleanup.');

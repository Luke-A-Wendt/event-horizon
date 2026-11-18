import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {RenderHost} from '../dist/render-host.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {fixture} from './render-fixture.mjs';
const create=()=>new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const source=create(),worker=create(),reference=create();
source.loadScene('solar-system');source.sceneId='snapshot-performance-fixture';
const ship=source.objects.find(o=>o.type==='shuttle');assert(ship);assert(source.setFreeDrive(ship.id,true));
restoreRenderer(worker,snapshotRenderer(source));restoreRenderer(reference,snapshotRenderer(source));
const stable=worker.objects,earth=worker.objects.find(o=>o.name==='Earth'),metadata=worker.orbitGeometryById;
source.releaseOrbitHold(ship);
const frame=r=>r.objectFrames.map(o=>({id:o.id,position:o.position,velocity:o.velocity,frame:o.frame,radius:o.radius}));
for(let step=1;step<=12;step++){
 source.time+=.02;ship.drivePosition=ship.drivePosition.map((v,i)=>v+(i===1?.000001:0));ship.flight.position=ship.drivePosition.map(v=>v*1.47662504e3*4.3e6);ship.clock.properSeconds+=.02;
 source.fillObjects();source.updateCameraFrame();
 const packet=snapshotRenderer(source,{includeObjects:false,objectIds:[ship.id]});
 assert(!('objects'in packet));assert.equal(packet.objectUpdates.length,1);
 restoreRenderer(worker,packet);restoreRenderer(reference,snapshotRenderer(source));
 assert.strictEqual(worker.objects,stable);assert.strictEqual(worker.objects.find(o=>o.id===earth.id),earth);
 assert.strictEqual(worker.orbitGeometryById,metadata,'Unchanged orbital transforms staycached during flight');
 assert.deepEqual(frame(worker),frame(reference),'Pose-only transport matches full-catalog transport');
 assert.equal(worker.objects.find(o=>o.id===ship.id).clock.properSeconds,ship.clock.properSeconds);
}
// Clearing a transient field must propagate too, not leave a stale return arc.
ship.driveReturn={elapsed:.4,position:[...ship.drivePosition],basis:ship.driveBasis};
restoreRenderer(worker,snapshotRenderer(source,{includeObjects:false,objectIds:[ship.id]}));assert(worker.objectById.get(ship.id).driveReturn);
delete ship.driveReturn;
restoreRenderer(worker,snapshotRenderer(source,{includeObjects:false,objectIds:[ship.id]}));assert(!worker.objectById.get(ship.id).driveReturn);

// Actual catalog edits still replace all records and rebuild static metadata.
const before=worker.orbitGeometryById;source.objects.find(o=>o.id===earth.id).radiusMeters*=1.01;source.refreshConfiguration();restoreRenderer(worker,snapshotRenderer(source));assert.notStrictEqual(worker.orbitGeometryById,before);
// Exercise the actual host mailbox decision as well as the serializer.
const packets=[];source.cpu=true;source.workerReady=true;source.mailbox={inflight:false,push:p=>packets.push(p)};
RenderHost.prototype.queueSnapshot.call(source);assert(packets.at(-1).snapshot.objects);
source.time+=.01;RenderHost.prototype.queueSnapshot.call(source);
assert(!packets.at(-1).snapshot.objects);assert.equal(packets.at(-1).snapshot.objectUpdates.length,1);
source.refreshConfiguration();source.time+=.01;RenderHost.prototype.queueSnapshot.call(source);assert(packets.at(-1).snapshot.objects,'A real model edit sends a complete catalog');
const full=()=>snapshotRenderer(source),delta=()=>snapshotRenderer(source,{includeObjects:false,objectIds:[ship.id]});
let baseline=full;
if(process.env.PRODUCTION_STATE_PATH){const production=await import(process.env.PRODUCTION_STATE_PATH);baseline=()=>production.snapshotRenderer(source);}
const fullBytes=JSON.stringify(baseline()).length,deltaBytes=JSON.stringify(delta()).length;assert(deltaBytes<fullBytes*.1,'Drive packets omit at least90% of catalog bytes');
const timed=fn=>{for(let i=0;i<10;i++)fn();const started=performance.now();for(let i=0;i<100;i++)fn();return(performance.now()-started)/100;};
const fullMs=timed(baseline),deltaMs=timed(delta);
source.dispose();worker.dispose();reference.dispose();
console.log(`PASS: dynamic packet/full-snapshot parity, static catalog identity and transform reuse, clock/return updates. ${fullBytes}→${deltaBytes} bytes (${(100*(1-deltaBytes/fullBytes)).toFixed(1)}% smaller); measured ${fullMs.toFixed(3)}→${deltaMs.toFixed(3)}ms snapshot CPU.`);

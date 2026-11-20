import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RenderHost} from '../dist/render-host.js';
import {SceneLoadLifecycle} from '../dist/render-state.js';

const classes=new Set(),host={
 canvas:{parentElement:{classList:{add:key=>classes.add(key),remove:key=>classes.delete(key),contains:key=>classes.has(key)}}},
 sceneLoad:new SceneLoadLifecycle({now:()=>0}),workerStats:{},now:()=>0,
 currentSignature:()=> 'current-view',noteInteraction(){},cancelCpuWork(){},onError(){},emitHostStats(){}
};
const choose=()=>RenderHost.prototype.requestSceneLoad.call(host,{blank:true});
const complete=(revision,signature='current-view')=>RenderHost.prototype.completedFrame.call(host,signature,revision);
const first=choose();assert(classes.has('scene-awaiting-frame'));
assert.equal(complete(first),false,'Preparation must finish before any frame is presented');
host.preparedSceneLoad=false;
assert.equal(complete(first-1),false,'An old frame cannot bring the previous scene back');
assert.equal(complete(first,'old-view'),false,'A stale camera or scene signature cannot reveal the canvas');
const second=choose();host.preparedSceneLoad=false;
assert.equal(complete(first),false,'Rapid scene choices keep obsolete frames hidden');
assert(classes.has('scene-awaiting-frame'));
assert(complete(second));assert(!classes.has('scene-awaiting-frame'));
RenderHost.prototype.requestSceneLoad.call(host);
assert(!classes.has('scene-awaiting-frame'),'Ordinary object edits do not blank the scene');
const failed=choose();host.preparedSceneLoad=false;host.sceneLoad.fail('Test failure');
assert.equal(complete(failed),false);assert(classes.has('scene-awaiting-frame'),'A failure retains empty space behind its recovery controls');
// Graphics retry can advance the lifecycle directly, without another scene choice.
host.sceneRevision=host.sceneLoad.begin();assert(complete(host.sceneRevision));assert(!classes.has('scene-awaiting-frame'));
choose();host.pendingPresentationRevision=undefined;
RenderHost.prototype.didRestoreSnapshot.call(host);
host.hostDisposed=true;assert.equal(complete(host.sceneRevision),false);assert(classes.has('scene-awaiting-frame'));
host.hostDisposed=false;assert(complete(host.sceneRevision));assert(!classes.has('scene-awaiting-frame'),'Full host replacement adopts and clears the inherited blank view');
const css=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
assert.match(css,/scene-awaiting-frame #universe[^}]*opacity:0/);
assert(!/scene-awaiting-frame[^}]*pointer-events:none/.test(css),'Canvas orbit and zoom input remain enabled');
console.log('PASS: empty scene handoff, stale-frame isolation, rapid reselection, failure/retry and retained canvas input.');

// The initially unstyled shell and the completed instrument layout are both
// gated. A child with visibility:visible must not escape the panel's gate.
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
assert.match(html,/class="scene scene-awaiting-frame" id="scene"/);
assert.match(css,/#scene\.scene-awaiting-frame #sceneMetrics,[^{]*\{display:none\}/);
assert.match(css,/#scene\.scene-awaiting-frame #sceneSubtitle \{display:block\}/);

// Fast grid switches retain their last frame. Slow ones use the loading
// screen until a frame for the exact new revision arrives. A stuck old worker
// is replaced once while a worker compiling the current revision is retained.
let now=0,restarts=0;
globalThis.document={hidden:false};
Object.assign(host,{worker:{},workerReady:true,mailbox:{inflight:true},sceneLoad:new SceneLoadLifecycle({now:()=>now}),now:()=>now,
 workerStats:{},restartRendering(){restarts++;},presentationPaused:false,workerAcceptedRevision:1});
const changeGrid=()=>{const revision=RenderHost.prototype.requestSceneLoad.call(host);host.preparedSceneLoad=false;return revision;};
const monitor=()=>RenderHost.prototype.checkSceneLoad.call(host);
const preview=changeGrid();now+=400;monitor();assert(!classes.has('scene-awaiting-frame'));
assert(complete(preview));const grid=changeGrid();now+=1300;monitor();assert(classes.has('scene-awaiting-frame'));
assert(!complete(preview));assert(classes.has('scene-awaiting-frame'));
host.presentationPaused=true;monitor();now+=20000;monitor();assert.equal(restarts,0);
host.presentationPaused=false;monitor();now+=4750;monitor();assert.equal(restarts,1);
now+=500;monitor();assert.equal(restarts,1);
assert(complete(grid));assert(!classes.has('scene-awaiting-frame'));
const currentGrid=changeGrid();host.workerAcceptedRevision=currentGrid;
now+=6100;monitor();assert.equal(restarts,1);assert(classes.has('scene-awaiting-frame'));
assert(complete(currentGrid));assert(!classes.has('scene-awaiting-frame'));
console.log('PASS: first-paint HUD gate, delayed grid loader, stale frames, covered views and single scoped worker recovery.');

// Power can change the shader in the same scene revision. A genuine cold
// compilation may take longer than the normal completed-frame heartbeat.
let signature='powered-explorer',failure='';
host.currentSignature=()=>signature;
host.workerFailed=error=>{failure=error;};
const phase=(key,revision)=>RenderHost.prototype.handleWorker.call(host,{type:'render-phase',phase:'compiling',signature:key,sceneRevision:revision});
phase('old-view',currentGrid);phase(signature,currentGrid-1);
assert.equal(host.sceneLoad.state,'ready');
phase(signature,currentGrid);assert.equal(host.sceneLoad.state,'loading');assert.equal(host.sceneLoad.timeout,60000);
now+=37000;monitor();assert.equal(failure,'');assert(classes.has('scene-awaiting-frame'));
phase(signature,currentGrid);assert.equal(host.sceneLoad.elapsed,37000);
assert(complete(currentGrid,signature));assert.equal(host.sceneLoad.timeout,30000);assert(!classes.has('scene-awaiting-frame'));
// Missed or delayed worker stage messages cannot prevent the monitor from
// recognizing changed features. Repeated changes cannot move its deadline.
signature='fresh-shader';now+=29500;monitor();assert.equal(host.sceneLoad.timeout,60000);
signature='newer-shader';now+=29500;phase(signature,currentGrid);monitor();assert.equal(failure,'');
now+=1001;monitor();assert.match(failure,/did not finish within 60 seconds/);
assert.equal(host.sceneLoad.state,'failed');
console.log('PASS: in-scene shader gets one full first-frame deadline, exact-frame recovery and bounded failure.');

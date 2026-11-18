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

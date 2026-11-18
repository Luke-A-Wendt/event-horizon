import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RenderHost} from '../dist/render-host.js';
import {SceneLoadLifecycle} from '../dist/render-state.js';

const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const apply=app.slice(app.indexOf('async function applyPreset(id){'),app.indexOf('async function loadSceneSnapshot('));
const pause=app.match(/function pauseCoveredView\(paused\)\{[^\n]+\}/)[0];
const events=[],paintWaiters=[],nodes=new Map();let painted=false,dialogOpen=false,revision=0;
const $=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',open:id==='atlasDialog',classList:{add:name=>events.push('class:'+name)},close(){this.open=false;events.push('close');}});return nodes.get(id);};
const renderer={requestSceneLoad(options){assert.deepEqual(options,{blank:true,notify:false,hold:true});events.push('hold');return ++revision;},getState(){assert(painted,'No catalog traversal before the blank viewport paints');return {};},loadScene(id){assert(painted);events.push('load:'+id);return {};},update(){},setPresentationPaused(value){events.push('pause:'+value);}};
const env={$,renderer,SCENE_PRESETS:[{id:'one',title:'First scene',number:'1'},{id:'two',title:'Second scene',number:'2'}],DEFAULTS:{},handleError:error=>{assert(!error,error);},sceneChoicePaint:()=>new Promise(resolve=>paintWaiters.push(()=>{painted=true;resolve();})),viewportUI:{close:()=>events.push('panels-closed'),sceneChanged(){}},makePreset:()=>({}),syncControls(){},renderObjectManager(){},setFeature(){},handleStats(){},document:{querySelector:()=>dialogOpen?{}:null,querySelectorAll:()=>[]}};
const api=new Function('env',`const {$,renderer,SCENE_PRESETS,DEFAULTS,handleError,sceneChoicePaint,viewportUI,makePreset,syncControls,renderObjectManager,setFeature,handleStats,document}=env;
let mutationSerial=0,sceneRequestSerial=0,pendingScene=null,activePreset,travelIntroPending,latestSceneRevision=0,state={},custom,lastStats,selectedObjectId,rosterSignature;
${pause}\n${apply}\nreturn {choose:applyPreset,closeEvent:()=>pauseCoveredView(false)};`)(env);
const first=api.choose('one');
assert.equal($('atlasDialog').open,false);assert.equal($('sceneTitle').textContent,'First scene');
assert(!events.some(e=>e.startsWith('load:')));
api.closeEvent();assert.equal(events.at(-1),'pause:true','Dialog closure cannot resume the old scene');
const second=api.choose('two');assert.equal($('sceneTitle').textContent,'Second scene');
paintWaiters.shift()();await first;assert(!events.some(e=>e.startsWith('load:')),'Superseded selections do no preparation');
paintWaiters.shift()();await second;assert.deepEqual(events.filter(e=>e.startsWith('load:')),['load:two']);assert.equal(events.at(-1),'pause:false');
painted=false;const third=api.choose('one');dialogOpen=true;paintWaiters.shift()();await third;
assert.equal(events.at(-1),'pause:true','A dialog opened during handoff remains responsive and keeps rendering paused');

// Visible-page work must not beat the blank paint via a timeout.
const raf=[],tasks=[],paintExpression=app.match(/const sceneChoicePaint=([^\n]+);/)[1];
const waitForPaint=new Function('document','requestAnimationFrame','setTimeout','return '+paintExpression)({hidden:false},fn=>raf.push(fn),fn=>tasks.push(fn));
let completed=false;const wait=waitForPaint().then(()=>{completed=true;});
assert.equal(tasks.length,0);raf.shift()();assert.equal(tasks.length,0);raf.shift()();
assert.equal(tasks.length,1);assert(!completed);tasks.shift()();await wait;assert(completed);

// The actual host fast path does not inspect or clone its old scene.
const host={sceneLoad:new SceneLoadLifecycle({now:()=>0}),noteInteraction(){},now:()=>0,onError(){},setPresentationPaused(value){assert(value&&this.preparedSceneLoad);},getState(){assert.fail('Old catalog traversed');},shaderFeatures(){assert.fail('Old assets inspected');}};
host.emitHostStats=()=>RenderHost.prototype.emitHostStats.call(host,true);
RenderHost.prototype.requestSceneLoad.call(host,{blank:true,notify:false,hold:true});
host.emitHostStats();RenderHost.prototype.queueSnapshot.call(host);RenderHost.prototype.checkSceneLoad.call(host);
console.log('PASS: immediate dialog/title handoff, no pre-paint catalog work, paint-before-preparation, rapid choice cancellation, and dialog-aware resume.');

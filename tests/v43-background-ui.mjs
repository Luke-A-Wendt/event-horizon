import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLoadingIndicator} from '../dist/loading-indicator.js';
import {uiDomFixture} from './ui-dom-fixture.mjs';

const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
const doc=uiDomFixture(html),status=doc.getElementById('loading');
assert(status);assert.equal(status.parentNode.className,'scene-top','Preparation status stays with the performance readout');
assert.equal(doc.querySelector('.scene-loading'),null,'There is no full-scene loading element');
assert.equal(doc.querySelector('.loading-visual'),null,'No separate loader canvas/animation is created');
assert.equal(doc.getElementById('loadingElapsed'),null);
assert.equal(doc.getElementById('loadingChooseScene'),null);
assert(doc.getElementById('retryRenderer')&&doc.getElementById('continueCPU'),'Failure recovery and explicit CPU choice remain available');
assert.match(css,/\.scene-render-status\{[^}]*pointer-events:none/,'Inline status cannot consume orbit or zoom input');
assert(!html.includes('assets/loading-orbit.gif'),'No unused GIF preload or image request');

const indicator=createLoadingIndicator(status);
indicator.update(true,'Warp field laboratory',true,{phase:'compiling',elapsedMs:60000});
assert.equal(status.hidden,false);assert.equal(status.textContent,'Preparing graphics…');
assert.match(status.getAttribute('aria-label'),/Warp field laboratory/);
assert(!status.textContent.includes('%')&&!status.textContent.includes('60'),'A timeout is never presented as progress');
indicator.update(true,'Our Solar System',false,{phase:'drawing'});
assert.equal(status.textContent,'Rendering preview…');
indicator.update(false);assert.equal(status.hidden,true);
indicator.dispose();indicator.update(true);assert.equal(status.hidden,true);

// Editing the current logical scene is permitted while its first GPU frame is
// pending. The worker takes the latest snapshot; UI actions do not wait for it.
const functionText=app.match(/function stageMutation\(reason,operation\)\{[^\n]+\}/)?.[0];
assert(functionText);
const events=[];
const perform=new Function('renderer','loadingIndicator','loadingSceneTitle','handleStats','handleError','pendingScene',`let mutationSerial=0;${functionText};return stageMutation;`)(
 {prepareMutation:reason=>events.push('prepare:'+reason),finishMutation:()=>events.push('finish'),getState:()=>({})},
 {update:()=>events.push('status')},()=> 'Scene',()=>events.push('stats'),()=>assert.fail('Unexpected error'),{phase:'loading'}
);
assert.equal(perform('Track target',()=>{events.push('edit');return 7;}),7);
assert.deepEqual(events,['status','prepare:Track target','edit','finish','stats']);
assert(!app.includes('Try this action when its first frame is ready.'));
console.log('PASS: nonblocking inline render status, no loader animation/timer/progress, retained failure controls, and immediate edits during pending GPU rendering.');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('style.css');
assert(!/id=["']loading["']/.test(html));
assert.match(html,/class="scene-loading-label"[^>]*>LOADING<\/div>/);
assert.match(css,/scene-awaiting-frame[^}]*scene-loading-label/);
assert(!/createLoadingIndicator|loadingIndicator|loadingSceneTitle/.test(app));
assert(!/#loading\b|loader-orbit/.test(css));
assert(html.includes('id="renderError"')&&html.includes('id="retryRenderer"'));
const fn=app.match(/function stageMutation\(reason,operation\)\{[^\n]+\}/)[0];
const events=[];
const run=new Function('renderer','handleStats','handleError',`let mutationSerial=0;${fn};return stageMutation;`)(
 {prepareMutation:()=>events.push('prepare'),finishMutation:()=>events.push('finish'),getState:()=>({})},
 ()=>events.push('stats'),()=>assert.fail('Unexpected error'));
assert.equal(run('Track target',()=>{events.push('edit');return 7;}),7);
assert.deepEqual(events,['prepare','edit','finish','stats']);
console.log('PASS: static initial-frame label only; edits and failure recovery remain available.');

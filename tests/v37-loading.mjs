import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {LOADING_VISUAL_WORKER_SOURCE,createLoadingVisual} from '../dist/loading-visual.js';
import {uiDomFixture} from './ui-dom-fixture.mjs';
// The rendering page never executes during these advances. The independent
// loader worker must keep updating its own elapsed counter and orbit.
let now=0,id=0,closed=false;const tasks=new Map(),texts=[],dots=[];
const ctx=new Proxy({fillText:(...a)=>texts.push(a),arc:(...a)=>dots.push(a)},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
const self={close(){closed=true;}},scope={self,performance:{now:()=>now},Date:{now:()=>now},Math,Error,setTimeout(fn,ms){tasks.set(++id,{fn,at:now+ms});return id;},clearTimeout:id=>tasks.delete(id)};
vm.runInNewContext(LOADING_VISUAL_WORKER_SOURCE,scope);
function send(data){self.onmessage({data});}
function advance(ms){const end=now+ms;for(;;){const next=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;now=next[1].at;tasks.delete(next[0]);next[1].fn();}now=end;}
send({type:'init',canvas:{getContext:()=>ctx}});send({type:'state',running:true,elapsedMs:0,suspended:false,revision:1,sentAt:now});const first=dots.at(-1);advance(15000);assert.equal(texts.at(-1)[0],'25%');assert.notDeepEqual(dots.at(-1),first);
send({type:'state',running:true,elapsedMs:15000,suspended:true,revision:1,sentAt:now});advance(90000);assert.equal(texts.at(-1)[0],'25%');
send({type:'state',running:true,elapsedMs:0,suspended:false,revision:2,sentAt:now,reduced:true});assert.equal(texts.at(-1)[0],'0%');const reducedDot=dots.at(-1);advance(60000);assert.equal(texts.at(-1)[0],'100%');assert.deepEqual(dots.at(-1),reducedDot);advance(2000);assert.equal(texts.at(-1)[0],'100%');
send({type:'state',running:false,elapsedMs:60000,suspended:false,revision:2,sentAt:now});assert.equal(tasks.size,0);send({type:'dispose'});assert(closed);
// Older S9 browsers without OffscreenCanvas retain an already-painted numeric
// strip animated only by transforms, rather than depending on DOM timer ticks.
const doc=uiDomFixture('<div id="loading"><div class="loading-card"><span class="loading-bootstrap"></span><output id="loadingPercent"></output></div></div>'),element=doc.getElementById('loading'),animations=[];
const create=doc.createElement;doc.createElement=tag=>{const node=create(tag);node.animate=(frames,options)=>{const animation={frames,options,paused:false,currentTime:0,pause(){this.paused=true;},play(){this.paused=false;},cancel(){this.cancelled=true;}};animations.push(animation);return animation;};return node;};
// Parsed children do not inherit custom factory properties in this DOM fixture.
const visual=createLoadingVisual(element,{document:doc,matchMedia:()=>({matches:false})});assert(visual);assert.equal(element.querySelector('.loading-percent-strip').children.length,101);assert.equal(element.querySelector('.loading-bootstrap'),null);visual.update({running:true,elapsedMs:15000,suspended:false,revision:1});assert.equal(element.querySelector('.loading-percent-strip').style.transform,'translate3d(0,-550px,0)');visual.dispose();assert.equal(element.querySelector('.loading-visual'),null);
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),css=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
assert(html.includes('loading-bootstrap-active'));assert(!html.match(/id="loading"[^>]*hidden/));assert(css.includes('loading-elapsed-scroll 60s steps(100,end)'));assert(css.includes('translate3d(0,-2200px,0)'));assert(css.includes('will-change:transform'));
console.log('PASS: independent loading worker advances without page callbacks, real 60s cap, revision reset/suspension/reduced motion/disposal; initial HTML and compositor fallback contain prepainted percentages.');

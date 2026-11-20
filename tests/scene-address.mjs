import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {replaceSceneAddress} from '../dist/scene-address.js';

const browser={location:new URL('https://example.test/observatory/?ui=compact&scene=janus-solar-tour#flight')};
const state={visit:1};
browser.history={state,replaceState(next,_,address){
 assert.equal(next,state);
 browser.location=new URL(address,browser.location);
}};
const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('async function selectCatalogScene('),source.indexOf("document.querySelectorAll('[data-scene]').forEach(el=>el.addEventListener('click'"));
const pending=new Map();
const choose=new Function('applyPreset','replaceSceneAddress',handler+'\nreturn selectCatalogScene;')(
 id=>new Promise(resolve=>pending.set(id,resolve)),id=>replaceSceneAddress(id,browser));
const first=choose('disk'),second=choose('warp-lab');
pending.get('warp-lab')(true);await second;pending.get('disk')(false);await first;
assert.equal(browser.location.href,'https://example.test/observatory/?ui=compact&scene=warp-lab#flight');
// A local snapshot may still carry a built-in sceneId as its source preset.
const loader=source.slice(source.indexOf('async function loadSceneSnapshot('),source.indexOf('async function selectCatalogScene('));
assert(loader.indexOf('replaceSceneAddress(null)')>loader.indexOf('renderer.loadSnapshot(snapshot)'));
replaceSceneAddress(null,browser);
assert.equal(browser.location.href,'https://example.test/observatory/?ui=compact#flight');
replaceSceneAddress('warp-lab',browser);assert.equal(browser.location.searchParams.get('scene'),'warp-lab');
browser.location=new URL('file:///standalone.html');replaceSceneAddress('disk',browser);
assert.equal(browser.location.href,'file:///standalone.html');
console.log('PASS: shareable preset links, superseded choices, local scene imports, unrelated URL options, and standalone files.');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {installViewportUI} from '../dist/viewport-ui.js';
import {SCENE_FILE_VERSION} from '../dist/scene-file.js';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
for(let visit=0;visit<2;visit++){
 const document=uiDomFixture(html),f=fixture();globalThis.document=document;
 globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:false}),addEventListener(){},removeEventListener(){}};
 const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false}),$=id=>document.getElementById(id);r.loadScene('disk');
 const optics=document.createElement('details');optics.className='geometry-panel';document.querySelector('.view-toolbar').append(optics);
 let opened=0,ui;
 ui=installViewportUI({renderer:()=>r,objects:()=>r.getObjects(),state:()=>r.state,activePreset:()=>r.sceneId,refresh:()=>ui?.refresh(r.getState()),updateParameter(){},setFeature(){},selectObject(){},selectComponent(){},syncRendererState(){},markCustom(){},setPaused(){},syncViewMode(){},toast(){},openScenes:()=>{opened++;$('atlasDialog').showModal();},openDialog:id=>$(id).showModal(),onDialogClose(){},openHelp(){}});
 await Promise.resolve();await Promise.resolve();ui.refresh(r.getState());
 const button=$('viewportScenes');assert(button.classList.contains('scene-discovery'),`Visit ${visit+1} starts with the cue`);
 $('universe').dispatch('pointerdown');r.resetCamera();ui.refresh(r.getState());assert(button.classList.contains('scene-discovery'),'Other interactions do not dismiss the cue');
 button.click();assert.equal(opened,1);assert(!button.classList.contains('scene-discovery'),'The actual Scenes click ends it immediately');$('atlasDialog').close();
 r.loadScene('warp-lab');ui.sceneChanged();r.loadScene('disk');ui.sceneChanged();ui.rendererChanged();await Promise.resolve();await Promise.resolve();assert(!button.classList.contains('scene-discovery'),'Scene changes and renderer refresh do not reactivate it');
 assert.equal($('mathNav').textContent,'MATH');assert.equal($('applicationVersion').textContent,'Version '+SCENE_FILE_VERSION);ui.dispose();r.dispose();
}
const source=readFileSync(new URL('../dist/viewport-ui.js',import.meta.url),'utf8'),css=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
assert(!/localStorage|sessionStorage/.test(source));assert.match(css,/scene-discovery-pulse 3\.2s ease-in-out infinite/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.viewport-scenes\.scene-discovery::after\{animation:none/);assert.match(css,/#mathNav\{font-size:17px;font-weight:800/);
console.log('PASS: gentle default-scene cue resets each visit, stops on Scenes click, stays off through scene/renderer resets, uses no browser storage, respects reduced motion; bold uppercase MATH.');

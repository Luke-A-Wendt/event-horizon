import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {DEFAULTS,makePreset,SCENE_PRESETS} from '../dist/config.js';
import {installViewportUI,gridDisplayPatch} from '../dist/viewport-ui.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';
import {fixture} from './render-fixture.mjs';
import {uiDomFixture} from './ui-dom-fixture.mjs';

const f=fixture(),dom=uiDomFixture(await readFile(new URL('../dist/index.html',import.meta.url),'utf8'));
globalThis.document=dom;globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:false}),addEventListener(){},removeEventListener(){}};
globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
const $=id=>dom.getElementById(id),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false,deferProgram:true});
let ui;
const change=(key,value)=>{r.update(gridDisplayPatch(r.state,key,value)??{[key]:value});ui.refresh(r.getState());};
const optics=dom.createElement('details');optics.className='geometry-panel';optics.innerHTML='<label><input id="grid" type="checkbox">Spacetime grid</label>';dom.querySelector('.view-toolbar').append(optics);
try{
 r.loadScene('gravity-anomaly');
 ui=installViewportUI({renderer:()=>r,objects:()=>r.getObjects(),state:()=>r.state,activePreset:()=>r.sceneId,updateParameter:change,refresh:()=>ui.refresh(r.getState())});ui.refresh(r.getState());
 const arrows=$('velocityArrowsToggle'),scene=$('sceneGridDensity'),warp=$('warpGridDensity');
 assert([arrows,scene,warp].every(e=>$('displayPanel').contains(e)));assert(optics.contains(scene));
 assert.equal(r.state.grid,true);assert.equal(r.state.warpGridOnly,false);assert.equal(Number(scene.value),2);assert.equal(Number(warp.value),1.5);assert(!arrows.checked);
 const labels=r.state.annotations;
 arrows.checked=true;arrows.dispatch('change');assert(r.state.velocityArrows);assert.equal(r.state.annotations,labels,'arrows never toggle labels');
 scene.value=2.75;scene.dispatch('input');assert.equal(r.state.sceneGridDensity,2.75);assert.equal(warp.getAttribute('aria-valuetext'),'1.5×');
 warp.value=.5;warp.dispatch('input');assert.equal(r.state.warpGridDensity,.5);assert.equal($('sceneGridDensityValue').textContent,'2.75×');
 const saved=serializeScene(r),round= parseScene(saved).state;
 assert.deepEqual([round.velocityArrows,round.sceneGridDensity,round.warpGridDensity],[true,2.75,.5]);
 assert.throws(()=>parseScene(saved.replace('sceneGridDensity: 2.75','sceneGridDensity: 4')),/sceneGridDensity/);
 const old=parseScene(saved.replace(/^ *(velocityArrows|sceneGridDensity|warpGridDensity):[^\n]*\n/gm,'')).state;
 assert.deepEqual([old.velocityArrows,old.sceneGridDensity,old.warpGridDensity],[false,2,1.5]);
 r.update({sceneGridDensity:5,warpGridDensity:NaN});assert.deepEqual([r.state.sceneGridDensity,r.state.warpGridDensity],[3,DEFAULTS.warpGridDensity]);
 r.loadScene('warp-lab');ui.refresh(r.getState());assert(!arrows.checked);assert.equal(Number(scene.value),1);assert.equal(Number(warp.value),1.5);assert(r.state.warpGridOnly);
 for(const p of SCENE_PRESETS)assert.equal(makePreset(p.id).velocityArrows,p.id==='geometry-orbit',p.id);
 r.loadScene('geometry-orbit');ui.refresh(r.getState());assert(arrows.checked);assert.equal(dom.getElementById('warpGridOnlyToggle').disabled,true);
 const legacyOrbit=serializeScene(r).replace(/^ *velocityArrows: true\n/m,'');assert(parseScene(legacyOrbit).state.velocityArrows);
}finally{r.dispose();}
console.log('PASS: independent motion and resolution controls, anomaly grid, preset reload, validated scene saves, and old-file defaults.');

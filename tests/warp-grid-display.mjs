import './fixtures/shuttle-bridge.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from './render-fixture.mjs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {warpGridSample,WARP_GRID_SPACING,WARP_GRID_RADIUS} from '../dist/warp-grid-profile.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {installViewportUI,gridDisplayPatch} from '../dist/viewport-ui.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
const markup=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const f=fixture(),dom=uiDomFixture(markup);globalThis.document=dom;
globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:false}),addEventListener(){},removeEventListener(){}};
globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
let ui;
const change=(key,value)=>{r.update(gridDisplayPatch(r.state,key,value)??{[key]:value});ui?.refresh(r.getState());};
const api={renderer:()=>r,objects:()=>r.getObjects(),state:()=>r.state,updateParameter:change,refresh:()=>ui?.refresh(r.getState()),activePreset:()=>r.sceneId};
const optics=dom.createElement('details');optics.className='geometry-panel';dom.querySelector('.view-toolbar').append(optics);
try{
 r.loadScene('warp-lab');ui=installViewportUI(api);ui.refresh(r.getState());
 const toggle=dom.getElementById('warpGridOnlyToggle'),setOnly=value=>{toggle.checked=value;toggle.dispatch('change');};
 const flags=s=>[s.grid,s.warpGrid,s.warpGridOnly];
 const both=[true,true,false],only=[false,false,true],off=[false,false,false];
 assert.deepEqual(flags(r.state),only);assert(toggle.checked&&!toggle.disabled);
 setOnly(true);assert.deepEqual(flags(r.state),only);
 assert.deepEqual(flags(parseScene(serializeScene(r)).state),only);
 setOnly(false);assert.deepEqual(flags(r.state),both,'Unchecking restores both grids without a second click');
 const scene=serializeScene(r);
 assert.deepEqual(flags(parseScene(scene.replace(/^ *warpGridOnly: false\n/m,'')).state),both,'A scene without the new key opens normally');
 assert.throws(()=>parseScene(scene.replace('warpGridOnly: false','warpGridOnly: true')),/Choose all grids/);
 r.loadScene('enterprise-solar-tour');ui.refresh(r.getState());assert.deepEqual(flags(r.state),only);assert(toggle.checked);
 change('grid',false);assert.deepEqual(flags(r.state),off);assert(!toggle.checked);
 change('grid',true);assert.deepEqual(flags(r.state),both);assert(!toggle.checked);
 setOnly(true);change('spectrum','geometry');assert.deepEqual(flags(r.state),both);assert(toggle.disabled&&!toggle.checked);
 console.log('Warp-grid display controls, scene defaults, and backward-compatible project saves passed.');
}finally{r.dispose();}

// Browsers without an offscreen canvas replay the grid mask as drawing commands.
const recorder=new CpuCommandCanvas();recorder.getBoundingClientRect=f.canvas.getBoundingClientRect;
const cpu=new CpuRenderer(recorder,{autoStart:false,bindControls:false});
try{
 cpu.loadScene('warp-lab');
 const grid=()=>{cpu.fillHoles();cpu.fillObjects();cpu.updateCameraFrame();recorder.beginFrame();cpu.grid();return recorder.takeFrame().commands;};
 cpu.update({grid:true});
 const both=grid();assert(both.some(([op,arg])=>op==='clip'&&arg==='evenodd'));
 assert.equal(both.filter(([op])=>op==='save').length,both.filter(([op])=>op==='restore').length);
 cpu.update({warpGridOnly:true});const only=grid();assert(only.some(([op])=>op==='stroke'));assert(!only.some(([op])=>op==='clip'));

 // The local renderer must actually stop generating geometry at the radial
 // mask boundary; a visually identical oversized sheet would regress CPU cost.
 const patch=cpu.localWarpPatch(cpu.frameById.get(cpu.warpObjectId)),{center,radius,ship}=patch;
 const side=ship.frame[2],up=ship.frame[1],depth=[side[1]*up[2]-side[2]*up[1],side[2]*up[0]-side[0]*up[2],side[0]*up[1]-side[1]*up[0]];
 let strokes=0,interior=0;
 cpu.drawLine=points=>{strokes++;for(const p of points)if(p){
  const delta=p.map((v,k)=>(v-center[k])/radius),coord=b=>delta.reduce((t,val,i)=>t+val*b[i],0);
  const r=Math.hypot(coord(side),coord(depth));assert(r<=WARP_GRID_RADIUS+1e-6);
  if(r<.8)interior++;
 }};
 for(const _ of cpu.localWarpGridStages(patch)){}
 assert(strokes>0&&interior>0,'The finite grid must draw lines in the flat interior');
 assert(WARP_GRID_SPACING<.25);assert.equal(warpGridSample(0,0,12,1).alpha,1);
 assert.equal(warpGridSample(.8,0,12,0).alpha,1);
 assert.equal(warpGridSample(1.38,0,12,1).alpha,0,'An exterior flat area fades before the geometric cutoff');
 assert(warpGridSample(1.05,0,12,1).alpha>.99,'The deformed wall stays visible');
 assert.equal(warpGridSample(WARP_GRID_RADIUS,0,1,3).alpha,0);
}finally{cpu.dispose();}

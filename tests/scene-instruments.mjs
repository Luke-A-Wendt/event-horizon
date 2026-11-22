import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {installPilotControls} from '../dist/pilot-ui.js';
import {installViewportUI} from '../dist/viewport-ui.js';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
for(const [id,width,height] of [['nasa-shuttle',1536,864],['shuttle-sgra-direct',375,667],['warp-lab',667,375],['radiant-descent',320,568],['orbital-expedition',390,844],['disk',1440,900]]){
 const fx=fixture({width,height}),d=uiDomFixture(html);globalThis.document=d;d.body=d.querySelector('body');globalThis.window=d.createElement('window');window.devicePixelRatio=1;window.innerWidth=width;window.innerHeight=height;window.matchMedia=()=>({matches:false});
 const $=s=>d.getElementById(s),r=new BlackHoleRenderer(fx.canvas,{autoStart:false,bindControls:false,deferProgram:true});r.loadScene(id);
 const optics=d.createElement('details');optics.className='geometry-panel';d.querySelector('.view-toolbar').append(optics);
 Object.defineProperty(Object.getPrototypeOf(d),'parentElement',{configurable:true,get(){return this.parentNode;}});
 const create=d.createElement;d.createElement=tag=>{const el=create(tag);if(tag==="progress")Object.defineProperty(el,"max",{writable:true,value:1});return el;};
 const api={renderer:()=>r,state:()=>r.state,objects:()=>r.getObjects(),activePreset:()=>r.sceneId,refresh(){},updateParameter:(k,v)=>r.update({[k]:v}),setFeature(){},selectObject(){},selectComponent(){},syncRendererState(){},markCustom(){},setPaused:v=>{r.state.paused=v;},syncViewMode(){},toast(){},openScenes(){},openHelp(){},openDialog:x=>$(x).showModal(),onDialogClose(){}};
 const ui=installViewportUI(api),p=installPilotControls({...api,mount:$('pilotControls')});const tick=()=>{ui.refresh(r.getState());p.update();};tick();const rail=$('sceneMetrics'),body=$('instrumentBody'),toggle=rail.querySelector('button');
 for(const metric of ['habitatFloorRadius','habitatSpinRate','habitatRimGravity','distance','distanceUnit','physicalDistance','pilotDilationRate','pilotDilation','pilotFlightAcceleration','pilotHorizonWarning','tourDistance','tourShipTime','pilotLegSpeed','renderStatus','fpsCorner','qualityTier','backendStatus','pilotFlightStage','pilotFlightRemaining','pilotDestination']){
  assert(body.contains($(metric)),metric+' is outside rail');
  assert.equal(d.querySelectorAll('#'+metric).length,1,metric+' duplicated');
 }
 for(const control of ['zoomIn','zoomOut','fullscreen','pilotModeAuto','pilotModeDrive','pilotPlaylist','pilotPower'])assert(!rail.contains($(control)),control+' is hidden by collapse');
 assert.equal(!!body.hidden,false,'The panel is open on initial load');
 assert.equal($('instrumentAction').textContent,'Minimize');
 const initialHidden=!!body.hidden;toggle.click();assert.equal($('instrumentAction').textContent,'Expand');assert.match(toggle.getAttribute('aria-label'),/^Expand /);assert.equal(!!body.hidden,!initialHidden);assert.equal(toggle.getAttribute('aria-expanded'),String(initialHidden));tick();assert.equal(!!body.hidden,!initialHidden);toggle.click();assert.equal(!!body.hidden,initialHidden);
 console.log(id,width+'x'+height,'OK: rail owns metric nodes, unique IDs, controls outside, collapse/sync.');
 p.dispose();r.dispose();
}

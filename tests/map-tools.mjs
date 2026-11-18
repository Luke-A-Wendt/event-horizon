import './fixtures/shuttle-bridge.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {installViewportUI} from '../dist/viewport-ui.js';
const markup=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
for(const compact of [false,true]){
const f=fixture(),document=uiDomFixture(markup);globalThis.document=document;
globalThis.window={devicePixelRatio:1,matchMedia:q=>({matches:q.includes('530px')&&compact}),addEventListener(){},removeEventListener(){}};
globalThis.requestAnimationFrame=fn=>{fn(performance.now());return 1;};globalThis.cancelAnimationFrame=()=>{};
const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene('solar-system');r.render();
let ui,custom=0,lastSelected=null,lastComponent=null;
const api={renderer:()=>r,objects:()=>r.getObjects(),state:()=>r.state,updateParameter:(k,v)=>r.update({[k]:v}),setFeature(){},selectObject:id=>{lastSelected=id;r.selectObject(id);},selectComponent:id=>{lastComponent=id;},refresh:()=>ui?.refresh(r.getState()),syncRendererState(){},markCustom(){custom++;},setPaused:value=>r.update({paused:value}),syncViewMode:mode=>r.setViewMode(mode),stageMutation:(_reason,fn)=>fn(),toast(){},openDialog:id=>document.getElementById(id).showModal(),onDialogClose(){},openScenes(){},openHelp(){},activePreset:()=>r.sceneId};
const optics=document.createElement('details');optics.className='geometry-panel';document.querySelector('.view-toolbar').append(optics);
ui=installViewportUI(api);const $=id=>{const node=document.getElementById(id);assert(node,`Control exists: ${id}`);return node;};

const ship=r.objects.find(x=>x.type==='shuttle');ui.openMap(ship.id);
const map=$('orbitMapDialog'),tab=k=>map.querySelector('button[data-map-tool="'+k+'"]'),pane=k=>map.querySelector('section[data-map-pane="'+k+'"]');
assert.equal(map.dataset.mapTool,compact?'map':'object');
assert.equal(tab('map').hidden,!compact);assert.equal(tab('flight').hidden,false);
for(const k of ['object','orbit','display','flight']){
 tab(k).click(); assert.equal(map.dataset.mapTool,k); assert.equal(tab(k).getAttribute('aria-pressed'),'true'); assert.equal(pane(k).hidden,false);
}
assert(pane('display').contains($('mapAmplification')));
assert(pane('orbit').contains($('mapOrbitMeters')));
assert(pane('object').contains($('mapBodyPicker')));
assert(pane('flight').contains($('mapDestination')));
if(compact){tab('map').click();assert.equal(map.dataset.mapTool,'map');assert($('orbitMapDrawing').innerHTML.includes('<svg'));}
// Dock opens the scene hierarchy even when the camera and selection are on a planet.
const sun=r.objects.find(x=>x.name==='Sun'),earth=r.objects.find(x=>x.name==='Earth'),moon=r.objects.find(x=>x.name==='Moon');
const tier=()=>Array.from($('mapBodyPicker').querySelectorAll('option'),o=>o.value),pick=id=>{ $('mapBodyPicker').value=id;$('mapBodyPicker').dispatch('change');};
map.close();r.selectedId=r.focusId=earth.id;$('mapToggle').click();
assert.equal($('orbitMapCenter').value,'space');assert($('mapParentUp').disabled);assert($('mapRemoveBranch').hidden);assert(!document.getElementById('mapRouteStrip'));
assert(tier().includes(sun.id)&&!tier().includes(earth.id));pick(sun.id);$('mapCenterSelected').click();
assert.equal($('orbitMapCenter').value,sun.id);assert(tier().includes(earth.id)&&!tier().includes(moon.id));pick(earth.id);
if(compact){$('mapInspectSelection').click();assert.equal(map.dataset.mapTool,'object');}
$('mapRemoveBranch').click();assert.match($('mapBranchPrompt').textContent,/Remove Earth and .*descendant/);$('mapBranchCancel').click();
assert(!$('mapQuickQueue').hidden,'Hierarchy can enqueue for the Auto vehicle while focused on a planet');$('mapQuickQueue').click();
assert.equal(r.getFlightSequence(ship.id).nodes.at(-1).targetId,earth.id);assert(map.open);assert.match($('mapActionStatus').textContent,/added to playlist/);
$('mapCenterSelected').click();assert(tier().includes(moon.id));assert.equal($('orbitMapCenter').value,earth.id);
$('mapAddChild').click();assert(!$('mapBranchEditor').hidden);const types=$('mapChildType').querySelectorAll('option').map(o=>o.value);assert(types.includes('moon')&&!types.includes('star'));$('mapChildType').value='moon';$('mapBranchCommit').click();
const newMoon=r.objects.find(o=>o.type==='moon'&&o.parentId===earth.id&&o.id!==moon.id);assert(newMoon);assert.equal($('mapBodyPicker').value,newMoon.id);
$('mapRemoveBranch').click();assert(!$('mapBranchEditor').hidden);$('mapBranchCancel').click();assert(r.objects.some(o=>o.id===newMoon.id));
$('mapRemoveBranch').click();$('mapBranchCommit').click();assert(!r.objects.some(o=>o.id===newMoon.id));assert.equal($('orbitMapCenter').value,earth.id);
$('mapParentUp').click();assert.equal($('orbitMapCenter').value,sun.id);assert.equal($('mapBodyPicker').value,earth.id);
$('mapBreadcrumbs').querySelector('[data-map-center="space"]').click();assert.equal($('orbitMapCenter').value,'space');
// Waypoints without a useful estimate can still be appended, including their configured arrival heading.
map.close();r.loadScene('test-shuttle-bridge');const bridgeCraft=r.objects.find(o=>o.type==='shuttle');r.selectedId=r.focusId=bridgeCraft.id;ui.sceneChanged();ui.openMap();tab('flight').click();
$('mapDestination').value='bridge-throat';$('mapDestination').dispatch('change');assert.equal($('mapTravelHeadingRow').hidden,false);$('mapTravelHeading').value='45';$('mapTravelHeading').dispatch('input');$('mapTravelQueue').click();
assert.equal(r.getFlightSequence(bridgeCraft.id).nodes.at(-1).heading,45);assert(map.open);
await new Promise(resolve=>setImmediate(resolve));ui.dispose();r.dispose();
}
console.log('PASS: desktop and phone map tool switching, flight availability and map return');

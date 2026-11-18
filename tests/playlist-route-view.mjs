import assert from 'node:assert/strict';
import {installPlaylistEditor} from '../dist/playlist-ui.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {uiDomFixture} from './ui-dom-fixture.mjs';

const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
try {
 r.loadScene('shuttle-earth-moon-loop');r.fillHoles();r.fillObjects();
 const craft=r.objects.find(o=>o.type==='shuttle'),sequence=()=>r.getFlightSequence(craft.id);
 const d=uiDomFixture('<dialog open><div id="editor"></div></dialog>'),mount=d.getElementById('editor');
 const editor=installPlaylistEditor(mount,{renderer:()=>r}),find=s=>mount.querySelector(s);
 const render=()=>editor.refresh(craft,sequence()),list=()=>find('#flightPlanStops');
 const rows=()=>list().querySelectorAll('li[data-stop-index]'),legs=()=>list().querySelectorAll('.flight-route-leg');
 const trigger=id=>find('[data-route-detail="'+id+'"]'),detail=id=>find('#flight-route-'+id);
 const lap=i=>find('[data-plan-laps="'+i+'"]'),remove=i=>find('[data-plan-remove="'+i+'"]').click();
 const before=JSON.stringify(sequence()),initial=sequence().nodes.map(n=>n.targetId);
 render();
 assert.equal(find('[role="tablist"]'),null,'The playlist opens directly into one itinerary');
 assert.equal(mount.querySelectorAll('ol').length,1,'Stop editing and transfer inspection share a single list');
 assert.equal(rows().length,2);assert(rows().every(row=>row.parentNode===list()));
 for(let i=0;i<2;i++){
  assert(rows()[i].contains(trigger('s'+i)));
  assert(rows()[i].contains(lap(i)),'Controls belong to the same stop as its properties');
  assert(rows()[i].contains(trigger('l'+i)),'Each edge belongs to its departure row');
 }
 assert.match(trigger('s0').textContent,/Earth/);assert.match(trigger('s1').textContent,/Moon/);
 assert.equal(legs().length,2);assert.match(trigger('l1').textContent,/return to.*Earth/i);
 assert.match(trigger('l0').textContent,/onboard/i);

 trigger('l0').click();assert(!detail('l0').hidden);assert.equal(trigger('l0').getAttribute('aria-expanded'),'true');
 for(const text of [/peak speed/i,/light-sec/i,/distant time/i,/clock difference/i])assert.match(detail('l0').textContent,text);
 trigger('s0').click();assert(!detail('s0').hidden);assert.match(detail('s0').textContent,/body mass/i);assert.match(detail('s0').textContent,/body radius/i);
 assert.equal(JSON.stringify(sequence()),before,'Reading visit and leg details must not change the running flight');

 const draft=lap(0);draft.focus();draft.value='3';render();
 assert.strictEqual(lap(0),draft);assert.strictEqual(d.activeElement,draft);assert.equal(draft.value,'3');
 assert.equal(trigger('s0').getAttribute('aria-expanded'),'true','Live refresh retains the disclosed body');
 draft.dispatch('change');
 assert.equal(sequence().nodes[0].extraLaps,3);
 find('#flightPlanLoop').click();
 assert.equal(sequence().loop,false);assert.equal(legs().length,1,'Turning off looping removes only the return edge');

 const picker=find('#flightPlanDestination');picker.value=initial[0];picker.dispatch('change');
 assert.deepEqual(sequence().nodes.map(n=>n.targetId),[initial[0],initial[1],initial[0]]);
 assert.equal(rows().length,3);assert.equal(legs().length,2);
 assert.notStrictEqual(trigger('s0'),trigger('s2'),'Returning to the same body is a separate editable visit');
 rows()[1].querySelector('.route-grip').dispatch('keydown',{key:'Home'});
 assert.deepEqual(sequence().nodes.map(n=>n.targetId),[initial[1],initial[0],initial[0]]);
 assert.match(trigger('s0').textContent,/Moon/);assert(rows()[0].contains(trigger('l0')));
 remove(2);remove(1);
 assert.equal(rows().length,1);assert.equal(legs().length,0);assert(trigger('s0'));
 // A vehicle parked in an orbit keeps its current body. An unparked one has a truly empty queue.
 r.loadScene('shuttle-space');r.fillHoles();r.fillObjects();
 const unparked=r.objects.find(o=>o.type==='shuttle');editor.refresh(unparked,r.getFlightSequence(unparked.id));
 assert.equal(rows().length,0);assert.equal(legs().length,0);assert.match(list().textContent,/no stops|empty|add.*stop/i);
 console.log('PASS: one editable flight itinerary, onboard transfers, physical details, draft preservation, loop changes, repeated stops, keyboard reorder, single and empty states.');
}finally{r.dispose();}

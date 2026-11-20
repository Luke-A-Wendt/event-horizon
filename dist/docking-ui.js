// The docking panel belongs to the observed Meridian. Keep the controls together
// so the crew can pick a station and either axial port without changing camera.
import {hullType} from './objects.js';
import {metricDistance,metricSpeed} from './metric-units.js';
import {formatClockDuration} from './object-clocks.js';

export function installDockingPanel(body,api){
 const panel=document.createElement('section');panel.className='docking-instruments';panel.hidden=true;panel.setAttribute('aria-label','Station docking');
 panel.innerHTML='<div class="docking-head"><div><small>Hub docking</small><strong id="dockStation"></strong></div><button type="button" id="dockOpen" aria-haspopup="dialog" aria-controls="dockingDialog">Docking</button></div><div id="dockReadings" hidden><div class="dock-progress"><p id="dockStage"></p><small id="dockPropulsion"></small></div><dl><div><dt id="dockRangeLabel">Port gap</dt><dd id="dockGap"></dd></div><div><dt id="dockSpeedLabel">Relative speed</dt><dd id="dockSpeed"></dd></div></dl></div>';
 const dialog=document.createElement('dialog');dialog.id='dockingDialog';dialog.setAttribute('aria-labelledby','dockTitle');
 dialog.innerHTML='<div class="dialog-header"><div><span class="eyebrow">NASA Meridian</span><h2 id="dockTitle">Station docking</h2></div><button class="icon-button" id="dockClose" aria-label="Close docking">×</button></div><div class="dock-dialog-body"><div class="dock-selects"><label>Station<select id="dockTarget"></select></label><label>Hub port<select id="dockPort"><option value="south">Lower (−axis)</option><option value="north">Upper (+axis)</option></select></label></div><p id="dockInstructions"></p><p id="dockError" role="alert" hidden></p><div class="dock-actions"><button type="button" id="dockTakeControl" hidden>Leave guidance</button><button type="button" class="dock-primary" id="dockCommit">Dock at station</button></div></div>';
 body.append(panel);document.body.append(dialog);
 const at=id=>panel.querySelector('#'+id)||dialog.querySelector('#'+id);
 const open=at('dockOpen'),target=at('dockTarget'),port=at('dockPort'),commit=at('dockCommit'),leave=at('dockTakeControl');
 let craftId=null,stationKey=null,stations=[],live=null,observedStationId=null;
 const set=(node,value)=>{if(node.textContent!==value)node.textContent=value;},portLabel=v=>v==='south'?'Lower':'Upper';
 function syncDialog(){
  if(!craftId)return;
  const key=JSON.stringify(stations.map(o=>[o.id,o.name]));
  if(key!==stationKey){
   const previous=target.value;target.textContent='';
   for(const s of stations){const opt=document.createElement('option');opt.value=s.id;opt.textContent=s.name||'Garden Station';target.append(opt);}
   target.value=stations.some(o=>o.id===previous)?previous:stations[0]?.id||'';stationKey=key;
  }
  if(live){target.value=live.stationId;port.value=live.port;}
  const held=!!live?.canUndock;
  target.disabled=port.disabled=!!live;
  commit.hidden=!!live&&!held;commit.disabled=held?false:!target.value;
  set(commit,held?'Undock':'Dock at station');
  leave.hidden=!live||held;
  const action=live?live.label||'Docking in progress':'';
  const detail=!live?'Start a docking maneuver now, or add the station in Playlist. The rim jets align Meridian with the selected hub port.':
   held?((live.automaticDeparture??live.loop)?'The ferry departs automatically. Undock now to leave the route and fly independently.':'The collars are latched. Undocking releases the shuttle and backs it away with rim jets.'):
   (action+(live.loop?' · Repeating ferry':'')+'.');
  set(at('dockInstructions'),detail);
 }
 function update(r,subject,state){
  const observedStation=subject?.type==='habitat'?subject:null,shuttles=observedStation?(r.objects||[]).filter(o=>hullType(o)==='shuttle'):[];
  // Don't choose arbitrarily between two shuttles. Each has its own docking desk.
  const craft=hullType(subject)==='shuttle'?subject:shuttles.length===1?shuttles[0]:shuttles.find(o=>o.id===r.driveId||o.id===r.selectedId);
  const id=craft?.id||null;
  stations=id&&typeof r?.startDocking==='function'&&r.hasHabitat!==false?(r.objects||[]).filter(o=>o.type==='habitat'):[];
  if(craftId!==id||observedStationId!==(observedStation?.id||null)){if(dialog.open)dialog.close();stationKey=null;}
  craftId=id;observedStationId=observedStation?.id||null;
  live=state||(observedStation&&id?r.getDockingState?.(id):null);panel.hidden=!craftId||(!stations.length&&!live)||!!(observedStation&&live&&live.stationId!==observedStationId);
  if(panel.hidden){if(dialog.open)dialog.close();return;}
  const readings=at('dockReadings');readings.hidden=!live;
  set(at('dockStation'),observedStation?craft.name||'NASA Meridian':live?live.stationName||'Orbital station':stations.length===1?stations[0].name||'Garden Station':'Station rendezvous');
  if(live){
   const phase=live.detail||live.label||'Docking',end=portLabel(live.port)+' port';
   set(at('dockStage'),phase+' · '+end);
   const near=live.rcsOnly??live.phase!=='transit',transit=live.phase==='transit',stationRange=!['approach','docked','undock'].includes(live.phase),propulsion=at('dockPropulsion');
   const firing=transit&&Number.isFinite(live.mainThrust)&&live.mainThrust>1e-4;
   propulsion.hidden=live.phase==='docked';set(propulsion,near?'Rim jets only':firing?live.mainThrust.toFixed(1)+'g main thrust':'Main engines off');propulsion.title=near?'Close maneuvers use the rim jets; the main engines stay off.':'Commanded main-engine thrust.';
   set(at('dockRangeLabel'),stationRange?'Station range':'Port gap');set(at('dockSpeedLabel'),transit&&!near?'Transfer ETA':'Relative speed');
   set(at('dockGap'),Number.isFinite(live.gapMeters)?metricDistance(Math.max(0,live.gapMeters)):'—');
   at('dockGap').title=stationRange?'Current distance to the target station center.':'Separation between the shuttle and station docking faces.';
   at('dockSpeed').title=transit&&!near?'Distant-frame time remaining in the transfer, before orbital rendezvous and docking.':'Speed relative to the station.';
   set(at('dockSpeed'),transit&&!near?formatClockDuration(live.remainingSeconds):Number.isFinite(live.relativeSpeed)?metricSpeed(Math.abs(live.relativeSpeed)):'—');
  }
  if(dialog.open)syncDialog();
 }
 open.addEventListener('click',()=>{
  if(!craftId)return;
  at('dockError').hidden=true;syncDialog();if(observedStationId&&!live)target.value=observedStationId;if(!dialog.open)dialog.showModal();
 });
 at('dockClose').addEventListener('click',()=>dialog.close());
 function action(method){
  const r=api.renderer();if(!craftId||!r)return;
  const result=method==='startDocking'?r.startDocking?.(craftId,target.value,port.value):r[method]?.(craftId);
  if(!result||result.error){set(at('dockError'),result?.error||r.lastDockingError||'This maneuver is unavailable.');at('dockError').hidden=false;return;}
  if(observedStationId&&method==='startDocking'&&target.value!==observedStationId)r.focusTarget?.(craftId,'track');
  dialog.close();api.setPaused?.(false);api.refresh?.();api.update?.();
 }
 commit.addEventListener('click',()=>action(live?.canUndock?'undock':'startDocking'));
 leave.addEventListener('click',()=>action('cancelDocking'));
 return {update,dispose(){dialog.remove();panel.remove();}};
}

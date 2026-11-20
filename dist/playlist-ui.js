import {sceneCruiseWarp} from './config.js';
import {disclosureAttrs,stopDetails,transferRow} from './playlist-route-view.js';
import {bridgeWorldLayout} from './proxima-gate-layout.js';
import {REFERENCE_RG_METERS} from './objects.js';
import {playlistRouteModel} from './playlist-route-model.js';
import {stopMinimumMeters} from './orbit-clearance.js';
import {edgeOrbitName} from './proximity-orbits.js';
export {edgeOrbitName};
// Keep editing independent of playback. All entry points read the current queue
// when the user acts, including previews opened before the current leg changed.
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function parkingDisplayScale(r,targetId){
 if(r.sceneId!=='earth-proxima-gates')return 1;
 const layout=bridgeWorldLayout(targetId==='bridge-far-world',r.sceneId);
 const source=r.delegate||r;
 if(!source.configCache?.bridgeRadius)return null;
 return layout.radiusMeters/(layout.radius*source.configCache.bridgeRadius*REFERENCE_RG_METERS);
}
function applyPlaylist(r,craftId,nodes,loop){
 const result=r.setFlightSequence?.(craftId,nodes,{loop});
 if(!result)return {error:'This playlist could not be saved. Use up to 64 stops.'};
 if(result.error)return result;
 if(result.nodes.length&&!result.active&&r.getNavigationState?.(craftId)?.mode!=='manual'){
  const started=r.startFlightSequence?.(craftId);
  if(!started||started.error)return {error:started?.error||r.getFlightSequence?.(craftId)?.error||'This route could not start.'};
 }
 return result;
}
export function appendPlaylistStop(r,craftId,targetId,warpFactor,heading=null){
 const craft=r?.objects?.find(o=>o.id===craftId),target=r?.getTravelTargets?.({craftId})?.find(t=>t.id===targetId);
 if(!craft||!target||r.getNavigationState?.(craftId)?.mode==='manual')return {error:'Choose an available destination in Auto.'};
 const q=r.getFlightSequence(craftId),node={targetId,...(target.dockable?{kind:'dock',port:'south'}:{}),...(craft.type==='enterprise'&&craft.hullModel!=='janusPod'?{warpFactor:warpFactor??sceneCruiseWarp(r.sceneId)??1}:{}),...(target.waypoint&&Number.isFinite(heading)?{heading}:{})};
 return applyPlaylist(r,craftId,[...q.nodes,node],q.loop);
}

export function installPlaylistEditor(mount,api){
 mount.innerHTML='<div class="route-editor-head"><strong id="flightPlanTitle">Itinerary</strong><select id="flightPlanDestination" aria-label="Add an orbit, waypoint or station docking stop"></select><button id="flightPlanLoop" type="button" aria-pressed="false" title="Repeat the playlist"><span aria-hidden="true">↻</span> Loop</button></div><ol id="flightPlanStops" aria-label="Stops and transfers in travel order"></ol><p class="flight-route-note" hidden>Transfer times are onboard estimates from current body positions, excluding parking orbits.</p><p id="flightPlanLapHelp" class="route-lap-help" hidden>Full laps are complete orbits before departure. Set 0 for the departure arc alone.</p><p id="flightPlanStatus" role="status" hidden></p>';
 const find=id=>mount.querySelector('#'+id),stops=find('flightPlanStops'),picker=find('flightPlanDestination'),loop=find('flightPlanLoop'),status=find('flightPlanStatus');
 let craftId=null,targetKey='',rowKey='',optionsKey='',viewKey='',visitOrder='',open='',current=-1,names=new Map(),localError='';
 function disclose(id){
  const previous=open;open=previous===id?'':id;
  for(const k of new Set([previous,id]))if(k){
   const button=stops.querySelector('[data-route-detail="'+k+'"]'),panel=find('flight-route-'+k);
   button?.setAttribute('aria-expanded',String(open===k));if(panel)panel.hidden=open!==k;
  }
 }
 mount.closest('dialog')?.addEventListener('close',()=>{viewKey='';open='';});
 const targetName=t=>t.name||t.label||t.id;
 function targets(r,id,force=false){
  const key=[r.sceneId,id,r.geometryRevision,r.objects?.length,r.state?.bridge].join('|');
  if(!force&&key===targetKey)return;
  targetKey=key;
  const options=r.getTravelTargets?.({craftId:id})||[];
  const nextKey=JSON.stringify(options.map(t=>[t.id,targetName(t),!!t.waypoint,!!t.dockable]));
  if(nextKey===optionsKey)return;optionsKey=nextKey;viewKey='';
  names=new Map(options.map(t=>[t.id,targetName(t)]));
  picker.innerHTML='<option value="">Next stop…</option>'+options.map(t=>'<option value="'+escape(t.id)+'">'+escape(targetName(t))+' · '+(t.dockable?'dock':t.waypoint?'waypoint':'orbit')+'</option>').join('');
  picker.value='';
 }
 const rowsKey=(r,craft,q)=>JSON.stringify([craft.id,q.nodes,r.state?.mass,r.state?.spin,r.state?.diskThickness,r.state?.disk,craft.scale]);
 function refresh(craft,q){
  const r=api.renderer();if(!craft||!q)return;
  if(craftId!==craft.id||targetKey.split('|')[0]!==String(r.sceneId)){craftId=craft.id;targetKey=rowKey=viewKey=visitOrder=open='';localError='';}
  targets(r,craft.id);
  const key=rowsKey(r,craft,q),source=r.delegate||r,ready=!!(source.configCache?.primaryBasis&&source.getFocusFrame);
  const replay=q.loop&&q.restartOnLoop;
  const snapshotKey=JSON.stringify([key,!!q.loop,!!replay,r.sceneRevision,r.geometryRevision,ready]);
  if(snapshotKey!==viewKey){
   // Recalculate once per edit or dialog opening, never on each playback tick.
   const order=JSON.stringify(q.nodes.map(n=>n.targetId));if(order!==visitOrder)open='';visitOrder=order;
   const model=ready&&q.nodes.length?playlistRouteModel(r,craft,q):{
    stops:q.nodes.map(n=>({name:names.get(n.targetId)||n.targetId,kind:n.kind,port:n.port,orbitRadiusMeters:n.radiusMeters})),
    legs:q.nodes.flatMap((n,i)=>q.nodes.length>1&&(i+1<q.nodes.length||(q.loop&&!replay))?[{fromIndex:i,toIndex:(i+1)%q.nodes.length,error:'Waiting for scene geometry.'}]:[])};
   const legs=new Map(model.legs.map(l=>[l.fromIndex,l]));
   if(open.startsWith('l')&&!legs.has(Number(open.slice(1))))open='';
   rowKey=key;viewKey=snapshotKey;current=-1;
   find('flightPlanTitle').textContent=q.nodes.length===1?'1 stop':q.nodes.length+' stops';
   const note=mount.querySelector('.flight-route-note');note.hidden=!model.legs.length&&!replay;
   note.textContent=r.sceneId==='earth-proxima-gates'?'Meridian flips halfway through each local transfer to brake. When the gates open, it crosses between the two orbital systems.':q.propulsion==='bridge'?'Warp holds the local orbit for the specified laps. Between bodies, Janus exchanges its orbital frame through its onboard bridge.':q.nodes.some(n=>n.kind==='dock')?'Station legs include a 1g transfer when needed, orbital rendezvous and a rim-jet approach. Open a leg for its estimate.':replay?'Transfer times exclude parking orbits. After the final lap, playback restarts at the first orbit.':'Transfer times are onboard estimates from current body positions, excluding parking orbits.';
   stops.innerHTML=q.nodes.length?q.nodes.map((n,i)=>{
    const name=escape(names.get(n.targetId)||n.targetId),waypoint=n.kind==='waypoint',dock=n.kind==='dock';
    const field=dock?'<label>Hub port<select data-plan-port="'+i+'" aria-label="Docking port at '+name+'"><option value="south"'+(n.port!=='north'?' selected':'')+'>Lower</option><option value="north"'+(n.port==='north'?' selected':'')+'>Upper</option></select></label>':waypoint&&q.propulsion!=='bridge'?'<label>Heading <input type="number" min="-180" max="180" step="any" data-plan-heading="'+i+'" aria-label="Arrival heading at '+name+' in degrees" placeholder="Auto" value="'+(Number.isFinite(n.heading)?n.heading:'')+'"></label>':'';
    const compact=!dock&&!waypoint&&!r.state?.bridge&&r.getFocusFrame?.(n.targetId)?.collapsed,minimum=compact?stopMinimumMeters(r,craft,n.targetId)/1000:.001;
    const stop=model.stops[i],id='s'+i;let stopDetail=q.propulsion==='bridge'?(waypoint?'Waypoint · hold':'Local warp orbit'):dock?'Dock at station':stop.flyThrough?'Fly-through':waypoint?'Waypoint · rest':'Orbit';
    if(r.sceneId==='nasa-shuttle'&&compact&&n.radiusMeters){
     stopDetail=edgeOrbitName(r,craft,n.targetId,n.radiusMeters,q.nodes.filter(stop=>stop.targetId===n.targetId&&stop.radiusMeters).map(stop=>stop.radiusMeters));
    }
    const radius=!dock&&!waypoint&&n.radiusMeters&&ready?'<label>'+(compact?'Circle radius':'Radius')+' (km)<input type="number" min="'+minimum+'" step="any" data-plan-radius="'+i+'" aria-label="Circle radius around '+name+' in kilometres" value="'+n.radiusMeters*parkingDisplayScale(r,n.targetId)/1000+'"></label>'+(compact?'<button type="button" data-plan-closest="'+i+'" title="'+(r.sceneId==='nasa-shuttle'?'Closest stable circular orbit in this flight plan':'Smallest circle that keeps the vehicle outside the horizon')+'">Closest</button>':''):'';
    const laps=waypoint||dock?'':'<label>Full laps<input type="number" min="0" max="99" step="1" required inputmode="numeric" data-plan-laps="'+i+'" aria-label="Full laps around '+name+' before departure" aria-describedby="flightPlanLapHelp" value="'+(n.extraLaps??0)+'"></label>';
    if(n.transferProperSeconds)stopDetail+=' · '+Number((n.transferProperSeconds/60).toFixed(2))+' min warp leg';
    const warp=craft.type==='enterprise'&&q.propulsion!=='bridge'&&!n.transferProperSeconds?'<label>Warp <input type="number" min="'+(sceneCruiseWarp(r.sceneId) ? .1 : 0)+'" max="'+(sceneCruiseWarp(r.sceneId)??9.9999)+'" step="0.1" data-plan-warp="'+i+'" aria-label="Warp for '+name+'" value="'+Number(n.warpFactor??sceneCruiseWarp(r.sceneId)??(q.holding?r.state.warpFactor:1))+'"></label>':'';
    return '<li data-stop-index="'+i+'"><div class="route-stop-card"><button type="button" class="route-grip" aria-label="Reorder '+name+' with Up or Down" title="Drag to reorder · ↑ / ↓">⠿</button><span class="route-number">'+(i+1)+'</span><button type="button" class="route-stop-name" '+disclosureAttrs(id,open===id)+' title="Show stop details"><strong>'+name+'</strong><small>'+escape(stopDetail)+'</small></button><div class="route-stop-fields">'+field+radius+laps+warp+'</div><div class="route-edit-actions"><button type="button" data-plan-remove="'+i+'" aria-label="Remove '+name+'">×</button></div></div>'+stopDetails(stop,n,i,open)+transferRow(model,legs.get(i),open)+'</li>';
   }).join(''):'<li class="route-empty">No stops yet. Choose a destination above or add one from the Map.</li>';
   find('flightPlanLapHelp').textContent=q.propulsion==='bridge'?'Each lap is a complete local orbit before the next exchange. At a waypoint the pod holds position.':'Full laps are complete orbits before departure. Set 0 for the departure arc alone.';
   find('flightPlanLapHelp').hidden=!q.nodes.some(n=>n.kind==='orbit');
  }
  const next=q.active&&!q.error?q.index:-1;
  if(next!==current){const old=stops.querySelector('[aria-current="step"]');old?.removeAttribute('aria-current');stops.querySelector('[data-stop-index="'+next+'"]')?.setAttribute('aria-current','step');current=next;}
  loop.setAttribute('aria-pressed',String(!!q.loop));loop.title=replay?'Loop on · restart at the first orbit after the final lap':q.loop?'Loop on · repeat the playlist':'Loop off · hold at the last stop';
  picker.disabled=!names.size||q.nodes.length>=64;
  const dock=craft.type==='shuttle'?r.getDockingState?.(craft.id):null;
  const message=localError||q.error||(dock?((dock.stationName||'Station')+' · '+(dock.detail||dock.label||'Docking')):'');
  status.classList.toggle('guidance-status',!!message&&!localError&&!q.error);if(status.textContent!==message)status.textContent=message;status.hidden=!message;
 }
 function state(){const r=api.renderer(),craft=r?.objects?.find(o=>o.id===craftId);return craft&&r.getNavigationState?.(craftId)?.mode!=='manual'?{r,craft,q:r.getFlightSequence(craftId)}:null;}
 function finish(ctx,result,focus){
  localError=result?.error||'';api.refresh?.();refresh(ctx.craft,ctx.r.getFlightSequence(ctx.craft.id));
  if(focus){const item=stops.querySelector(focus);if(item&&!item.disabled)item.focus?.();else picker.focus?.();}
 }
 picker.addEventListener('focus',()=>{const ctx=state();if(ctx)targets(ctx.r,craftId,true);});
 picker.addEventListener('change',()=>{const ctx=state(),id=picker.value;picker.value='';if(!ctx||!id)return;finish(ctx,appendPlaylistStop(ctx.r,craftId,id));if(!localError)stops.lastElementChild?.scrollIntoView?.({block:'nearest'});});
 loop.addEventListener('click',()=>{const ctx=state();if(ctx)finish(ctx,applyPlaylist(ctx.r,craftId,ctx.q.nodes,!ctx.q.loop));});
 let drag=null;
 function move(from,to,key){
  const ctx=state();if(!ctx||rowsKey(ctx.r,ctx.craft,ctx.q)!==key||from===to||to<0||to>=ctx.q.nodes.length)return;
  const nodes=ctx.q.nodes.slice();nodes.splice(to,0,nodes.splice(from,1)[0]);
  finish(ctx,applyPlaylist(ctx.r,craftId,nodes,ctx.q.loop),'[data-stop-index="'+to+'"] .route-grip');
 }
 function paint(){
  if(!drag)return;
  const rows=[...stops.children];let to=0;
  for(const row of rows){if(row===drag.row)continue;const b=row.getBoundingClientRect();if(drag.y>b.top+b.height/2)to++;}
  drag.to=to;rows.forEach((r,i)=>{r.classList.toggle('insert-before',i===to&&to<drag.from);r.classList.toggle('insert-after',i===to&&to>drag.from);});
 }
 function scrollFrame(){
  if(!drag?.active)return;
  const d=mount.closest('dialog'),b=d.getBoundingClientRect(),v=drag.y<b.top+48?-9:drag.y>b.bottom-48?9:0;
  if(v){d.scrollTop+=v;paint();}
  drag.frame=requestAnimationFrame(scrollFrame);
 }
 function end(commit){
  if(!drag)return;const d=drag;drag=null;clearTimeout(d.timer);cancelAnimationFrame(d.frame||0);
  for(const r of stops.children)r.classList.remove('dragging','insert-before','insert-after');
  if(stops.hasPointerCapture?.(d.id))stops.releasePointerCapture(d.id);
  if(commit&&d.active)move(d.from,d.to,d.key);
 }
 stops.addEventListener('pointerdown',e=>{
  const row=e.target.closest('[data-stop-index]');if(!row||drag||e.button!==0||!e.target.closest('.route-grip'))return;
  const from=Number(row.dataset.stopIndex);drag={id:e.pointerId,row,from,to:from,y:e.clientY,start:e.clientY,key:rowKey};
  stops.setPointerCapture(e.pointerId);
  drag.timer=setTimeout(()=>{if(drag){drag.active=true;row.classList.add('dragging');paint();scrollFrame();}},180);
 });
 stops.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;drag.y=e.clientY;if(!drag.active&&Math.abs(drag.y-drag.start)>5){clearTimeout(drag.timer);drag.active=true;drag.row.classList.add('dragging');scrollFrame();}if(drag.active)paint();});
 stops.addEventListener('pointerup',e=>{if(drag?.id===e.pointerId){drag.y=e.clientY;if(drag.active)paint();end(true);}});
 for(const ev of ['pointercancel','lostpointercapture'])stops.addEventListener(ev,()=>end(false));
 mount.closest('dialog')?.addEventListener('close',()=>end(false));
 stops.addEventListener('keydown',e=>{if(!e.target.closest('.route-grip')||!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const i=Number(e.target.closest('li').dataset.stopIndex);move(i,e.key==='Home'?0:e.key==='End'?stops.children.length-1:i+(e.key==='ArrowUp'?-1:1),rowKey);});
 stops.addEventListener('click',event=>{
  const btn=event.target.closest('button');if(!btn||btn.disabled)return;
  const detail=btn.getAttribute('data-route-detail');if(detail){disclose(detail);return;}
  const ctx=state();if(!ctx)return;
  if(btn.getAttribute('data-plan-closest')!==null){const i=Number(btn.getAttribute('data-plan-closest')),node=ctx.q.nodes[i];if(node){const nodes=ctx.q.nodes.map((n,j)=>j===i?{...n,radiusMeters:stopMinimumMeters(ctx.r,ctx.craft,node.targetId)}:n);finish(ctx,applyPlaylist(ctx.r,craftId,nodes,ctx.q.loop));}return;}
  const action=['up','down','remove'].find(a=>btn.getAttribute('data-plan-'+a)!==null);if(!action)return;
  const nodes=ctx.q.nodes.slice(),i=Number(btn.getAttribute('data-plan-'+action));if(!nodes[i])return;
  let j=i;if(action==='remove'){nodes.splice(i,1);j=Math.min(i,nodes.length-1);}else{j=i+(action==='up'?-1:1);if(!nodes[j])return;[nodes[i],nodes[j]]=[nodes[j],nodes[i]];}
  finish(ctx,applyPlaylist(ctx.r,craftId,nodes,ctx.q.loop),'[data-plan-'+action+'="'+j+'"]');
 });
 stops.addEventListener('change',event=>{
  const input=event.target,ctx=state();if(!ctx)return;
  const type=input.getAttribute('data-plan-port')!==null?'port':input.getAttribute('data-plan-radius')!==null?'radius':input.getAttribute('data-plan-heading')!==null?'heading':input.getAttribute('data-plan-warp')!==null?'warp':input.getAttribute('data-plan-laps')!==null?'laps':null;if(!type)return;
  const nodes=ctx.q.nodes.map(n=>({...n})),i=Number(input.getAttribute('data-plan-'+type)),n=nodes[i];if(!n)return;
  if(input.validity&&!input.validity.valid&&!(type==='warp'&&input.validity.stepMismatch&&!input.validity.rangeOverflow&&!input.validity.rangeUnderflow)){input.reportValidity?.();return;}
  const val=Number(input.value);if(type==='heading'&&input.value==='')delete n.heading;
  else if(type==='port'&&n.kind==='dock'&&['north','south'].includes(input.value))n.port=input.value;
  else if(type==='radius'&&val>0)n.radiusMeters=val*1000/parkingDisplayScale(ctx.r,n.targetId);
  else if(type==='heading'&&Number.isFinite(val)&&Math.abs(val)<=180)n.heading=val;
  else if(type==='laps'&&n.kind==='orbit'&&input.value!==''&&Number.isInteger(val)&&val>=0&&val<=99){n.extraLaps=val;delete n.defaultExtraLaps;}
  else if(type==='warp'&&input.value!==''&&Number.isFinite(val)&&val>=0&&val<10)n.warpFactor=Math.min(sceneCruiseWarp(ctx.r.sceneId)??9.9999,val);
  else {viewKey='';refresh(ctx.craft,ctx.q);return;}
  viewKey='';finish(ctx,applyPlaylist(ctx.r,craftId,nodes,ctx.q.loop),'[data-plan-'+type+'="'+i+'"]');
 });
 return {refresh};
}

// The bridge uses its own navigation chart and phase clock. Never infer an
// intergalactic velocity or ETA by dividing the endpoint separation by time.
const coordinates='@janus-local-position',address='@janus-galactic-address';
const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
const name=(state,id)=>state.targets?.find(t=>t.id===id)?.label;
const location=s=>(s.currentLabel||name(s,s.currentId)||'Open space')+(s.currentKind==='orbit'?' orbit':'');
const nextName=s=>s.active||s.destinationId?s.destinationLabel||name(s,s.destinationId):null;
const phases={local:'Local warp maneuver',charge:'Charging bridge',settle:'Closing bridge'};
function status(s){
 if(s.stage==='local')return 'Matching '+(nextName(s)||'local position');
 if(s.stage==='charge')return 'Target: '+(nextName(s)||'destination');
 if(s.stage==='settle')return 'Arrived · '+location(s);
 if(s.auto&&s.currentKind==='orbit'&&s.laps)return 'Local warp orbit · '+Math.round(100*s.progress)+'%'+(nextName(s)?' · Next: '+nextName(s):'')+(s.loop?' · Loop':'');
 if(s.auto&&nextName(s))return 'Next: '+nextName(s)+(s.loop?' · Loop':'');
 return s.auto?'Finishing visit':'Ready for exchange';
}
export function installJanusControls(body,api){
 const panel=document.createElement('section');panel.className='janus-instruments';panel.hidden=true;panel.setAttribute('aria-label','Centered bridge');
 panel.innerHTML='<div class="docking-head"><div><small>Einstein–Rosen bridge</small><strong id="janusPhase" aria-live="polite" aria-atomic="true"></strong></div><button type="button" id="janusOpen" aria-label="Open bridge controls" aria-haspopup="dialog" aria-controls="janusDialog">Bridge</button></div><span id="janusDetail"></span><progress id="janusProgress" max="1" value="0" aria-label="Bridge phase progress" hidden></progress>';
 const dialog=document.createElement('dialog');dialog.id='janusDialog';dialog.setAttribute('aria-labelledby','janusTitle');
 dialog.innerHTML=`<div class="dialog-header"><div><span class="eyebrow">NASA Janus · navigation</span><h2 id="janusTitle">Centered bridge</h2></div><button type="button" id="janusClose" class="icon-button" aria-label="Close bridge controls">×</button></div>
 <div class="dock-dialog-body"><p class="janus-intro">The bridge forms at the cabin’s center. When it opens, the pod exchanges places with the destination; the crew clock keeps running.</p>
 <div class="janus-location"><span>Present location</span><strong id="janusOrigin"></strong></div><small id="janusAddress" hidden></small>
 <label class="janus-target">Exchange destination<select id="janusTarget"></select></label>
 <fieldset id="janusCoordinates" hidden><legend id="janusUnits">Local chart coordinates · km</legend><div class="local-position-grid"><label>X<input id="janusX" type="number" step="any" min="-1000000000" max="1000000000" value="0"></label><label>Y<input id="janusY" type="number" step="any" min="-1000000000" max="1000000000" value="0"></label><label>Z<input id="janusZ" type="number" step="any" min="-1000000000" max="1000000000" value="0"></label></div><small id="janusAxisHint"></small></fieldset>
 <div class="janus-options"><label><input type="checkbox" id="janusAuto"> Automatic exchanges</label><label><input type="checkbox" id="janusLoop"> Loop route</label></div>
 <p id="janusRouteNote"></p><button type="button" id="janusUseTarget" class="outline-button" hidden>Add to playlist</button><p id="janusError" role="alert" hidden></p>
 <div class="dock-actions"><button type="button" id="janusEngage" class="dock-primary">Exchange now</button></div></div>`;
 body.append(panel);document.body.append(dialog);
 const at=id=>panel.querySelector('#'+id)||dialog.querySelector('#'+id);
 const target=at('janusTarget'),error=at('janusError'),engage=at('janusEngage'),coords=at('janusCoordinates'),loop=at('janusLoop'),auto=at('janusAuto');
 let craftId=null,sceneId=null,state=null,optionsKey='',coordinateMode=null,entries={};
 function setCoordinateMode(id){
  const next=id===coordinates||id===address?id:null;
  if(next===coordinateMode)return;
  const inputs=['X','Y','Z'].map(axis=>at('janus'+axis));
  if(coordinateMode)entries[coordinateMode]=inputs.map(i=>i.value);
  if(next)inputs.forEach((el,i)=>{el.value=entries[next]?.[i]??'';});
  coordinateMode=next;
 }
 const readPosition=limit=>{
  const values=['X','Y','Z'].map(axis=>at('janus'+axis).value.trim());
  return values.every(x=>x!==''&&Number.isFinite(Number(x))&&Math.abs(Number(x))<=limit)?values.map(Number):null;
 };
 function syncDialog(){
  if(!state)return;
  const targets=state.targets||[],key=JSON.stringify([state.currentId,...targets.map(t=>[t.id,t.label])]);
  if(key!==optionsKey){
   const previous=target.value;target.textContent='';
   for(const t of [...targets,{id:coordinates,label:'Local coordinates…'},{id:address,label:'Deep-space address…'}]){
    const opt=document.createElement('option');opt.value=t.id;opt.textContent=t.label+(t.id===state.currentId?' (here)':'');opt.disabled=t.id===state.currentId;target.append(opt);
   }
   const valid=id=>id&&id!==state.currentId&&(id===coordinates||id===address||targets.some(t=>t.id===id));
   target.value=(valid(previous)&&previous)||(valid(state.destinationId)&&state.destinationId)||targets.find(t=>valid(t.id))?.id||coordinates;
   optionsKey=key;
  }
  text(at('janusOrigin'),location(state));
  const addr=at('janusAddress');addr.hidden=!state.addressLy;
  if(state.addressLy)text(addr,'Address from Sol · '+state.addressLy.map(x=>String(Number(x.toPrecision(8)))).join(', ')+' ly');
  setCoordinateMode(target.value);
  const busy=state.active;
  target.disabled=!!busy;coords.hidden=target.value!==coordinates&&target.value!==address;
  if(!coords.hidden){
   const deep=target.value===address,limit=deep?5e10:1e9;
   text(at('janusUnits'),deep?'Deep-space address · light-years':'Local chart coordinates · km');
   text(at('janusAxisHint'),deep?'Measured from Sol, up to ±50 billion light-years on each axis.':'Measured from the current chart’s origin, up to ±1 billion km on each axis.');
   for(const axis of ['X','Y','Z']){const input=at('janus'+axis);input.setAttribute('min',String(-limit));input.setAttribute('max',String(limit));}
  }
  auto.checked=!!state.auto;loop.checked=!!state.loop;
  const stops=state.stops||[],canPick=target.value!=='janus-departure'&&targets.some(t=>t.id===target.value&&t.id!==state.currentId);
  auto.disabled=!state.auto&&!stops.length&&!canPick;loop.disabled=stops.length<2;
  at('janusUseTarget').hidden=busy||!canPick||stops.length>=64;
  const route=stops.slice(0,3).map(id=>name(state,id)).filter(Boolean).join(' → ')+(stops.length>3?' (+ '+(stops.length-3)+' more)':'');
  text(at('janusRouteNote'),busy?(phases[state.stage]||'Exchanging')+' · '+status(state):route?'Auto route: '+route+'. '+(state.auto?'Following route.':'Standing by.'):state.auto?(state.loop?'Auto follows the route in a loop.':'Auto stops after the last arrival.'):!targets.length?'Choose a deep-space address or local position, or add a waypoint in Objects and select it here.':'Exchange now for one jump, or use Drive for thrusters and warp.');
  engage.disabled=!!busy||!target.value||target.value===state.currentId;
  text(engage,busy?phases[state.stage]||'Exchanging':'Exchange now');
 }
 function update(r,craft,s,visible=true){
  const id=craft&&s?craft.id:null;
  if(id!==craftId||sceneId!==r?.sceneId){if(dialog.open)dialog.close();optionsKey='';target.value='';error.hidden=true;entries={};coordinateMode=null;}
  craftId=id;sceneId=r?.sceneId;state=id?s:null;panel.hidden=!state||!visible;
  if(!state)return;
  text(at('janusPhase'),phases[s.stage]||location(s));
  text(at('janusDetail'),status(s));
  const bar=at('janusProgress');bar.hidden=!s.active&&!(s.auto&&s.currentKind==='orbit');
  if(!bar.hidden)bar.value=Math.min(1,Math.max(0,Number(s.progress)||0));
  if(dialog.open)syncDialog();
 }
 function fail(message){text(error,message);error.hidden=false;}
 function refresh(){api.refresh?.();api.update?.();}
 function open(id=null){
  if(!state)return false;
  if(id&&!(state.targets||[]).some(t=>t.id===id))return false;
  if(id===state.currentId&&id)return false;
  syncDialog();error.hidden=true;
  if(id&&!state.active){target.value=id;syncDialog();}
  if(!dialog.open)dialog.showModal();
  return true;
 }
 function jump(id){
  if(!craftId||!state||state.active||!id||id===state.currentId)return false;
  let destination=id;
  if(id===coordinates||id===address){const deep=id===address,values=readPosition(deep?5e10:1e9);if(!values){fail(deep?'Enter three coordinates within ±50 billion light-years.':'Enter three coordinates within ±1 billion km.');return false;}
   destination=deep?{addressLy:values,label:'Deep space'}:{position:values.map(x=>x*1000),label:'Local coordinates'};
  }
  else if(!state.targets?.some(t=>t.id===id))return false;
  const r=api.renderer(),result=r.startJanusExchange(craftId,destination);
  if(!result||result.error){const msg=result?.error||r.lastJanusError||'The bridge could not acquire that destination.';if(dialog.open)fail(msg);else api.toast?.(msg);return false;}
  if(dialog.open)dialog.close();api.setPaused?.(false);refresh();return true;
 }
 at('janusOpen').addEventListener('click',()=>open());at('janusClose').addEventListener('click',()=>dialog.close());
 target.addEventListener('change',()=>{error.hidden=true;syncDialog();});
 engage.addEventListener('click',()=>jump(target.value));
 function chooseRoute(){
  if(!craftId||!state||state.active||!state.targets.some(t=>t.id===target.value&&t.id!==state.currentId))return false;
  const r=api.renderer(),q=r.getFlightSequence(craftId);
  const nodes=q.nodes.length?q.nodes.slice():state.currentId?[{targetId:state.currentId}]:[];
  nodes.push({targetId:target.value});return !!r.setFlightSequence(craftId,nodes,{loop:!!loop.checked});
 }
 at('janusUseTarget').addEventListener('click',()=>{if(!chooseRoute())fail('Unable to set this route.');else error.hidden=true;refresh();});
 auto.addEventListener('change',()=>{
  if(!craftId)return;const r=api.renderer(),on=auto.checked;
  if(on&&!state.stops?.length&&!chooseRoute()){fail('Choose a planet or waypoint to start an automatic route.');return;}
  if(on&&r.getNavigationState?.(craftId)?.mode==='manual')r.setNavigationMode(craftId,'auto');
  const result=r.setJanusAuto(craftId,on);if(result===false||result?.error)fail(result?.error||'No automatic route is available.');
  else{error.hidden=true;if(on){dialog.close();api.setPaused?.(false);}}
  refresh();
 });
 loop.addEventListener('change',()=>{if(craftId){api.renderer().setJanusLoop(craftId,loop.checked);refresh();}});
 return {update,open,jump,dispose(){dialog.remove();panel.remove();}};
}

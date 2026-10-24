import { PHOTO_PRESETS, createPhotoRender } from './photo-renderer.js';

// The viewport owns navigation. Existing property controls are moved, never
// cloned, so every slider has one state and one accessible label.
export function installViewportUI(api){
 const $=id=>document.getElementById(id),scene=$('scene'),controls=document.querySelector('.controls');
 const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
 const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let panel=null,selection='primary',lastSignature='',lastTargetSignature='',lastFocusedId=null,lastVRError='',lastChromeSignature='',photoAbort=null,photoUrl=null,vrSupport=null;
 const componentEntries=[['primary','Black hole','blackHole','blackhole'],['binary','Companion','binary','blackhole'],['disk','Accretion disc','disk','blackhole'],['jets','Polar jets','jets','arrow'],['stars','Starfield','stars','spark'],['nebula','Nebula','nebula','cloud'],['planet','Planet','planet','orbit'],['tidalStar','Disrupting star','tidalStar','spark'],['warp','Warp field','warp','warp'],['bridge','Einstein–Rosen bridge','bridge','warp']];
 const shell=document.createElement('div');shell.className='viewport-ui';shell.innerHTML=`
 <button class="viewport-scenes" id="viewportScenes">${icon('scenes')}<span>Scenes</span>${icon('down')}</button>
 <div class="viewport-dock" role="toolbar" aria-label="Explore the scene">
  <button id="elementsToggle" data-view-panel="elements" aria-expanded="false" aria-controls="elementsPanel">${icon('select')}<span>Elements</span></button>
  <button id="cameraToggle" data-view-panel="camera" aria-expanded="false" aria-controls="cameraPanel">${icon('video')}<span>Camera</span></button>
  <button id="displayToggle" data-view-panel="display" aria-expanded="false" aria-controls="displayPanel">${icon('environment')}<span>Display</span></button>
  <span class="dock-separator"></span><button id="viewportPause" aria-label="Pause simulation" title="Pause simulation"><span class="pause-glyph">${icon('pause')}</span><span id="viewportPauseLabel">Pause</span></button>
  <button id="pictureToggle" aria-haspopup="dialog" aria-controls="pictureDialog">${icon('camera')}<span>Picture</span></button>
  <button id="viewportHelp" aria-label="How to explore">${icon('help')}<span>Help</span></button>
 </div>
 <section id="elementsPanel" class="viewport-popover elements-popover" aria-labelledby="elementsPanelTitle" hidden>
  <div class="viewport-panel-heading"><div><small>COMPOSE YOUR UNIVERSE</small><h3 id="elementsPanelTitle">Scene elements</h3></div><button class="icon-button" data-close-view-panel aria-label="Close elements">${icon('close')}</button></div>
  <p class="viewport-panel-intro">Select a name to edit it. Switches control visibility. Track gets you close; Ride looks around on board.</p>
  <button id="viewportAdd" class="viewport-add">＋ Add an object <span>Craft · people · planets · stars</span></button>
  <div id="viewportElements" class="viewport-elements"></div>
 </section>
 <section id="cameraPanel" class="viewport-popover camera-popover" aria-labelledby="cameraPanelTitle" hidden>
  <div class="viewport-panel-heading"><div><small>CHOOSE YOUR PERSPECTIVE</small><h3 id="cameraPanelTitle">Camera</h3></div><button class="icon-button" data-close-view-panel aria-label="Close camera">${icon('close')}</button></div>
  <div id="cameraControlSlot"></div><p class="viewport-mode-note" id="viewportModeNote">Orbit a subject. Scroll or pinch to set your distance.</p>
  <div class="camera-target-controls"><label for="viewportTarget">FOLLOW A BODY</label><select id="viewportTarget"></select><div class="viewport-camera-actions"><button id="viewportTrack" class="outline-button">Track</button><button id="viewportRide" class="outline-button">Ride · 360°</button></div><button id="viewportCockpit" class="outline-button cockpit-action viewport-wide" hidden>${icon('video')}Cockpit view</button></div>
  <button id="viewportReset" class="outline-button viewport-wide">${icon('reset')}Reset scene view</button>
  <div class="vr-entry"><button id="enterVR" class="outline-button">${icon('vr')}Enter VR</button><p id="vrStatus">Checking headset support…</p></div>
 </section>
 <section id="displayPanel" class="viewport-popover display-popover" aria-labelledby="displayPanelTitle" hidden>
  <div class="viewport-panel-heading"><div><small>LIGHT, GEOMETRY & QUALITY</small><h3 id="displayPanelTitle">Display</h3></div><button class="icon-button" data-close-view-panel aria-label="Close display">${icon('close')}</button></div>
  <div id="displayControlSlot"></div>
 </section>
 <div id="cpuQualityNotice" class="cpu-quality-notice" hidden><strong>Low-fidelity CPU view</strong><span>Visual quality is much better with a GPU.</span><small id="cpuBackendStatus"></small></div>
 </div>`;
 scene.append(shell);scene.classList.add('has-viewport-ui');
 const inspectorHeader=document.createElement('div');inspectorHeader.className='viewport-inspector-heading';inspectorHeader.innerHTML=`<button id="inspectorBack" title="Back to scene elements" aria-label="Back to scene elements">‹</button><div><small>SELECTED ELEMENT</small><h3 id="inspectorTitle">Black hole</h3></div><button class="icon-button" id="closeInspector" aria-label="Close properties">${icon('close')}</button>`;
 const inspectorActions=document.createElement('div');inspectorActions.className='inspector-camera-actions';inspectorActions.innerHTML='<button id="inspectorCockpit" class="outline-button cockpit-action" hidden>Cockpit view</button><button id="inspectorTrack" class="outline-button">Track</button><button id="inspectorRide" class="outline-button">Ride · 360°</button>';
 controls.prepend(inspectorActions);controls.prepend(inspectorHeader);controls.classList.add('viewport-inspector');controls.hidden=true;controls.setAttribute('aria-label','Selected element properties');scene.append(controls);
 // Camera, render and spectral controls stay available in native fullscreen.
 $('cameraControlSlot').append(document.querySelector('.camera-toolbar'));
 const free=document.createElement('button');free.id='freeMode';free.textContent='Free roam';free.setAttribute('aria-pressed','false');document.querySelector('.camera-mode').append(free);
 const viewToolbar=document.querySelector('.view-toolbar');$('displayControlSlot').append(viewToolbar);$('displayControlSlot').append($('performanceControls'));
 const optics=document.querySelector('.geometry-panel');optics.open=true;
 const transport=document.querySelector('.transport');$('displayControlSlot').append(transport);transport.append($('resetAll'));
 // No always-visible return banner. The return action lives in Camera.
 $('focusBanner').hidden=true;scene.classList.add('no-focus-banner');
 for(const id of ['mathDialog','atlasDialog','warpDialog','helpDialog'])scene.append($(id));
 scene.append($('toast'));

 const picture=document.createElement('dialog');picture.id='pictureDialog';picture.setAttribute('aria-labelledby','pictureTitle');picture.innerHTML=`
 <div class="dialog-header"><div><span class="eyebrow">PAUSE. COMPOSE. RENDER.</span><h2 id="pictureTitle">Picture studio</h2></div><button id="closePicture" class="icon-button" aria-label="Close picture studio">${icon('close')}</button></div>
 <div class="dialog-content picture-content"><p class="picture-intro">Freeze this moment for a detailed still. Procedural textures gain finer structure, while tiled sampling refines light and edges. Your controls remain responsive.</p>
 <div class="picture-options"><label for="picturePreset">OUTPUT QUALITY<select id="picturePreset">${PHOTO_PRESETS.map(p=>`<option value="${escape(p.id)}">${escape(p.label)}</option>`).join('')}</select></label><button id="startPicture" class="outline-button">Render still</button><button id="cancelPicture" class="outline-button" hidden>Cancel</button></div>
 <p class="picture-note">Higher settings add finer procedural detail and more samples. Render time depends on your GPU and scene; the progress below measures completed work.</p>
 <div id="pictureProgressArea" class="picture-progress-area" hidden><label for="pictureProgress" id="picturePhase">Preparing the image…</label><progress id="pictureProgress" max="1" value="0"></progress><div><span id="picturePercent">0%</span><span id="pictureTime">Estimating time…</span></div></div>
 <p id="pictureStatus" role="status" aria-live="polite"></p><figure id="pictureResult" hidden><img id="picturePreview" alt="Your rendered black hole observatory image"><figcaption><span id="pictureDimensions"></span><a id="downloadPicture" class="outline-button" download="event-horizon-still.png">Download PNG ↗</a></figcaption></figure>
 <div id="quickCaptureSlot" class="quick-capture-slot"><span>Just want the current frame?</span></div></div>`;scene.append(picture);const quick=document.createElement('button');quick.id='quickCapturePicture';quick.className='text-button';quick.textContent='Save current frame ↗';quick.addEventListener('click',()=>{if(photoAbort)return;picture.addEventListener('close',()=>requestAnimationFrame(()=>$('capture').click()),{once:true});picture.close();});$('quickCaptureSlot').append(quick);

 const renderer=()=>api.renderer();
 const targets=()=>renderer()?.getSceneTargets?.()||[];
 const isShuttle=id=>api.objects().some(o=>o.id===id&&o.type==='shuttle');
 const selectedTarget=()=>{const id=selection==='binary'?'secondary':selection==='disk'||selection==='jets'?'primary':selection==='warp'?renderer()?.getState().warpObjectId:selection==='bridge'?(renderer()?.getState().bridgeObjectId||'bridge'):selection;return targets().find(t=>t.id===id);};
 function setPanel(next,focus=false){
  panel=next;for(const name of ['elements','camera','display']){$(`${name}Panel`).hidden=next!==name;$(`${name}Toggle`).setAttribute('aria-expanded',String(next===name));}
  controls.hidden=next!=='inspector';scene.classList.toggle('inspector-open',next==='inspector');
  if(next==='elements'){refreshElements(true);$('elementsPanel').scrollTop=0;}if(next==='camera'){refreshTargets(true);refreshVRSupport();}if(next==='inspector')controls.querySelector('.controls-body').scrollTop=0;
  if(focus&&next){const region=next==='inspector'?controls:$(`${next}Panel`);region.querySelector('button,select,input')?.focus({preventScroll:true});}
 }
 function labelFor(id){return (componentEntries.find(e=>e[0]===id)?.[1])||api.objects().find(o=>o.id===id)?.label||'Object';}
 function select(id){
  selection=id;const object=api.objects().find(o=>o.id===id);controls.dataset.inspectorKind=object?'object':id==='add'?'add':'component';
  if(object){api.selectObject(id);api.setFeature('objects');}
  else if(id==='primary')api.setFeature('hole');
  else if(id==='warp')api.setFeature('warp');
  else if(id==='add'){api.setFeature('objects');$('addObjectPanel').open=true;}
  else{api.setFeature('scene');api.selectComponent(id);}
  const label=id==='add'?(renderer()?.getObjectContext?.().kind==='bridge'?'Change traveler':'Add an object'):id==='primary'&&api.state().whiteHole?'White hole':labelFor(id);$('inspectorTitle').textContent=label;
  updateInspectorActions();
  setPanel('inspector',true);refreshElements();
 }
 function updateInspectorActions(){const target=selectedTarget();inspectorActions.hidden=!target?.canTrack;$('inspectorTrack').disabled=!target?.enabled;$('inspectorRide').hidden=!target?.canBoard;$('inspectorRide').disabled=!target?.enabled;$('inspectorCockpit').hidden=!isShuttle(target?.id);$('inspectorCockpit').disabled=!target?.enabled;}
 function focus(id,mode,cockpit=false){
  if(!renderer()?.focusTarget?.(id,mode)){api.toast('Turn this element on before following it.');return;}
  api.refresh();api.syncViewMode(mode==='onboard'?'look':'orbit');setPanel(null);refreshTargets(true);
  api.toast(cockpit?'Inside the shuttle cockpit. Drag to look around; choose Cockpit view again to look ahead.':mode==='onboard'?'Riding along. Drag to look in every direction.':'Tracking this body. Drag to orbit; scroll or pinch to move closer.');
 }
 function refreshElements(force=false){
  if(!force&&panel!=='elements')return;
  const s=api.state(),objects=api.objects(),signature=JSON.stringify([componentEntries.map(e=>[e[0],!!s[e[2]]]),objects.map(o=>[o.id,o.label,o.warpEnabled,o.bridgeTraveler]),selection,s.whiteHole,s.bridge,s.blackHole]);
  if(!force&&signature===lastSignature)return;lastSignature=signature;
  const context=renderer()?.getObjectContext?.()||renderer()?.getState?.().objectContext;$('viewportAdd').innerHTML=context?.kind==='bridge'?'↔ Change traveler <span>Enterprise · NASA Shuttle · Astronaut</span>':'＋ Add an object <span>Craft · people · planets · stars</span>';
  const fields=componentEntries.filter(([id])=>id!=='warp').map(([id,label,param,glyph])=>{const unavailable=!s.blackHole&&['binary','disk','jets','planet','tidalStar'].includes(id);return `<div class="viewport-element ${selection===id?'selected':''} ${unavailable?'element-unavailable':''}"><button data-element="${escape(id)}" ${unavailable?'disabled':''}><span class="element-glyph">${icon(glyph)}</span><span>${escape(id==='primary'&&s.whiteHole?'White hole':label)}<small>${unavailable?'Enable a black hole first':`Properties${['primary','binary','planet','tidalStar'].includes(id)?' & viewpoints':''}`}</small></span><b>›</b></button><button class="element-switch" data-element-toggle="${param}" ${unavailable?'disabled':''} role="switch" aria-checked="${!!s[param]}" aria-label="${s[param]?'Hide':'Show'} ${escape(label.toLowerCase())}"><i></i></button></div>`;}).join('');
  const bodies=objects.map(o=>`<div class="viewport-element ${selection===o.id?'selected':''}"><button data-element="${escape(o.id)}"><span class="element-glyph">${icon(o.type==='enterprise'?'warp':'select')}</span><span>${escape(o.label)}<small>${o.bridgeTraveler?'Bridge traveler · ':o.warpEnabled?'Warp on · ':''}${o.type==='shuttle'?'Cockpit · track · properties':'Properties · track · ride'}</small></span><b>›</b></button></div>`).join('');
  $('viewportElements').innerHTML=(objects.length?'<span class="element-group-label">OBJECTS IN THIS SCENE</span>'+bodies:'<p class="elements-empty">No added objects. Add a craft or traveler above.</p>')+'<span class="element-group-label">FIELDS & ENVIRONMENT</span>'+fields;

 }
 function refreshTargets(force=false){
  if(!force&&panel!=='camera')return;
  const list=targets().filter(t=>t.enabled&&t.canTrack),previous=$('viewportTarget').value,signature=JSON.stringify(list.map(t=>[t.id,t.label,t.canBoard]));
  const currentFocus=renderer()?.focusId;if(force||signature!==lastTargetSignature||currentFocus!==lastFocusedId){const focusChanged=currentFocus!==lastFocusedId;lastFocusedId=currentFocus;lastTargetSignature=signature;$('viewportTarget').innerHTML=list.map(t=>`<option value="${escape(t.id)}">${escape(t.label)}</option>`).join('');if(focusChanged&&list.some(t=>t.id===currentFocus))$('viewportTarget').value=currentFocus;else if(list.some(t=>t.id===previous))$('viewportTarget').value=previous;else if(list.some(t=>t.id===currentFocus))$('viewportTarget').value=currentFocus;}
  const selected=list.find(t=>t.id===$('viewportTarget').value);$('viewportTrack').disabled=!selected;$('viewportRide').disabled=!selected?.canBoard;$('viewportCockpit').hidden=!isShuttle(selected?.id);$('viewportCockpit').disabled=!selected;
 }
 function refresh(stats={}){
  if(selection!=='add'&&!componentEntries.some(e=>e[0]===selection)&&!api.objects().some(o=>o.id===selection)){selection='primary';if(panel==='inspector')setPanel('elements');}
  if(selection==='primary'){const label=api.state().whiteHole?'White hole':'Black hole';$('inspectorTitle').textContent=label;}
  refreshElements();refreshTargets();if(stats.vrError&&stats.vrError!==lastVRError){lastVRError=stats.vrError;api.toast(stats.vrError);}const s=api.state(),mode=stats.viewMode||s.viewMode;
  $('freeMode').setAttribute('aria-pressed',String(mode==='free'));
  const note=mode==='free'?'Drag to choose a heading. Scroll or pinch to travel forward or backward. W / S also move.':mode==='look'?'Look around from this position. Switch to Free roam to travel in the direction you face.':'Orbit a subject. Scroll or pinch to set your distance.';
  if($('viewportModeNote').textContent!==note)$('viewportModeNote').textContent=note;
  const chromeSignature=[s.paused,!!stats.vrActive].join('|');if(chromeSignature!==lastChromeSignature){lastChromeSignature=chromeSignature;$('viewportPauseLabel').textContent=s.paused?'Play':'Pause';$('viewportPause').querySelector('.pause-glyph').innerHTML=icon(s.paused?'play':'pause');$('viewportPause').setAttribute('aria-label',s.paused?'Resume simulation':'Pause simulation');$('enterVR').innerHTML=stats.vrActive?'Exit VR':icon('vr')+'Enter VR';}
  if(picture.open&&!photoAbort)$('startPicture').disabled=!renderer()?.ready||!!renderer()?.cpu||!!stats.vrActive;const cpu=stats.cpu||renderer()?.cpu;$('cpuQualityNotice').hidden=!cpu;const backendLabel={'worker-canvas':'Rendering in a worker','worker-commands':'Geometry in a worker','cooperative-main':'Compatibility renderer · cooperative tasks'}[stats.cpuBackend]||'';if($('cpuBackendStatus').textContent!==backendLabel)$('cpuBackendStatus').textContent=backendLabel;$('pictureToggle').disabled=false;$('pictureToggle').title=cpu?'Picture studio requires GPU graphics':'Render a high-resolution still';$('enterVR').disabled=!!cpu||(!stats.vrActive&&vrSupport?.supported===false);
  if(panel==='inspector'){if(controls.dataset.inspectorKind==='object'&&!api.objects().some(o=>o.id===selection)){setPanel('elements');}updateInspectorActions();}
 }
 document.querySelectorAll('[data-view-panel]').forEach(button=>button.addEventListener('click',event=>setPanel(panel===button.dataset.viewPanel?null:button.dataset.viewPanel,event.detail===0)));
 shell.querySelectorAll('[data-close-view-panel]').forEach(button=>button.addEventListener('click',()=>setPanel(null)));
 $('viewportElements').addEventListener('click',e=>{const choice=e.target.closest('[data-element]'),toggle=e.target.closest('[data-element-toggle]');if(toggle){const key=toggle.dataset.elementToggle;api.updateParameter(key,!api.state()[key]);refresh();}else if(choice)select(choice.dataset.element);});
 $('viewportAdd').addEventListener('click',()=>select('add'));$('inspectorBack').addEventListener('click',()=>setPanel('elements'));$('closeInspector').addEventListener('click',()=>{setPanel(null);$('elementsToggle').focus({preventScroll:true});});
 $('inspectorTrack').addEventListener('click',()=>focus(selectedTarget()?.id,'track'));$('inspectorRide').addEventListener('click',()=>focus(selectedTarget()?.id,'onboard'));$('inspectorCockpit').addEventListener('click',()=>focus(selectedTarget()?.id,'onboard',true));
 $('viewportTarget').addEventListener('change',()=>refreshTargets());$('viewportTrack').addEventListener('click',()=>focus($('viewportTarget').value,'track'));$('viewportRide').addEventListener('click',()=>focus($('viewportTarget').value,'onboard'));$('viewportCockpit').addEventListener('click',()=>focus($('viewportTarget').value,'onboard',true));
 $('viewportScenes').addEventListener('click',()=>{setPanel(null);api.openScenes($('viewportScenes'));});$('viewportHelp').addEventListener('click',()=>api.openHelp($('viewportHelp')));
 $('viewportPause').addEventListener('click',()=>{api.setPaused(!api.state().paused);refresh();});$('viewportReset').addEventListener('click',()=>{renderer()?.resetCamera();api.refresh();setPanel(null);api.toast('Restored this scene’s starting view.');});
 $('freeMode').addEventListener('click',()=>{renderer()?.setViewMode('free');api.syncViewMode('free');refresh(renderer()?.getState());});
 async function refreshVRSupport(){try{vrSupport=await renderer()?.getVRSupport?.()||{supported:false,reason:'Use a WebXR-capable browser and headset.'};}catch{vrSupport={supported:false,reason:'VR is unavailable in this browser.'};}$('vrStatus').textContent=vrSupport.supported?'Headset ready. Your current viewpoint becomes the starting position.':vrSupport.reason;refresh(renderer()?.getState());}
 $('enterVR').addEventListener('click',async()=>{const button=$('enterVR');button.disabled=true;try{if(renderer()?.getState().vrActive)await renderer().exitVR();else{setPanel(null);await renderer().enterVR();}refresh(renderer()?.getState());}catch(error){api.toast(error?.message||'The VR session could not start.');}finally{button.disabled=false;refresh(renderer()?.getState());}});
 function duration(ms){if(!Number.isFinite(ms)||ms<0)return 'Estimating…';const seconds=Math.ceil(ms/1000);return seconds<60?`${seconds}s`:`${Math.floor(seconds/60)}m ${seconds%60}s`;}
 function openPicture(){setPanel(null);api.openDialog('pictureDialog',$('pictureToggle'));const vr=renderer()?.getState().vrActive;$('startPicture').disabled=!renderer()?.ready||!!renderer()?.cpu||!!vr;$('pictureStatus').textContent=vr?'Exit VR before rendering a still.':renderer()?.cpu?'High-resolution picture rendering needs a GPU. You can save the current CPU preview below.':'';}
 $('pictureToggle').addEventListener('click',openPicture);$('closePicture').addEventListener('click',()=>{photoAbort?.abort();picture.close();});picture.addEventListener('cancel',()=>photoAbort?.abort());picture.addEventListener('close',()=>{photoAbort?.abort();api.onDialogClose('pictureDialog');});
 $('cancelPicture').addEventListener('click',()=>photoAbort?.abort());
 $('startPicture').addEventListener('click',async()=>{
  if(photoAbort)return;photoAbort=new AbortController();$('startPicture').disabled=true;quick.disabled=true;$('picturePreset').disabled=true;$('cancelPicture').hidden=false;$('pictureProgressArea').hidden=false;$('pictureResult').hidden=true;$('pictureStatus').textContent='';$('pictureProgress').value=0;
  try{const render=renderer().renderPicture?.bind(renderer())||((options)=>createPhotoRender(renderer(),options));const result=await render({presetId:$('picturePreset').value,signal:photoAbort.signal,onProgress:p=>{$('pictureProgress').value=p.progress;$('picturePercent').textContent=`${Math.floor(p.progress*100)}%`;$('picturePhase').textContent=p.phase||'Rendering…';$('pictureTime').textContent=`${duration(p.elapsedMs)} elapsed · ${Number.isFinite(p.remainingMs)?duration(p.remainingMs)+' remaining':'estimating time…'}`;}});
   if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=URL.createObjectURL(result.blob);$('picturePreview').src=photoUrl;$('downloadPicture').href=photoUrl;$('downloadPicture').download=`event-horizon-${api.activePreset()}-${result.width}x${result.height}.png`;$('pictureDimensions').textContent=`${result.width} × ${result.height} · ${result.samples} samples${result.steps?' · '+result.steps+' ray steps':''} · ${duration(result.elapsedMs)}`;$('pictureResult').hidden=false;$('pictureProgress').value=1;$('picturePercent').textContent='100%';$('picturePhase').textContent='Image ready';$('pictureStatus').textContent='Your still is ready to inspect and download.';
  }catch(error){$('pictureStatus').textContent=error?.name==='AbortError'?'Render cancelled. Your scene is unchanged.':error?.message||'The still could not be rendered.';}
  finally{photoAbort=null;quick.disabled=false;$('startPicture').disabled=false;$('picturePreset').disabled=false;$('cancelPicture').hidden=true;api.refresh();}
 });
 // A tap on the universe dismisses controls without intercepting its camera drag.
 $('universe').addEventListener('pointerdown',()=>setPanel(null));
 scene.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')&&panel){event.stopPropagation();setPanel(null);$('elementsToggle').focus({preventScroll:true});}});
 refresh();refreshVRSupport();
 return {refresh,select,sceneChanged:()=>{selection='primary';setPanel(null);refresh(renderer()?.getState());},openElements:()=>setPanel('elements'),openDisplay:()=>setPanel('display'),openCamera:()=>setPanel('camera'),openPicture,close:()=>setPanel(null),rendererChanged:()=>{$('universe').addEventListener('pointerdown',()=>setPanel(null));lastSignature='';lastTargetSignature='';refresh();refreshVRSupport();},dispose:()=>{photoAbort?.abort();if(photoUrl)URL.revokeObjectURL(photoUrl);}};
}

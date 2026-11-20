import {K2_GRID} from './kardashev-solar.js';
import {OBJECT_TYPES} from './objects.js';
import {DEFAULTS,GRID_DENSITY_RANGE,sceneCruiseWarp} from './config.js';
import {appendPlaylistStop} from './playlist-ui.js';
import {MAP_FILTERS,DEFAULT_MAP_FILTERS,objectCategory} from './object-taxonomy.js';
import { PHOTO_PRESETS, createPhotoRender } from './photo-renderer.js';
import { mapModel, renderOrbitMap, mapPotential, orbitSliderRadius, orbitSliderValue } from './orbit-map.js';
import { SURFACE_PROFILES } from './planet-profiles.js';
import { SCENE_FILE_VERSION } from './scene-file.js';
import { formatClockDuration } from './object-clocks.js';

// Legacy scene files mirror the all-grids switch into grid and warpGrid.
export function gridDisplayPatch(state,key,value){
 if(key==='spectrum'&&value==='geometry')return {spectrum:value,grid:true,warpGrid:true,warpGridOnly:false};
 if(key!=='grid'&&key!=='warpGrid'&&key!=='warpGridOnly')return null;
 const geometry=state.spectrum==='geometry';
 const only=key==='warpGridOnly'&&!!value&&!geometry;
 const all=geometry||(key==='warpGridOnly'?!value:!!value);
 return {grid:all,warpGrid:all,warpGridOnly:only};
}
// The viewport owns navigation. Existing property controls are moved, never
// cloned, so every slider has one state and one accessible label.
export function installViewportUI(api){
 const $=id=>document.getElementById(id),scene=$('scene'),controls=document.querySelector('.controls');
 const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
 const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const densityFields=[['sceneGridDensity','Scene grid'],['warpGridDensity','Warp grid']];
 let scenesDiscovered=false; // This visit only: never persisted in browser storage.
 let playDiscovered=false;
 let panel=null,selection='space',lastSignature='',lastTargetSignature='',lastFocusedId=null,lastVRError='',lastChromeSignature='',lastOverlaySignature='',photoAbort=null,photoUrl=null,vrSupport=null;
 const collapsed=new Set(),knownBranches=new Set();let objectSearch='',cameraSearch='',mapSelection=null;
 const tree=()=>renderer()?.getObjectTree?.()||[];
 const componentEntries=[['primary','Black hole','blackHole','blackhole'],['binary','Companion','binary','blackhole'],['disk','Accretion disc','disk','blackhole'],['jets','Polar jets','jets','arrow'],['stars','Starfield','stars','spark'],['nebula','Nebula','nebula','cloud'],['planet','Planet','planet','orbit'],['tidalStar','Disrupting star','tidalStar','spark'],['warp','Warp field','warp','warp'],['bridge','Einstein–Rosen bridge','bridge','warp']];
 const shell=document.createElement('div');shell.className='viewport-ui';shell.innerHTML=`
 <button class="viewport-scenes scene-discovery" id="viewportScenes">${icon('scenes')}<span>Scenes</span>${icon('down')}</button>
 <div class="viewport-dock" role="toolbar" aria-label="Explore the scene">
  <button id="elementsToggle" data-view-panel="elements" aria-expanded="false" aria-controls="elementsPanel">${icon('select')}<span>Objects</span></button>
  <button id="mapToggle" aria-haspopup="dialog" aria-controls="orbitMapDialog">${icon('solar')}<span>Map</span></button>
  <button id="cameraToggle" data-view-panel="camera" aria-expanded="false" aria-controls="cameraPanel">${icon('video')}<span>Camera</span></button>
  <button id="displayToggle" data-view-panel="display" aria-expanded="false" aria-controls="displayPanel">${icon('environment')}<span>Display</span></button>
  <button id="viewportPause" aria-label="Pause simulation" title="Pause simulation"><span class="pause-glyph">${icon('pause')}</span><span id="viewportPauseLabel">Pause</span></button>
  <button id="pictureToggle" aria-haspopup="dialog" aria-controls="pictureDialog">${icon('camera')}<span>Picture</span></button>
  <button id="viewportHelp" aria-label="How to explore">${icon('help')}<span>Help</span></button>
 </div>
 <section id="elementsPanel" class="viewport-popover elements-popover" aria-labelledby="elementsPanelTitle" hidden>
  <div class="viewport-panel-heading"><div><small>COMPOSE YOUR UNIVERSE</small><h3 id="elementsPanelTitle">Objects in Space</h3></div><button class="icon-button" data-close-view-panel aria-label="Close elements">${icon('close')}</button></div>
  <p class="viewport-panel-intro">Expand a branch to see its children. The gear opens properties and viewpoints. Space controls the sky.</p>
  <button id="viewportAdd" class="viewport-add">＋ Add an object <span>Choose a parent, then a child</span></button>
  <p id="objectSearchStatus" class="tree-search-status"></p>
  <div id="viewportElements" class="viewport-elements"></div>
 </section>
 <section id="cameraPanel" class="viewport-popover camera-popover" aria-labelledby="cameraPanelTitle" hidden>
  <div class="viewport-panel-heading"><div><small>CHOOSE YOUR PERSPECTIVE</small><h3 id="cameraPanelTitle">Camera</h3></div><button class="icon-button" data-close-view-panel aria-label="Close camera">${icon('close')}</button></div>
  <div id="cameraControlSlot" hidden></div><p class="viewport-mode-note" id="viewportModeNote">Orbit a subject. Scroll or pinch to set your distance.</p>
  <div class="camera-target-controls"><label for="viewportTarget">FOLLOW A BODY</label><select id="viewportTarget"></select><div class="viewport-camera-actions"><button id="viewportTrack" class="outline-button">Orbit</button><button id="viewportRide" class="outline-button">Ride · 360°</button></div><button id="viewportChase" class="outline-button viewport-wide" hidden>Chase · 360° <small>Behind & above the vehicle</small></button><button id="viewportDrive" class="outline-button drive-action viewport-wide" hidden>Drive <small>Take the helm</small></button><button id="viewportLineup" class="outline-button viewport-wide" hidden>View all vehicles</button><button id="relativeFree" class="outline-button viewport-wide">Free roam around this body</button><button id="orbitMapOpen" class="outline-button viewport-wide">${icon('solar')}Orbit map <small>Log scales & gravity study</small></button></div>
  <button id="viewportReset" class="outline-button viewport-wide">${icon('reset')}Reset scene view</button>
  <div class="vr-entry"><button id="enterVR" class="outline-button">${icon('vr')}Enter VR</button><p id="vrStatus">Checking headset support…</p></div>
 </section>
 <section id="displayPanel" class="viewport-popover display-popover" aria-labelledby="displayPanelTitle" hidden>
  <div class="viewport-panel-heading"><div><small>LIGHT, GEOMETRY & QUALITY</small><h3 id="displayPanelTitle">Display</h3></div><button class="icon-button" data-close-view-panel aria-label="Close display">${icon('close')}</button></div>
  <div class="display-guides"><label class="planned-path-toggle" title="Direction of motion. In the orbit and free-fall studies, velocity is relative to the falling grid."><input id="velocityArrowsToggle" type="checkbox"> Velocity arrows</label><label class="planned-path-toggle"><input id="plannedPathToggle" type="checkbox"> Planned path <small>(with labels)</small></label></div>
  <div id="gridSettings" class="display-grid-settings">
   <label class="planned-path-toggle"><input id="warpGridOnlyToggle" type="checkbox"> Warp grid only <small>(around the bubble)</small></label>
   <fieldset class="display-grid-detail"><legend>Grid resolution</legend><div class="display-grid-sliders">${densityFields.map(([id,label])=>`<div><div class="range-header"><label for="${id}">${label}</label><output id="${id}Value" for="${id}"></output></div><input id="${id}" type="range" min="${GRID_DENSITY_RANGE[0]}" max="${GRID_DENSITY_RANGE[1]}" step=".25" value="${DEFAULTS[id]}" aria-describedby="gridResolutionNote"></div>`).join('')}</div><p id="gridResolutionNote">Higher values draw more lines.</p></fieldset>
  </div><div id="displayControlSlot"></div><details class="render-diagnostics"><summary>Rendering diagnostics</summary><p id="renderDiagnostics" role="status">Waiting for the renderer…</p><small id="applicationVersion">Version ${SCENE_FILE_VERSION}</small></details>
 </section>
 <div id="cpuQualityNotice" class="cpu-quality-notice" hidden><strong>Low-fidelity CPU view</strong><span>Visual quality is much better with a GPU.</span><small id="cpuBackendStatus"></small></div>
 </div>`;
 scene.append(shell);scene.classList.add('has-viewport-ui');
 const inspectorHeader=document.createElement('div');inspectorHeader.className='viewport-inspector-heading';inspectorHeader.innerHTML=`<button id="inspectorBack" title="Back to scene elements" aria-label="Back to scene elements">‹</button><div><small>SELECTED ELEMENT</small><h3 id="inspectorTitle">Black hole</h3></div><button class="icon-button" id="closeInspector" aria-label="Close properties">${icon('close')}</button>`;
 const inspectorActions=document.createElement('div');inspectorActions.className='inspector-camera-actions';inspectorActions.innerHTML=`<button id="inspectorDrive" class="outline-button drive-action" hidden>Drive</button><button id="inspectorLineup" class="outline-button" hidden>View all vehicles</button><details class="inspector-view-menu" id="inspectorViewMenu"><summary>${icon('video')}Viewpoint${icon('down')}</summary><div class="inspector-view-options"><button id="inspectorTrack" class="outline-button">Track</button><button id="inspectorRide" class="outline-button">Ride · 360°</button><button id="inspectorChase" class="outline-button" hidden>Chase · 360°</button><button id="inspectorFree" class="outline-button">Free roam here</button><button id="inspectorMap" class="outline-button">Orbit map</button></div></details>`;
 const branchActions=document.createElement('div');branchActions.className='inspector-branch-actions';branchActions.innerHTML='<button id="inspectorAddChild" class="outline-button">＋ Add child</button><button id="inspectorDeleteBranch" class="text-button">Delete object</button>';controls.prepend(branchActions);controls.prepend(inspectorActions);controls.prepend(inspectorHeader);controls.classList.add('viewport-inspector');controls.hidden=true;controls.setAttribute('aria-label','Selected element properties');scene.append(controls);
 // Camera, render and spectral controls stay available in native fullscreen.
 $('cameraControlSlot').append(document.querySelector('.camera-toolbar'));

 $('warpGridOnlyToggle').addEventListener('change',()=>api.updateParameter('warpGridOnly',$('warpGridOnlyToggle').checked));
 $('plannedPathToggle').addEventListener('change',()=>api.updateParameter('plannedPath',$('plannedPathToggle').checked));
 $('velocityArrowsToggle').addEventListener('change',()=>api.updateParameter('velocityArrows',$('velocityArrowsToggle').checked));
 for(const [id] of densityFields)$(id).addEventListener('input',()=>api.updateParameter(id,Number($(id).value)));
 $('grid')?.closest('label')?.after($('gridSettings'));
 const viewToolbar=document.querySelector('.view-toolbar');$('displayControlSlot').append(viewToolbar);$('displayControlSlot').append($('performanceControls'));
 const optics=document.querySelector('.geometry-panel');optics.open=true;
 const transport=document.querySelector('.transport');$('displayControlSlot').append(transport);transport.append($('resetAll'));
 // No always-visible return banner. The return action lives in Camera.
 $('focusBanner').hidden=true;scene.classList.add('no-focus-banner');
 for(const id of ['mathHubDialog','mathDialog','atlasDialog','warpDialog','bridgeDialog','helpDialog'])scene.append($(id));
 scene.append($('toast'));

 const picture=document.createElement('dialog');picture.id='pictureDialog';picture.setAttribute('aria-labelledby','pictureTitle');picture.innerHTML=`
 <div class="dialog-header"><div><span class="eyebrow">PAUSE. COMPOSE. RENDER.</span><h2 id="pictureTitle">Picture studio</h2></div><button id="closePicture" class="icon-button" aria-label="Close picture studio">${icon('close')}</button></div>
 <div class="dialog-content picture-content"><p class="picture-intro">Freeze this view and render a high-resolution PNG.</p>
 <div class="picture-options"><label for="picturePreset">OUTPUT QUALITY<select id="picturePreset">${PHOTO_PRESETS.map(p=>`<option value="${escape(p.id)}">${escape(p.label)}</option>`).join('')}</select></label><button id="startPicture" class="outline-button">Render still</button><button id="cancelPicture" class="outline-button" hidden>Cancel</button></div>
 <p class="picture-note">Studio and Exhibition trace finer detail and sample the light across each pixel. Resolution adapts to your GPU; the preview shows the actual size. Quick saves the current frame.</p>
 <div id="pictureProgressArea" class="picture-progress-area" hidden><label for="pictureProgress" id="picturePhase">Preparing the image…</label><progress id="pictureProgress" max="1" value="0"></progress><div><span id="picturePercent">0%</span><span id="pictureTime">Estimating time…</span></div></div>
 <p id="pictureStatus" role="status" aria-live="polite"></p><figure id="pictureResult" hidden><img id="picturePreview" alt="Rendered still of the selected scene"><figcaption><span id="pictureDimensions"></span><a id="downloadPicture" class="outline-button" download="event-horizon-still.png">Download PNG ↗</a></figcaption></figure>
 </div>`;scene.append(picture);
 $('picturePreset').value='high';


 const renderer=()=>api.renderer();
 $('editSurfaceProfile').innerHTML=SURFACE_PROFILES.map(p=>`<option value="${p.id}">${escape(p.label)}</option>`).join('');
 const mapDialog=document.createElement('dialog');mapDialog.id='orbitMapDialog';mapDialog.setAttribute('aria-labelledby','orbitMapTitle');mapDialog.innerHTML=`
 <div class="dialog-header"><div><h2 id="orbitMapTitle">Orbit map</h2></div><button id="closeOrbitMap" class="icon-button" aria-label="Close orbit map">${icon('close')}</button></div>
 <div class="map-navigation"><button id="mapParentUp" class="outline-button" aria-label="Map of parent object">↑ Parent</button><nav id="mapBreadcrumbs" aria-label="Object ancestry"></nav></div>
 <div class="map-filters" id="mapFilters" role="group" aria-labelledby="mapFilterTitle" title="Show or hide categories. Stars and black holes stay visible."><strong id="mapFilterTitle">Map filters</strong>${MAP_FILTERS.map(filter=>`<button type="button" data-map-filter="${filter.id}" aria-pressed="${!!DEFAULT_MAP_FILTERS[filter.id]}"><span class="filter-check" aria-hidden="true">✓</span>${escape(filter.label)}</button>`).join('')}</div><p class="map-filter-note">Select a category to show or hide it. Stars and black holes always stay visible.</p><div class="orbit-map-layout"><div class="orbit-map-main"><div class="map-scale-badge">Distance and size use separate scales</div><div id="orbitMapDrawing"></div><section id="mapTravel" class="map-travel" aria-labelledby="mapTravelTarget" hidden><div><span id="mapTravelMode" class="map-travel-kicker">FLIGHT PLAN</span><h3 id="mapTravelTarget">Choose a destination</h3></div><dl id="mapTravelTimes"><div><dt>Distant time</dt><dd id="mapTravelTime"></dd></div><div id="mapTravelProperRow"><dt>Onboard time</dt><dd id="mapTravelProper"></dd></div><div id="mapTravelDilationRow"><dt>Time dilation</dt><dd id="mapTravelDilation"></dd></div></dl><label id="mapTravelWarpRow" class="transfer-warp" hidden><span>Trip warp <output id="mapTravelWarpValue">1</output></span><input id="mapTravelWarp" type="range" min="1" max="9.9999" step=".1" value="1" aria-label="Warp factor for this orbit transfer"></label><label id="mapTravelHeadingRow" class="arrival-heading" hidden><span>Arrival heading · degrees</span><input id="mapTravelHeading" type="number" min="-180" max="180" step="5" placeholder="Auto" aria-label="Arrival heading in degrees; leave blank for automatic alignment"></label><p id="mapTravelNote" role="status"></p><div class="map-travel-actions"><button id="mapTravelQueue" class="outline-button">Add to playlist</button><button id="mapTravelCancel" class="outline-button">Cancel</button></div></section><div class="map-level-footer"><p class="map-chart-note">Select a body to inspect it. Double-tap to open its level.</p><button id="mapInspectSelection" class="outline-button" hidden>Inspect</button></div></div>
 <aside class="orbit-map-controls"><details class="map-find"><summary>Find an object anywhere</summary><label class="field-label" for="mapObjectSearch">FIND AN OBJECT</label><input id="mapObjectSearch" type="search" placeholder="Earth, Moon, Pluto…" autocomplete="off"><label class="field-label" for="orbitMapCenter">MAP CENTER</label><select id="orbitMapCenter"></select></details><label class="field-label" for="mapBodyPicker">THIS LEVEL</label><select id="mapBodyPicker"></select>
 <div id="mapSelected" class="map-selected"></div><div class="map-object-actions"><button id="mapQuickQueue" class="outline-button" hidden>Add to playlist</button><button id="mapProperties" class="outline-button">${icon('environment')}Properties</button><button id="mapCenterSelected" class="outline-button">Explore children →</button><button id="mapTrack" class="outline-button">Track in 3D</button><button id="mapRide" class="outline-button">Ride · 360°</button><button id="mapChase" class="outline-button" hidden>Chase · 360°</button><button id="mapDrive" class="outline-button drive-action" hidden>Drive</button></div>
 <div class="map-branch"><div class="map-branch-actions"><button id="mapAddChild" class="outline-button" aria-expanded="false" aria-controls="mapBranchEditor">＋ Add child</button><button id="mapRemoveBranch" class="outline-button" aria-expanded="false" aria-controls="mapBranchEditor" hidden>Remove object…</button></div><div id="mapBranchEditor" hidden><strong id="mapBranchPrompt"></strong><select id="mapChildType" aria-label="Child object type"></select><div class="map-branch-actions"><button id="mapBranchCommit" class="outline-button"></button><button id="mapBranchCancel" class="outline-button">Cancel</button></div></div><p id="mapActionStatus" role="status" aria-live="polite"></p></div>
 <div id="mapOrbitField" class="map-orbit-editor" hidden><label class="field-label" for="mapOrbitRadius"><span id="mapOrbitLabel">ORBIT SIZE</span> <output id="mapOrbitRadiusValue"></output></label><input id="mapOrbitRadius" type="range" min="0" max="1" step="0.001" value="0.5"><p id="mapSliderHint" class="map-slider-note">Exponential radius · linear travel on this log map</p><label class="field-label" for="mapOrbitMeters">SEMI-MAJOR AXIS · METERS</label><input id="mapOrbitMeters" type="number" min="0" step="any"><div id="mapShuttleSpeedField" hidden><label class="field-label" for="mapShuttleSpeed">CIRCULAR SPEED · M/S</label><input id="mapShuttleSpeed" type="number" min="0" step="any"></div><p id="mapOrbitMotion" class="map-study-note"></p></div><p id="mapOrbitReason" class="map-study-note"></p>
 <details class="map-display-options"><summary>Map scales & gravity study</summary><label class="map-check"><input id="mapLogDistance" type="checkbox" checked> Logarithmic distance</label><input id="mapLogSize" type="checkbox" checked hidden><p class="map-study-note">Equal-size points identify every body. Double-click or double-tap a point to explore its children; use the path above to go back.</p><label class="map-check"><input id="mapGrid" type="checkbox"> Coordinate grid</label><label class="map-check"><input id="mapAnnotations" type="checkbox"> Object labels</label><h3>Reveal weak gravity</h3><p class="map-study-note">This potential profile amplifies a small physical effect. It is not a metric embedding or a moving sheet that carries planets.</p><label class="field-label" for="mapAmplification">VERTICAL AMPLIFICATION <output id="mapAmplificationValue">10⁶×</output></label><input id="mapAmplification" type="range" min="0" max="12" step="1" value="6"><div id="mapPotential"></div><p class="map-physics-note">A freely falling body has zero proper acceleration. Its local tangent is straight; its coordinate velocity changes direction along an orbit. The four-velocity is parallel transported through curved spacetime.</p></details></aside></div>`;scene.append(mapDialog);
 // The chart and its tools share a bounded workspace. On narrow or short
 // screens each tool takes the chart's place, keeping controls within reach.
 const mapTop=document.createElement('div');mapTop.className='map-dialog-top';
 const header=mapDialog.querySelector('.dialog-header'),inspector=mapDialog.querySelector('.orbit-map-controls'),layout=mapDialog.querySelector('.orbit-map-layout'),navigationBar=mapDialog.querySelector('.map-navigation');
 header.querySelector('#closeOrbitMap').before(navigationBar);mapTop.append(header);mapDialog.prepend(mapTop);
 const tabRow=document.createElement('div');tabRow.className='map-tool-tabs';tabRow.setAttribute('role','group');tabRow.setAttribute('aria-label','Map tools');
 tabRow.innerHTML=[['map','Map'],['object','Object'],['orbit','Orbit'],['display','Display'],['flight','Flight']].map(([key,text])=>'<button type="button" data-map-tool="'+key+'" aria-pressed="false">'+text+'</button>').join('');
 layout.prepend(tabRow);
 const pane=key=>{const el=document.createElement('section');el.className='map-tool-pane';el.setAttribute('data-map-pane',key);inspector.append(el);return el;};
 const objectPane=pane('object'),orbitPane=pane('orbit'),displayPane=pane('display'),flightPane=pane('flight');
 for(const el of [...inspector.children])if(!el.classList.contains('map-tool-pane')&&!['mapOrbitField','mapOrbitReason'].includes(el.id)&&!el.classList.contains('map-display-options'))objectPane.append(el);
 orbitPane.append($('mapOrbitField'),$('mapOrbitReason'));
 const studyOptions=mapDialog.querySelector('.map-display-options');displayPane.append(studyOptions);studyOptions.open=true;
 const destinations=document.createElement('div');destinations.className='map-destinations';destinations.id='mapDestinations';destinations.hidden=true;destinations.innerHTML='<div id="mapCraftChoice" hidden><label for="mapCraftPicker">Playlist vehicle</label><select id="mapCraftPicker"></select></div><label for="mapDestination">Destination</label><select id="mapDestination"><option value="">Select destination…</option></select><button id="mapFlightPlan" class="outline-button">Playlist</button>';
 const flightRail=document.createElement('div');flightRail.className='map-flight-rail';flightRail.append(destinations,$('mapTravel'));flightPane.append(flightRail);
 $('mapTravelTarget').setAttribute('aria-live','polite');
 const mapQuery=window.matchMedia?.('(max-width: 700px), (max-height: 530px)'),compactMap=()=>!!mapQuery?.matches;
 let tool='object',lastCompact=null;
 function mapTool(key){
  const compact=compactMap(),showFlight=!destinations.hidden;
  if(!compact&&key==='map')key='object';
  if(key==='flight'&&!showFlight)key=compact?'map':'object';
  tool=key;mapDialog.dataset.mapTool=key;
  for(const b of tabRow.querySelectorAll('button')){b.hidden=(b.dataset.mapTool==='map'&&!compact)||(b.dataset.mapTool==='flight'&&!showFlight);b.setAttribute('aria-pressed',String(b.dataset.mapTool===key));}
  for(const el of inspector.querySelectorAll('.map-tool-pane'))el.hidden=el.dataset.mapPane!==key;
  lastCompact=compact;
 }
 tabRow.addEventListener('click',event=>{const b=event.target.closest('[data-map-tool]');if(b&&b.tagName==='BUTTON'){mapTool(b.dataset.mapTool);if(tool==='map')updateMap();}});
 const adaptMap=()=>{mapTool(compactMap()?'map':'object');if(mapDialog.open)updateMap();};mapQuery?.addEventListener?.('change',adaptMap);
 mapTool(compactMap()?'map':'object');
 const mapFilters={...DEFAULT_MAP_FILTERS};
 let mapModelCurrent=null,mapOrbitRange=null,mapCenter='space',mapSearch='',mapCenterSignature='',mapOrbitPending=null,mapOrbitScheduled=false;
 let mapDriveSession=null,mapTravelPreview=null,mapTravelKey='',mapTravelDismissed=null,mapCraftId=null,mapWarp=1,mapTravelDestination=null,mapHeading=null,mapHeadingTarget=null;
 const pilotCrafts=()=>renderer()?.objects?.filter(o=>o.type==='shuttle'||o.type==='enterprise')||[];
 const transferCraft=()=>{const r=renderer(),ships=pilotCrafts(),auto=ships.filter(o=>navigation(o.id).mode==='auto');if(r?.objects?.some(o=>o.id===r.focusId&&['astronaut','iss'].includes(o.type)))return null;return [r?.driveId,r?.selectedId,r?.focusId].map(id=>ships.find(o=>o.id===id)).find(Boolean)||auto.find(o=>r.flightSequences?.[o.id]?.active)||auto[0]||null;};
 const optionalHeading=value=>String(value).trim()===''||!Number.isFinite(Number(value))?null:Math.max(-180,Math.min(180,Number(value)));
 const navigation=id=>renderer()?.getNavigationState?.(id)||{mode:renderer()?.driveId===id?'manual':'auto'};
 const bridgeFor=id=>id?renderer()?.getJanusBridge?.(id):null;
 const planTargets=craftId=>renderer()?.getTravelTargets?.({craftId,warpFactor:1})||[];
 function openFlightPlan(craftId=transferCraft()?.id,targetId=null,warpFactor,heading=null){
  const r=renderer(),craft=r?.objects?.find(o=>o.id===craftId&&['enterprise','shuttle'].includes(o.type));if(!craft||navigation(craftId).mode==='manual')return false;
  if(targetId){const result=appendPlaylistStop(r,craftId,targetId,warpFactor,heading);if(result.error){api.toast(result.error);return false;}}
  api.closeTravelPreview?.();setPanel(null);if(mapDialog.open)mapDialog.close();if(api.showPlaylist)return api.showPlaylist(craftId);if(r.selectedId!==craftId)api.selectObject(craftId);api.refresh();$('pilotPlaylist')?.click();return true;
 }
 function updateMapDestinations(){const ships=pilotCrafts().filter(o=>navigation(o.id).mode==='auto'),picker=$('mapCraftPicker'),key=ships.map(o=>o.id+':'+o.name).join('|');$('mapCraftChoice').hidden=ships.length<2;if(picker.dataset.signature!==key){picker.innerHTML=ships.map(o=>`<option value="${escape(o.id)}">${escape(o.name||OBJECT_TYPES.find(t=>t.id===o.type)?.label||o.type)}</option>`).join('');picker.dataset.signature=key;}picker.value=mapCraftId||'';const craft=renderer()?.objects?.find(o=>o.id===mapCraftId),show=!!craft&&navigation(craft.id).mode==='auto';$('mapDestinations').hidden=!show;if(!show)return;$('mapFlightPlan').textContent='Playlist';const list=planTargets(craft.id),signature=list.map(t=>t.id+':'+(t.name||t.label)).join('|');if($('mapDestination').dataset.signature!==signature){$('mapDestination').dataset.signature=signature;$('mapDestination').innerHTML='<option value="">Select destination…</option>'+list.map(t=>`<option value="${escape(t.id)}">${escape(t.name||t.label||t.id)}${t.dockable?' · dock':t.waypoint?' · waypoint':''}</option>`).join('');}$('mapDestination').value=mapTravelDestination||mapSelection||'';}
 function updateMapTravel(id=mapTravelDestination||mapSelection||mapModelCurrent?.centerId){
  const r=renderer(),craft=r?.objects?.find(o=>o.id===mapCraftId),pilot=craft?.id,active=!!r?.getTravelState?.()?.active;
  updateMapDestinations();mapTool(lastCompact===compactMap()?tool:compactMap()?'map':'object');if(!mapDialog.open||!pilot||navigation(pilot).mode!=='auto'){$('mapTravel').hidden=true;mapTravelPreview=null;mapTravelKey='';return;}
  if(mapHeadingTarget!==id){mapHeadingTarget=id;mapHeading=null;$('mapTravelHeading').value='';}
  const target=planTargets(pilot).find(t=>t.id===id),waypoint=target?.waypoint,options={craftId:pilot,warpFactor:mapWarp,...(waypoint&&mapHeading!==null?{heading:mapHeading}:{})},key=[pilot,id,active,!!target,mapWarp,mapHeading,r.geometryRevision].join('|');
  const bridge=bridgeFor(pilot);
  if(key!==mapTravelKey){mapTravelKey=key;mapTravelPreview=target&&!bridge&&!target.dockable?r.previewTravel?.(id,options):null;if(mapTravelPreview&&!mapTravelPreview.error)mapTravelPreview={...mapTravelPreview,craftId:pilot,craftType:craft.type};r.setTravelPreview?.(mapTravelPreview);}
  const data=mapTravelPreview,estimated=Number.isFinite(data?.properSeconds)&&!data.error;
  $('mapTravel').hidden=!target||mapTravelDismissed===id;
  $('mapTravelMode').textContent=bridge?'CENTERED BRIDGE':target?.dockable?'HUB DOCKING':craft.type==='shuttle'?'AUTO FLIGHT · 1g':'AUTO FLIGHT · WARP';
  const promptTarget=target?.name||target?.label||'Choose a destination';if($('mapTravelTarget').textContent!==promptTarget)$('mapTravelTarget').textContent=promptTarget;
  $('mapTravelHeadingRow').hidden=!!bridge||!waypoint;$('mapTravelTimes').hidden=!estimated;$('mapTravelProperRow').hidden=false;$('mapTravelDilationRow').hidden=craft.type!=='shuttle';$('mapTravelDilation').textContent=estimated?formatClockDuration(data.estimatedDilationSeconds??data.dilationSeconds??0):'';$('mapTravelWarpRow').hidden=!!bridge||!target||craft.type!=='enterprise';$('mapTravelWarpValue').textContent=Number(mapWarp.toPrecision(2)).toLocaleString();
  $('mapTravelTime').textContent=estimated?formatClockDuration(data.coordinateSeconds):'';$('mapTravelProper').textContent=estimated?formatClockDuration(data.properSeconds):'';
  $('mapTravelNote').textContent=bridge?'Add this visit to the route. Janus uses local warp in orbit and a bridge between destinations.' :target?.dockable?'Match the station’s orbit and dock at the lower hub. Change the port in Playlist.':!target?'Choose a body or waypoint on the map.':estimated?'From current position · adds to end of playlist.':'Calculated from the preceding stop when queued.';
  $('mapTravelQueue').disabled=false;$('mapTravelQueue').textContent=target?.dockable?'Add docking stop':'Add to playlist';$('mapTravelQueue').hidden=!target;$('mapTravelCancel').hidden=!target;
 }
 const mapDistance=value=>value>=14959787070?`${(value/149597870700).toLocaleString(undefined,{maximumSignificantDigits:5})} AU`:value>=1000?`${(value/1000).toLocaleString(undefined,{maximumSignificantDigits:5})} km`:`${value.toLocaleString(undefined,{maximumSignificantDigits:5})} m`;
 function refreshMapCenters(){const nodes=tree(),shown=nodes.filter(n=>n.id===mapCenter||!mapSearch||n.label.toLowerCase().includes(mapSearch)),signature=shown.map(n=>n.id+':'+n.label).join('|');if(signature!==mapCenterSignature){mapCenterSignature=signature;$('orbitMapCenter').innerHTML=shown.map(n=>`<option value="${escape(n.id)}">${escape(n.label)}</option>`).join('')||'<option value="space">Space</option>';}$('orbitMapCenter').value=mapCenter;}
 function updateMap(){
  if(!mapDialog.open)return;const r=renderer();mapModelCurrent=mapModel(r,mapCenter,{filters:mapFilters});mapCenter=mapModelCurrent.centerId;refreshMapCenters();
  if(mapOrbitRange&&mapOrbitRange.centerId===mapCenter)mapModelCurrent.maximum=mapOrbitRange.chartMaximum;
  const s=api.state();$('mapGrid').checked=!!s.grid;$('mapGrid').disabled=s.spectrum==='geometry';$('mapAnnotations').checked=!!s.annotations;const amp=Number($('mapAmplification').value),result=renderOrbitMap(mapModelCurrent,{logDistance:$('mapLogDistance').checked,logSize:$('mapLogSize').checked,amplification:amp,grid:s.grid,annotations:s.annotations,metrics:false,selectedId:mapSelection,viewportWidth:$('orbitMapDrawing').getBoundingClientRect?.().width||(compactMap()?mapDialog.getBoundingClientRect().width:900)});
  $('orbitMapDrawing').innerHTML=result.svg;$('mapPotential').innerHTML=result.profileSvg;$('mapAmplificationValue').textContent=`10^${amp}×`;
  const b=result.selected,radius=b.distanceMeters||b.radiusMeters,potential=mapPotential(mapModelCurrent.host.massSolar,radius),tidal=potential/Math.max(1,radius*radius),orbitInfo=r?.getOrbitEditInfo?.(b.id),orbit=orbitInfo?{...orbitInfo,editable:orbitInfo.editable&&b.id!==mapCenter,reason:orbitInfo.editable&&b.id===mapCenter?'Open the parent map to edit this object’s orbit.':orbitInfo.reason}:null,node=mapModelCurrent.nodes.find(n=>n.id===b.id),canTrack=b.id==='space'||targets().some(t=>t.id===b.id&&t.enabled&&t.canTrack),canRide=targets().some(t=>t.id===b.id&&t.enabled&&t.canBoard);
  updateMapTravel(mapTravelDestination||b.id);
  const realNode=node&&!r.state.bridge,eligible=!!mapCraftId&&navigation(mapCraftId).mode==='auto'&&planTargets(mapCraftId).some(t=>t.id===b.id);
  $('mapAddChild').hidden=!realNode||!node.canAdd;$('mapRemoveBranch').hidden=!realNode||node.id==='space';
  $('mapRemoveBranch').textContent=node?.children?.length?'Remove branch…':'Remove object…';
  $('mapInspectSelection').hidden=!compactMap();$('mapInspectSelection').textContent='Inspect '+b.name;
  const bridge=bridgeFor(mapCraftId);$('mapQuickQueue').disabled=!!bridge&&(bridge.active||bridge.currentId===b.id);$('mapQuickQueue').textContent=bridge?'Set bridge destination':eligible&&node?.type==='habitat'?'Add docking stop':'Add to playlist';$('mapQuickQueue').hidden=!eligible;$('mapQuickQueue').title=bridge?'Open bridge controls for this endpoint':eligible?'Append '+b.name+' to '+(r.objects.find(o=>o.id===mapCraftId)?.name||'the vehicle')+'’s playlist':'';
  if(branchEdit&&branchEdit.id!==b.id)closeBranchEditor();
  $('mapSelected').innerHTML=`<span>SELECTED ${b.type==='space'?'ROOT':'OBJECT'}</span><h3>${escape(b.name)}</h3><dl>${b.type==='waypoint'?'<div><dt>Arrival</dt><dd>At rest</dd></div>':b.type!=='space'?`<div><dt>${b.catalogId===K2_GRID?'Network extent':b.horizonMeters?'Event horizon radius':'Body radius'}</dt><dd>${mapDistance(b.horizonMeters||b.radiusMeters)}</dd></div>${b.massSolar>0?`<div><dt>Mass</dt><dd>${b.massSolar>=.01?Number(b.massSolar.toPrecision(4)).toLocaleString()+' M☉':(b.massSolar*1.98847e30).toExponential(2)+' kg'}</dd></div>`:''}`:''}<div><dt>From map center</dt><dd>${b.distanceMeters>0?mapDistance(b.distanceMeters):'At center'}</dd></div>${mapModelCurrent.host.massSolar>0&&b.catalogId!==K2_GRID?`<div><dt>GM / (r c²)</dt><dd>${potential.toExponential(2)}</dd></div><div><dt>Tidal scale · 1/m²</dt><dd>${tidal.toExponential(2)}</dd></div>`:''}</dl>${b.dataNote?`<details class="map-source-note"><summary>Source &amp; model notes</summary><p>${escape(b.dataNote)}</p></details>`:''}`;
  $('mapTrack').disabled=!canTrack;$('mapRide').disabled=!canRide;$('mapChase').hidden=!isPilotable(b.id);$('mapChase').disabled=!canRide;$('mapDrive').hidden=!isPilotable(b.id);setDriveAvailability($('mapDrive'),b.id,canRide);$('mapCenterSelected').disabled=b.id===mapCenter;$('mapCenterSelected').textContent=node?.children?.length?`Explore ${node.children.length} ${node.children.length===1?'child':'children'} →`:'Center map here';
  const entries=[mapModelCurrent.host,...mapModelCurrent.entries],bodySignature=entries.map(b=>b.id+':'+b.name).join('|');if($('mapBodyPicker').dataset.signature!==bodySignature){$('mapBodyPicker').dataset.signature=bodySignature;$('mapBodyPicker').innerHTML=entries.map(b=>`<option value="${escape(b.id)}">${escape(b.name)}${b.id===mapCenter?' · center':''}</option>`).join('');}$('mapBodyPicker').value=b.id;
  const nodes=new Map(mapModelCurrent.nodes.map(n=>[n.id,n])),chain=[];let ancestor=nodes.get(mapCenter);while(ancestor&&chain.length<40){chain.unshift(ancestor);ancestor=nodes.get(ancestor.parentId);}
  $('mapBreadcrumbs').innerHTML=chain.map((n,i)=>`${i?'<span aria-hidden="true">/</span>':''}<button data-map-center="${escape(n.id)}" ${n.id===mapCenter?'aria-current="location"':''}>${escape(n.label)}</button>`).join('');$('mapParentUp').disabled=!mapModelCurrent.parentId;$('mapParentUp').title=mapModelCurrent.parentId?`Map of ${nodes.get(mapModelCurrent.parentId)?.label||'parent'}`:'Space is the root';
  $('mapOrbitField').hidden=!orbit?.editable;$('mapOrbitReason').textContent=orbit?.editable?'':orbit?.reason||'Choose an orbiting child to change its orbit.';
  if(orbit?.editable){
   if(!mapOrbitRange||mapOrbitRange.id!==b.id||orbit.minimumMeters!==mapOrbitRange.minimum){const maximum=Math.min(orbit.maximumMeters,Math.max(mapModelCurrent.maximum*2,orbit.radiusMeters*4,orbit.minimumMeters*100)),chartMaximum=Math.max(mapModelCurrent.maximum,maximum*1.05);mapOrbitRange={id:b.id,centerId:mapCenter,minimum:orbit.minimumMeters,maximum,reference:Math.max(mapModelCurrent.host.radiusMeters,chartMaximum*1e-6,1),chartMaximum};mapModelCurrent.maximum=chartMaximum;updateMap();return;}
   const range=mapOrbitRange;$('mapOrbitLabel').textContent=(orbit.radiusLabel||'Orbit size').toUpperCase();$('mapOrbitRadius').value=orbitSliderValue(orbit.radiusMeters,range.minimum,range.maximum,range.reference,$('mapLogDistance').checked);$('mapSliderHint').textContent=$('mapLogDistance').checked?'Exponential radius · linear travel on this log map':'Linear radius · linear travel on this map';$('mapOrbitRadiusValue').textContent=mapDistance(orbit.radiusMeters);$('mapOrbitRadius').setAttribute('aria-valuetext',mapDistance(orbit.radiusMeters));if(document.activeElement!==$('mapOrbitMeters'))$('mapOrbitMeters').value=orbit.radiusMeters;$('mapOrbitMeters').min=orbit.minimumMeters;$('mapOrbitMeters').setAttribute('max',orbit.maximumMeters);
   $('mapShuttleSpeedField').hidden=b.type!=='shuttle';if(b.type==='shuttle'&&document.activeElement!==$('mapShuttleSpeed'))$('mapShuttleSpeed').value=Number(orbit.speedMetersPerSecond.toPrecision(7));
   $('mapOrbitMotion').textContent=[Number.isFinite(orbit.periodDays)?`Period ${orbit.periodDays.toLocaleString(undefined,{maximumSignificantDigits:4})} days`:'',Number.isFinite(orbit.speedMetersPerSecond)?`${orbit.velocityLabel||'Reference speed'} ${mapDistance(orbit.speedMetersPerSecond)}/s`:''].filter(Boolean).join(' · ');
  }
 }
 function resetMapAmplification(model){const subject=model.children.find(b=>b.id===mapSelection)||[...model.children].sort((a,b)=>b.radiusMeters-a.radiusMeters)[0],value=mapPotential(model.host.massSolar,subject?.distanceMeters||model.host.radiusMeters*5);$('mapAmplification').value=value>0?Math.max(0,Math.min(12,Math.round(Math.log10(.3/value)))):0;}
 function centerMap(id){closeBranchEditor();$('mapActionStatus').textContent='';mapTravelDestination=null;mapLastTap=null;mapTravelDismissed=null;mapTravelKey='';mapCenter=id||'space';mapSelection=null;mapOrbitRange=null;mapSearch='';$('mapObjectSearch').value='';resetMapAmplification(mapModel(renderer(),mapCenter,{filters:mapFilters}));updateMap();}
 function chooseMapBody(id){closeBranchEditor();$('mapActionStatus').textContent='';mapTravelDestination=null;mapTravelDismissed=null;mapTravelKey='';mapSelection=id;mapOrbitRange=null;updateMap();}
 function openMap(center){closeBranchEditor();$('mapActionStatus').textContent='';mapTool(compactMap()?'map':'object');mapHeading=null;mapHeadingTarget=null;mapTravelDestination=null;api.closeTravelPreview?.();const chosen=transferCraft();mapCraftId=chosen?.id||null;mapWarp=sceneCruiseWarp(renderer()?.sceneId)??1;$('mapTravelWarp').setAttribute('max',String(sceneCruiseWarp(renderer()?.sceneId)??9.9999));$('mapTravelWarp').value=String(mapWarp);$('mapToggle').classList.remove('control-discovery');mapTravelDismissed=null;mapTravelKey='';mapLastTap=null;setPanel(null);const r=renderer(),nodes=tree(),requested=center||'space',requestedNode=nodes.find(n=>n.id===requested),current=requestedNode&&!requestedNode.children?.length&&requestedNode.parentId&&requestedNode.parentId!=='space'?requestedNode.parentId:requested,model=mapModel(r,current,{filters:mapFilters});mapCenter=model.centerId;mapSelection=requested!==model.centerId?requested:null;mapOrbitRange=null;mapSearch='';$('mapObjectSearch').value='';refreshMapCenters();resetMapAmplification(model);api.openDialog('orbitMapDialog',$('mapToggle'));updateMap();}
 function changeMapOrbit(meters,id=mapSelection||mapModelCurrent?.centerId){if(!id||!Number.isFinite(meters)||!(meters>0))return;const result=renderer()?.setOrbitRadiusMeters?.(id,meters);if(result===false||result?.ok===false){api.toast(result?.reason||'This orbit could not be changed.');return;}api.markCustom?.();api.syncRendererState?.();api.refresh();updateMap();}
 let branchEdit=null;
 function closeBranchEditor(){branchEdit=null;$('mapBranchEditor').hidden=true;for(const id of ['mapAddChild','mapRemoveBranch'])$(id).setAttribute('aria-expanded','false');}
 function beginBranchEdit(mode){
  closeBranchEditor();const r=renderer(),nodes=tree(),id=mapSelection||mapCenter,node=nodes.find(n=>n.id===id);if(!node||r.state.bridge)return;
  const adding=mode==='add',button=$(adding?'mapAddChild':'mapRemoveBranch'),types=adding?r.allowedChildTypes(id):[];if(adding&&!types.length){$('mapActionStatus').textContent='No child types available here.';return;}if(!adding&&id==='space')return;
  let descendants=0;if(!adding){const seen=new Set([id]),stack=[...(node.children||[])],byId=new Map(nodes.map(n=>[n.id,n]));while(stack.length){const child=stack.pop();if(!seen.has(child)){seen.add(child);descendants++;stack.push(...(byId.get(child)?.children||[]));}}}
  branchEdit={mode,id,parentId:node.parentId};button.setAttribute('aria-expanded','true');$('mapBranchEditor').hidden=false;$('mapActionStatus').textContent='';
  $('mapChildType').hidden=!adding;if(adding){$('mapChildType').innerHTML=types.map(type=>`<option value="${escape(type)}">${escape(OBJECT_TYPES.find(o=>o.id===type)?.label||type)}</option>`).join('');$('mapChildType').value=types[0];}
  $('mapBranchPrompt').textContent=adding?'Add a child to '+node.label:'Remove '+node.label+(descendants?' and '+descendants+' descendant'+(descendants===1?'':'s'):'')+'?';
  $('mapBranchCommit').textContent=adding?'Add child':'Remove';$(adding?'mapChildType':'mapBranchCancel').focus();
 }
 $('mapInspectSelection').addEventListener('click',()=>{mapTool('object');$('mapBodyPicker').focus();});
 $('mapAddChild').addEventListener('click',()=>beginBranchEdit('add'));$('mapRemoveBranch').addEventListener('click',()=>beginBranchEdit('remove'));$('mapBranchCancel').addEventListener('click',()=>{const opener=branchEdit?.mode==='add'?'mapAddChild':'mapRemoveBranch';closeBranchEditor();$(opener).focus();});
 $('mapBranchCommit').addEventListener('click',()=>{
  if(!branchEdit)return;const {mode,id,parentId}=branchEdit,r=renderer(),type=$('mapChildType').value,adding=mode==='add',label=labelFor(id);
  const edit=()=>{const result=adding?r.addChildObject(id,type):r.removeTreeObject(id);if(!result){$('mapActionStatus').textContent=r.lastTreeError||'The scene could not be changed.';return;}
   api.syncRendererState?.();api.markCustom?.();api.refresh();centerMap(adding?id:parentId);if(adding){const added=r.objects.find(o=>o.id===result.id)||result;const category=objectCategory(added);if(Object.hasOwn(mapFilters,category)&&!mapFilters[category]){mapFilters[category]=true;mapDialog.querySelector('[data-map-filter="'+category+'"]')?.setAttribute('aria-pressed','true');}chooseMapBody(result.id);}
   $('mapActionStatus').textContent=adding?'Child added to '+label+'.':label+' removed.';$('mapBodyPicker').focus();
  };if(api.stageMutation)api.stageMutation(adding?'Adding child…':'Removing branch…',edit);else edit();
 });
 const targets=()=>(renderer()?.getSceneTargets?.()||[]).filter(target=>target.id!=='bridge');
 const isShuttle=id=>api.objects().some(o=>o.id===id&&o.type==='shuttle');
 const isEnterprise=id=>api.objects().some(o=>o.id===id&&o.type==='enterprise');
 const isPilotable=id=>isShuttle(id)||isEnterprise(id);
 function setDriveAvailability(button,id,base=true){button.disabled=!base||!isPilotable(id);const fleet=renderer()?.sceneId==='shuttle-space';button.textContent=fleet?'Take the helm':'Flight controls';button.title=fleet?'Drive this vehicle':'Show the vehicle’s Auto and Drive controls';}
 function drive(id){if(!isPilotable(id))return;if(renderer()?.sceneId==='shuttle-space'&&api.takeLineupHelm?.(id))return;api.selectObject(id);setPanel(null);api.refresh();$('pilotModeAuto')?.focus?.({preventScroll:true});}

 const selectedTarget=()=>{const id=selection==='space'?null:selection==='binary'?'secondary':selection==='warp'?renderer()?.getState().warpObjectId:selection==='bridge'?(renderer()?.getState().bridgeObjectId||'bridge'):selection;return targets().find(t=>t.id===id);};
 function setPanel(next,focus=false){
  panel=next;for(const name of ['elements','camera','display']){$(`${name}Panel`).hidden=next!==name;$(`${name}Toggle`).setAttribute('aria-expanded',String(next===name));}
  controls.hidden=next!=='inspector';scene.classList.toggle('inspector-open',next==='inspector');scene.classList.toggle('viewport-panel-open',!!next);
  if(next==='elements'){refreshElements(true);$('elementsPanel').scrollTop=0;}if(next==='camera'){refreshTargets(true);const id=renderer()?.driveId||currentVehicleId()||renderer()?.focusId;if(targets().some(t=>t.id===id)){$('viewportTarget').value=id;refreshTargets();}refreshVRSupport();}if(next==='inspector')controls.querySelector('.controls-body').scrollTop=0;
  if(focus&&next){const region=next==='inspector'?controls:$(`${next}Panel`);region.querySelector('button,select,input')?.focus({preventScroll:true});}
 }
 function labelFor(id){return tree().find(n=>n.id===id)?.label||(componentEntries.find(e=>e[0]===id)?.[1])||api.objects().find(o=>o.id===id)?.label||'Object';}
 function select(id){
  selection=id;$('inspectorViewMenu').open=false;const branchMap=new Map(tree().map(n=>[n.id,n]));let ancestor=branchMap.get(id);while(ancestor){collapsed.delete(ancestor.id);ancestor=branchMap.get(ancestor.parentId);}const object=api.objects().find(o=>o.id===id);controls.dataset.inspectorKind=object?'object':id==='add'?'add':id==='space'?'space':'component';
  if(object){api.selectObject(id);api.setFeature('objects');}
  else if(id==='primary')api.setFeature('hole');
  else if(id==='space'){api.setFeature('scene');api.selectComponent('space');}
  else if(id==='secondary'){api.setFeature('scene');api.selectComponent('binary');}
  else if(id==='secondary-disk'||id==='secondary-jets'){api.setFeature('scene');api.selectComponent(id==='secondary-disk'?'secondaryDisk':'secondaryJets');}
  else if(id==='warp')api.setFeature('warp');
  else if(id==='add'){api.setFeature('objects');$('addObjectPanel').open=true;}
  else{api.setFeature('scene');api.selectComponent(id);}
  const label=id==='add'?(renderer()?.getObjectContext?.().kind==='bridge'?'Change traveler':'Add an object'):id==='primary'&&api.state().whiteHole?'White hole':labelFor(id);$('inspectorTitle').textContent=label;
  const node=tree().find(n=>n.id===id);$('inspectorAddChild').hidden=!node?.canAdd;$('inspectorDeleteBranch').hidden=id==='space'||id==='add';const descendants=new Set();const collect=key=>{for(const child of tree().filter(n=>n.parentId===key)){if(descendants.has(child.id))continue;descendants.add(child.id);collect(child.id);}};collect(id);$('inspectorDeleteBranch').textContent=descendants.size?`Delete object + ${descendants.size} children`:'Delete object';$('inspectorDeleteBranch').title=`Delete ${label} and ${descendants.size} descendants`;
  updateInspectorActions();
  setPanel('inspector',true);refreshElements();
 }
 function updateInspectorActions(){$('inspectorLineup').hidden=renderer()?.sceneId!=='shuttle-space';const target=selectedTarget();inspectorActions.hidden=!target?.canTrack;$('inspectorTrack').disabled=!target?.enabled;$('inspectorRide').hidden=!target?.canBoard;$('inspectorRide').disabled=!target?.enabled;$('inspectorChase').hidden=!isPilotable(target?.id);$('inspectorChase').disabled=!target?.enabled;$('inspectorDrive').hidden=!isPilotable(target?.id);setDriveAvailability($('inspectorDrive'),target?.id,!!target?.enabled);$('inspectorMap').hidden=['disk','jets','ring','belt','dyson','bridge'].includes(tree().find(n=>n.id===selection)?.type);}
 function focus(id,mode){setPanel(null);return api.stageMutation?api.stageMutation('Preparing viewpoint…',()=>focusNow(id,mode)):focusNow(id,mode);}
 function focusNow(id,mode){
  if(id==='space'){renderer()?.resetCamera();renderer()?.releaseFocus(false);api.refresh();setPanel(null);return;}
  if(!renderer()?.focusTarget?.(id,mode)){api.toast('Turn this element on before following it.');return;}
  api.refresh();api.syncViewMode(mode==='onboard'||mode==='chase'?'look':'orbit');setPanel(null);refreshTargets(true);
  api.toast(mode==='chase'?'Following behind the vehicle. Drag to look around in every direction.':mode==='onboard'?'Riding along. Drag to look in every direction.':'Tracking this body. Drag to orbit; scroll or pinch to move closer.');
 }
 function refreshElements(force=false){
  if(!force&&panel!=='elements')return;
  const nodes=tree();for(const n of nodes)if(!knownBranches.has(n.id)){knownBranches.add(n.id);if(nodes.length>40&&n.children?.length&&n.parentId!=='space'&&n.id!=='space')collapsed.add(n.id);}const signature=JSON.stringify([nodes.map(n=>[n.id,n.parentId,n.label,n.enabled,n.children]),selection,[...collapsed],objectSearch]);if(!force&&signature===lastSignature)return;lastSignature=signature;
  const context=renderer()?.getObjectContext?.();$('viewportAdd').innerHTML=context?.kind==='bridge'?'↔ Change traveler <span>NASA Warp Explorer · NASA Meridian · Astronaut</span>':'＋ Add an object <span>Choose a parent, then a child</span>';
  const glyph=n=>({space:'spark',blackhole:'blackhole',star:'spark',planet:'solar',moon:'orbit',planetoid:'solar',asteroid:'orbit',enterprise:'warp',shuttle:'meridian',heritageShuttle:'shuttle',disk:'blackhole',jets:'arrow',ring:'orbit',belt:'orbit',dyson:'solar'}[n.type]||'select');
  const map=new Map(nodes.map(n=>[n.id,n]));
  const ancestors=n=>{const result=[];let p=map.get(n.parentId);while(p&&result.length<30){result.push(p);p=map.get(p.parentId);}return result;};
  const matches=nodes.filter(n=>n.label.toLowerCase().includes(objectSearch)),visible=new Set();if(objectSearch)for(const n of matches){visible.add(n.id);for(const p of ancestors(n))visible.add(p.id);}
  $('objectSearchStatus').textContent=objectSearch?`${matches.length} matching ${matches.length===1?'object':'objects'} · parent branches included`:`${Math.max(0,nodes.length-1)} objects · expand a branch to explore`;
  $('viewportElements').innerHTML=nodes.filter(n=>objectSearch?visible.has(n.id):!ancestors(n).some(p=>collapsed.has(p.id))).map(n=>{const depth=ancestors(n).length,children=n.children?.length>0,open=!!objectSearch||!collapsed.has(n.id);return `<div class="tree-row ${selection===n.id?'selected':''}" style="--tree-depth:${depth}" role="treeitem" aria-level="${depth+1}" ${children?`aria-expanded="${open}"`:''} aria-selected="${selection===n.id}"><button class="tree-expand" ${children?`data-tree-expand="${escape(n.id)}"`:'disabled'} aria-label="${open?'Collapse':'Expand'} ${escape(n.label)}">${children?(open?'⌄':'›'):''}</button><button class="tree-name" data-element="${escape(n.id)}"><span class="element-glyph">${icon(glyph(n))}</span><span>${escape(n.label)}${children?`<b class="tree-child-count">${n.children.length}</b>`:''}<small>${n.id==='space'?(api.state().bridge?'Wormhole · two skies':'Starfield · nebula'):['disk','jets','dyson'].includes(n.type)?'Attached component':n.parentId==='space'?'Independent object':n.type==='moon'?'Natural satellite':'Orbiting child'}</small></span></button><button class="tree-gear" data-element="${escape(n.id)}" aria-label="Properties of ${escape(n.label)}" title="Properties & viewpoints">${icon('environment')}</button></div>`;}).join('')||`<p class="elements-empty">${objectSearch?'No matching objects. Try a shorter name.':'Preparing the object tree…'}</p>`;
  $('viewportElements').setAttribute('role','tree');$('viewportElements').setAttribute('aria-label','Objects in Space');
 }
 function refreshTargets(force=false){
  $('viewportLineup').hidden=renderer()?.sceneId!=='shuttle-space';
  if(!force&&panel!=='camera')return;
  const list=targets().filter(t=>t.enabled&&t.canTrack&&(!cameraSearch||t.label.toLowerCase().includes(cameraSearch))),previous=$('viewportTarget').value,signature=JSON.stringify(list.map(t=>[t.id,t.label,t.canBoard]));
  const currentFocus=renderer()?.focusId;if(force||signature!==lastTargetSignature||currentFocus!==lastFocusedId){const focusChanged=currentFocus!==lastFocusedId;lastFocusedId=currentFocus;lastTargetSignature=signature;$('viewportTarget').innerHTML='<option value="space">Space · root view</option>'+list.map(t=>`<option value="${escape(t.id)}">${escape(t.label)}</option>`).join('');if(focusChanged&&list.some(t=>t.id===currentFocus))$('viewportTarget').value=currentFocus;else if(list.some(t=>t.id===previous))$('viewportTarget').value=previous;else if(list.some(t=>t.id===currentFocus))$('viewportTarget').value=currentFocus;}
  const selected=list.find(t=>t.id===$('viewportTarget').value);$('viewportTrack').disabled=!selected&&$('viewportTarget').value!=='space';$('viewportRide').disabled=!selected?.canBoard;$('viewportChase').hidden=!isPilotable(selected?.id);$('viewportChase').disabled=!selected;$('viewportDrive').hidden=!isPilotable(selected?.id);setDriveAvailability($('viewportDrive'),selected?.id,!!selected);
 }
 const currentVehicleId=()=>isPilotable(renderer()?.selectedId)?renderer().selectedId:renderer()?.focusId;
 function refresh(stats={}){
  $('viewportScenes').classList.toggle('scene-discovery',!scenesDiscovered);
  const craft=transferCraft();if((craft?.id||null)!==mapDriveSession){mapDriveSession=craft?.id||null;mapTravelDismissed=null;mapTravelKey='';}
  $('mapToggle').classList.remove('control-discovery');if(mapDialog.open)updateMapTravel();

  if(!api.state().paused)playDiscovered=true;$('viewportPause').classList.toggle('control-discovery',!playDiscovered&&!!api.state().paused);
  if(selection!=='add'&&selection!=='space'&&!tree().some(n=>n.id===selection)&&!componentEntries.some(e=>e[0]===selection)&&!api.objects().some(o=>o.id===selection)){selection='space';if(panel==='inspector')setPanel('elements');}
  if(selection==='primary'){const label=api.state().whiteHole?'White hole':labelFor('primary');$('inspectorTitle').textContent=label;}
  refreshElements();refreshTargets();if(stats.vrError&&stats.vrError!==lastVRError){lastVRError=stats.vrError;api.toast(stats.vrError);}const s=api.state(),mode=stats.viewMode||s.viewMode;

  $('plannedPathToggle').checked=!!s.plannedPath;$('warpGridOnlyToggle').checked=!!s.warpGridOnly;$('warpGridOnlyToggle').disabled=s.spectrum==='geometry';
  $('velocityArrowsToggle').checked=!!s.velocityArrows;
  const overlaySignature=[s.sceneGridDensity,s.warpGridDensity,!!s.annotations,!!s.metrics,s.spectrum==='geometry'].join('|');if(overlaySignature!==lastOverlaySignature){lastOverlaySignature=overlaySignature;
   for(const [id] of densityFields){
    const slider=$(id),value=s[id]??DEFAULTS[id],label=Number(value.toFixed(2))+'×';
    slider.value=value;slider.setAttribute('aria-valuetext',label);$(id+'Value').textContent=label;
    slider.style.setProperty('--progress',((value-Number(slider.min))/(Number(slider.max)-Number(slider.min))*100)+'%');
   }
   for(const id of ['gridShortcut','allGridToggle']){$(id).disabled=s.spectrum==='geometry';$(id).title=s.spectrum==='geometry'?'Geometry view keeps the grid on':'Show or hide spacetime grids';}
  }
  const note=mode==='free'?'Drag to choose a heading. Scroll or pinch to travel forward or backward. W / S also move.':mode==='look'?'Drag to look around. Zoom out to track this body without changing your heading.':'Orbit a subject. Scroll or pinch to set your distance.';
  if($('viewportModeNote').textContent!==note)$('viewportModeNote').textContent=note;
  const chromeSignature=[s.paused,!!stats.vrActive].join('|');if(chromeSignature!==lastChromeSignature){lastChromeSignature=chromeSignature;$('viewportPauseLabel').textContent=s.paused?'Play':'Pause';$('viewportPause').querySelector('.pause-glyph').innerHTML=icon(s.paused?'play':'pause');$('viewportPause').setAttribute('aria-label',s.paused?'Resume simulation':'Pause simulation');$('enterVR').innerHTML=stats.vrActive?'Exit VR':icon('vr')+'Enter VR';}
  if(picture.open&&!photoAbort)$('startPicture').disabled=!renderer()?.ready||($('picturePreset').value!=='quick'&&!!renderer()?.cpu)||!!stats.vrActive;const cpu=stats.cpu||renderer()?.cpu;$('cpuQualityNotice').hidden=!cpu;const backendLabel={'worker-canvas':'Rendering in a worker','worker-commands':'Geometry in a worker','cooperative-main':'Compatibility renderer · cooperative tasks'}[stats.cpuBackend]||'';if($('cpuBackendStatus').textContent!==backendLabel)$('cpuBackendStatus').textContent=backendLabel;$('pictureToggle').disabled=false;$('pictureToggle').title='Capture or render a picture';$('enterVR').disabled=!!cpu||(!stats.vrActive&&vrSupport?.supported===false);
  if(panel==='inspector'){if(controls.dataset.inspectorKind==='object'&&!api.objects().some(o=>o.id===selection)){setPanel('elements');}updateInspectorActions();}
 }
 document.querySelectorAll('[data-view-panel]').forEach(button=>button.addEventListener('click',event=>setPanel(panel===button.dataset.viewPanel?null:button.dataset.viewPanel,event.detail===0)));
 shell.querySelectorAll('[data-close-view-panel]').forEach(button=>button.addEventListener('click',()=>setPanel(null)));
 $('viewportElements').addEventListener('click',e=>{const expansion=e.target.closest('[data-tree-expand]');if(expansion){const id=expansion.dataset.treeExpand;collapsed.has(id)?collapsed.delete(id):collapsed.add(id);refreshElements(true);return;}const choice=e.target.closest('[data-element]'),toggle=e.target.closest('[data-element-toggle]');if(toggle){const key=toggle.dataset.elementToggle;api.updateParameter(key,!api.state()[key]);refresh();}else if(choice)select(choice.dataset.element);});

 $('viewportAdd').addEventListener('click',()=>{const node=tree().find(n=>n.id===selection);$('addParent').value=node?.canAdd?selection:'space';select('add');});
 $('inspectorAddChild').addEventListener('click',()=>{$('addParent').value=selection;select('add');});
 $('inspectorDeleteBranch').addEventListener('click',()=>{const id=selection,label=labelFor(id);return api.stageMutation?.('Removing branch…',()=>{renderer()?.removeTreeObject?.(id);api.syncRendererState();api.markCustom();selection='space';api.refresh();setPanel('elements');api.toast(`${label} and its children removed.`);});});
 $('inspectorFree').addEventListener('click',()=>{renderer()?.freeRoamRelative?.(selectedTarget()?.id);api.syncViewMode('free');api.refresh();setPanel(null);});$('inspectorBack').addEventListener('click',()=>setPanel('elements'));$('closeInspector').addEventListener('click',()=>{setPanel(null);$('elementsToggle').focus({preventScroll:true});});
 for(const id of ['inspectorLineup','viewportLineup'])$(id).addEventListener('click',()=>{api.showLineup?.();selection='space';setPanel(null);});
 $('inspectorDrive').addEventListener('click',()=>drive(selectedTarget()?.id));$('inspectorChase').addEventListener('click',()=>focus(selectedTarget()?.id,'chase'));
 $('inspectorTrack').addEventListener('click',()=>focus(selectedTarget()?.id,'track'));$('inspectorRide').addEventListener('click',()=>focus(selectedTarget()?.id,'onboard'));
 $('inspectorMap').addEventListener('click',()=>openMap(selection));$('orbitMapOpen').addEventListener('click',()=>openMap($('viewportTarget').value));$('mapToggle').addEventListener('click',()=>openMap('space'));$('closeOrbitMap').addEventListener('click',()=>mapDialog.close());mapDialog.addEventListener('close',()=>{mapOrbitPending=null;renderer()?.setTravelPreview?.(null);api.onDialogClose('orbitMapDialog');});
 $('mapFilters').addEventListener('click',event=>{const button=event.target.closest('[data-map-filter]');if(!button)return;const category=button.dataset.mapFilter;if(!(category in mapFilters))return;mapFilters[category]=!mapFilters[category];button.setAttribute('aria-pressed',String(mapFilters[category]));mapSelection=null;mapOrbitRange=null;mapTravelDismissed=null;mapTravelKey='';updateMap();});
 $('mapTravelCancel').addEventListener('click',()=>{mapTravelDismissed=mapTravelDestination||mapSelection||mapModelCurrent?.centerId;$('mapTravel').hidden=true;renderer()?.setTravelPreview?.(null);});
 $('mapDestination').addEventListener('change',()=>{mapTravelDestination=$('mapDestination').value||null;mapTravelDismissed=null;mapTravelKey='';updateMapTravel();});
 function queueFromMap(id){const r=renderer(),result=appendPlaylistStop(r,mapCraftId,id,mapWarp,mapHeadingTarget===id?mapHeading:null);const title=planTargets(mapCraftId).find(t=>t.id===id)?.name||labelFor(id);const message=result?.error||title+' added to playlist.';api.refresh();$('mapActionStatus').textContent=message;api.toast(message);}
 $('mapFlightPlan').addEventListener('click',()=>openFlightPlan(mapCraftId));$('mapTravelQueue').addEventListener('click',()=>queueFromMap(mapTravelDestination||mapSelection||mapCenter));$('mapQuickQueue').addEventListener('click',()=>queueFromMap(mapSelection||mapCenter));
 $('mapCraftPicker').addEventListener('change',()=>{mapCraftId=$('mapCraftPicker').value;mapTravelDismissed=null;mapTravelKey='';updateMap();});
 $('mapTravelHeading').addEventListener('input',()=>{mapHeading=optionalHeading($('mapTravelHeading').value);mapTravelKey='';updateMapTravel();});
 $('mapTravelWarp').addEventListener('input',()=>{mapWarp=Math.max(1,Math.min(sceneCruiseWarp(renderer()?.sceneId)??9.9999,Number($('mapTravelWarp').value)||1));mapTravelKey='';updateMapTravel();});
 $('orbitMapCenter').addEventListener('change',()=>centerMap($('orbitMapCenter').value));$('mapObjectSearch').addEventListener('input',()=>{mapSearch=$('mapObjectSearch').value.trim().toLowerCase();refreshMapCenters();});$('mapBodyPicker').addEventListener('change',()=>chooseMapBody($('mapBodyPicker').value));for(const id of ['mapLogDistance','mapLogSize'])$(id).addEventListener('change',updateMap);$('mapAmplification').addEventListener('input',updateMap);
 $('mapParentUp').addEventListener('click',()=>{const child=mapCenter,parent=mapModelCurrent?.parentId;if(parent){centerMap(parent);chooseMapBody(child);}});$('mapBreadcrumbs').addEventListener('click',event=>{const target=event.target.closest('[data-map-center]');if(target)centerMap(target.dataset.mapCenter);});$('mapCenterSelected').addEventListener('click',()=>centerMap(mapSelection||mapModelCurrent?.centerId));
 $('mapGrid').addEventListener('change',()=>{api.updateParameter('grid',$('mapGrid').checked);updateMap();});$('mapAnnotations').addEventListener('change',()=>{api.updateParameter('annotations',$('mapAnnotations').checked);updateMap();});
 // A rendered selection replaces the SVG nodes; remember the object ID so
 // the second tap still drills down even though its DOM target is new.
 let mapLastTap=null;
 const selectMapBody=event=>{const body=event.target.closest('[data-map-object]');if(!body)return;const id=body.dataset.mapObject,now=performance.now(),twice=event.type==='click'&&mapLastTap?.id===id&&mapLastTap.center===mapCenter&&now-mapLastTap.time<430;if(twice){mapLastTap=null;centerMap(id);}else{mapLastTap=event.type==='click'?{id,center:mapCenter,time:now}:null;chooseMapBody(id);}};
 $('orbitMapDrawing').addEventListener('click',selectMapBody);$('orbitMapDrawing').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectMapBody(event);}});$('orbitMapDrawing').addEventListener('dblclick',event=>{const body=event.target.closest('[data-map-object]');if(body){mapLastTap=null;centerMap(body.dataset.mapObject);}});
 $('mapChase').addEventListener('click',()=>{const target=mapSelection||mapModelCurrent?.centerId;mapDialog.close();focus(target,'chase');});$('mapDrive').addEventListener('click',()=>{const target=mapSelection||mapModelCurrent?.centerId;mapDialog.close();drive(target);});
 $('mapTrack').addEventListener('click',()=>{const target=mapSelection||mapModelCurrent?.centerId;if(target){mapDialog.close();focus(target,'track');}});$('mapRide').addEventListener('click',()=>{const target=mapSelection||mapModelCurrent?.centerId;if(target){mapDialog.close();focus(target,'onboard');}});$('mapProperties').addEventListener('click',()=>{const target=mapSelection||mapModelCurrent?.centerId;if(target){mapDialog.close();select(target);}});
 const flushMapOrbit=()=>{mapOrbitScheduled=false;const pending=mapOrbitPending;mapOrbitPending=null;if(pending&&mapDialog.open&&pending.center===mapCenter&&pending.scene===renderer()?.sceneId&&pending.id===(mapSelection||mapModelCurrent?.centerId))changeMapOrbit(pending.meters,pending.id);};
 $('mapShuttleSpeed').addEventListener('change',()=>{const speed=Number($('mapShuttleSpeed').value),id=mapOrbitRange?.id;if(!id||!Number.isFinite(speed)||speed<=0){api.toast('Enter a positive circular speed in meters per second.');return;}const result=renderer()?.setShuttleOrbitSpeed?.(id,speed);if(!result)return;mapOrbitRange=null;$('mapShuttleSpeed').value=Number(result.speedMetersPerSecond.toPrecision(7));api.markCustom?.();api.syncRendererState?.();api.refresh();updateMap();});
 $('mapOrbitRadius').addEventListener('input',()=>{if(mapOrbitRange){const range=mapOrbitRange;mapOrbitPending={id:range.id,center:mapCenter,scene:renderer()?.sceneId,meters:orbitSliderRadius(Number($('mapOrbitRadius').value),range.minimum,range.maximum,range.reference,$('mapLogDistance').checked)};if(!mapOrbitScheduled){mapOrbitScheduled=true;requestAnimationFrame(flushMapOrbit);}}});$('mapOrbitRadius').addEventListener('change',flushMapOrbit);$('mapOrbitMeters').addEventListener('change',()=>{const value=Number($('mapOrbitMeters').value);if(!(value>0)){api.toast('Enter a positive orbit size in meters.');return;}mapOrbitRange=null;changeMapOrbit(value);});
 $('viewportChase').addEventListener('click',()=>focus($('viewportTarget').value,'chase'));$('viewportDrive').addEventListener('click',()=>drive($('viewportTarget').value));
 $('viewportTarget').addEventListener('change',()=>refreshTargets());$('viewportTrack').addEventListener('click',()=>focus($('viewportTarget').value,'track'));$('viewportRide').addEventListener('click',()=>focus($('viewportTarget').value,'onboard'));
 const mathHub=$('mathHubDialog');document.querySelectorAll('[data-open-math-hub]').forEach(button=>button.addEventListener('click',()=>{setPanel(null);api.openDialog('mathHubDialog',button);}));$('closeMathHub').addEventListener('click',()=>mathHub.close());mathHub.addEventListener('close',()=>api.onDialogClose('mathHubDialog'));mathHub.addEventListener('click',event=>{if(event.target===mathHub)mathHub.close();});mathHub.querySelectorAll('.math-hub-card').forEach(button=>button.addEventListener('click',()=>{if(mathHub.open)mathHub.close();},{capture:true}));$('helpMath').addEventListener('click',()=>{$('helpDialog').close();api.openDialog('mathHubDialog',$('mathNav'));});
 $('viewportScenes').addEventListener('click',()=>{scenesDiscovered=true;$('viewportScenes').classList.remove('scene-discovery');setPanel(null);api.openScenes($('viewportScenes'));});$('viewportHelp').addEventListener('click',()=>api.openHelp($('viewportHelp')));
 $('viewportPause').addEventListener('click',()=>{api.setPaused(!api.state().paused);refresh();});$('viewportReset').addEventListener('click',()=>{renderer()?.resetCamera();api.refresh();setPanel(null);api.toast('Restored this scene’s starting view.');});
 $('relativeFree').addEventListener('click',()=>{if(renderer()?.freeRoamRelative)renderer().freeRoamRelative($('viewportTarget').value||'space');else renderer()?.setViewMode('free');api.syncViewMode('free');refresh(renderer()?.getState());setPanel(null);});
 async function refreshVRSupport(){try{vrSupport=await renderer()?.getVRSupport?.()||{supported:false,reason:'Use a WebXR-capable browser and headset.'};}catch{vrSupport={supported:false,reason:'VR is unavailable in this browser.'};}$('vrStatus').textContent=vrSupport.supported?'Headset ready. Your current viewpoint becomes the starting position.':vrSupport.reason;refresh(renderer()?.getState());}
 $('enterVR').addEventListener('click',async()=>{const button=$('enterVR');button.disabled=true;try{if(renderer()?.getState().vrActive)await renderer().exitVR();else{setPanel(null);await renderer().enterVR();}refresh(renderer()?.getState());}catch(error){api.toast(error?.message||'The VR session could not start.');}finally{button.disabled=false;refresh(renderer()?.getState());}});
 function duration(ms){if(!Number.isFinite(ms)||ms<0)return 'Estimating…';const seconds=Math.ceil(ms/1000);return seconds<60?`${seconds}s`:`${Math.floor(seconds/60)}m ${seconds%60}s`;}
 function openPicture(){setPanel(null);api.openDialog('pictureDialog',$('pictureToggle'));if(renderer()?.cpu)$('picturePreset').value='quick';const vr=renderer()?.getState().vrActive;$('startPicture').disabled=!renderer()?.ready||($('picturePreset').value!=='quick'&&!!renderer()?.cpu)||!!vr;$('pictureStatus').textContent=vr?'Exit VR before rendering a still.':renderer()?.cpu?'Quick captures the CPU preview. Studio and Exhibition need a GPU.':'';}
 $('pictureToggle').addEventListener('click',openPicture);$('picturePreset').addEventListener('change',()=>refresh(renderer()?.getState()));$('closePicture').addEventListener('click',()=>{photoAbort?.abort();picture.close();});picture.addEventListener('cancel',()=>photoAbort?.abort());picture.addEventListener('close',()=>{photoAbort?.abort();api.onDialogClose('pictureDialog');});
 $('cancelPicture').addEventListener('click',()=>photoAbort?.abort());
 $('startPicture').addEventListener('click',async()=>{
  if(photoAbort)return;photoAbort=new AbortController();$('startPicture').disabled=true;$('picturePreset').disabled=true;$('cancelPicture').hidden=false;$('pictureProgressArea').hidden=false;$('pictureResult').hidden=true;$('pictureStatus').textContent='';$('pictureProgress').removeAttribute('value');$('picturePercent').textContent='Working…';$('picturePhase').textContent='Capturing current frame…';$('pictureTime').textContent='0s elapsed';
  try{const render=renderer().renderPicture?.bind(renderer())||((options)=>createPhotoRender(renderer(),options));const result=await render({presetId:$('picturePreset').value,signal:photoAbort.signal,onProgress:p=>{if(p.indeterminate)$('pictureProgress').removeAttribute('value');else $('pictureProgress').value=p.progress;$('picturePercent').textContent=p.indeterminate?'Working…':`${Math.floor(p.progress*100)}%`;$('picturePhase').textContent=p.phase||'Rendering…';$('pictureTime').textContent=`${duration(p.elapsedMs)} elapsed · ${Number.isFinite(p.remainingMs)?duration(p.remainingMs)+' remaining':'estimating time…'}`;}});
   if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=URL.createObjectURL(result.blob);$('picturePreview').src=photoUrl;$('downloadPicture').href=photoUrl;$('downloadPicture').download=`event-horizon-${api.activePreset()}-${result.width}x${result.height}.png`;$('pictureDimensions').textContent=`${result.width} × ${result.height} · ${result.samples}${result.samplesMax>result.samples?'–'+result.samplesMax:''} samples / pixel${result.steps?' · '+result.steps+' ray steps':''} · ${duration(result.elapsedMs)}`;$('pictureResult').hidden=false;$('pictureProgress').value=1;$('picturePercent').textContent='100%';$('picturePhase').textContent='Image ready';$('pictureStatus').textContent=result.fallback?'Saved the live frame. This device could not complete a finer image within the work budget.':result.budgetLimited?'Saved the best complete refinement within the work budget.':'Your picture is ready to inspect and download.';if(result.refinementError)$('pictureStatus').textContent+=' Refinement stopped: '+String(result.refinementError).replace(/\s+/g,' ').slice(0,240);if(result.warning)$('pictureStatus').textContent+=' '+result.warning;
  }catch(error){$('pictureProgressArea').hidden=true;$('pictureStatus').textContent=error?.name==='AbortError'?'Render cancelled. Your scene is unchanged.':error?.message||'The still could not be rendered.';}
  finally{photoAbort=null;$('startPicture').disabled=false;$('picturePreset').disabled=false;$('cancelPicture').hidden=true;api.refresh();}
 });
 // A tap on the universe dismisses controls without intercepting its camera drag.
 $('universe').addEventListener('pointerdown',()=>setPanel(null));
 scene.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')&&panel){event.stopPropagation();setPanel(null);$('elementsToggle').focus({preventScroll:true});}});
 refresh();refreshVRSupport();
 return {resetDiscovery:()=>{scenesDiscovered=false;refresh();},refresh,select,track:id=>focus(id,'track'),sceneChanged:()=>{playDiscovered=false;mapDriveSession=null;mapTravelKey='';mapTravelDismissed=null;mapOrbitPending=null;if(mapDialog.open)mapDialog.close();mapTravelDestination=null;selection='space';collapsed.clear();knownBranches.clear();objectSearch='';cameraSearch='';setPanel(null);refresh(renderer()?.getState());},openElements:()=>setPanel('elements'),openDisplay:()=>setPanel('display'),openCamera:()=>setPanel('camera'),openPicture,openMap,openFlightPlan,close:()=>setPanel(null),rendererChanged:()=>{$('universe').addEventListener('pointerdown',()=>setPanel(null));lastSignature='';lastTargetSignature='';refresh();refreshVRSupport();},dispose:()=>{mapQuery?.removeEventListener?.('change',adaptMap);photoAbort?.abort();if(photoUrl)URL.revokeObjectURL(photoUrl);}};
}

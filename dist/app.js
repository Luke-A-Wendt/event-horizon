import { createRenderHost } from './render-host.js';
import { snapshotRenderer, restoreRenderer } from './render-state.js';
import { createLoadingIndicator } from './loading-indicator.js';
import { installViewportUI } from './viewport-ui.js';
import { renderMathGuide } from './math.js';
import { renderWarpGuide } from './warp-math.js';
import { DEFAULTS, SCENE_PRESETS, makePreset, horizonRg, iscoRg, REFERENCE_MASS } from './config.js';
import { OBJECT_TYPES } from './objects.js';

const $=id=>document.getElementById(id);
const reducedMotion=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
let state={...DEFAULTS},renderer,lastStats,toastTimer,activePreset='disk',custom=false,lastRendererError='',viewportUI=null;
const openers=new Map();
const loadingIndicator=createLoadingIndicator($('loading'),$('loadingReason'));
let rendererGeneration=0,lastStatsAt=0,lastStatsPaint=-Infinity,lastStatsSignal='';
let sceneRequestSerial=0,pendingScene=null,latestSceneRevision=0;
loadingIndicator.update(true,'Preparing your universe…',true);
let activeTab='scene',activeComponent='disk',selectedObjectId=null,rosterSignature='';
const objectSilhouettes={
 planet:'<circle cx="60" cy="40" r="23"/><path d="M44 23c12 9 2 17 15 20s8 10 16 13M41 49l10-5-2-12M66 19l-5 11 12 5"/>',
 star:'<circle cx="60" cy="40" r="15"/><path d="M60 10v9m0 42v9M30 40h9m42 0h9M39 19l6 6m30 30 6 6M39 61l6-6m30-30 6-6"/>',
 probe:'<circle cx="60" cy="39" r="9"/><path d="M51 39H25m44 0h26M60 30V16m0 32v15M28 29v20m64-20v20M55 20h10"/>',
 iss:'<path d="M19 40h82M45 34h30v12H45zM59 24h7v32h-7M42 28v24m36-24v24"/><path class="object-panel" d="M19 13h15v23H19zm0 31h15v23H19zm67-31h15v23H86zm0 31h15v23H86zM37 18h10v14H37zm0 30h10v14H37zm36-30h10v14H73zm0 30h10v14H73z"/>',
 shuttle:'<path d="M60 10c-7 5-9 17-9 28L28 59v7l25-9 2 10h10l2-10 25 9v-7L69 38c0-11-2-23-9-28Z"/><path d="M55 24h10l2 6H53zm5 11v28M53 48h14M56 67v4m8-4v4"/>',
 astronaut:'<circle cx="60" cy="23" r="12"/><path class="object-panel" d="M52 20q8-5 16 0v7q-8 5-16 0z"/><path d="M49 35h22l5 20-9 2-1 15h-9l-2-15-9-2 3-20Zm-2 4-11 7-6-10 6-4 6 6 7-3m22 4 11 7 6-10-6-4-6 6-5-3M54 39h12v11H54zm6 18v13"/>',
 enterprise:'<ellipse cx="60" cy="24" rx="27" ry="15"/><ellipse cx="60" cy="24" rx="7" ry="4"/><path d="M57 39v12l-7 10 10 9 10-9-7-10V39M52 57 35 47m33 10 17-10M30 36h10v26H30zm50 0h10v26H80z"/><path class="object-panel" d="M30 36h10v7H30zm50 0h10v7H80z"/>'
};
$('objectType').innerHTML=OBJECT_TYPES.map(object=>`<option value="${object.id}">${object.label}</option>`).join('');
function updateObjectPreview(){
 const selected=OBJECT_TYPES.find(object=>object.id===$('objectType').value)||OBJECT_TYPES[0];
 $('objectDescription').textContent=selected.description;
 $('objectPreview').innerHTML=`<svg viewBox="0 0 120 80" aria-hidden="true">${objectSilhouettes[selected.id]||objectSilhouettes.probe}</svg>`;
}
function updateObjectScale(){const input=$('objectScale');$('scaleValue').textContent=`${Number(input.value).toFixed(2)}×`;rangeFill(input);}
$('objectType').addEventListener('change',updateObjectPreview);
$('objectScale').addEventListener('input',updateObjectScale);

function range(id,label,min,max,step,unit='',digits=1){return `<div class="property-range"><div class="range-header"><label for="${id}">${label}</label><output id="out-${id}" for="${id}"></output></div><input id="${id}" data-param="${id}" data-unit="${unit}" data-digits="${digits}" type="range" min="${min}" max="${max}" step="${step}" value="${state[id]}"></div>`;}
function toggle(id,label){return `<label class="toggle-line"><span>${label}</span><input id="${id}" data-param="${id}" type="checkbox" role="switch" ${state[id]?'checked':''}></label>`;}
function select(id,label,options){return `<label class="field-label" for="${id}">${label}</label><div class="select-wrap"><select id="${id}" data-param="${id}">${options.map(([value,text])=>`<option value="${value}">${text}</option>`).join('')}</select>${icon('down')}</div>`;}
function color(id,label){return `<label class="color-line" for="${id}"><span>${label}</span><span><output id="out-${id}" for="${id}"></output><input id="${id}" data-param="${id}" type="color" value="${state[id]}"></span></label>`;}
function panel(key,title,subtitle,glyph,content){return `<details class="component-panel" data-component="${key}"><summary><span class="component-icon" aria-hidden="true">${glyph}</span><span>${title}<small>${subtitle}</small></span><span class="component-status" id="status-${key}">${state[key]?'On':'Off'}</span></summary><div class="component-body">${toggle(key,`Show ${title.toLowerCase()}`)}${content}</div></details>`;}

$('blackHoleControls').innerHTML=`
 <div class="control-section parameters">${toggle('blackHole','Show central object')}${toggle('whiteHole','White hole · reverse the flow')}<p class="control-note">A white hole is a time-reversed black hole. The pale glow is an illustration; it is not inherently white.</p><div class="section-label">PRIMARY METRIC <span class="model-badge" id="modelBadge">KERR</span></div>
 ${range('mass','Mass M',.1,100,.1,' × 10⁶ M☉',1)}<div class="range-ends"><span>0.1 million suns</span><span>100 million</span></div>
 ${range('spin','Dimensionless spin a*',0,.998,.001,'',3)}<div class="range-ends"><span>Non-rotating</span><span>Near-extremal</span></div>
 <div class="physics-readouts"><div><span>HORIZON r₊</span><strong id="horizonValue">—</strong><small id="horizonPhysical">—</small></div><div><span>PROGRADE ISCO</span><strong id="iscoValue">—</strong><small id="iscoPhysical">—</small></div></div>
 <p class="control-note mass-note">Mass changes the physical hole while your observer stays in place. Spin changes the horizon and the disc’s inner stable orbit.</p>
 <details class="axis-details"><summary>Primary spin orientation</summary>${range('primaryTilt','Tilt from orbital axis',0,180,1,'°',0)}${range('primaryAzimuth','Axis direction',0,360,1,'°',0)}<p class="control-note">The primary disc and jets share this spin axis.</p></details>
 ${toggle('horizonGuide','Horizon geometry guide')}<p class="control-note physics-clarifier">The dark image is a lensed shadow, not the horizon itself. The cyan guide is an unlensed coordinate outline.</p>
 <button class="physics-link" data-open-math data-section="math-spin">Understand the horizon, shadow & gap ${icon('arrow')}</button></div>
 <details class="component-panel geometry-panel"><summary><span class="component-icon">${icon('view')}</span><span>Optics<small>Lensing · exposure · motion</small></span></summary><div class="component-body">${toggle('lensing','Gravitational lensing')}${toggle('grid','Spacetime grid · all fields')}${toggle('autoRotate','Auto-orbit camera')}${range('exposure','Exposure',.2,3,.05,'×',2)}<p class="control-note">One grid switch controls every field. The guide is lensed with the scene, flows inward near a black hole, and becomes nearly stationary far away. Spin adds angular flow.</p></div></details>`;

$('componentControls').innerHTML=[
 panel('stars','Starfield','The distant universe','✦',range('starDensity','Star density',0,2,.05,'×',2)),
 panel('disk','Accretion disc','Material outside the horizon',icon('blackhole'),select('diskStyle','COMPOSITION / APPEARANCE',[['thermal','Thermal plasma · original'],['hydrogen','Hydrogen-rich glow'],['helium','Helium-rich glow'],['dust','Cool dust'],['nebula','Nebulous gas'],['radiant','Radiant plasma · white / cyan'],['ribbons','Flowing ribbons · electric blue']])+color('diskColor','Disc color')+range('diskOuter','Outer radius',7,40,.5,' r_g',1)+range('diskThickness','Thickness',.2,4,.1,'×',1)+range('diskDensity','Optical density',.1,2,.05,'×',2)+'<p class="control-note">Composition presets are illustrative emission palettes, not resolved chemical spectra. The inner edge follows the prograde ISCO.</p>'),
 panel('nebula','Backdrop nebula','Clouds beyond the lens','☁',select('nebulaShape','CLOUD STRUCTURE',[['cloud','Turbulent cloud'],['shell','Expanding shell'],['filaments','Woven filaments'],['spiral','Spiral cloud']])+color('nebulaColor','Nebula color')+range('nebulaScale','Structure scale',.3,3,.1,'×',1)+range('nebulaIntensity','Brightness',.1,3,.1,'×',1)+range('nebulaRotation','Sky rotation',0,360,1,'°',0)),
 panel('planet','Planet','An editable orbiting world','●',range('planetMass','Mass',.1,318,.1,' M⊕',1)+range('planetRadius','Radius',.3,8,.1,' R⊕',1)+range('planetDistance','Orbital distance',8,60,.5,' r_g',1)+color('planetColor','Surface color')+'<div class="property-grid"><div><span>MEAN DENSITY</span><strong id="planetDensity">—</strong></div><div><span>SURFACE GRAVITY</span><strong id="planetGravity">—</strong></div></div><p class="control-note">The radius sets its actual dimensions. Mass and radius set these physical diagnostics; its gravity is negligible beside a million-solar-mass hole.</p>'),
 panel('tidalStar','Disrupting star','A star feeding the darkness','☀',range('starRadius','Stellar size',.25,3,.05,'×',2)+range('starDistance','Encounter radius',7,25,.5,' r_g',1)+range('disruptionStrength','Disruption strength',.1,2,.05,'×',2)+color('starColor','Star & debris color')+'<p class="control-note">A star at its physical reference size, with a repeating prescribed tidal stream. The strength slider changes how rapidly it unravels.</p>'),
 panel('binary','Second black hole','A coupled orbital system',icon('blackhole'),range('binaryRatio','Secondary / primary mass',.1,2,.05,'',2)+range('binarySeparation','Separation',12,60,.5,' r_g',1)+range('secondarySpin','Secondary spin a*',0,.998,.001,'',3)+'<span class="sub-label">SECONDARY SPIN ORIENTATION</span>'+range('secondaryTilt','Tilt from orbital axis',0,180,1,'°',0)+range('secondaryAzimuth','Axis direction',0,360,1,'°',0)+'<p class="control-note">Circular barycentric orbits use the mass ratio and separation. Each disc and jet follows its own spin axis. Close discs are tidally limited; this is an approximate binary spacetime.</p>'),
 panel('bridge','Einstein–Rosen bridge','Ellis comparison model',icon('warp'),'<label class="field-label" for="bridgeTravelerType">TRAVELER</label><select id="bridgeTravelerType"><option value="enterprise">Starship Enterprise</option><option value="shuttle">NASA Shuttle</option><option value="astronaut">Astronaut</option></select>'+range('bridgeRadius','Throat radius',3,30,.5,' traveler radii',1)+toggle('bridgeTravel','Animate traversal')+'<span class="sub-label">OTHER SIDE OF THE BRIDGE</span>'+toggle('bridgeOtherNebula','Far-side nebula')+color('bridgeOtherColor','Far-side nebula color')+select('bridgeOtherShape','FAR-SIDE STRUCTURE',[['cloud','Turbulent cloud'],['shell','Expanding shell'],['filaments','Woven filaments'],['spiral','Spiral cloud']])+range('bridgeOtherScale','Structure scale',.2,4,.1,'×',1)+range('bridgeOtherIntensity','Brightness',0,4,.1,'×',1)+range('bridgeOtherRotation','Sky rotation',-360,360,1,'°',0)+'<p class="control-note">Near side: use Starfield and Nebula properties. Far side: toggle and shape its nebula here. The default starts in plain stars and arrives among purple clouds.</p>'+'<p class="control-note">Traversal uses an Ellis wormhole model. A classical Einstein–Rosen bridge is not traversable.</p>'),
 panel('jets','Polar jets','Outflows along each spin axis','↟',color('jetColor','Jet color')+range('jetSpread','Opening spread',.25,3,.05,'×',2)+range('jetLength','Length',.3,3,.1,'×',1)+range('jetIntensity','Brightness',.1,3,.1,'×',1)+'<p class="control-note">The two outflows follow the local spin axis. Jets are an illustrative plasma model, not matter escaping the horizon.</p>')
].join('');


document.querySelector('.view-toolbar .help-button').before(document.querySelector('.geometry-panel'));
document.querySelector('.controls-fixed .active-scene').after($('performanceControls'));
const displayOptions=document.querySelector('.geometry-panel');document.addEventListener('pointerdown',event=>{if(displayOptions.open&&!displayOptions.contains(event.target))displayOptions.open=false;});
const componentCatalog=[['stars','Starfield','✦'],['disk','Accretion disc',icon('blackhole')],['nebula','Nebula','☁'],['planet','Planet','●'],['tidalStar','Disrupting star','☀'],['binary','Binary companion',icon('blackhole')],['jets','Polar jets','↟'],['bridge','Einstein–Rosen bridge',icon('warp')]];
$('componentDeck').innerHTML=componentCatalog.map(([key,label,glyph])=>`<div class="component-tile"><button data-edit-component="${key}" aria-pressed="${key===activeComponent}"><span>${glyph}</span><strong>${label}<small>Edit settings</small></strong></button><button data-switch-param="${key}" class="component-tile-toggle" aria-label="Toggle ${label.toLowerCase()}" aria-pressed="${!!state[key]}"><i></i></button></div>`).join('');
$('warpControls').innerHTML=`${toggle('warp','Enable warp field')}${range('warpFactor','Warp factor',0,10,.01,'',2)}<div class="range-ends"><span>0 · off</span><span>10 · infinite limit</span></div>${range('warpRadius','Bubble radius',1.3,8,.1,' ship radii',1)}${range('warpThickness','Wall sharpness',1,12,.2,'',1)}${toggle('warpField','Show field boundary')}${toggle('warpGrid','Spacetime grid · all fields')}<p class="control-note">This is the same Grid control as in the view. It switches the black hole and warp guides together.</p>`;
function setFeature(tab,scroll=false){
 activeTab=tab;
 const contexts={hole:'The central mass, horizon, and orientation shared by its disc and jets.',scene:'The surrounding sky and components. Select a name to edit; use its switch to show it.',objects:'Individual bodies with their own dimensions, paths, and cameras.',warp:'The Enterprise’s field and route. Edit the ship itself in Objects.'};$('controlContext').textContent=contexts[tab]||contexts.scene;
 document.querySelectorAll('[data-tab]').forEach(button=>{const current=button.dataset.tab===tab;button.setAttribute('aria-selected',String(current));button.tabIndex=current?0:-1;});
 document.querySelectorAll('.feature-pane').forEach(pane=>pane.hidden=pane.id!==`pane-${tab}`);
 document.querySelectorAll('[data-feature]').forEach(button=>button.classList.toggle('active',button.dataset.feature===tab));
 $('controlsBody').scrollTop=0;
 if(tab==='objects')renderObjectManager();
 if(scroll&&!viewportUI&&window.matchMedia('(max-width: 980px)').matches)document.querySelector('.controls').scrollIntoView({behavior:reducedMotion()?'instant':'smooth',block:'start'});
}
function selectComponent(key){activeComponent=key;$('componentSettingsTitle').textContent=`EDITING · ${(componentCatalog.find(c=>c[0]===key)?.[1]||key).toUpperCase()}`;document.querySelectorAll('#componentControls [data-component]').forEach(el=>{el.hidden=el.dataset.component!==key;el.open=el.dataset.component===key;});document.querySelectorAll('[data-edit-component]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.editComponent===key)));}
document.querySelectorAll('[data-tab]').forEach(button=>{button.addEventListener('click',()=>setFeature(button.dataset.tab));button.addEventListener('keydown',e=>{const tabs=[...document.querySelectorAll('[data-tab]')],at=tabs.indexOf(button);let next;if(e.key==='ArrowRight')next=tabs[(at+1)%tabs.length];if(e.key==='ArrowLeft')next=tabs[(at+tabs.length-1)%tabs.length];if(e.key==='Home')next=tabs[0];if(e.key==='End')next=tabs.at(-1);if(next){e.preventDefault();setFeature(next.dataset.tab);next.focus();}});});
document.querySelectorAll('[data-feature]').forEach(button=>button.addEventListener('click',()=>{if(viewportUI){const tab=button.dataset.feature;if(tab==='hole')viewportUI.select('primary');else if(tab==='warp')exploreWarp();else if(tab==='objects')viewportUI.select('add');else viewportUI.openElements();}else setFeature(button.dataset.feature,true);}));
document.querySelectorAll('[data-edit-component]').forEach(button=>button.addEventListener('click',()=>selectComponent(button.dataset.editComponent)));
document.querySelectorAll('[data-switch-param]').forEach(button=>button.addEventListener('click',()=>updateParameter(button.dataset.switchParam,!state[button.dataset.switchParam])));
selectComponent(activeComponent);setFeature(activeTab);

const sceneCategory=p=>p.category||(p.patch?.warp?'Warp experiments':'Black holes');
const sceneCategories=['All',...new Set(SCENE_PRESETS.map(sceneCategory))];
$('sceneFilters').innerHTML=sceneCategories.map((category,i)=>`<button data-scene-filter="${category}" aria-pressed="${i===0}">${category}</button>`).join('');
$('scenesCount').textContent=`${SCENE_PRESETS.length} distinct experiments. Choose a starting point, then make it your own.`;
$('atlasGrid').innerHTML=SCENE_PRESETS.map(p=>`<button class="atlas-card ${p.id==='disk'?'selected':''}" data-scene="${p.id}" data-scene-category="${sceneCategory(p)}" aria-pressed="${p.id==='disk'}"><div class="atlas-art mini-universe ${p.className}"><i></i><b></b><img src="assets/atlas-${p.id}.webp" alt="" loading="lazy"></div><div class="atlas-card-info"><span>${p.number} / ${sceneCategory(p).toUpperCase()}</span><h3>${p.title}</h3><p>${p.description}</p><div class="scene-tags">${(p.tags||[p.subtitle]).map(tag=>`<span>${tag}</span>`).join('')}</div>${p.explore?`<span class="scene-try"><b>TRY THIS</b> ${p.explore}</span>`:''}</div></button>`).join('');
$('sceneFilters').addEventListener('click',event=>{const selected=event.target.closest('[data-scene-filter]');if(!selected)return;const category=selected.dataset.sceneFilter;document.querySelectorAll('[data-scene-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button===selected)));document.querySelectorAll('[data-scene-category]').forEach(card=>card.hidden=category!=='All'&&card.dataset.sceneCategory!==category);});
document.querySelectorAll('.atlas-art img').forEach(img=>img.addEventListener('error',()=>img.hidden=true));

function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3600);}
function rangeFill(el){el.style.setProperty('--progress',`${(Number(el.value)-Number(el.min))/(Number(el.max)-Number(el.min))*100}%`);}
function formatOutput(el){const output=$(`out-${el.id}`);if(!output)return;if(el.type==='color'){output.textContent=el.value.toUpperCase();return;}if(el.type!=='range')return;output.textContent=Number(el.value).toFixed(Number(el.dataset.digits||0))+(el.dataset.unit||'');rangeFill(el);}
function markCustom(){custom=true;const p=SCENE_PRESETS.find(p=>p.id===activePreset);$('currentScene').textContent=`Custom · ${p.title}`;$('sceneNumber').textContent=`CUSTOM / ${p.title.toUpperCase()}`;document.querySelectorAll('[data-scene]').forEach(el=>{el.classList.remove('selected');el.setAttribute('aria-pressed','false');});}
function updateMetrics(){
 const h=horizonRg(state.spin),inner=iscoRg(state.spin),rgMillionKm=state.mass*1.47662504;
 $('horizonValue').textContent=`${h.toFixed(3)} r_g`;$('horizonPhysical').textContent=`${(h*rgMillionKm).toFixed(2)} million km`;$('iscoValue').textContent=`${inner.toFixed(3)} r_g`;$('iscoPhysical').textContent=`${(inner*rgMillionKm).toFixed(2)} million km`;$('modelBadge').textContent=state.spin===0?'SCHWARZSCHILD':'KERR';
 $('planetDensity').textContent=`${(5.514*state.planetMass/state.planetRadius**3).toFixed(2)} g/cm³`;$('planetGravity').textContent=`${(9.80665*state.planetMass/state.planetRadius**2).toFixed(2)} m/s²`;
 $('distanceInput').min=(h*1.013).toFixed(3);$('nearHorizon').disabled=state.binary||!state.blackHole||!!lastStats?.focusId;$('nearHorizon').title=state.binary?'Available for a single black hole.':'Move just outside the horizon and look outward';
 document.querySelectorAll('[data-component]').forEach(el=>{const key=el.dataset.component;el.classList.toggle('component-enabled',!!state[key]);$(`status-${key}`).textContent=state[key]?'On':'Off';});
 document.querySelectorAll('[data-switch-param]').forEach(el=>el.setAttribute('aria-pressed',String(!!state[el.dataset.switchParam])));
 document.querySelectorAll('[data-param]').forEach(el=>{if(el.type==='checkbox')el.checked=!!state[el.dataset.param];});
 const gridsOn=!!state.grid;for(const id of ['gridShortcut','allGridToggle']){$(id).setAttribute('aria-pressed',String(gridsOn));$(id).setAttribute('aria-label',`${gridsOn?'Turn off':'Turn on'} all spacetime grids`);}$('gridState').textContent=gridsOn?'On':'Off';$('guideLabel').hidden=!state.horizonGuide||!state.blackHole;
 const notes={visible:'Visible light · reflected surfaces, glowing gas, and stars.',xray:'X-ray false color · hot gas, stellar coronae, and jets stand out; cool surfaces fade.',infrared:'Infrared false color · cool dust and thermal surfaces stand out across the scene.',radio:'Radio / millimeter false color · synchrotron jets, hot plasma, and cold dust stand out. Cool, compact objects are faint.',gamma:'Gamma-ray false color · energetic jets and the hottest plasma dominate. Ordinary stars, dust, and cool surfaces are very faint.'};$('spectrumNote').textContent=notes[state.spectrum];document.querySelectorAll('[data-spectrum]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.spectrum===state.spectrum)));
 const factor=state.warp?(Number(state.warpFactor)||0):0;
 $('warpSpeedValue').textContent=factor===0?'Warp field off':factor===10?'∞ · theoretical limit':factor<1?'Sub-warp field ramp':factor<=9?`${Math.pow(factor,10/3).toLocaleString(undefined,{maximumFractionDigits:1})} c`:'Beyond Warp 9';
 $('warpSpeedNote').textContent=factor===10?'Warp 10 has no finite TNG speed. The visualization remains bounded.':factor>9?'The licensed curve approaches infinity. There is no unique canonical conversion above Warp 9.':factor>0&&factor<1?'Below Warp 1 this control ramps up the visual field. No canonical speed conversion is assigned.':'The licensed TNG convention uses W^(10/3) from Warp 1 through Warp 9. This is a fictional speed scale, not an Alcubierre energy calculation.';
 $('scaleModeNote').textContent='All bodies use physical dimensions. Select an object in Elements, then Track for a close view or Ride to look around on board.';
 if(lastStats)renderObserver(lastStats);
}
function syncControls(){document.querySelectorAll('[data-param]').forEach(el=>{const value=state[el.dataset.param];if(el.type==='checkbox')el.checked=!!value;else el.value=value;formatOutput(el);});$('speed').value=state.speed;updateMetrics();syncViewMode(state.viewMode);setPaused(state.paused);}
function updateParameter(key,value){
 if(key==='grid'||key==='warpGrid'){state.grid=state.warpGrid=!!value;renderer?.update({grid:!!value,warpGrid:!!value});}else{state[key]=value;renderer?.update({[key]:value});}
 if(renderer){const current=renderer.getState();for(const name of Object.keys(DEFAULTS))if(name in current)state[name]=current[name];}
 markCustom();
 if(key==='diskStyle'){const colors={thermal:'#ffd69a',hydrogen:'#f5a7b5',helium:'#b9a4ff',dust:'#ce936b',nebula:'#83a7ff'};state.diskColor=colors[value];renderer?.update({diskColor:state.diskColor});$('diskColor').value=state.diskColor;formatOutput($('diskColor'));}
 updateMetrics();if(key==='objectScaleMode'||key==='warp'||key==='bridge')renderObjectManager();viewportUI?.refresh(renderer?.getState());
}
document.querySelectorAll('[data-param]').forEach(el=>{formatOutput(el);const event=el.type==='checkbox'||el.tagName==='SELECT'?'change':'input';el.addEventListener(event,()=>{const value=el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value;formatOutput(el);updateParameter(el.dataset.param,value);});});
document.querySelectorAll('[data-spectrum]').forEach(el=>el.addEventListener('click',()=>updateParameter('spectrum',el.dataset.spectrum)));

function formatMeters(meters){if(!Number.isFinite(meters))return '—';if(Math.abs(meters)>=1e9)return `${(meters/1e9).toLocaleString(undefined,{maximumFractionDigits:2})} million km`;if(Math.abs(meters)>=1000)return `${(meters/1000).toLocaleString(undefined,{maximumFractionDigits:2})} km`;return `${meters.toLocaleString(undefined,{maximumFractionDigits:2})} m`;}
function renderObserver(stats){
 const focused=!!stats.focusId,body=focused?((stats.objects||objects()).find(o=>String(o.id)===String(stats.focusId))||renderer?.getSceneTargets?.().find(o=>o.id===stats.focusId)):null;
 $('observerLabel').textContent=focused?(stats.focusMode==='onboard'?'ONBOARD VIEW':(state.bridge?'LOCAL CHART OFFSET':'DISTANCE TO OBJECT')):(state.bridge?'ISOTROPIC CHART POSITION':'OBSERVER DISTANCE');
 $('focusBanner').hidden=true;$('distanceForm').hidden=focused||state.bridge||!state.blackHole;$('focusCameraHint').hidden=!focused;$('releaseFocusToolbar').hidden=!focused;$('releaseFocusEditor').hidden=!focused;$('nearHorizon').hidden=focused||!state.blackHole;
 $('nearHorizon').disabled=focused||state.binary||!state.blackHole;
 $('focusBannerText').textContent=focused?`${stats.focusMode==='onboard'?'On board':'Following'} · ${body?.label||stats.focusLabel||'Object'}`:'';
 $('focusCameraHint').textContent=stats.focusMode==='onboard'?'Look 360° · drag to explore':'Following object · drag to orbit · scroll to zoom';
 $('bridgeRegion').hidden=!state.bridge;$('bridgeRegion').textContent=state.bridge?`BRIDGE · ${String(stats.bridgeRegion||'near side').replace(/[-_]/g,' ').toUpperCase()}`:'';
 $('warpMotionReadout').hidden=!state.warp||state.warpScenario!=='isolated';$('warpMotionReadout').textContent=`Visual travel: ${formatMeters(stats.warpTravelMeters||0)} · ${formatMeters(stats.paused?0:(stats.warpSpeedMetersPerSecond||0)*(stats.speed??1))}/s.`;
 $('lookCenter').textContent=focused?(stats.focusMode==='onboard'?'Forward':'At object'):'Inward';$('lookTangent').textContent=focused?'Side view':'Across disc';$('lookOutward').textContent=focused?'Look back':'Outward';
 if(focused){$('distance').textContent=stats.focusMode==='onboard'?'360°':formatMeters(stats.cameraDistanceMeters);$('distanceUnit').textContent='';$('physicalDistance').textContent=body?`${body.label} · ${state.bridge?'local chart scale':'physical scale'}`:'';return;}
 if(!state.blackHole&&!state.bridge){$('observerLabel').textContent='LOCAL SCENE';$('distance').textContent=formatMeters(stats.cameraDistanceMeters??((stats.worldDistance||0)*REFERENCE_MASS*1.47662504e9));$('distanceUnit').textContent='';$('physicalDistance').textContent='Distance from local origin';return;}
 const distance=Number.isFinite(stats.worldDistance)?stats.worldDistance*REFERENCE_MASS/state.mass:stats.distance;if(!Number.isFinite(distance))return;
 $('distance').textContent=distance<10?distance.toFixed(2):distance.toFixed(1);$('distanceUnit').innerHTML=state.bridge?'chart r<sub>g</sub>':'r<sub>g</sub>';
 const au=distance*state.mass*1.47662504/149.5978707;$('physicalDistance').textContent=state.bridge?'Isotropic bridge chart · illustrative distance':state.blackHole?`${au<10?au.toFixed(2):au.toFixed(1)} AU from ${state.binary?'barycenter':'center'}`:'Isolated warp laboratory';
 if(document.activeElement!==$('distanceInput'))$('distanceInput').value=distance.toFixed(distance<10?2:1);
}
function objects(){return renderer?.getObjects?.()||[];}
function formatLuminosity(log){const value=10**Number(log||0);return value<1000?value.toFixed(value<10?1:0)+'×':value<1e6?(value/1e3).toFixed(1)+' thousand ×':(value/1e6).toFixed(1)+' million ×';}
function selectedObject(){return objects().find(o=>String(o.id)===String(selectedObjectId));}
function selectObject(id){const item=objects().find(o=>String(o.id)===String(id));if(!item)return;selectedObjectId=item.id;renderer.selectObject(item.id);renderObjectManager();}
function objectContext(){return renderer?.getObjectContext?.()||renderer?.getState?.().objectContext||{kind:state.bridge?'bridge':state.blackHole?'orbit':'local',referenceLabel:'scene origin',allowedTypes:OBJECT_TYPES.map(o=>o.id)};}
function refreshObjectContext(){
 const context=objectContext(),allowed=context.allowedTypes||OBJECT_TYPES.map(o=>o.id),signature=allowed.join(','),picker=$('objectType'),previous=picker.value;
 if(picker.dataset.allowed!==signature){picker.dataset.allowed=signature;picker.innerHTML=OBJECT_TYPES.filter(o=>allowed.includes(o.id)).map(o=>`<option value="${o.id}">${o.label}</option>`).join('');if(allowed.includes(previous))picker.value=previous;updateObjectPreview();}
 $('addOrbitPlacement').hidden=context.kind!=='orbit';
 $('addPlacementContext').textContent=context.kind==='bridge'?'Choose the traveler that crosses the bridge. Replacing it preserves the route and viewpoint.':context.kind==='orbit'?'Place a body on an orbit around the black hole.':`Place an object near ${context.referenceLabel||'the scene origin'}. Its position is edited in meters.`;
 $('addObject').textContent=context.kind==='bridge'?'Use as traveler':'+ Add to scene';
 return context;
}
function syncRendererState(){const current=renderer?.getState?.();if(current){for(const key of Object.keys(DEFAULTS))if(key in current)state[key]=current[key];lastStats=current;}updateMetrics();return current;}
function exploreWarp(){
 if(!renderer){toast('Graphics are starting. Try again in a moment.');return;}
 const object=renderer.exploreWarp?.();if(!object){toast('Select an Enterprise in an orbital or open-space scene to enable its warp drive.');return;}
 selectedObjectId=object.id;syncRendererState();markCustom();renderObjectManager();viewportUI?.select(object.id);toast('Enterprise ready. Its warp drive, size, placement, and viewpoints are in this panel.');
}
function renderObjectManager(snapshot=renderer?.getState?.()||{}){
 const items=snapshot.objects||objects(),context=refreshObjectContext();
 if(snapshot.warp!==undefined&&state.warp!==snapshot.warp){state.warp=snapshot.warp;updateMetrics();}
 if(snapshot.selectedId!==undefined&&snapshot.selectedId!==null)selectedObjectId=snapshot.selectedId;
 if(!items.some(o=>String(o.id)===String(selectedObjectId)))selectedObjectId=items[0]?.id??null;
 const selected=items.find(o=>String(o.id)===String(selectedObjectId));
 const signature=JSON.stringify(items.map(o=>[o.id,o.type,o.scale,String(o.id)===String(selectedObjectId),o.focused]));
 if(signature!==rosterSignature){rosterSignature=signature;$('objectRoster').innerHTML=items.map((o,i)=>`<div class="object-roster-row ${String(o.id)===String(selectedObjectId)?'selected':''}"><button data-select-object="${o.id}" aria-pressed="${String(o.id)===String(selectedObjectId)}"><span class="roster-icon"><svg viewBox="0 0 120 80" aria-hidden="true">${objectSilhouettes[o.type]||objectSilhouettes.probe}</svg></span><span><strong>${o.label||o.type}</strong><small>${String(i+1).padStart(2,'0')} · ${o.focused?'Following':`${Number(o.scale).toFixed(2)}× size`}</small></span><b>›</b></button><button class="roster-delete" data-remove-object="${o.id}" aria-label="Delete ${o.label||o.type}" title="Delete this object">×</button></div>`).join('');}
 $('objectCount').textContent=items.length;$('objectEmpty').hidden=items.length>0;$('objectEditor').hidden=!selected;$('addObject').disabled=items.length>=10&&context.kind!=='bridge';$('clearObjects').disabled=!items.length;
 if(selected){
  $('selectedObjectName').textContent=selected.label||selected.type;
  const length=Number(selected.lengthMeters);$('objectDimensions').textContent=`Physical length / span: ${formatMeters(length)}`;
  const fields=[['editScale',selected.scale,`${Number(selected.scale).toFixed(2)}×`],['editRadius',selected.radius,`${Number(selected.radius).toFixed(2)} r_g`],['editHeight',selected.height??0,`${Number(selected.height??0).toFixed(2)} r_g`],['editPhase',((selected.phase*180/Math.PI)%360+360)%360,`${(((selected.phase*180/Math.PI)%360+360)%360).toFixed(0)}°`]];
  for(const [id,value,label] of fields){if(document.activeElement!==$(id)){$(id).value=value;$(`${id}Value`).textContent=label;rangeFill($(id));}}
  $('cockpitObject').hidden=selected.type!=='shuttle';
  $('trackObject').setAttribute('aria-pressed',String(String(snapshot.focusId)===String(selected.id)&&snapshot.focusMode==='track'));$('onboardObject').setAttribute('aria-pressed',String(String(snapshot.focusId)===String(selected.id)&&snapshot.focusMode==='onboard'));
  const bridgeShip=selected.bridgeTraveler||(state.bridge&&String(snapshot.bridgeObjectId)===String(selected.id)),local=selected.placement==='local'||(!state.blackHole&&!bridgeShip);
  $('orbitalPlacement').hidden=local||bridgeShip;$('localPlacement').hidden=!local;$('bridgeTravelerProperties').hidden=!bridgeShip;
  $('localPlacementContext').textContent=`Position relative to ${selected.referenceLabel||context.referenceLabel||'the scene origin'}`;
  for(const key of ['x','y','z']){const input=$('edit'+key.toUpperCase());if(document.activeElement!==input)input.value=Number(selected[key]||0).toFixed(2);}
  if(document.activeElement!==$('editHeading')){$('editHeading').value=selected.headingDegrees??((selected.phase||0)*180/Math.PI+360)%360;$('editHeadingValue').textContent=Math.round(Number($('editHeading').value))+'°';rangeFill($('editHeading'));}
  $('probeProperties').hidden=selected.type!=='probe';
  if(document.activeElement!==$('editLuminosity')){$('editLuminosity').value=selected.logLuminosity??0;$('editLuminosityValue').textContent=formatLuminosity(selected.logLuminosity??0);rangeFill($('editLuminosity'));}
  $('enterpriseProperties').hidden=selected.type!=='enterprise';$('objectWarpEnabled').checked=!!selected.warpEnabled;$('objectWarpEnabled').disabled=!!bridgeShip;$('editObjectWarp').disabled=!!bridgeShip;
  $('objectWarpNote').textContent=bridgeShip?'Warp is disabled while following the bridge demonstration.':'The field belongs to this ship and moves with it. Only one Enterprise field is active at a time.';
  const traveler=items.find(o=>o.bridgeTraveler||String(o.id)===String(snapshot.bridgeObjectId));if(traveler&&document.activeElement!==$('bridgeTravelerType'))$('bridgeTravelerType').value=traveler.type;
  const isWarpShip=state.warp&&String(snapshot.warpObjectId)===String(selected.id),guided=isWarpShip&&state.warpScenario==='excursion',isolated=isWarpShip&&state.warpScenario==='isolated';
  const motion=selected.motion||'orbit';if(document.activeElement!==$('editMotion'))$('editMotion').value=motion;$('editMotion').disabled=isWarpShip||bridgeShip;$('editMotionNote').textContent=selected.motionDescription||(motion==='infall'?'An illustrative slow approach that ends outside the horizon.':motion==='horizon'?'A fixed viewpoint just outside the horizon; this is not a physical hover solution.':'A prescribed circular orbit.');$('editRadiusLabel').textContent=motion==='infall'?'Starting distance from black hole':'Distance from black hole';
  $('editRadius').disabled=guided||isolated||bridgeShip||motion==='horizon';$('editHeight').disabled=guided||isolated||bridgeShip||motion==='horizon';$('editPhase').disabled=guided||bridgeShip;$('editPhaseLabel').textContent=isolated?'Heading':'Current orbital phase';$('editPhaseNote').textContent=bridgeShip?'Bridge properties control the traveler and the crossing. Turn Animate traversal off to pause its path.':isolated?'Heading turns the ship and its direction of travel. Pause time for precise placement.':guided?'This route sets the direction and timing of the encounter. Choose an orbital route to edit its phase.':'Phase moves the object around its orbit immediately. Pause time for precise placement.';
  $('objectCameraNote').textContent=selected.type==='shuttle'?'Cockpit view looks forward through the flight-deck windows. Drag to look around; the cabin stays aligned with the shuttle. Choose Cockpit again to look ahead.':bridgeShip?'This traveler follows the bridge’s route. Physical size and cameras remain editable; Bridge properties let you change the traveler.':isolated?'The ship travels with its field. Size and heading remain editable; choose an orbital route to change its distance from a black hole.':guided?'This ship follows the approach-and-return path. Size and cameras remain editable; choose Orbit a black hole to edit its orbit.':'Track to orbit around this object. On board lets you look in every direction while it moves.';
 }
 if(renderer){renderObserver(snapshot);if(snapshot.viewMode&&snapshot.viewMode!==state.viewMode)syncViewMode(snapshot.viewMode);}viewportUI?.refresh(snapshot);
}
$('objectRoster').addEventListener('click',e=>{const remove=e.target.closest('[data-remove-object]'),choose=e.target.closest('[data-select-object]');if(remove){const item=objects().find(o=>String(o.id)===remove.dataset.removeObject);if(item){renderer.removeObject(item.id);markCustom();renderObjectManager();}}else if(choose)selectObject(choose.dataset.selectObject);});
for(const [id,key,unit] of [['editScale','scale','×'],['editRadius','radius',' r_g'],['editHeight','height',' r_g'],['editPhase','phase','°']])$(id).addEventListener('input',()=>{const item=selectedObject();if(!item)return;const number=Number($(id).value);$(`${id}Value`).textContent=number.toFixed(id==='editPhase'?0:2)+unit;rangeFill($(id));renderer.updateObject(item.id,{[key]:key==='phase'?number*Math.PI/180:number});markCustom();renderObjectManager();});
for(const key of ['x','y','z'])$('edit'+key.toUpperCase()).addEventListener('change',event=>{const item=selectedObject(),value=Number(event.target.value);if(!item||!Number.isFinite(value))return;renderer.updateObject(item.id,{[key]:value});markCustom();renderObjectManager();});
$('editMotion').addEventListener('change',event=>{const item=selectedObject();if(!item)return;renderer.updateObject(item.id,{motion:event.target.value});markCustom();renderObjectManager();});
$('editLuminosity').addEventListener('input',event=>{const item=selectedObject();if(!item||item.type!=='probe')return;const logLuminosity=Number(event.target.value);renderer.updateObject(item.id,{logLuminosity});$('editLuminosityValue').textContent=formatLuminosity(logLuminosity);rangeFill(event.target);markCustom();});
$('editHeading').addEventListener('input',event=>{const item=selectedObject();if(!item)return;renderer.updateObject(item.id,{phase:Number(event.target.value)*Math.PI/180});$('editHeadingValue').textContent=event.target.value+'°';rangeFill(event.target);markCustom();renderObjectManager();});
$('objectWarpEnabled').addEventListener('change',event=>{const item=selectedObject();if(!item)return;renderer.setObjectWarp?.(item.id,event.target.checked);syncRendererState();markCustom();renderObjectManager();});
$('editObjectWarp').addEventListener('click',()=>{const item=selectedObject();if(!item)return;renderer.setObjectWarp?.(item.id,true);syncRendererState();markCustom();renderObjectManager();viewportUI?.select('warp');});
$('bridgeTravelerType').addEventListener('change',event=>{const item=renderer?.setBridgeTraveler?.(event.target.value);if(item){selectedObjectId=item.id;syncRendererState();markCustom();renderObjectManager();viewportUI?.refresh(renderer.getState());}});
$('deleteObject').addEventListener('click',()=>{const item=selectedObject();if(item){renderer.removeObject(item.id);markCustom();renderObjectManager();toast(`${item.label||'Object'} removed.`);}});
for(const [id,mode] of [['trackObject','track'],['onboardObject','onboard'],['cockpitObject','onboard']])$(id).addEventListener('click',()=>{const item=selectedObject();if(!item)return;renderer.focusObject(item.id,mode);syncViewMode(mode==='onboard'?'look':'orbit');renderObjectManager();renderObserver(renderer.getState());toast(id==='cockpitObject'?'Inside the shuttle cockpit. Drag to look around; Cockpit view resets your gaze forward.':mode==='onboard'?'On board. Drag to look around in every direction.':'Following this object. Drag to orbit it, and scroll or pinch to zoom.');});
function returnToOverview(){if(!renderer)return;renderer.releaseFocus(true);lastStats=renderer.getState();syncViewMode(lastStats.viewMode||'orbit');renderObjectManager();renderObserver(lastStats);toast('Returned to your previous orbiting view.');}
for(const id of ['releaseFocus','releaseFocusToolbar','releaseFocusEditor'])$(id).addEventListener('click',returnToOverview);
function syncViewMode(mode){state.viewMode=mode;$('orbitMode').setAttribute('aria-pressed',String(mode==='orbit'));$('lookMode').setAttribute('aria-pressed',String(mode==='look'));if($('freeMode'))$('freeMode').setAttribute('aria-pressed',String(mode==='free'));$('touchHint').innerHTML=mode==='free'?'Drag to look <b>·</b> Pinch to move forward / back':mode==='look'?'Drag to look in 360° <b>·</b> Pinch to zoom':'Drag to orbit <b>·</b> Pinch to zoom';$('desktopHint').innerHTML=mode==='free'?'Drag to look <b>·</b> Scroll or W / S to travel':mode==='look'?'Drag to look in 360° <b>·</b> Scroll to zoom':'Drag to orbit <b>·</b> Middle-drag to look <b>·</b> Scroll to zoom';}
function handleStats(stats){
 // Old frames cannot dismiss the loader for a newer scene choice.
 if(Number.isFinite(stats.sceneLoadRevision)&&stats.sceneLoadRevision<latestSceneRevision)return;
 if(Number.isFinite(stats.sceneLoadRevision))latestSceneRevision=stats.sceneLoadRevision;
 if(pendingScene&&(pendingScene.phase==='paint'||(Number.isFinite(pendingScene.revision)&&Number.isFinite(stats.sceneLoadRevision)&&stats.sceneLoadRevision<pendingScene.revision)))return;
 lastStats=stats;lastStatsAt=performance.now();
 if(stats.sceneLoadState==='failed'){pendingScene=null;const error=stats.sceneLoadError||'This scene could not finish loading. Retry, or choose another scene.';if(lastRendererError!==error)handleError(error);}
 else if(pendingScene&&(stats.sceneLoadState==='ready'||(!stats.sceneLoadState&&stats.renderReady)))pendingScene=null;
 const signal=[stats.renderBusy,stats.shaderCompiling,stats.renderReady,stats.cpu,stats.vrActive,stats.focusId,stats.focusMode,stats.selectedId,stats.objectCount,stats.effectiveQuality,stats.sceneLoadState,stats.sceneLoadRevision,stats.sceneLoadError].join('|');
 if(lastStatsAt-lastStatsPaint<250&&signal===lastStatsSignal)return;lastStatsPaint=lastStatsAt;lastStatsSignal=signal;
 loadingIndicator.update(!lastRendererError&&$('cpuFallbackPrompt').hidden&&!!(pendingScene||stats.sceneLoadState==='loading'||stats.renderBusy||stats.shaderCompiling||!(stats.renderReady??renderer?.ready)),stats.loadingReason||(stats.shaderCompiling?'Preparing graphics…':'Preparing your scene…'));$('renderError').hidden=!lastRendererError;
 updateQualityStatus(stats);
 $('objectCount').textContent=stats.objectCount??0;$('addObject').disabled=(stats.objectCount??0)>=(stats.maxObjects??10)&&objectContext().kind!=='bridge';
 $('renderDetail').textContent=stats.cpu?`LOCAL CPU · ${{'worker-canvas':'WORKER CANVAS','worker-commands':'WORKER GEOMETRY','cooperative-main':'COOPERATIVE FALLBACK'}[stats.cpuBackend]||'SIMPLIFIED PREVIEW'}`:stats.shaderCompiling?'PREPARING GRAPHICS · KEEPING THE LAST VIEW':`LOCAL GPU · ${Math.round(stats.scale*100)}% RESOLUTION · ${stats.steps} RAY STEPS`;
 if(stats.viewMode&&stats.viewMode!==state.viewMode)syncViewMode(stats.viewMode);
 if(activeTab==='objects'&&!document.querySelector('.controls').hidden)renderObjectManager(stats);else{renderObserver(stats);viewportUI?.refresh(stats);}
}
function handleError(error){
 lastRendererError=error?(typeof error==='string'?error:'Enable hardware acceleration and reload in a browser with WebGL support.'):'';
 $('renderError').hidden=!lastRendererError;$('scene').classList.toggle('render-failed',!!lastRendererError);if(lastRendererError)loadingIndicator.update(false);
 if(!lastRendererError)return;
 $('errorText').textContent=lastRendererError;console.error('Renderer:',error);
}
async function initRenderer(cpu=false){
 const requestedScene=pendingScene?.id,generation=++rendererGeneration;++sceneRequestSerial;pendingScene=null;latestSceneRevision=0;
 try{
  const previous=renderer,preserved=previous?snapshotRenderer(previous):null;previous?.dispose();handleError(null);$('cpuFallbackPrompt').hidden=true;loadingIndicator.update(true,cpu?'Preparing the CPU preview…':'Preparing graphics…',true);
  // Each backend needs its own canvas; a transferred OffscreenCanvas cannot be reused.
  if(previous){const fresh=$('universe').cloneNode(false);$('universe').replaceWith(fresh);}
  renderer=createRenderHost($('universe'),{onStats:stats=>{if(generation===rendererGeneration)handleStats(stats);},onError:error=>{if(generation===rendererGeneration)handleError(error);},onCanvasChanged:()=>viewportUI?.rendererChanged()},{cpu});
  if(preserved){
   // Retry and explicit CPU opt-in keep the latest scene, camera, and objects,
   // including edits made while the previous backend was still starting.
   preserved.quality=cpu?'cpu':$('quality').value;restoreRenderer(renderer,preserved);
   for(const key of Object.keys(DEFAULTS))if(key in preserved.state)state[key]=preserved.state[key];
   selectedObjectId=preserved.selectedId??selectedObjectId;
  }else{renderer.loadScene(activePreset);renderer.update(state);}
  if(!cpu)renderer.setQuality($('quality').value);$('quality').disabled=cpu;
  renderer.setPresentationPaused(!!document.querySelector('dialog[open]'));
  $('cpuQualityNotice')&&($('cpuQualityNotice').hidden=!cpu);viewportUI?.rendererChanged();handleStats(renderer.getState());
  window.observatory={get renderer(){return renderer;},get state(){return {...state};}};
  if(requestedScene)void applyPreset(requestedScene);
  const startup=await renderer.startup;if(generation!==rendererGeneration)return;
  if(startup.workerFailed){handleError(startup.reason||'The renderer could not start. Please retry.');return;}
  if(!cpu&&!startup.available){renderer.setPresentationPaused(true);$('renderError').hidden=true;loadingIndicator.update(false);$('cpuFallbackPrompt').hidden=false;$('cpuQualityNotice').hidden=true;return;}
  handleStats(renderer.getState());
 }catch(e){if(generation===rendererGeneration)handleError(e.message);}
}
$('retryRenderer').addEventListener('click',()=>initRenderer(!!renderer?.cpu));$('chooseAnotherScene').addEventListener('click',()=>openDialog('atlasDialog',$('chooseAnotherScene')));$('retryGPU').addEventListener('click',()=>initRenderer(false));$('continueCPU').addEventListener('click',()=>initRenderer(true));

async function applyPreset(id){
 const p=SCENE_PRESETS.find(p=>p.id===id)||SCENE_PRESETS[0],token=++sceneRequestSerial;
 pendingScene={id:p.id,token,phase:'paint',revision:null};activePreset=p.id;
 handleError(null);loadingIndicator.update(true,`Opening ${p.title}…`,true);
 if($('atlasDialog').open)$('atlasDialog').close();viewportUI?.close();
 // This cheap host signal invalidates old work before the first paint. The
 // synchronous compatibility path begins only after the loader has been painted.
 try{renderer?.requestSceneLoad?.();pendingScene.revision=renderer?.getState().sceneLoadRevision;latestSceneRevision=pendingScene.revision??latestSceneRevision;}
 catch(error){pendingScene=null;handleError(error.message||'This scene could not start loading.');return;}
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 if(token!==sceneRequestSerial)return;
 try{
  pendingScene.phase='loading';custom=false;state=makePreset(p.id);state.paused=reducedMotion();
  if(renderer){const current=renderer.loadScene(p.id);for(const key of Object.keys(DEFAULTS))if(key in current)state[key]=current[key];state.paused=reducedMotion();renderer.update({paused:state.paused});lastStats=renderer.getState();}
  selectedObjectId=null;rosterSignature='';syncControls();renderObjectManager();
  $('currentScene').textContent=p.title;$('sceneNumber').textContent=`${p.number} / ${p.title.toUpperCase()}`;$('sceneTitle').textContent=p.heading;$('sceneSubtitle').textContent=p.subtitle;
  document.querySelectorAll('[data-scene]').forEach(el=>{const selected=el.dataset.scene===p.id;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));});setFeature(state.warp?'warp':p.objects?.length?'objects':'scene');viewportUI?.sceneChanged();
  if(renderer)handleStats(renderer.getState());
 }catch(error){if(token===sceneRequestSerial){pendingScene=null;handleError(error.message||'This scene could not load. Retry, or choose another scene.');}}
}
document.querySelectorAll('[data-scene]').forEach(el=>el.addEventListener('click',()=>{applyPreset(el.dataset.scene);}));
function setPaused(value){state.paused=value;renderer?.update({paused:value});$('playPause').innerHTML=icon(value?'play':'pause');$('playPause').setAttribute('aria-label',value?'Resume simulation':'Pause simulation');$('playPause').title=value?'Resume simulation':'Pause simulation';$('motionState').textContent=value?'TIME IS PAUSED':'TIME IS FLOWING';viewportUI?.refresh(renderer?.getState());}
$('playPause').addEventListener('click',()=>setPaused(!state.paused));$('speed').addEventListener('change',e=>{state.speed=Number(e.target.value);renderer?.update({speed:state.speed});});for(const id of ['gridShortcut','allGridToggle'])$(id).addEventListener('click',()=>updateParameter('grid',!state.grid));
$('zoomIn').addEventListener('click',()=>renderer?.zoom(.8));$('zoomOut').addEventListener('click',()=>renderer?.zoom(1.25));$('resetCamera').addEventListener('click',()=>{renderer?.resetCamera();lastStats=renderer?.getState();syncViewMode(lastStats?.viewMode||'orbit');renderObjectManager();toast('Restored this scene’s starting view.');});
[['orbitMode','orbit'],['lookMode','look']].forEach(([id,mode])=>$(id).addEventListener('click',()=>{renderer?.setViewMode(mode);syncViewMode(mode);}));[['lookCenter','center'],['lookOutward','outward'],['lookTangent','tangent']].forEach(([id,direction])=>$(id).addEventListener('click',()=>{renderer?.setViewMode('look');renderer?.look(direction);syncViewMode('look');}));
$('distanceForm').addEventListener('submit',e=>{e.preventDefault();const value=Number($('distanceInput').value);if(!Number.isFinite(value)||value<=0)return;renderer?.setDistanceRg(Math.max(horizonRg(state.spin)*1.013,Math.min(5000,value)));});$('nearHorizon').addEventListener('click',()=>{if(state.binary)return;renderer?.setDistanceRg(horizonRg(state.spin)*1.08);renderer?.look('outward');renderer?.setViewMode('look');syncViewMode('look');toast('Just outside the horizon, looking out. Drag to explore the sky.');});
const qualityNotes={low:'Fixed Low quality. Select Adaptive to let the mode change with frame rate.',medium:'Fixed Medium quality. Select Adaptive to let the mode change with frame rate.',high:'Fixed High quality. Select Adaptive to let the mode change with frame rate.',ultra:'Maximum detail, even at low FPS. Pause to compose a shot, then Save image.',adaptive:'Selects Low, Medium, or High to stay at 30 FPS or above.'};
const qualityName=value=>({low:'Low',medium:'Medium',high:'High',ultra:'Ultra'}[value]||'Low');
function updateQualityStatus(stats={}){
 const fps=Number.isFinite(stats.fps)?`${Math.round(stats.fps)} FPS`:'— FPS';$('fpsCorner').textContent=fps;$('fps').textContent=fps;
 if(stats.cpu){$('effectiveQuality').textContent='CPU preview';$('gpuLabel').textContent='CPU';$('qualityTier').textContent='PREVIEW';$('renderStatus').setAttribute('aria-label',`CPU preview, ${fps}`);$('qualityNote').textContent='Simplified local preview. GPU graphics provide much better image quality.';if(Number.isFinite(stats.fps))$('fps').textContent=`${Math.round(stats.fps)} FPS`;$('quality').disabled=true;return;}
 const selected=$('quality').value,effective=qualityName(stats.effectiveQuality||(selected==='adaptive'?'low':selected));
 const mode=selected==='adaptive'?`Adaptive · ${effective}`:`Manual · ${effective}`;
 if($('effectiveQuality').textContent!==mode)$('effectiveQuality').textContent=mode;
 if(Number.isFinite(stats.fps))$('fps').textContent=`${Math.round(stats.fps)} FPS`;
 $('performanceControls').classList.toggle('is-adjusting',selected==='adaptive'&&stats.adaptiveStatus==='limited');
 $('gpuLabel').textContent=selected==='adaptive'?'ADAPTIVE':'MANUAL';$('qualityTier').textContent=effective.toUpperCase();
 $('renderStatus').setAttribute('aria-label',`${mode}, ${fps}`);
 let message=qualityNotes[selected];
 if(stats.shaderCompiling)message='Preparing the selected graphics. Your current view stays in place.';
 else if(selected==='adaptive'){
  const messages={warming:'Measuring frame rate, then checking higher modes.',probing:`Trying ${effective}. Adaptive keeps it if it stays at 30 FPS or above.`,stable:effective==='High'?'Highest automatic mode. Adaptive steps down if FPS stays below 30.':`Using ${effective}. Higher modes are checked again while motion stays smooth.`,limited:effective==='Low'?'Low is the minimum. Adaptive will check higher modes again.':`Using ${effective} after a drop below 30 FPS. Higher modes will be checked again.`};
  message=messages[stats.adaptiveStatus]||qualityNotes.adaptive;
 }
 if($('qualityNote').textContent!==message)$('qualityNote').textContent=message;
 $('capture').title=selected==='ultra'?'Save a full-detail Ultra frame; capture waits for it to finish':'Save a fresh frame at the selected render quality';
}
$('quality').addEventListener('change',e=>{renderer?.setQuality(e.target.value);updateQualityStatus(renderer?.getState());});
$('orbitRadius').addEventListener('input',e=>{$('radiusValue').textContent=`${e.target.value} r_g`;rangeFill(e.target);});$('orbitPhase').addEventListener('input',e=>{$('phaseValue').textContent=`${e.target.value}°`;rangeFill(e.target);});
$('showAddObject').addEventListener('click',()=>{$('addObjectPanel').open=true;$('addObjectPanel').scrollIntoView({behavior:reducedMotion()?'instant':'smooth',block:'nearest'});$('objectType').focus({preventScroll:true});});
$('addObject').addEventListener('click',()=>{
 if(!renderer){toast('Graphics are starting. Try again in a moment.');return;}
 const type=$('objectType').value,context=objectContext(),result=context.kind==='bridge'?renderer.setBridgeTraveler?.(type):renderer.addObject(type,Number($('orbitRadius').value),Number($('orbitPhase').value)*Math.PI/180,Number($('objectScale').value));
 if(!result){toast('Your scene has reached its 10-object limit. Delete an object to make room.');return;}
 selectedObjectId=result.id;renderer.selectObject(result.id);$('addObjectPanel').open=false;syncRendererState();markCustom();renderObjectManager();viewportUI?.openElements();toast(`${OBJECT_TYPES.find(object=>object.id===type)?.label||'Object'} ${context.kind==='bridge'?'is the bridge traveler':'added'}. Select it in Elements to edit, track, or ride.`);
});
$('clearObjects').addEventListener('click',()=>{renderer?.clearObjects();selectedObjectId=null;markCustom();renderObjectManager();$('addObjectPanel').open=true;toast('Additional objects cleared.');});
$('resetAll').addEventListener('click',()=>{applyPreset('disk');$('quality').value='adaptive';renderer?.setQuality('adaptive');updateQualityStatus(renderer?.getState());$('orbitRadius').value='12';$('orbitPhase').value='0';$('objectType').value='planet';$('objectScale').value='1';updateObjectPreview();updateObjectScale();$('radiusValue').textContent='12 r_g';$('phaseValue').textContent='0°';rangeFill($('orbitRadius'));rangeFill($('orbitPhase'));$('objectCount').textContent='0';$('addObject').disabled=false;$('addObjectPanel').open=true;setFeature('scene');toast('Original starfield and accretion disc restored.');});

function pauseCoveredView(paused){renderer?.setPresentationPaused(paused);}
function openDialog(id,button){openers.set(id,button);$(id).showModal();pauseCoveredView(true);}
function setupDialog(id,closeId){$(closeId).addEventListener('click',()=>$(id).close());$(id).addEventListener('close',()=>{pauseCoveredView(!!document.querySelector('dialog[open]'));openers.get(id)?.focus();});$(id).addEventListener('click',e=>{const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$(id).close();});}
document.querySelectorAll('[data-open-atlas]').forEach(button=>button.addEventListener('click',()=>openDialog('atlasDialog',button)));setupDialog('atlasDialog','closeAtlas');
let mathGuideReady=false,warpGuideReady=false;
document.querySelectorAll('[data-open-math]').forEach(button=>button.addEventListener('click',()=>{openDialog('mathDialog',button);if(!mathGuideReady){renderMathGuide($('mathContent'));mathGuideReady=true;}const section=button.dataset.section;if(!section)return;const target=$(section);if(target){target.open=true;requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));}}));setupDialog('mathDialog','closeMath');
document.querySelectorAll('[data-open-warp]').forEach(button=>button.addEventListener('click',()=>{openDialog('warpDialog',button);if(!warpGuideReady){renderWarpGuide($('warpMathContent'));warpGuideReady=true;}}));setupDialog('warpDialog','closeWarp');
document.querySelectorAll('[data-open-help]').forEach(button=>button.addEventListener('click',()=>openDialog('helpDialog',button)));setupDialog('helpDialog','closeHelp');$('helpScenes').addEventListener('click',()=>{$('helpDialog').close();openDialog('atlasDialog',$('currentScene').closest('button'));});
$('fullscreen').addEventListener('click',async()=>{if($('scene').classList.contains('pseudo-fullscreen')){$('scene').classList.remove('pseudo-fullscreen');$('fullscreen').setAttribute('aria-label','Expand observatory');renderer?.resize();return;}try{if(document.fullscreenElement)await document.exitFullscreen();else if($('scene').requestFullscreen)await $('scene').requestFullscreen();else $('scene').classList.toggle('pseudo-fullscreen');}catch{$('scene').classList.toggle('pseudo-fullscreen');}if($('scene').classList.contains('pseudo-fullscreen'))$('fullscreen').setAttribute('aria-label','Exit expanded view');renderer?.resize();});
document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit expanded view':'Expand observatory');renderer?.resize();});
$('capture').addEventListener('click',async()=>{
 if(!renderer?.ready){toast('Start the renderer before saving an image.');return;}
 const button=$('capture'),label=button.innerHTML;button.disabled=true;button.textContent='Preparing image…';button.setAttribute('aria-busy','true');
 try{
  const blob=await renderer.captureImage();
  if(!blob)throw new Error('Image capture is not available in this browser.');
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`event-horizon-${custom?'custom':activePreset}-${state.spectrum}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Your view has been saved.');
 }catch(error){toast(error?.message||'The image could not be saved. Try again once the view is ready.');}
 finally{button.disabled=false;button.innerHTML=label;button.removeAttribute('aria-busy');}
});
function showObservatory(){$('scene').scrollIntoView({behavior:reducedMotion()?'instant':'smooth',block:'start'});}
$('observatoryNav').addEventListener('click',showObservatory);$('backToView').addEventListener('click',showObservatory);$('editScene').addEventListener('click',()=>viewportUI?.openElements());
document.addEventListener('keydown',e=>{
 if(document.querySelector('dialog[open]'))return;
 if(e.key==='Escape')displayOptions.open=false;
 if(e.key==='Escape'&&$('scene').classList.contains('pseudo-fullscreen')){$('scene').classList.remove('pseudo-fullscreen');$('fullscreen').setAttribute('aria-label','Expand observatory');renderer?.resize();}
 if(e.key==='Escape'&&renderer?.getState().focusId){e.preventDefault();returnToOverview();return;}
 if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
 if(e.target===$('universe')&&e.code==='Space'){e.preventDefault();setPaused(!state.paused);}
});
if(reducedMotion())state.paused=true;syncControls();updateObjectPreview();updateObjectScale();rangeFill($('orbitRadius'));rangeFill($('orbitPhase'));
viewportUI=installViewportUI({renderer:()=>renderer,state:()=>state,objects,selectObject,setFeature,selectComponent,updateParameter,setPaused,syncViewMode,toast,activePreset:()=>activePreset,refresh:()=>{lastStats=renderer?.getState();if(lastStats){syncViewMode(lastStats.viewMode);renderObjectManager(lastStats);}},openDialog,openScenes:button=>openDialog('atlasDialog',button),openHelp:button=>openDialog('helpDialog',button),onDialogClose:id=>{pauseCoveredView(!!document.querySelector('dialog[open]'));openers.get(id)?.focus();}});
initRenderer();renderObjectManager();
const statsWatchdog=setInterval(()=>{if(lastStatsAt&&performance.now()-lastStatsAt>2200&&!document.hidden&&!document.querySelector('dialog[open]')){$('fpsCorner').textContent='0 FPS';if(lastRendererError||!$('cpuFallbackPrompt').hidden)return;loadingIndicator.update(true,pendingScene?`Opening ${SCENE_PRESETS.find(p=>p.id===pendingScene.id)?.title||'scene'}…`:'Waiting for the next frame…');}},750);
window.addEventListener('pagehide',event=>{if(!event.persisted){clearInterval(statsWatchdog);loadingIndicator.dispose();viewportUI?.dispose();renderer?.dispose();}});

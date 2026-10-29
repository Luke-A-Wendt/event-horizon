import { installAnomalyControls } from './anomaly-ui.js';
import { installPilotControls } from './pilot-ui.js';
import { installStellarControls } from './stellar-ui.js';
import { installAnnotations } from './annotations.js';
import { installSceneFiles } from './scene-file-ui.js';
import { createRenderHost } from './render-host.js';
import { snapshotRenderer, restoreRenderer } from './render-state.js';
import { createLoadingIndicator } from './loading-indicator.js';
import { installViewportUI } from './viewport-ui.js';
import { renderMathGuide, renderWormholeGuide } from './math.js';
import { renderRelativityGuide } from './relativity-math.js';
import { renderWarpGuide } from './warp-math.js';
import { DEFAULTS, SCENE_PRESETS, makePreset, horizonRg, iscoRg, REFERENCE_MASS } from './config.js';
import { OBJECT_TYPES } from './objects.js';

const $=id=>document.getElementById(id);
const reducedMotion=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
let state={...DEFAULTS},renderer,lastStats,toastTimer,activePreset='disk',custom=false,lastRendererError='',viewportUI=null,pilotUI=null,stellarUI=null,anomalyUI=null;
const openers=new Map();
const loadingIndicator=createLoadingIndicator($('loading'),$('loadingReason'));
let rendererGeneration=0,lastStatsAt=0,lastStatsPaint=-Infinity,lastStatsSignal='';
let sceneRequestSerial=0,pendingScene=null,latestSceneRevision=0,annotationsUI=null,sceneFilesUI=null;
const loadingSceneTitle=()=>pendingScene?.title||SCENE_PRESETS.find(p=>p.id===(pendingScene?.id||activePreset))?.title||'Your scene';
loadingIndicator.update(true,loadingSceneTitle(),true);
let activeTab='scene',activeComponent='disk',selectedObjectId=null,rosterSignature='';
const objectSilhouettes={
 heighliner:'<path d="M25 24h65v32H25M42 24v32m7-32v32M26 31h56M26 49h56"/><ellipse cx="90" cy="40" rx="12" ry="16"/><ellipse cx="90" cy="40" rx="7" ry="11"/><path d="M25 24c-12 0-12 32 0 32"/>',
 anomaly:'<path d="M18 25c18-24 25 35 43 6s23-18 41-9M15 40c24-30 33 31 48 0s27-6 42-5M18 57c19-23 27 17 42-3s24-10 42 7"/>',

 dyson:'<path d="M79 16a29 29 0 1 0 0 48M79 16v48"/><ellipse cx="79" cy="40" rx="9" ry="24"/><path d="M33 40h37M44 18q-12 22 0 44M56 12q-12 28 0 56"/><circle cx="59" cy="40" r="5"/>',
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
 <div class="mass-control"><label for="exactMass">Mass <span>M☉</span></label><input id="exactMass" type="number" min="1" max="100000000000" step="any" value="4300000" aria-label="Black hole mass in solar masses"><input id="mass" data-param="mass" type="range" min="0" max="1" step=".0001" value=".6" aria-label="Black hole mass, exponential scale"><div class="mass-range"><span>1 M☉</span><label for="maxMass">Maximum <input id="maxMass" type="number" min="2" max="100000000000" step="any" value="100000000000"> M☉</label></div></div>
 ${range('spin','Dimensionless spin a*',0,.998,.001,'',3)}<div class="range-ends"><span>Non-rotating</span><span>Near-extremal</span></div>
 <div class="physics-readouts"><div><span>HORIZON r₊</span><strong id="horizonValue">—</strong><small id="horizonPhysical">—</small></div><div><span>PROGRADE ISCO</span><strong id="iscoValue">—</strong><small id="iscoPhysical">—</small></div></div>
 <p class="control-note mass-note">Mass changes the physical hole while your observer stays in place. Spin changes the horizon and the disc’s inner stable orbit.</p>
 <details class="axis-details"><summary>Primary spin orientation</summary>${range('primaryTilt','Tilt from orbital axis',0,180,1,'°',0)}${range('primaryAzimuth','Axis direction',0,360,1,'°',0)}<p class="control-note">The primary disc and jets share this spin axis.</p></details>
 ${toggle('interiorView','Interior geometry cutaway')}<p class="control-note">Removes horizon capture for an illustrative spatial cutaway. This is not an optical prediction of what an infalling observer would see. Use Geometry in Display for physical outlines.</p>${toggle('horizonGuide','Coordinate horizons · interior cutaway')}<p class="control-note physics-clarifier">The dark silhouette is the lensed shadow, larger than the horizon. Coordinate horizons are shown only in the Geometry interior cutaway.</p>
 <button class="physics-link" data-open-math data-section="math-spin">Understand the horizon, shadow & gap ${icon('arrow')}</button></div>
 <details class="component-panel geometry-panel"><summary><span class="component-icon">${icon('view')}</span><span>Optics<small>Lensing · exposure · motion</small></span></summary><div class="component-body">${toggle('lensing','Gravitational lensing')}${toggle('grid','Spacetime grid · all fields')}${toggle('gravitationalWaves','Gravitational-wave grid study')}${range('waveAmplitude','Wave amplification',0,1,.01,'×',2)}${range('waveFrequency','Wave rate',.1,4,.1,'×',1)}<p class="control-note">Waves are a strongly amplified quadrupole illustration, not a numerical-relativity solution.</p>${toggle('autoRotate','Auto-orbit camera')}${range('exposure','Exposure',.2,3,.05,'×',2)}<p class="control-note">One grid switch controls every field. The guide is lensed with the scene, flows inward near a black hole, and becomes nearly stationary far away. Spin adds angular flow.</p></div></details>`;

$('componentControls').innerHTML=[
 panel('stars','Starfield','The distant universe','✦',range('starDensity','Star density',0,2,.05,'×',2)+range('starBrightness','Star brightness',.1,3,.05,'×',2)+range('starVariety','Color & size variety',0,2,.05,'×',2)),
 panel('disk','Accretion disc','Material outside the horizon',icon('blackhole'),select('diskStyle','COMPOSITION / APPEARANCE',[['thermal','Thermal plasma · original'],['hydrogen','Hydrogen-rich glow'],['helium','Helium-rich glow'],['dust','Cool dust'],['nebula','Nebulous gas'],['radiant','Radiant plasma · white / cyan'],['ribbons','Flowing ribbons · electric blue']])+select('diskPalette','COLOR MODEL',[['physical','Physical emission palette'],['artistic','Artistic · use chosen color'],['rainbow','Rainbow · artistic']])+color('diskColor','Disc color')+range('diskOuter','Outer radius',7,40,.5,' r_g',1)+range('diskThickness','Thickness',.2,4,.1,'×',1)+range('diskDensity','Optical density',.1,2,.05,'×',2)+'<p class="control-note">Composition presets are illustrative emission palettes, not resolved chemical spectra. The inner edge follows the prograde ISCO.</p>'),
 panel('nebula','Backdrop nebula','Clouds beyond the lens','☁',select('nebulaShape','CLOUD STRUCTURE',[['cloud','Turbulent cloud'],['shell','Expanding shell'],['filaments','Woven filaments'],['spiral','Spiral cloud']])+color('nebulaColor','Nebula color')+range('nebulaScale','Structure scale',.3,3,.1,'×',1)+range('nebulaIntensity','Brightness',.1,3,.1,'×',1)+range('nebulaRotation','Sky rotation',0,360,1,'°',0)),
 panel('planet','Planet','An editable orbiting world','●',range('planetMass','Mass',.1,318,.1,' M⊕',1)+range('planetRadius','Radius',.3,8,.1,' R⊕',1)+range('planetDistance','Orbital distance',8,60,.5,' r_g',1)+color('planetColor','Surface color')+'<div class="property-grid"><div><span>MEAN DENSITY</span><strong id="planetDensity">—</strong></div><div><span>SURFACE GRAVITY</span><strong id="planetGravity">—</strong></div></div><p class="control-note">The radius sets its actual dimensions. Mass and radius set these physical diagnostics; its gravity is negligible beside a million-solar-mass hole.</p>'),
 panel('tidalStar','Disrupting star','A star feeding the darkness','☀',range('starRadius','Stellar size',.25,3,.05,'×',2)+range('starDistance','Encounter radius',7,25,.5,' r_g',1)+range('disruptionStrength','Disruption strength',.1,2,.05,'×',2)+color('starColor','Star & debris color')+'<p class="control-note">A star at its physical reference size, with a repeating prescribed tidal stream. The strength slider changes how rapidly it unravels.</p>'),
 panel('binary','Second black hole','A coupled orbital system',icon('blackhole'),toggle('secondaryWhiteHole','White-hole companion · reverse flow')+select('binaryMotion','MOTION',[['orbit','Orbit'],['merger','Illustrative merger']])+range('mergerDuration','Merger duration',10,120,1,' s',0)+range('binaryRatio','Secondary / primary mass',.1,2,.05,'',2)+range('binarySeparation','Separation',12,60,.5,' r_g',1)+range('secondarySpin','Secondary spin a*',0,.998,.001,'',3)+'<span class="sub-label">SECONDARY SPIN ORIENTATION</span>'+range('secondaryTilt','Tilt from orbital axis',0,180,1,'°',0)+range('secondaryAzimuth','Axis direction',0,360,1,'°',0)+'<p class="control-note">Circular barycentric orbits use the mass ratio and separation. Each disc and jet follows its own spin axis. Close discs are tidally limited; this is an approximate binary spacetime.</p>'),
 panel('bridge','Einstein–Rosen bridge','Ellis comparison model',icon('warp'),'<label class="field-label" for="bridgeTravelerType">TRAVELER</label><select id="bridgeTravelerType"><option value="enterprise">Starship Enterprise</option><option value="shuttle">NASA Shuttle</option><option value="heighliner">Guild Heighliner</option><option value="astronaut">Astronaut</option><option value="blackhole">Black hole · speculative</option><option value="whitehole">White hole · speculative</option></select>'+select('bridgeMode','BRIDGE GEOMETRY',[['single','Single throat'],['crossed','Two crossed charts · illustrative']])+select('bridgeGridOrientation','GRID PLANE',[['perpendicular','Perpendicular to flight'],['parallel','Along the flight plane']])+select('bridgeLifecycle','PORTAL SEQUENCE',[['steady','Always open'],['open-transit-close','Open · cross · close · return']])+range('bridgeRadius','Throat radius',.61,30,.01,' traveler radii',2)+toggle('bridgeTravel','Animate traversal')+toggle('warpField','Enterprise warp envelope · comparison').replace('id="warpField"','id="bridgeWarpEnvelope"')+'<p class="control-note" id="bridgePhaseNote"></p>'+'<span class="sub-label">OTHER SIDE OF THE BRIDGE</span>'+toggle('bridgeSurfaces','Planetary endpoints')+select('bridgeWorlds','ENDPOINT WORLDS',[['caladan','Caladan & Arakas'],['earth-proxima','Earth & Proxima Centauri']])+toggle('bridgeOtherStars','Far-side stars')+range('bridgeOtherStarDensity','Star density',0,2,.05,'×',2)+range('bridgeOtherStarBrightness','Star brightness',.1,3,.05,'×',2)+range('bridgeOtherStarVariety','Color & size variety',0,2,.05,'×',2)+toggle('bridgeOtherNebula','Far-side nebula')+color('bridgeOtherColor','Far-side nebula color')+select('bridgeOtherShape','FAR-SIDE STRUCTURE',[['cloud','Turbulent cloud'],['shell','Expanding shell'],['filaments','Woven filaments'],['spiral','Spiral cloud']])+range('bridgeOtherScale','Structure scale',.2,4,.1,'×',1)+range('bridgeOtherIntensity','Brightness',0,4,.1,'×',1)+range('bridgeOtherRotation','Sky rotation',-360,360,1,'°',0)+'<p class="control-note">Near side: use Starfield and Nebula properties. Far side: toggle and shape its nebula here. The default starts in plain stars and arrives among purple clouds.</p>'+'<p class="control-note">Traversal uses an Ellis wormhole model. A classical Einstein–Rosen bridge is not traversable.</p>'),
 panel('jets','Polar jets','Outflows along each spin axis','↟',select('jetStructure','PLASMA STRUCTURE',[['steady','Continuous outflow'],['knots','Bright knots'],['helix','Helical filaments']])+color('jetColor','Jet color')+range('jetSpread','Opening spread',.25,3,.05,'×',2)+range('jetLength','Length',.3,3,.1,'×',1)+range('jetIntensity','Brightness',.1,3,.1,'×',1)+'<p class="control-note">The two outflows follow the local spin axis. Jets are an illustrative plasma model, not matter escaping the horizon.</p>'),
 panel('secondaryDisk','Companion accretion disc','Material around the second black hole',icon('blackhole'),select('secondaryDiskStyle','APPEARANCE',[['thermal','Thermal plasma'],['hydrogen','Hydrogen-rich glow'],['helium','Helium-rich glow'],['dust','Cool dust'],['nebula','Nebulous gas'],['radiant','Radiant plasma'],['ribbons','Flowing ribbons']])+select('secondaryDiskPalette','COLOR MODEL',[['physical','Physical emission palette'],['artistic','Artistic · use chosen color'],['rainbow','Rainbow · artistic']])+color('secondaryDiskColor','Disc color')+range('secondaryDiskOuter','Outer radius',7,40,.5,' r_g',1)+range('secondaryDiskThickness','Thickness',.2,4,.1,'×',1)+range('secondaryDiskDensity','Optical density',.1,2,.05,'×',2)),
 panel('secondaryJets','Companion polar jets','Aligned with the companion spin',icon('arrow'),select('secondaryJetStructure','PLASMA STRUCTURE',[['steady','Continuous outflow'],['knots','Bright knots'],['helix','Helical filaments']])+color('secondaryJetColor','Jet color')+range('secondaryJetSpread','Opening spread',.25,3,.05,'×',2)+range('secondaryJetLength','Length',.3,3,.1,'×',1)+range('secondaryJetIntensity','Brightness',.1,3,.1,'×',1))
].join('');


document.querySelector('.view-toolbar .help-button').before(document.querySelector('.geometry-panel'));
document.querySelector('.controls-fixed .active-scene').after($('performanceControls'));
const displayOptions=document.querySelector('.geometry-panel');document.addEventListener('pointerdown',event=>{if(displayOptions.open&&!displayOptions.contains(event.target))displayOptions.open=false;});
const componentCatalog=[['secondaryDisk','Companion disc',icon('blackhole')],['secondaryJets','Companion jets',icon('arrow')],['stars','Starfield','✦'],['disk','Accretion disc',icon('blackhole')],['nebula','Nebula','☁'],['planet','Planet','●'],['tidalStar','Disrupting star','☀'],['binary','Binary companion',icon('blackhole')],['jets','Polar jets','↟'],['bridge','Einstein–Rosen bridge',icon('warp')]];
$('componentDeck').innerHTML=componentCatalog.map(([key,label,glyph])=>`<div class="component-tile"><button data-edit-component="${key}" aria-pressed="${key===activeComponent}"><span>${glyph}</span><strong>${label}<small>Edit settings</small></strong></button><button data-switch-param="${key}" class="component-tile-toggle" aria-label="Toggle ${label.toLowerCase()}" aria-pressed="${!!state[key]}"><i></i></button></div>`).join('');
$('warpControls').innerHTML=`${toggle('warp','Enable warp field')}${range('warpFactor','Warp factor',0,10,.01,'',2)}<div class="range-ends"><span>0 · off</span><span>10 · infinite limit</span></div>${''}${range('warpThickness','Wall sharpness',1,12,.2,'',1)}${toggle('warpField','Show field boundary')}${toggle('warpGrid','Spacetime grid · all fields')}<p class="control-note">This is the same Grid control as in the view. It switches the black hole and warp guides together.</p>`;
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
function selectComponent(key){activeComponent=key;$('componentSettingsTitle').textContent=`EDITING · ${(key==='space'?'Space · environment':componentCatalog.find(c=>c[0]===key)?.[1]||key).toUpperCase()}`;document.querySelectorAll('#componentControls [data-component]').forEach(el=>{const show=key==='space'?['stars','nebula',...(state.bridge?['bridge']:[])].includes(el.dataset.component):el.dataset.component===key;el.hidden=!show;el.open=show;});document.querySelectorAll('[data-edit-component]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.editComponent===key)));}
document.querySelectorAll('[data-tab]').forEach(button=>{button.addEventListener('click',()=>setFeature(button.dataset.tab));button.addEventListener('keydown',e=>{const tabs=[...document.querySelectorAll('[data-tab]')],at=tabs.indexOf(button);let next;if(e.key==='ArrowRight')next=tabs[(at+1)%tabs.length];if(e.key==='ArrowLeft')next=tabs[(at+tabs.length-1)%tabs.length];if(e.key==='Home')next=tabs[0];if(e.key==='End')next=tabs.at(-1);if(next){e.preventDefault();setFeature(next.dataset.tab);next.focus();}});});
document.querySelectorAll('[data-feature]').forEach(button=>button.addEventListener('click',()=>{if(viewportUI){const tab=button.dataset.feature;if(tab==='hole')viewportUI.select('primary');else if(tab==='warp')exploreWarp();else if(tab==='objects')viewportUI.select('add');else viewportUI.openElements();}else setFeature(button.dataset.feature,true);}));
document.querySelectorAll('[data-edit-component]').forEach(button=>button.addEventListener('click',()=>selectComponent(button.dataset.editComponent)));
document.querySelectorAll('[data-switch-param]').forEach(button=>button.addEventListener('click',()=>updateParameter(button.dataset.switchParam,!state[button.dataset.switchParam])));
selectComponent(activeComponent);setFeature(activeTab);

const sceneCategory=p=>p.category||(p.patch?.warp?'Warp drive':'Black holes');
const sceneCategories=['All',...new Set(SCENE_PRESETS.map(sceneCategory))];
const categoryIcon=category=>({'Black holes':'blackhole','Warp drive':'warp','Warp experiments':'warp','Wormholes':'wormhole','Solar systems':'solar','Spacecraft':'shuttle','Geometry':'grid'}[category]||'scenes');
const filters=sceneCategories.map((category,i)=>`<button data-scene-filter="${category}" aria-pressed="${i===0}">${icon(categoryIcon(category))}${category}</button>`).join('');
$('sceneFilters').innerHTML=filters;
$('scenesCount').textContent=`${SCENE_PRESETS.length} experiments. Choose a starting point, then make it your own.`;
const cards=SCENE_PRESETS.map(p=>`<button class="atlas-card ${p.id==='disk'?'selected':''}" data-scene="${p.id}" data-scene-category="${sceneCategory(p)}" aria-pressed="${p.id==='disk'}"><div class="atlas-art mini-universe ${p.className}"><i></i><b></b><img src="assets/atlas-${p.id}.webp" alt="" loading="lazy" decoding="async" fetchpriority="low" width="960" height="632"></div><div class="atlas-card-info"><span>${p.number} / ${sceneCategory(p).toUpperCase()}</span><h3>${p.title}</h3><p>${p.description}</p><div class="scene-tags">${(p.tags||[p.subtitle]).map(tag=>`<span>${tag}</span>`).join('')}</div>${p.explore?`<span class="scene-try"><b>TRY THIS</b> ${p.explore}</span>`:''}</div></button>`).join('');
$('atlasGrid').innerHTML=cards;
for(const id of ['sceneFilters'])$(id).addEventListener('click',event=>{const selected=event.target.closest('[data-scene-filter]');if(!selected)return;const category=selected.dataset.sceneFilter;document.querySelectorAll('[data-scene-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.sceneFilter===category)));document.querySelectorAll('[data-scene-category]').forEach(card=>card.hidden=category!=='All'&&card.dataset.sceneCategory!==category);});
document.querySelectorAll('.atlas-art img').forEach(img=>img.addEventListener('error',()=>img.hidden=true));

function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3600);}
function rangeFill(el){el.style.setProperty('--progress',`${(Number(el.value)-Number(el.min))/(Number(el.max)-Number(el.min))*100}%`);}
function massSliderValue(mass){const max=Math.max(2,Number($('maxMass').value)||1e11);return Math.log10(Math.max(1,mass*1e6))/Math.log10(max);}
function massFromSlider(value){return Math.pow(Math.max(2,Number($('maxMass').value)||1e11),Number(value))/1e6;}
function formatOutput(el){if(el.id==='mass'){rangeFill(el);return;}const output=$(`out-${el.id}`);if(!output)return;if(el.type==='color'){output.textContent=el.value.toUpperCase();return;}if(el.type!=='range')return;output.textContent=Number(el.value).toFixed(Number(el.dataset.digits||0))+(el.dataset.unit||'');rangeFill(el);}
function markCustom(){custom=true;const p=SCENE_PRESETS.find(p=>p.id===activePreset)||{title:'Your universe'};$('currentScene').textContent=`Custom · ${p.title}`;$('sceneNumber').textContent=`CUSTOM / ${p.title.toUpperCase()}`;document.querySelectorAll('[data-scene]').forEach(el=>{el.classList.remove('selected');el.setAttribute('aria-pressed','false');});}
function updateMetrics(){
 if(document.activeElement!==$('exactMass'))$('exactMass').value=Number((state.mass*1e6).toPrecision(7));if(state.mass*1e6>Number($('maxMass').value))$('maxMass').value=state.mass*1e6;$('mass').value=massSliderValue(state.mass);rangeFill($('mass'));
 $('annotationShortcut').setAttribute('aria-pressed',String(!!state.annotations));
 const h=horizonRg(state.spin),inner=iscoRg(state.spin),rgMillionKm=state.mass*1.47662504;
 $('horizonValue').textContent=`${h.toFixed(3)} r_g`;$('horizonPhysical').textContent=`${(h*rgMillionKm).toFixed(2)} million km`;$('iscoValue').textContent=`${inner.toFixed(3)} r_g`;$('iscoPhysical').textContent=`${(inner*rgMillionKm).toFixed(2)} million km`;$('modelBadge').textContent=state.spin===0?'SCHWARZSCHILD':'KERR';
 $('planetDensity').textContent=`${(5.514*state.planetMass/state.planetRadius**3).toFixed(2)} g/cm³`;$('planetGravity').textContent=`${(9.80665*state.planetMass/state.planetRadius**2).toFixed(2)} m/s²`;
 $('distanceInput').min=(h*1.013).toFixed(3);$('nearHorizon').disabled=state.binary||!state.blackHole||!!lastStats?.focusId;$('nearHorizon').title=state.binary?'Available for a single black hole.':'Move just outside the horizon and look outward';
 document.querySelectorAll('[data-component]').forEach(el=>{const key=el.dataset.component;el.classList.toggle('component-enabled',!!state[key]);$(`status-${key}`).textContent=state[key]?'On':'Off';});
 document.querySelectorAll('[data-switch-param]').forEach(el=>el.setAttribute('aria-pressed',String(!!state[el.dataset.switchParam])));
 document.querySelectorAll('[data-param]').forEach(el=>{if(el.type==='checkbox')el.checked=!!state[el.dataset.param];});
 const geometry=state.spectrum==='geometry';for(const id of ['grid','warpGrid','gridShortcut','allGridToggle'])if($(id))$(id).disabled=geometry;const gridsOn=!!state.grid;for(const id of ['gridShortcut','allGridToggle']){$(id).setAttribute('aria-pressed',String(gridsOn));$(id).setAttribute('aria-label',`${gridsOn?'Turn off':'Turn on'} all spacetime grids`);}$('gridState').textContent=gridsOn?'On':'Off';$('guideLabel').hidden=!state.horizonGuide||!state.blackHole||!state.interiorView||!geometry;if($('horizonGuide'))$('horizonGuide').disabled=!geometry||!state.interiorView;
 const notes={geometry:'Geometry study · body outlines and spacetime grid. Black-hole outlines follow the lensed capture boundary; Interior cutaway shows coordinate horizons.',visible:'Visible light · reflected surfaces, glowing gas, and stars.',xray:'X-ray false color · hot gas, stellar coronae, and jets stand out; cool surfaces fade.',infrared:'Infrared false color · cool dust and thermal surfaces stand out across the scene.',radio:'Radio / millimeter false color · synchrotron jets, hot plasma, and cold dust stand out. Cool, compact objects are faint.',gamma:'Gamma-ray false color · energetic jets and the hottest plasma dominate. Ordinary stars, dust, and cool surfaces are very faint.'};$('spectrumNote').textContent=notes[state.spectrum];document.querySelectorAll('[data-spectrum]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.spectrum===state.spectrum)));
 const factor=state.warp?(Number(state.warpFactor)||0):0;
 $('warpSpeedValue').textContent=factor===0?'Warp field off':factor===10?'∞ · theoretical limit':factor<1?'Sub-warp field ramp':factor<=9?`${Math.pow(factor,10/3).toLocaleString(undefined,{maximumFractionDigits:1})} c`:'Beyond Warp 9';
 $('warpSpeedNote').textContent=factor===10?'Warp 10 has no finite TNG speed. The visualization remains bounded.':factor>9?'The licensed curve approaches infinity. There is no unique canonical conversion above Warp 9.':factor>0&&factor<1?'Below Warp 1 this control ramps up the visual field. No canonical speed conversion is assigned.':'The licensed TNG convention uses W^(10/3) from Warp 1 through Warp 9. This is a fictional speed scale, not an Alcubierre energy calculation.';
 $('scaleModeNote').textContent='All bodies use physical dimensions. Select an object in Objects, then Track for a close view or Ride to look around on board.';
 if(lastStats)renderObserver(lastStats);
}
function syncPlaybackNote(stats=renderer?.getState()){
 const note=$('playbackNote');if(!note)return;
 note.hidden=stats?.sceneId!=='geometry-orbit';if(note.hidden)return;
 const period=stats.orbitDisplayPeriodSeconds;
 const limited=Number.isFinite(stats.effectivePlaybackSpeed)&&stats.effectivePlaybackSpeed<(stats.speed??1)-1e-8;
 note.textContent=`Orbit + inward grid share one clock · ${Number.isFinite(period)?period.toLocaleString(undefined,{maximumSignificantDigits:2})+' s / orbit':'Paused'}${limited?' · 10 s minimum':''}.`;
}
function syncControls(){document.querySelectorAll('[data-param]').forEach(el=>{const value=state[el.dataset.param];if(el.type==='checkbox')el.checked=!!value;else el.value=el.id==='mass'?massSliderValue(value):value;formatOutput(el);});$('speed').value=state.speed;syncPlaybackNote();updateMetrics();syncViewMode(state.viewMode);setPaused(state.paused);}
function updateParameter(key,value){
 if(key==='grid'||key==='warpGrid'){value=state.spectrum==='geometry'||!!value;state.grid=state.warpGrid=value;renderer?.update({grid:value,warpGrid:value});}else if(key==='spectrum'&&value==='geometry'){state.spectrum=value;state.grid=state.warpGrid=true;renderer?.update({spectrum:value,grid:true,warpGrid:true});}else{state[key]=value;renderer?.update({[key]:value});}
 if(renderer){const current=renderer.getState();for(const name of Object.keys(DEFAULTS))if(name in current)state[name]=current[name];}
 markCustom();
 updateMetrics();if(key==='objectScaleMode'||key==='warp'||key==='bridge')renderObjectManager();viewportUI?.refresh(renderer?.getState());
}
document.querySelectorAll('[data-param]').forEach(el=>{formatOutput(el);const event=el.type==='checkbox'||el.tagName==='SELECT'?'change':'input';el.addEventListener(event,()=>{const value=el.type==='checkbox'?el.checked:el.id==='mass'?massFromSlider(el.value):el.type==='range'?Number(el.value):el.value;formatOutput(el);updateParameter(el.dataset.param,value);});});
document.querySelectorAll('[data-spectrum]').forEach(el=>el.addEventListener('click',()=>{updateParameter('spectrum',el.dataset.spectrum);viewportUI?.close();}));

function formatMeters(meters,significantDigits){if(!Number.isFinite(meters))return '—';const options=significantDigits?{minimumSignificantDigits:significantDigits,maximumSignificantDigits:significantDigits}:{maximumFractionDigits:2};if(Math.abs(meters)>=1e9)return `${(meters/1e9).toLocaleString(undefined,options)} million km`;if(Math.abs(meters)>=1000)return `${(meters/1000).toLocaleString(undefined,options)} km`;return `${meters.toLocaleString(undefined,options)} m`;}
function renderObserver(stats){
 const focused=!!stats.focusId,body=focused?((stats.objects||objects()).find(o=>String(o.id)===String(stats.focusId))||renderer?.getSceneTargets?.().find(o=>o.id===stats.focusId)):null;
 $('observerLabel').textContent=focused?(stats.focusMode==='onboard'?'ONBOARD VIEW':(state.bridge?'LOCAL CHART OFFSET':'DISTANCE TO OBJECT')):(state.bridge?'ISOTROPIC CHART POSITION':'OBSERVER DISTANCE');
 $('focusBanner').hidden=true;$('distanceForm').hidden=focused||state.bridge||!state.blackHole;$('focusCameraHint').hidden=!focused;$('releaseFocusToolbar').hidden=!focused;$('releaseFocusEditor').hidden=!focused;$('nearHorizon').hidden=focused||!state.blackHole;
 $('nearHorizon').disabled=focused||state.binary||!state.blackHole;
 $('focusBannerText').textContent=focused?`${stats.focusMode==='onboard'?'On board':'Following'} · ${body?.label||stats.focusLabel||'Object'}`:'';
 $('focusCameraHint').textContent=stats.focusMode==='onboard'?'Look 360° · drag to explore':'Following object · drag to orbit · scroll to zoom';
 $('bridgeRegion').hidden=!state.bridge;$('bridgeRegion').textContent=state.bridge?`BRIDGE · ${String(stats.bridgeRegion||'near side').replace(/[-_]/g,' ').toUpperCase()}`:'';
 $('warpMotionReadout').hidden=!state.warp||state.warpScenario!=='isolated';$('warpMotionReadout').textContent=`Visual travel: ${formatMeters(stats.warpTravelMeters||0)} · ${formatMeters(stats.paused?0:(stats.warpSpeedMetersPerSecond||0)*(stats.speed??1))}/s.`;
 $('lookCenter').textContent=focused?(stats.focusMode==='onboard'?'Forward':'At object'):'Inward';$('lookTangent').textContent='In plane';$('lookOutward').textContent=focused?'Look back':'Outward';
 if(focused){$('distance').textContent=stats.focusMode==='onboard'?'360°':formatMeters(stats.cameraDistanceMeters,2);$('distanceUnit').textContent='';$('physicalDistance').textContent=body?`${body.label} · ${state.bridge?'local chart scale':'physical scale'}`:'';return;}
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
 const context=objectContext(),tree=renderer?.getObjectTree?.()||[],picker=$('addParent'),previousParent=picker.value||'space';
 const parents=tree.filter(n=>n.canAdd),parentSignature=JSON.stringify(parents.map(n=>[n.id,n.label]));if(picker.dataset.options!==parentSignature){picker.dataset.options=parentSignature;picker.innerHTML=parents.map(n=>`<option value="${n.id}">${escapeHtml(n.label)}</option>`).join('');picker.value=parents.some(n=>n.id===previousParent)?previousParent:'space';}
 const parentId=picker.value||'space',allowed=state.bridge?(context.allowedTypes||[]):renderer?.allowedChildTypes?.(parentId)||context.allowedTypes||OBJECT_TYPES.map(o=>o.id),signature=allowed.join(','),typePicker=$('objectType'),previous=typePicker.value;
 if(typePicker.dataset.allowed!==signature){typePicker.dataset.allowed=signature;typePicker.innerHTML=allowed.map(id=>`<option value="${id}">${escapeHtml(OBJECT_TYPES.find(o=>o.id===id)?.label||({blackhole:'Black hole',disk:'Accretion disc',jets:'Polar jets',ring:'Planetary rings',belt:'Asteroid belt'}[id]||id))}</option>`).join('');if(allowed.includes(previous))typePicker.value=previous;updateObjectPreview();}
 const parent=tree.find(n=>n.id===parentId),blackHoleParent=['primary','secondary'].includes(parentId);
 $('addOrbitPlacement').hidden=!blackHoleParent;$('addParent').disabled=!!state.bridge;
 $('addPlacementContext').textContent=state.bridge?'Choose the bridge traveler. Its route and viewpoint are retained.':parentId==='space'?'Add an independent body to Space. Then add smaller children from its tree row.':`Add a child of ${parent?.label||parentId}. Its orbit follows that parent.`;
 $('addObject').textContent=state.bridge?'Use as traveler':'+ Add to scene';return context;
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
$('addParent').addEventListener('change',refreshObjectContext);

function syncRendererState(){const current=renderer?.getState?.();if(current){for(const key of Object.keys(DEFAULTS))if(key in current)state[key]=current[key];lastStats=current;}updateMetrics();return current;}
function exploreWarp(){
 if(!renderer){toast('Graphics are starting. Try again in a moment.');return;}
 const object=renderer.exploreWarp?.();if(!object){toast('Select an Enterprise in an orbital or open-space scene to enable its warp drive.');return;}
 selectedObjectId=object.id;syncRendererState();markCustom();renderObjectManager();viewportUI?.select(object.id);toast('Enterprise ready. Its warp drive, size, placement, and viewpoints are in this panel.');
}
let parentEligibilityCache={key:'',options:[]};
function setObjectFieldHidden(id,hidden){const input=$(id),label=document.querySelector(`label[for="${id}"]`);if(input)input.hidden=hidden;if(label)label.hidden=hidden;}
function renderObjectManager(snapshot=renderer?.getState?.()||{}){
 const items=snapshot.objects||objects(),context=refreshObjectContext();
 if(snapshot.warp!==undefined&&state.warp!==snapshot.warp){state.warp=snapshot.warp;updateMetrics();}
 if(snapshot.selectedId!==undefined&&snapshot.selectedId!==null)selectedObjectId=snapshot.selectedId;
 if(!items.some(o=>String(o.id)===String(selectedObjectId)))selectedObjectId=items[0]?.id??null;
 const selected=items.find(o=>String(o.id)===String(selectedObjectId));anomalyUI?.update(selected);
 const rosterItems=viewportUI?items.filter((o,i)=>i<12||String(o.id)===String(selectedObjectId)):items;
 const signature=JSON.stringify(rosterItems.map(o=>[o.id,o.type,o.scale,String(o.id)===String(selectedObjectId),o.focused]));
 if(signature!==rosterSignature){rosterSignature=signature;$('objectRoster').innerHTML=rosterItems.map((o,i)=>`<div class="object-roster-row ${String(o.id)===String(selectedObjectId)?'selected':''}"><button data-select-object="${o.id}" aria-pressed="${String(o.id)===String(selectedObjectId)}"><span class="roster-icon"><svg viewBox="0 0 120 80" aria-hidden="true">${objectSilhouettes[o.type]||objectSilhouettes.probe}</svg></span><span><strong>${escapeHtml(o.label||o.type)}</strong><small>${String(i+1).padStart(2,'0')} · ${o.focused?'Following':`${Number(o.scale).toFixed(2)}× size`}</small></span><b>›</b></button><button class="roster-delete" data-remove-object="${o.id}" aria-label="Delete ${escapeHtml(o.label||o.type)}" title="Delete this object">×</button></div>`).join('');}
 $('objectCount').textContent=items.length;$('objectEmpty').hidden=items.length>0;$('objectEditor').hidden=!selected;$('addObject').disabled=items.length>=(snapshot.maxObjects||10)&&context.kind!=='bridge';$('clearObjects').disabled=!items.length;
 if(selected){
  const opacitySupported=['star','planet','moon','probe','enterprise','shuttle','iss','astronaut','heighliner','dyson'].includes(selected.type)&&!renderer?.getStellarInfo?.(selected.id)?.collapsed,geometry=state.spectrum==='geometry',tzo=selected.type==='star'&&selected.starStyle==='tzo';
  $('dysonProperties').hidden=selected.type!=='dyson';
  if(selected.type==='dyson'){const radius=selected.renderRadiusMeters||149597870700;if(document.activeElement!==$('dysonRadius'))$('dysonRadius').value=Math.log10(radius/149597870700);if(document.activeElement!==$('dysonRadiusMeters'))$('dysonRadiusMeters').value=radius;$('dysonRadiusValue').textContent=(radius/149597870700).toLocaleString(undefined,{maximumSignificantDigits:3})+' AU';if(document.activeElement!==$('dysonCutaway'))$('dysonCutaway').value=selected.dysonCutaway??0;$('dysonCutawayValue').textContent=Math.round((selected.dysonCutaway??0)*100)+'%';rangeFill($('dysonRadius'));rangeFill($('dysonCutaway'));}
  $('objectOpacity').hidden=!opacitySupported;$('editOpacity').disabled=geometry;
  $('editOpacityLabel').textContent=tzo?'Envelope opacity':'Opacity';
  $('editOpacityNote').textContent=geometry?'Geometry shows solid gray bodies. Switch Display to a spectral view to edit opacity.':tzo?'Illustrative cutaway: the centered neutron core is enlarged to be visible. Total mass and physical dimensions stay unchanged.':'Reveal objects behind this surface. Mass and physical dimensions stay unchanged.';
  if(document.activeElement!==$('editOpacity')){const opacity=geometry?1:selected.opacity??1;$('editOpacity').value=opacity;$('editOpacityValue').textContent=Math.round(opacity*100)+'%';rangeFill($('editOpacity'));}
  $('selectedObjectName').textContent=selected.label||selected.type;$('objectDataNote').textContent=selected.dataNote||'';$('objectDataNote').hidden=!selected.dataNote;
  const tree=renderer?.getObjectTree?.()||[],eligibilityKey=selected.id+'|'+selected.type+'|'+tree.map(n=>n.id+':'+n.parentId+':'+n.type).join(',');if(parentEligibilityCache.key!==eligibilityKey)parentEligibilityCache={key:eligibilityKey,options:tree.filter(n=>n.id!==selected.id&&(renderer?.canParentObject?.(selected.type,n.id,selected.id)?.ok??n.canAdd))};const eligible=parentEligibilityCache.options;
  const parentSig=JSON.stringify(eligible.map(n=>[n.id,n.label]));if($('editParent').dataset.options!==parentSig){$('editParent').dataset.options=parentSig;$('editParent').innerHTML=eligible.map(n=>`<option value="${n.id}">${escapeHtml(n.label)}</option>`).join('');}
  const scalarFields={editName:selected.name||selected.label||selected.type,editParent:selected.parentId||'space',editOrbitMeters:selected.orbitMeters||1e8,editBodyColor:selected.surfaceId>0?(selected.surfaceTint||'#ffffff'):selected.color||(selected.type==='star'?'#ff9e40':'#0f4791'),editRadiusMeters:selected.radiusMeters||selected.lengthMeters/2,editMassSolar:selected.massSolar??(selected.type==='star'?1:selected.type==='planet'?3.00349e-6:selected.type==='moon'?3.694e-8:5e-26),editSpots:selected.spots??.35,editCorona:selected.corona??.35,editRotation:selected.rotation??1,editSurfaceProfile:selected.surfaceId||0,editMaterial:selected.material||'rocky',editInnerRadius:selected.innerRadiusRatio??.55,editThickness:selected.thicknessRatio??.015};for(const [id,value] of Object.entries(scalarFields))if(document.activeElement!==$(id))$(id).value=value;
  const styles=selected.type==='star'?[['main','Main-sequence star'],['redgiant','Red giant'],['dwarf','White dwarf'],['neutron','Neutron star']]:[['rocky','Rocky world'],['gas','Gas giant'],['ice','Ice world'],['ocean','Ocean world']];
  if($('editBodyStyle').dataset.kind!==selected.type){$('editBodyStyle').dataset.kind=selected.type;$('editBodyStyle').innerHTML=styles.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');}$('editBodyStyle').value=selected.starStyle||selected.planetStyle||styles[0][0];
  if(document.activeElement!==$('editNestedPhase')){$('editNestedPhase').value=((selected.phase*180/Math.PI)%360+360)%360;$('editNestedPhaseValue').textContent=Math.round(Number($('editNestedPhase').value))+'°';rangeFill($('editNestedPhase'));}
  $('editBodyColorLabel').textContent=selected.surfaceId>0?'Tint · white is neutral':'Color';
  $('surfaceProfileField').hidden=!['planet','moon'].includes(selected.type);$('editBodyStyle').disabled=!!selected.surfaceId;
  const compact=['blackhole','whitehole'].includes(selected.type),physicalOrbit=Number.isFinite(selected.orbitMeters)&&selected.orbitMeters>0&&selected.parentId!=='space';
  $('bodyAppearance').hidden=!['star','planet','moon','ring','belt','blackhole','whitehole'].includes(selected.type);setObjectFieldHidden('editBodyStyle',!['star','planet','moon'].includes(selected.type));setObjectFieldHidden('editRadiusMeters',compact);setObjectFieldHidden('editRotation',compact);setObjectFieldHidden('editMassSolar',false);$('editBodyColor').closest('label').hidden=compact;$('stellarAppearance').hidden=selected.type!=='star';$('ringAppearance').hidden=!['ring','belt'].includes(selected.type);$('physicalOrbitProperties').hidden=selected.type==='dyson'||(!physicalOrbit&&['space','primary','secondary'].includes(selected.parentId||'space'))||!!selected.bridgeTraveler;
  $('editScale').hidden=compact;const scaleHeader=document.querySelector('label[for="editScale"]')?.closest('.range-header');if(scaleHeader)scaleHeader.hidden=compact;
  $('freeDriveObject').hidden=!['enterprise','shuttle'].includes(selected.type)||!!selected.bridgeTraveler;$('freeDriveNote').hidden=$('freeDriveObject').hidden;$('freeDriveObject').textContent=selected.freeDrive?'Return to orbit':'Drive';

  const length=Number(selected.lengthMeters);$('objectDimensions').textContent=compact?`Event-horizon radius: ${formatMeters(selected.renderRadiusMeters||length/2)} · set by mass`:`Physical length / span: ${formatMeters(length)}`;
  const radiusFloor=renderer?.minimumObjectRadiusRg?.(selected)??2.2;$('editRadius').min=String(radiusFloor);$('editRadius').step='any';
  const fields=[['editScale',selected.scale,`${Number(selected.scale).toFixed(2)}×`],['editRadius',selected.radius,`${Number(selected.radius).toFixed(2)} r_g`],['editHeight',selected.height??0,`${Number(selected.height??0).toFixed(2)} r_g`],['editPhase',((selected.phase*180/Math.PI)%360+360)%360,`${(((selected.phase*180/Math.PI)%360+360)%360).toFixed(0)}°`]];
  for(const [id,value,label] of fields){if(document.activeElement!==$(id)){$(id).value=value;$(`${id}Value`).textContent=label;rangeFill($(id));}}
  $('trackObject').setAttribute('aria-pressed',String(String(snapshot.focusId)===String(selected.id)&&snapshot.focusMode==='track'));$('onboardObject').setAttribute('aria-pressed',String(String(snapshot.focusId)===String(selected.id)&&snapshot.focusMode==='onboard'));
  const bridgeShip=selected.bridgeTraveler||(state.bridge&&String(snapshot.bridgeObjectId)===String(selected.id)),local=selected.placement==='local'&&(!selected.parentId||selected.parentId==='space');
  $('orbitalPlacement').hidden=selected.type==='dyson'||local||bridgeShip||!['primary','secondary'].includes(selected.parentId||'primary');$('localPlacement').hidden=!local;$('bridgeTravelerProperties').hidden=!bridgeShip;
  for(const id of ['editRadius','editPhase']){const header=document.querySelector(`label[for="${id}"]`)?.closest('.range-header');$(id).hidden=physicalOrbit;if(header)header.hidden=physicalOrbit;}$('editPhaseNote').hidden=physicalOrbit;
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
  if(state.blackHole&&!local&&!bridgeShip){$('editMotionNote').textContent+=' Distance includes radius and height. Near-horizon paths are prescribed; circular motion there is not a stable orbit.';}
  $('editRadius').disabled=guided||isolated||bridgeShip||motion==='horizon';$('editHeight').disabled=guided||isolated||bridgeShip||motion==='horizon';$('editPhase').disabled=guided||bridgeShip;$('editPhaseLabel').textContent=isolated?'Heading':'Current orbital phase';$('editPhaseNote').textContent=bridgeShip?'Bridge properties control the traveler and the crossing. Turn Animate traversal off to pause its path.':isolated?'Heading turns the ship and its direction of travel. Pause time for precise placement.':guided?'This route sets the direction and timing of the encounter. Choose an orbital route to edit its phase.':'Phase moves the object around its orbit immediately. Pause time for precise placement.';
  $('objectCameraNote').textContent=selected.type==='dyson'?'Explore interior enters the hollow habitat. Drag to look around; the cutaway opens toward one side, and setting it to zero closes the shell.':selected.type==='shuttle'?'Ride looks around from the shuttle; Chase follows from behind. Zoom out to track without changing your heading.':bridgeShip?'This traveler follows the bridge’s route. Physical size and cameras remain editable; Bridge properties let you change the traveler.':isolated?'The ship travels with its field. Size and heading remain editable; choose an orbital route to change its distance from a black hole.':guided?'This ship follows the approach-and-return path. Size and cameras remain editable; choose Orbit a black hole to edit its orbit.':'Track to orbit around this object. On board lets you look in every direction while it moves.';
 }
 stellarUI?.update(selected?.id);
 if(['blackhole','whitehole'].includes(selected?.type))for(const id of ['editRadiusMeters','editRotation','editBodyStyle'])setObjectFieldHidden(id,true);
 if(renderer){renderObserver(snapshot);if(snapshot.viewMode&&snapshot.viewMode!==state.viewMode)syncViewMode(snapshot.viewMode);}viewportUI?.refresh(snapshot);
 pilotUI?.update();
}
$('objectRoster').addEventListener('click',e=>{const remove=e.target.closest('[data-remove-object]'),choose=e.target.closest('[data-select-object]');if(remove){const item=objects().find(o=>String(o.id)===remove.dataset.removeObject);if(item){(renderer.removeTreeObject||renderer.removeObject).call(renderer,item.id);markCustom();renderObjectManager();}}else if(choose)selectObject(choose.dataset.selectObject);});
for(const [id,key,unit] of [['editScale','scale','×'],['editRadius','radius',' r_g'],['editHeight','height',' r_g'],['editPhase','phase','°']])$(id).addEventListener('input',()=>{const item=selectedObject();if(!item)return;const number=Number($(id).value);$(`${id}Value`).textContent=number.toFixed(id==='editPhase'?0:2)+unit;rangeFill($(id));renderer.updateObject(item.id,{[key]:key==='phase'?number*Math.PI/180:number});markCustom();renderObjectManager();});
for(const key of ['x','y','z'])$('edit'+key.toUpperCase()).addEventListener('change',event=>{const item=selectedObject(),value=Number(event.target.value);if(!item||!Number.isFinite(value))return;renderer.updateObject(item.id,{[key]:value});markCustom();renderObjectManager();});
$('dysonRadius').addEventListener('input',()=>{const item=selectedObject();if(item?.type!=='dyson')return;renderer.updateObject(item.id,{radiusMeters:149597870700*10**Number($('dysonRadius').value),scale:1});markCustom();renderObjectManager();});
$('dysonRadiusMeters').addEventListener('change',()=>{const item=selectedObject(),value=Number($('dysonRadiusMeters').value);if(item?.type!=='dyson'||!(value>0))return;renderer.updateObject(item.id,{radiusMeters:value,scale:1});markCustom();renderObjectManager();});
$('dysonCutaway').addEventListener('input',()=>{const item=selectedObject();if(item?.type!=='dyson')return;renderer.updateObject(item.id,{dysonCutaway:Number($('dysonCutaway').value)});markCustom();renderObjectManager();});
$('dysonInterior').addEventListener('click',()=>{const item=selectedObject();if(item?.type!=='dyson')return;renderer.focusTarget(item.id,'onboard',false,true);syncViewMode('look');renderObjectManager();document.getElementById('inspectorRide')?.click();});
$('editOpacity').addEventListener('input',event=>{const item=selectedObject();if(!item||state.spectrum==='geometry')return;const opacity=Math.max(0,Math.min(1,Number(event.target.value)));if(!Number.isFinite(opacity))return;renderer.updateObject(item.id,{opacity});$('editOpacityValue').textContent=Math.round(opacity*100)+'%';rangeFill(event.target);markCustom();});
$('editMotion').addEventListener('change',event=>{const item=selectedObject();if(!item)return;renderer.updateObject(item.id,{motion:event.target.value});markCustom();renderObjectManager();});
$('editLuminosity').addEventListener('input',event=>{const item=selectedObject();if(!item||item.type!=='probe')return;const logLuminosity=Number(event.target.value);renderer.updateObject(item.id,{logLuminosity});$('editLuminosityValue').textContent=formatLuminosity(logLuminosity);rangeFill(event.target);markCustom();});
$('editHeading').addEventListener('input',event=>{const item=selectedObject();if(!item)return;renderer.updateObject(item.id,{phase:Number(event.target.value)*Math.PI/180});$('editHeadingValue').textContent=event.target.value+'°';rangeFill(event.target);markCustom();renderObjectManager();});
$('objectWarpEnabled').addEventListener('change',event=>{const item=selectedObject();if(!item)return;renderer.setObjectWarp?.(item.id,event.target.checked);syncRendererState();markCustom();renderObjectManager();});
$('editObjectWarp').addEventListener('click',()=>{const item=selectedObject();if(!item)return;renderer.setObjectWarp?.(item.id,true);syncRendererState();markCustom();renderObjectManager();viewportUI?.select('warp');});
$('bridgeTravelerType').addEventListener('change',event=>{const item=renderer?.setBridgeTraveler?.(event.target.value);if(item){selectedObjectId=item.id;syncRendererState();markCustom();renderObjectManager();viewportUI?.refresh(renderer.getState());}});
$('deleteObject').addEventListener('click',()=>{const item=selectedObject();if(item){(renderer.removeTreeObject||renderer.removeObject).call(renderer,item.id);markCustom();renderObjectManager();toast(`${item.label||'Object'} removed.`);}});
for(const [id,mode] of [['trackObject','track'],['onboardObject','onboard']])$(id).addEventListener('click',()=>{const item=selectedObject();if(!item)return;renderer.focusObject(item.id,mode);syncViewMode(mode==='onboard'?'look':'orbit');renderObjectManager();renderObserver(renderer.getState());toast(mode==='onboard'?'On board. Drag to look around in every direction.':'Following this object. Drag to orbit it, and scroll or pinch to zoom.');});
function returnToOverview(){if(!renderer)return;renderer.releaseFocus(true);lastStats=renderer.getState();syncViewMode(lastStats.viewMode||'orbit');renderObjectManager();renderObserver(lastStats);toast('Returned to your previous orbiting view.');}
for(const id of ['releaseFocus','releaseFocusToolbar','releaseFocusEditor'])$(id).addEventListener('click',returnToOverview);
function syncViewMode(mode){state.viewMode=mode;$('orbitMode').setAttribute('aria-pressed',String(mode==='orbit'));$('lookMode').setAttribute('aria-pressed',String(mode==='look'));$('touchHint').innerHTML=mode==='free'?'Drag to look <b>·</b> Pinch to move forward / back':mode==='look'?'Drag to look in 360° <b>·</b> Pinch to zoom':'Drag to orbit <b>·</b> Pinch to zoom';$('desktopHint').innerHTML=mode==='free'?'Drag to look <b>·</b> Scroll or W / S to travel':mode==='look'?'Drag to look in 360° <b>·</b> Scroll to zoom':'Drag to orbit <b>·</b> Middle-drag to look <b>·</b> Scroll to zoom';}
function handleStats(stats){
 const diagnostic=stats.diagnostics;if(diagnostic&&$('renderDiagnostics')){const isLoading=stats.sceneLoadState==='loading';$('renderDiagnostics').textContent=[diagnostic.backend,diagnostic.phase,`Last frame ${Number.isFinite(diagnostic.frameAgeMs)?(diagnostic.frameAgeMs/1000).toFixed(1)+'s ago':'pending'}`,isLoading?`${(diagnostic.loadElapsedMs/1000).toFixed(1)} / ${Math.round(diagnostic.deadlineMs/1000)}s load deadline`:'',diagnostic.detail,diagnostic.error].filter(Boolean).join(' · ');}
 // Old frames cannot dismiss the loader for a newer scene choice.
 if(Number.isFinite(stats.sceneLoadRevision)&&stats.sceneLoadRevision<latestSceneRevision)return;
 if(Number.isFinite(stats.sceneLoadRevision))latestSceneRevision=stats.sceneLoadRevision;
 if(pendingScene&&(pendingScene.phase==='paint'||(Number.isFinite(pendingScene.revision)&&Number.isFinite(stats.sceneLoadRevision)&&stats.sceneLoadRevision<pendingScene.revision)))return;
 lastStats=stats;lastStatsAt=performance.now();
 if(stats.sceneLoadState==='failed'){pendingScene=null;const error=stats.sceneLoadError||'This scene could not finish loading. Retry, or choose another scene.';if(lastRendererError!==error)handleError(error);}
 else if(pendingScene&&(stats.sceneLoadState==='ready'||(!stats.sceneLoadState&&stats.renderReady)))pendingScene=null;
 const signal=[stats.renderBusy,stats.shaderCompiling,stats.renderReady,stats.cpu,stats.vrActive,stats.focusId,stats.focusMode,stats.selectedId,stats.objectCount,stats.effectiveQuality,stats.sceneLoadState,stats.sceneLoadRevision,stats.sceneLoadError].join('|');
 annotationsUI?.setStatus(stats);pilotUI?.update();
 if(lastStatsAt-lastStatsPaint<250&&signal===lastStatsSignal)return;lastStatsPaint=lastStatsAt;lastStatsSignal=signal;
 loadingIndicator.update(!lastRendererError&&$('cpuFallbackPrompt').hidden&&!!(pendingScene||stats.sceneLoadState==='loading'||stats.renderBusy||stats.shaderCompiling||!(stats.renderReady??renderer?.ready)),loadingSceneTitle(),false,{revision:stats.sceneLoadRevision,elapsedMs:diagnostic?.loadElapsedMs||0,suspended:diagnostic?.suspended});$('renderError').hidden=!lastRendererError;
 updateQualityStatus(stats);syncPlaybackNote(stats);
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
 ++mutationSerial;
 const requestedScene=pendingScene?.id,generation=++rendererGeneration;++sceneRequestSerial;pendingScene=null;latestSceneRevision=0;
 try{
  const previous=renderer,preserved=previous?snapshotRenderer(previous):null;previous?.dispose();handleError(null);$('cpuFallbackPrompt').hidden=true;loadingIndicator.update(true,loadingSceneTitle(),true);
  // Each backend needs its own canvas; a transferred OffscreenCanvas cannot be reused.
  if(previous){const fresh=$('universe').cloneNode(false);$('universe').replaceWith(fresh);}
  renderer=createRenderHost($('universe'),{onStats:stats=>{if(generation===rendererGeneration)handleStats(stats);},onFrame:frame=>{if(generation===rendererGeneration)annotationsUI?.update(frame);},onError:error=>{if(generation===rendererGeneration)handleError(error);},onCanvasChanged:()=>viewportUI?.rendererChanged()},{cpu,presentationPaused:!!document.querySelector('dialog[open]')});
  if(preserved){
   // Retry and explicit CPU opt-in keep the latest scene, camera, and objects,
   // including edits made while the previous backend was still starting.
   preserved.quality=cpu?'cpu':$('quality').value;restoreRenderer(renderer,preserved);
   for(const key of Object.keys(DEFAULTS))if(key in preserved.state)state[key]=preserved.state[key];
   selectedObjectId=preserved.selectedId??selectedObjectId;
  }else{renderer.loadScene(activePreset);renderer.update(state);}
  renderer.setQuality($('quality').value);$('quality').disabled=false;
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
 ++mutationSerial;
 const p=SCENE_PRESETS.find(p=>p.id===id)||SCENE_PRESETS[0],token=++sceneRequestSerial;
 pendingScene={id:p.id,token,phase:'paint',revision:null};activePreset=p.id;
 handleError(null);loadingIndicator.update(true,p.title,true);
 if($('atlasDialog').open)$('atlasDialog').close();viewportUI?.close();
 // This cheap host signal invalidates old work before the first paint. The
 // synchronous compatibility path begins only after the loader has been painted.
 try{renderer?.requestSceneLoad?.();pendingScene.revision=renderer?.getState().sceneLoadRevision;latestSceneRevision=pendingScene.revision??latestSceneRevision;}
 catch(error){pendingScene=null;handleError(error.message||'This scene could not start loading.');return;}
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 if(token!==sceneRequestSerial)return;
 try{
  pendingScene.phase='loading';custom=false;state=makePreset(p.id);state.paused=true;
  if(renderer){const current=renderer.loadScene(p.id);for(const key of Object.keys(DEFAULTS))if(key in current)state[key]=current[key];state.paused=true;renderer.update({paused:state.paused});lastStats=renderer.getState();}
  selectedObjectId=null;rosterSignature='';syncControls();renderObjectManager();
  $('currentScene').textContent=p.title;$('sceneNumber').textContent=`${p.number} / ${p.title.toUpperCase()}`;$('sceneTitle').textContent=p.title;$('sceneSubtitle').textContent=p.subtitle;
  document.querySelectorAll('[data-scene]').forEach(el=>{const selected=el.dataset.scene===p.id;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));});setFeature(state.warp?'warp':p.objects?.length?'objects':'scene');viewportUI?.sceneChanged();
  if(renderer)handleStats(renderer.getState());
 }catch(error){if(token===sceneRequestSerial){pendingScene=null;handleError(error.message||'This scene could not load. Retry, or choose another scene.');}}
}
async function loadSceneSnapshot(snapshot,fileName){
 if(!renderer)throw new Error('The renderer is still starting.');
 if(renderer.getState().photoActive)throw new Error('Finish or cancel Picture studio before loading a scene.');
 ++mutationSerial;const token=++sceneRequestSerial,generation=rendererGeneration;
 const title=String(fileName||'Saved scene').replace(/\.ya?ml$/i,'');
 pendingScene={id:snapshot.sceneId,title,token,phase:'paint',revision:null};
 handleError(null);loadingIndicator.update(true,title,true);
 if($('atlasDialog').open)$('atlasDialog').close();viewportUI?.close();
 renderer.requestSceneLoad?.();pendingScene.revision=renderer.getState().sceneLoadRevision;latestSceneRevision=pendingScene.revision??latestSceneRevision;
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 if(token!==sceneRequestSerial||generation!==rendererGeneration)return false;
 try{
  pendingScene.phase='loading';snapshot.state.paused=true;
  renderer.loadSnapshot(snapshot);activePreset=snapshot.sceneId||'empty-space';custom=true;
  syncRendererState();selectedObjectId=snapshot.selectedId??null;rosterSignature='';
  if(!renderer.cpu)$('quality').value=renderer.quality;
  syncControls();renderObjectManager();
  $('currentScene').textContent=title;$('sceneNumber').textContent='SAVED SCENE';$('sceneTitle').textContent=title;$('sceneSubtitle').textContent='Your saved objects, environment, and viewpoint. Press Play to continue.';
  document.querySelectorAll('[data-scene]').forEach(el=>{el.classList.remove('selected');el.setAttribute('aria-pressed','false');});
  viewportUI?.sceneChanged();handleStats(renderer.getState());showObservatory();return true;
 }catch(error){pendingScene=null;handleError(error.message||'This scene could not load.');throw error;}
}
document.querySelectorAll('[data-scene]').forEach(el=>el.addEventListener('click',()=>{applyPreset(el.dataset.scene);showObservatory();}));
function setPaused(value){state.paused=value;renderer?.update({paused:value});$('playPause').innerHTML=icon(value?'play':'pause');$('playPause').setAttribute('aria-label',value?'Resume simulation':'Pause simulation');$('playPause').title=value?'Resume simulation':'Pause simulation';$('motionState').textContent=value?'TIME IS PAUSED':'TIME IS FLOWING';pilotUI?.update();viewportUI?.refresh(renderer?.getState());}
$('playPause').addEventListener('click',()=>setPaused(!state.paused));$('speed').addEventListener('change',e=>{state.speed=Number(e.target.value);renderer?.update({speed:state.speed});syncPlaybackNote();});for(const id of ['gridShortcut','allGridToggle'])$(id).addEventListener('click',()=>updateParameter('grid',!state.grid));
$('zoomIn').addEventListener('click',()=>renderer?.zoom(.8));$('zoomOut').addEventListener('click',()=>renderer?.zoom(1.25));$('resetCamera').addEventListener('click',()=>{renderer?.resetCamera();lastStats=renderer?.getState();syncViewMode(lastStats?.viewMode||'orbit');renderObjectManager();toast('Restored this scene’s starting view.');});
[['orbitMode','orbit'],['lookMode','look']].forEach(([id,mode])=>$(id).addEventListener('click',()=>{renderer?.setViewMode(mode);syncViewMode(mode);}));[['lookCenter','center'],['lookOutward','outward']].forEach(([id,direction])=>$(id).addEventListener('click',()=>{renderer?.setViewMode('look');renderer?.look(direction);syncViewMode('look');}));
[['lookTangent','in-plane'],['lookAbove','above-plane']].forEach(([id,preset])=>$(id).addEventListener('click',()=>{renderer?.setCameraPreset?.(preset);syncViewMode(renderer?.getState?.().viewMode||state.viewMode);}));
$('distanceForm').addEventListener('submit',e=>{e.preventDefault();const value=Number($('distanceInput').value);if(!Number.isFinite(value)||value<=0)return;renderer?.setDistanceRg(Math.max(horizonRg(state.spin)*1.013,value));});$('nearHorizon').addEventListener('click',()=>{if(state.binary)return;renderer?.setDistanceRg(horizonRg(state.spin)*1.08);renderer?.look('outward');renderer?.setViewMode('look');syncViewMode('look');toast('Just outside the horizon, looking out. Drag to explore the sky.');});
const qualityNotes={low:'Fixed Low quality. Select Adaptive to let the mode change with frame rate.',medium:'Fixed Medium quality. Select Adaptive to let the mode change with frame rate.',high:'Fixed High quality. Select Adaptive to let the mode change with frame rate.',ultra:'Maximum live detail, even at low FPS. Use Picture studio for a still image.',adaptive:'Targets 15–30 FPS, reducing resolution when needed and testing higher tiers above 30 FPS.'};
const qualityName=value=>({low:'Low',medium:'Medium',high:'High',ultra:'Ultra'}[value]||'Low');
function updateQualityStatus(stats={}){
 if($('bridgePhaseNote'))$('bridgePhaseNote').textContent=stats.bridge?stats.bridgePhase||'':'';
 const fps=Number.isFinite(stats.fps)?`${Math.round(stats.fps)} FPS`:'— FPS';$('fpsCorner').textContent=fps;$('fps').textContent=fps;
 const backend=stats.cpu||stats.gpuUnavailable?'GPU OFF':'GPU ON';$('backendStatus').textContent=backend;$('backendStatus').classList.toggle('is-cpu',!!stats.cpu);$('quality').disabled=false;
 const selected=$('quality').value,effective=qualityName(stats.effectiveQuality||(selected==='adaptive'?'low':selected));
 const mode=selected==='adaptive'?`Adaptive · ${effective}`:`Manual · ${effective}`;
 if($('effectiveQuality').textContent!==mode)$('effectiveQuality').textContent=mode;
 if(Number.isFinite(stats.fps))$('fps').textContent=`${Math.round(stats.fps)} FPS`;
 $('performanceControls').classList.toggle('is-adjusting',selected==='adaptive'&&stats.adaptiveStatus==='limited');
 $('gpuLabel').textContent=selected==='adaptive'?'ADAPTIVE':'MANUAL';$('qualityTier').textContent=effective.toUpperCase();
 $('renderStatus').setAttribute('aria-label',`${mode}, ${fps}, ${backend}`);
 let message=qualityNotes[selected];
 if(stats.cpu){
  message=selected==='adaptive'?`CPU preview · ${effective}. Simplifies geometry to target 15–30 FPS, and checks higher modes when there is room.`:`CPU preview · ${effective}. Resolution and scene detail use a separate CPU budget. GPU graphics provide much better image quality.`;
  if($('qualityNote').textContent!==message)$('qualityNote').textContent=message;return;
 }
 if(stats.shaderCompiling)message='Preparing the selected graphics. Your current view stays in place.';
 else if(selected==='adaptive'){
  const messages={warming:'Measuring completed frames, then checking higher tiers.',probing:`Trying ${effective}. Adaptive keeps it at 15 FPS or above.`,stable:effective==='High'?'Highest automatic tier. Adaptive steps down below 15 FPS.':`Using ${effective}. Higher tiers are tested with headroom above 30 FPS.`,limited:`Using ${effective} to recover from a drop below 15 FPS.`};
  message=messages[stats.adaptiveStatus]||qualityNotes.adaptive;
  if(stats.qualityReduced)message+=` Low is using a coarser image${Number.isFinite(stats.width)&&Number.isFinite(stats.height)?' ('+stats.width+' × '+stats.height+')':''}; resolution recovers before the next tier.`;
 }
 if(stats.surfaceWarning)message+=' Surface maps are unavailable; procedural surfaces remain active.';else if(stats.surfaceRefining)message+=' Refining nearby surfaces.';
 if($('qualityNote').textContent!==message)$('qualityNote').textContent=message;
}
$('quality').addEventListener('change',e=>{renderer?.setQuality(e.target.value);updateQualityStatus(renderer?.getState());});
$('orbitRadius').addEventListener('input',e=>{$('radiusValue').textContent=`${e.target.value} r_g`;rangeFill(e.target);});$('orbitPhase').addEventListener('input',e=>{$('phaseValue').textContent=`${e.target.value}°`;rangeFill(e.target);});
$('showAddObject').addEventListener('click',()=>{$('addObjectPanel').open=true;$('addObjectPanel').scrollIntoView({behavior:reducedMotion()?'instant':'smooth',block:'nearest'});$('objectType').focus({preventScroll:true});});
$('addObject').addEventListener('click',()=>{const chosen={type:$('objectType').value,parentId:$('addParent').value||'space',radius:Number($('orbitRadius').value),phase:Number($('orbitPhase').value)*Math.PI/180,scale:Number($('objectScale').value)};return stageMutation('Adding object…',()=>{
 if(!renderer){toast('Graphics are starting. Try again in a moment.');return;}
 const type=chosen.type,context=objectContext(),result=context.kind==='bridge'?renderer.setBridgeTraveler?.(type):renderer.addChildObject?renderer.addChildObject(chosen.parentId,type,{radius:chosen.radius,phase:chosen.phase,scale:chosen.scale}):renderer.addObject(type,Number($('orbitRadius').value),Number($('orbitPhase').value)*Math.PI/180,Number($('objectScale').value));
 if(!result){toast(renderer.lastTreeError||'This object cannot be added here, or the device-safe scene limit has been reached.');return;}
 selectedObjectId=result.id;renderer.selectObject?.(result.id);$('addObjectPanel').open=false;syncRendererState();markCustom();renderObjectManager();viewportUI?.openElements();toast(`${OBJECT_TYPES.find(object=>object.id===type)?.label||'Object'} ${context.kind==='bridge'?'is the bridge traveler':'added'}. Select it in Objects to edit, track, or ride.`);
});});
for(const [id,key] of [['editSurfaceProfile','surfaceId'],['editName','name'],['editOrbitMeters','orbitMeters'],['editRadiusMeters','radiusMeters'],['editMassSolar','massSolar'],['editSpots','spots'],['editRotation','rotation'],['editCorona','corona'],['editMaterial','material'],['editInnerRadius','innerRadiusRatio'],['editThickness','thicknessRatio']])$(id).addEventListener('change',()=>{const item=selectedObject();if(!item)return;renderer.updateObject(item.id,{[key]:['name','color','material'].includes(key)?$(id).value:Number($(id).value)});markCustom();renderObjectManager();});
$('editBodyColor').addEventListener('change',()=>{const item=selectedObject();if(!item)return;renderer.updateObject(item.id,{[item.surfaceId>0?'surfaceTint':'color']:$('editBodyColor').value});markCustom();renderObjectManager();});
$('editNestedPhase').addEventListener('input',()=>{const item=selectedObject();if(!item)return;renderer.updateObject(item.id,{phase:Number($('editNestedPhase').value)*Math.PI/180});$('editNestedPhaseValue').textContent=$('editNestedPhase').value+'°';rangeFill($('editNestedPhase'));markCustom();});
$('editBodyStyle').addEventListener('change',()=>{const item=selectedObject(),value=$('editBodyStyle').value;if(!item)return;return stageMutation('Updating appearance…',()=>{renderer.updateObject(item.id,{[item.type==='star'?'starStyle':'planetStyle']:value});markCustom();renderObjectManager();});});
$('editParent').addEventListener('change',()=>{const item=selectedObject(),parentId=$('editParent').value;if(!item)return;return stageMutation('Moving object…',()=>{if(!renderer.reparentObject?.(item.id,parentId))toast(renderer.lastTreeError||'This parent is not permitted.');syncRendererState();markCustom();renderObjectManager();});});
$('freeDriveObject').addEventListener('click',()=>{const item=selectedObject();if(!item)return;if(item.freeDrive)renderer.setFreeDrive?.(item.id,false);else pilotUI?.start(item.id);syncRendererState();renderObjectManager();pilotUI?.update();viewportUI?.close();});
$('exactMass').addEventListener('change',()=>updateParameter('mass',Math.max(1,Math.min(1e11,Number($('exactMass').value)||1))/1e6));
$('maxMass').addEventListener('change',()=>{$('maxMass').value=Math.max(2,Math.min(1e11,Number($('maxMass').value)||1e11));if(state.mass*1e6>Number($('maxMass').value))updateParameter('mass',Number($('maxMass').value)/1e6);updateMetrics();});
$('annotationShortcut').addEventListener('click',()=>{updateParameter('annotations',!state.annotations);$('annotationShortcut').setAttribute('aria-pressed',String(!!state.annotations));});
let mutationSerial=0;
async function stageMutation(reason,operation){if(pendingScene){toast('Opening the selected scene. Try this action when its first frame is ready.');return;}const token=++mutationSerial,generation=rendererGeneration,sceneSerial=sceneRequestSerial;loadingIndicator.update(true,loadingSceneTitle(),true);try{renderer?.prepareMutation?.(reason);}catch(error){handleError(error.message||'The scene could not update.');return;}await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(token!==mutationSerial||generation!==rendererGeneration||sceneSerial!==sceneRequestSerial)return;try{return operation();}catch(error){handleError(error.message||'The scene could not update.');}finally{renderer?.finishMutation?.();if(renderer)handleStats(renderer.getState());}}
$('clearObjects').addEventListener('click',()=>{renderer?.clearObjects();selectedObjectId=null;markCustom();renderObjectManager();$('addObjectPanel').open=true;toast('Additional objects cleared.');});
$('resetAll').addEventListener('click',()=>{applyPreset('disk');$('quality').value='adaptive';renderer?.setQuality('adaptive');updateQualityStatus(renderer?.getState());$('orbitRadius').value='12';$('orbitPhase').value='0';$('objectType').value='planet';$('objectScale').value='1';updateObjectPreview();updateObjectScale();$('radiusValue').textContent='12 r_g';$('phaseValue').textContent='0°';rangeFill($('orbitRadius'));rangeFill($('orbitPhase'));$('objectCount').textContent='0';$('addObject').disabled=false;$('addObjectPanel').open=true;setFeature('scene');toast('Original starfield and accretion disc restored.');});

function pauseCoveredView(paused){renderer?.setPresentationPaused(paused);}
function openDialog(id,button){openers.set(id,button);if(!$(id).open)$(id).showModal();pauseCoveredView(true);}
function setupDialog(id,closeId){$(closeId).addEventListener('click',()=>$(id).close());$(id).addEventListener('close',()=>{pauseCoveredView(!!document.querySelector('dialog[open]'));openers.get(id)?.focus();});$(id).addEventListener('click',e=>{const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$(id).close();});}
document.querySelectorAll('[data-open-atlas]').forEach(button=>button.addEventListener('click',()=>openDialog('atlasDialog',button)));setupDialog('atlasDialog','closeAtlas');
let mathGuideReady=false,warpGuideReady=false,bridgeGuideReady=false,relativityGuideReady=false;
// A subject always has an explicit route back, including links opened from an object's properties.
document.querySelectorAll('[data-math-back]').forEach(button=>button.addEventListener('click',()=>{
 const dialog=button.closest('dialog'),hub=$('mathHubDialog'),card=hub.querySelector('[data-open-'+button.dataset.mathBack+']');
 openers.set(dialog.id,card||$('mathNav'));
 // Open the hub before closing the notebook so the scene stays presentation-paused.
 openDialog('mathHubDialog',$('mathNav'));dialog.close();hub.scrollTop=0;(card||$('closeMathHub')).focus();
}));
document.querySelectorAll('[data-open-relativity]').forEach(button=>button.addEventListener('click',()=>{openDialog('relativityDialog',button);if(!relativityGuideReady){renderRelativityGuide($('relativityContent'));relativityGuideReady=true;}}));setupDialog('relativityDialog','closeRelativity');
$('relativityContent').addEventListener('click',event=>{const sectionButton=event.target.closest?.('[data-relativity-section]');if(sectionButton){const target=$(sectionButton.dataset.relativitySection);if(target){target.open=true;requestAnimationFrame(()=>target.scrollIntoView({block:'start',behavior:reducedMotion()?'instant':'smooth'}));}return;}const jump=event.target.closest?.('[data-relativity-target]');if(!jump)return;const selectors={blackholes:'[data-open-math]',warp:'[data-open-warp]',wormholes:'[data-open-bridge]'},selector=selectors[jump.dataset.relativityTarget],button=selector&&$('mathHubDialog').querySelector(selector);if(button){$('relativityDialog').close();button.click();}});
document.querySelectorAll('[data-open-bridge]').forEach(button=>button.addEventListener('click',()=>{openDialog('bridgeDialog',button);if(!bridgeGuideReady){renderWormholeGuide($('bridgeMathContent'));bridgeGuideReady=true;}}));setupDialog('bridgeDialog','closeBridge');
document.querySelectorAll('[data-open-math]').forEach(button=>button.addEventListener('click',()=>{openDialog('mathDialog',button);if(!mathGuideReady){renderMathGuide($('mathContent'));mathGuideReady=true;}const section=button.dataset.section;if(!section)return;const target=$(section);if(target){target.open=true;requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));}}));setupDialog('mathDialog','closeMath');
document.querySelectorAll('[data-open-warp]').forEach(button=>button.addEventListener('click',()=>{openDialog('warpDialog',button);if(!warpGuideReady){renderWarpGuide($('warpMathContent'));warpGuideReady=true;}}));setupDialog('warpDialog','closeWarp');
document.querySelectorAll('[data-open-help]').forEach(button=>button.addEventListener('click',()=>openDialog('helpDialog',button)));setupDialog('helpDialog','closeHelp');$('helpScenes').addEventListener('click',()=>{$('helpDialog').close();openDialog('atlasDialog',$('currentScene').closest('button'));});
$('fullscreen').addEventListener('click',()=>{const expanded=$('scene').classList.toggle('pseudo-fullscreen');$('fullscreen').setAttribute('aria-label',expanded?'Exit expanded view':'Expand observatory');renderer?.resize();});
document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit expanded view':'Expand observatory');renderer?.resize();});
function showObservatory(){$('scene').scrollIntoView({behavior:reducedMotion()?'instant':'smooth',block:'start'});}
$('backToView').addEventListener('click',showObservatory);$('editScene').addEventListener('click',()=>viewportUI?.openElements());
document.addEventListener('keydown',e=>{
 if(document.querySelector('dialog[open]'))return;
 if(e.key==='Escape')displayOptions.open=false;
 if(e.key==='Escape'&&$('scene').classList.contains('pseudo-fullscreen')){$('scene').classList.remove('pseudo-fullscreen');$('fullscreen').setAttribute('aria-label','Expand observatory');renderer?.resize();}
 if(e.key==='Escape'&&renderer?.getState().focusId){e.preventDefault();returnToOverview();return;}
 if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
 if(e.target===$('universe')&&e.code==='Space'){e.preventDefault();setPaused(!state.paused);}
});
if(reducedMotion())state.paused=true;syncControls();updateObjectPreview();updateObjectScale();rangeFill($('orbitRadius'));rangeFill($('orbitPhase'));
viewportUI=installViewportUI({renderer:()=>renderer,state:()=>state,objects,selectObject,startDrive:id=>pilotUI?.start(id),setFeature,stageMutation,syncRendererState,markCustom,selectComponent,updateParameter,setPaused,syncViewMode,toast,activePreset:()=>activePreset,refresh:()=>{lastStats=renderer?.getState();if(lastStats){syncViewMode(lastStats.viewMode);renderObjectManager(lastStats);}},openDialog,openScenes:button=>openDialog('atlasDialog',button),openHelp:button=>openDialog('helpDialog',button),onDialogClose:id=>{pauseCoveredView(!!document.querySelector('dialog[open]'));openers.get(id)?.focus();}});
if(typeof installPilotControls==='function')pilotUI=installPilotControls({mount:$('pilotControls'),closePanels:()=>viewportUI?.close(),renderer:()=>renderer,state:()=>state,objects,setPaused,updateParameter,refresh:()=>{syncRendererState();renderObjectManager();viewportUI?.close();}});
if(typeof installStellarControls==='function')stellarUI=installStellarControls({container:$('objectEditor'),renderer:()=>renderer,changed:()=>{syncRendererState();markCustom();renderObjectManager();}});
if(typeof installAnomalyControls==='function')anomalyUI=installAnomalyControls({container:$('objectEditor'),renderer:()=>renderer,changed:()=>{syncRendererState();markCustom();renderObjectManager();}});
$('objectEditor').prepend($('objectOpacity'));
if(typeof installAnnotations==='function')annotationsUI=installAnnotations($('scene'),()=>renderer,{onSelect:id=>viewportUI?.select(id),onTrack:id=>viewportUI?.track(id),onLabelTap:id=>pilotUI?.previewTravel(id)||false});
if(typeof installSceneFiles==='function')sceneFilesUI=installSceneFiles({saveButton:$('sceneSave'),loadButton:$('sceneLoad'),fileInput:$('sceneFileInput'),status:$('sceneFileStatus'),renderer:()=>renderer,context:()=>sceneRequestSerial,load:loadSceneSnapshot,onMessage:message=>toast(message)});
function showVisitEntrance(){
 $('quality').value='adaptive';
 if($('scene').classList.contains('pseudo-fullscreen')){$('scene').classList.remove('pseudo-fullscreen');$('fullscreen').setAttribute('aria-label','Expand observatory');renderer?.resize();}
 viewportUI?.resetDiscovery();
 document.querySelectorAll('[data-scene-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.sceneFilter==='All')));
 document.querySelectorAll('[data-scene-category]').forEach(card=>card.hidden=false);
 if(window.history){window.history.scrollRestoration='manual';if(window.location?.hash)window.history.replaceState(null,'',window.location.pathname+window.location.search);}
 window.scrollTo?.({top:0,left:0,behavior:'instant'});
 openDialog('atlasDialog',$('viewportScenes'));$('atlasDialog').scrollTop=0;const content=$('atlasDialog').querySelector('.dialog-content');if(content)content.scrollTop=0;
}
function restartVisit(){
 document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());viewportUI?.close();
 $('quality').value='adaptive';renderer?.setQuality('adaptive');
 // applyPreset clears the previous scene before yielding; the gallery remains
 // visible throughout preparation, and opening it never counts as discovery.
 const loading=applyPreset('disk');showVisitEntrance();return loading;
}
document.querySelector('.brand').addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();void restartVisit();});
window.addEventListener('pageshow',event=>{if(event.persisted)void restartVisit();});
showVisitEntrance();
initRenderer();renderObjectManager();
const statsWatchdog=setInterval(()=>{if(lastStatsAt&&performance.now()-lastStatsAt>2200&&!document.hidden&&!document.querySelector('dialog[open]')){$('fpsCorner').textContent='0 FPS';if(lastRendererError||!$('cpuFallbackPrompt').hidden)return;loadingIndicator.update(true,loadingSceneTitle());}},750);
window.addEventListener('pagehide',event=>{if(!event.persisted){clearInterval(statsWatchdog);loadingIndicator.dispose();sceneFilesUI?.dispose();pilotUI?.dispose();stellarUI?.dispose();annotationsUI?.dispose();viewportUI?.dispose();renderer?.dispose();}});

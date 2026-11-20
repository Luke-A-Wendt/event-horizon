import {isJanusPod,usesWarpHelm,JANUS_THRUST_MAX_G} from './objects.js';
import {sceneCruiseWarp} from './config.js';
import {installJanusControls} from './janus-controls.js';
import {installDockingPanel} from './docking-ui.js';
import {observedBodyMeasurements} from './body-measurements.js';
import {metricNumber,metricSpeed,metricDistance} from './metric-units.js';
import {speedForWarp,FLIGHT_LIGHT_SPEED} from './flight-dynamics.js';
import {edgeOrbitName,installPlaylistEditor} from './playlist-ui.js';
import {formatClockDuration,formatClockRate,formatProperClock,hasOnboardClock} from './object-clocks.js';
const crewNames={shuttle:'NASA Meridian',enterprise:'NASA Warp Explorer',iss:'ISS',habitat:'NASA Garden Station',astronaut:'Astronaut'};
const keys={KeyW:['speed',1],KeyS:['speed',-1],KeyA:['heading',-1],KeyD:['heading',1]};
const HEADING_STEP=5,HEADING_REPEAT_MS=100,HEADING_HOLD_DELAY_MS=350;
const normalizeHeading=value=>((Math.round(value)%360)+540)%360-180;
const isDirectTour=id=>id==='shuttle-proxima-direct'||id==='shuttle-sgra-direct';
const flightNumber=new Intl.NumberFormat(undefined,{minimumSignificantDigits:2,maximumSignificantDigits:2});
const superscripts={'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
const oneDecimal=new Intl.NumberFormat("en-US",{minimumFractionDigits:1,maximumFractionDigits:1,useGrouping:false});
export const formatGravity=g=>!Number.isFinite(g)?"—":(Math.abs(g)>=1e6?metricNumber(Math.abs(g),2):oneDecimal.format(Math.abs(g)))+"g";
// When local speed rounds to c, retain the subluminal offset if gamma is known.
export function logSpeedRatio(beta,gamma){
 if(!Number.isFinite(beta)||beta<0||beta>1)return NaN;
 if(beta===1&&Number.isFinite(gamma)&&gamma>1)return .5*Math.log1p(-((1/gamma)**2))/Math.LN10;
 return Math.log10(beta);
}
const driftPrefixes=['q','r','y','z','a','f','p','n','µ','m','','k','M','G','T','P','E','Z','Y','R','Q'];
export function formatClockDrift(value){
 if(!Number.isFinite(value))return '—';
 if(value===0)return '0 s/s';
 const exponent=Math.max(-10,Math.min(10,Math.floor(Math.log10(Number(Math.abs(value).toPrecision(3)))/3)));
 return metricNumber(Math.abs(value)/10**(3*exponent),3)+' '+driftPrefixes[10+exponent]+'s/s';
}
export function formatFlightSpeed(speed){return metricSpeed(speed);}
export function formatFlightNumber(n){
 if(!Number.isFinite(n))return '—';if(n===0)return '0';
 const rounded=Number(n.toPrecision(2)),magnitude=Math.abs(rounded);
 if(magnitude>=1e5||magnitude<.001){const [mantissa,exponent]=n.toExponential(1).split('e');return mantissa+' × 10'+String(Number(exponent)).split('').map(c=>superscripts[c]).join('');}
 return flightNumber.format(rounded);
}
// Keep the legacy export name for callers; clocks use readable elapsed-time units.
export const formatFlightDilation=formatClockDuration;
// A configured field strength is not a velocity. In particular, a dormant
// NASA Warp Explorer can share a scene with another ship's field, and impulse bridge
// crossings retain a warp-equivalent setting for interpolation.
export function enterpriseMotionReading(r,object,flight,orbitalSpeed){
 const owns=r.warpObjectId===object.id||(!r.warpObjectId&&object.warpEnabled===true);
 const powered=!!r.state?.warp&&owns,moving=flight?.id===object.id;
 const warp=powered?(moving?flight.warpFactor??0:r.state.warpFactor??0):0;
 const speed=moving?flight.speedMetersPerSecond:powered&&warp>0?speedForWarp(warp):object.waypointHoldId?0:orbitalSpeed;
 return {speed:Math.abs(speed??0),warp,effectiveWarp:powered&&warp>0};
}
export function installPilotControls(api){
 const mount=api.mount;if(!mount)return{update(){},start(){return false;},dispose(){}};
 mount.hidden=true;mount.className='pilot-console';
 mount.innerHTML=`
 <button id="pilotLeft" class="pilot-turn pilot-left" aria-label="Turn left 5 degrees; hold to repeat" title="Left 5° · A · hold to repeat">‹</button>
 <div class="pilot-main"><div class="pilot-mode-options" role="group" aria-label="Vehicle control mode"><button type="button" id="pilotModeAuto" aria-pressed="true" title="Follow the flight playlist">Auto</button><button type="button" id="pilotModeDrive" aria-pressed="false" title="Take the helm">Drive</button></div><div id="pilotManualControls" class="pilot-manual-controls" hidden><button id="pilotBrakeSpeed" title="Stop forward motion and turning">Stop motion</button><div class="pilot-sliders"><div class="pilot-info-row"><span id="pilotVelocityLabel">Warp</span><select id="janusPropulsion" aria-label="Propulsion mode" title="Choose Janus propulsion" hidden><option value="impulse">Thrusters</option><option value="warp">Warp</option></select><div class="pilot-heading-readout"><span>Heading</span> <output id="pilotHeadingValue" aria-label="Target heading relative to start of driving">0°</output></div></div><label class="pilot-power"><span class="pilot-range"><input id="pilotPower" type="range" min="0" max="9.9999" step=".01" value="4" aria-label="Warp level"></span><output id="pilotV">4</output></label></div></div><div id="pilotAutoControls" class="pilot-auto-controls"></div><p id="pilotStatus" class="pilot-status" role="status" hidden></p></div>
 <button id="pilotRight" class="pilot-turn pilot-right" aria-label="Turn right 5 degrees; hold to repeat" title="Right 5° · D · hold to repeat">›</button>`;
 const launcher=mount.querySelector('#pilotAutoControls');
 launcher.innerHTML='<button type="button" id="pilotPlaylist" aria-haspopup="dialog">Playlist <span id="pilotPlaylistCount">0</span></button><div class="pilot-destination"><small class="flight-sr">Destination</small><output id="pilotDestination" aria-label="Current destination">—</output></div>';
 const dialog=document.createElement('dialog');dialog.id='vehiclePlaylistDialog';dialog.setAttribute('aria-labelledby','vehiclePlaylistTitle');
 dialog.innerHTML='<div class="dialog-header"><h2 id="vehiclePlaylistTitle">Flight playlist</h2><button type="button" class="icon-button" aria-label="Close playlist">×</button></div><div class="dialog-content pilot-auto-controls"></div>';
 document.body.append(dialog);
 const editor=installPlaylistEditor(dialog.querySelector('.dialog-content'),api);
 let editorCraftId=null;
 function openPlaylist(id,targetId=null){
  const r=api.renderer(),craft=r?.objects?.find(o=>o.id===id&&['shuttle','enterprise'].includes(o.type));
  if(!craft)return false;
  const bridge=targetId&&r.getJanusBridge?.(id);if(bridge){janusPanel.update(r,craft,bridge,r.focusId===id);return janusPanel.open(targetId);}
  if(navigation(id).mode==='manual')return false;
  editorCraftId=id;editor.refresh(craft,r.getFlightSequence(id));if(!dialog.open)dialog.showModal();return true;
 }
 launcher.querySelector('button').addEventListener('click',()=>openPlaylist(selectedCraft()?.id));
 dialog.addEventListener('close',()=>{editorCraftId=null;});
 dialog.querySelector('button').addEventListener('click',()=>dialog.close());
 const scene=mount.parentElement||mount.parentNode;
 const flightReadout=document.createElement('section');flightReadout.id='pilotFlightReadout';flightReadout.className='pilot-flight-readout';flightReadout.hidden=true;flightReadout.setAttribute('aria-label','Vehicle telemetry');
 flightReadout.innerHTML='<div class="pilot-flight-body"><dl id="pilotFlightMetrics" class="pilot-flight-metrics"><div><dt id="pilotFlightEtaLabel">ETA</dt><dd><output id="pilotFlightRemaining" aria-label="Estimated onboard time remaining">0 s</output></dd></div></dl><div class="pilot-flight-route"><div class="pilot-flight-stage"><output id="pilotFlightStage" aria-live="polite">In orbit</output></div></div></div>';const tripGroup=document.createElement('div');tripGroup.className='flight-trip-group';launcher.append(tripGroup);tripGroup.append(launcher.querySelector('.pilot-destination'),flightReadout);const bar=document.createElement('progress');bar.className='flight-leg-progress';bar.max=1;bar.value=0;bar.hidden=true;bar.setAttribute('aria-label','Progress to destination');tripGroup.append(bar);
 const travelCard=document.createElement('section');travelCard.id='pilotTravel';travelCard.className='pilot-travel';travelCard.hidden=true;travelCard.setAttribute('aria-label','Change orbit');travelCard.setAttribute('data-scene-control','');
 travelCard.innerHTML='<div class="pilot-travel-heading"><div><small id="pilotTripMode"></small><h3 id="pilotTripTarget"></h3></div><button id="pilotTripClose" aria-label="Close travel preview" title="Close travel preview">×</button></div><p id="pilotTripQuestion">Change orbit to this object?</p><label id="pilotTripWarpRow" class="transfer-warp" hidden><span>Trip warp <output id="pilotTripWarpValue">1</output></span><input id="pilotTripWarp" type="range" min="1" max="9.9999" step=".1" value="1" aria-label="Warp factor for this trip"></label><label id="pilotTripHeadingRow" class="arrival-heading" hidden><span>Arrival heading · degrees</span><input id="pilotTripHeading" type="number" min="-180" max="180" step="5" placeholder="Auto" aria-label="Arrival heading in degrees; leave blank for automatic alignment"></label><div class="pilot-trip-time"><span id="pilotTripTimeLabel">Onboard flight time</span><output id="pilotTripTime"></output></div><div class="pilot-trip-secondary" id="pilotTripProperRow"><span id="pilotTripProperLabel">Distant time</span><output id="pilotTripProper"></output></div><div class="pilot-trip-secondary" id="pilotTripDilationRow"><span id="pilotTripDilationLabel">Clock lag</span><output id="pilotTripDilation"></output></div><progress id="pilotTripProgress" max="1" value="0" hidden aria-label="Trip progress"></progress><p id="pilotTripNote"></p><div class="pilot-trip-actions"><button id="pilotTripQueue">Add to playlist</button><button id="pilotTripCancel">Cancel</button></div>';scene?.append(travelCard);
 // Keep decisions immediately below the destination, before optional estimates.
 travelCard.querySelector('#pilotTripQuestion').after(travelCard.querySelector('.pilot-trip-actions'));
 const stack=document.createElement('div');stack.className='motion-stack';stack.hidden=true;scene?.append(stack);
 const motion=document.createElement('section');motion.className='motion-hud';motion.setAttribute('aria-label','Vehicle motion');
 motion.innerHTML='<div class="motion-speed-group"><span class="eyebrow">DISTANT-FRAME SPEED</span><output id="pilotLegSpeed" aria-label="Speed"></output><div class="motion-log"><span id="pilotRatioLabel">log₁₀(v/c) = </span><output id="pilotSpeedLog"></output></div></div><div class="motion-power"><span class="eyebrow" id="motionPowerLabel">ACCELERATION</span><div class="proper-reading"><output id="pilotFlightAcceleration"></output><span id="pilotAccelMode" hidden></span></div><span id="pilotCrewAlert" class="crew-alert" hidden></span></div>';
 const escapeNote=document.createElement('aside');escapeNote.id='shuttleEscapeNote';escapeNote.className='shuttle-escape-note';escapeNote.hidden=true;escapeNote.title='Hypothetical return, not current acceleration: a work-based lower bound for a direct transfer back to the outer orbit. Other paths can require less thrust. This is not an escape threshold.';motion.querySelector('.motion-power').append(escapeNote);
 const horizonNote=document.createElement('aside');horizonNote.id='pilotHorizonWarning';horizonNote.className='shuttle-escape-note';horizonNote.hidden=true;motion.querySelector('.motion-power').append(horizonNote);
 const tourEstimate=document.createElement('aside');tourEstimate.className='tour-estimate';tourEstimate.id='tourEstimate';tourEstimate.hidden=true;tourEstimate.setAttribute('aria-label','Transfer time estimates');
 tourEstimate.innerHTML='<div class="trip-caption eyebrow" id="tourCaption">Trip estimate</div><dl><div><dt class="eyebrow">Distance</dt><dd id="tourDistance">—</dd></div><div><dt class="eyebrow">Onboard</dt><dd id="tourShipTime">—</dd></div></dl>';stack.append(tourEstimate,motion);
 const tourCaption=tourEstimate.querySelector('#tourCaption');
 const tourOutputs=['tourDistance','tourShipTime'].map(id=>tourEstimate.querySelector('#'+id));
 function updateTourEstimate(tour,arc,trip){
  const years=(arc?arc.transferSeconds:trip?.properSeconds)/31557600;
  tourEstimate.hidden=!tour||!(years>=1);if(tourEstimate.hidden)return;
  const ly=(arc?arc.transferDistanceMeters:trip?.pathLengthMeters)/9.4607304725808e15;
  const fmt=n=>metricNumber(n);
  const values=[ly>0?fmt(ly)+' ly':'—',fmt(years)+' yr'];
  values.forEach((v,i)=>{if(tourOutputs[i].textContent!==v)tourOutputs[i].textContent=v;});
 }
 const hint=document.createElement('aside');hint.id='pilotNavHint';hint.className='pilot-nav-hint';hint.hidden=true;hint.setAttribute('data-scene-control','');hint.setAttribute('aria-label','Flight controls');hint.innerHTML='<button id="pilotHintClose" aria-label="Dismiss flight hint">×</button><strong>Choose your next destination</strong><p>In Auto, choose a next stop in the playlist, on the Map, or by tapping a scene label. Hold and drag a stop to reorder it. Turn on Loop to repeat the route.</p><p>Choose Drive to take over from the current position. Set power and steer with the heading arrows. Play and Pause work in both modes.</p>';scene?.append(hint);
 const labelButton=document.getElementById('annotationShortcut');let travelScene=null,travelPreview=null,travelSelection=null,tripWarp=1,tripHeading=null,hintShown=false;
 const optionalHeading=value=>String(value).trim()===''||!Number.isFinite(Number(value))?null:Math.max(-180,Math.min(180,Number(value)));
 const navigation=id=>api.renderer()?.getNavigationState?.(id)||{mode:api.renderer()?.driveId===id?'manual':'auto'};
 const selectedCraft=()=>{const r=api.renderer();if(r?.sceneId==='shuttle-space'&&!r.selectedId&&!r.focusId)return null;if(r?.objects?.some(o=>o.id===r.focusId&&['astronaut','iss','habitat','classicEnterprise','heritageShuttle'].includes(o.type)))return null;if(r?.driveId&&r.focusId===r.driveId&&navigation(r.driveId).mode==='manual')return r.objects.find(o=>o.id===r.driveId);return [r?.focusId,r?.selectedId,r?.driveId].map(id=>r?.objects?.find(o=>o.id===id&&['enterprise','shuttle'].includes(o.type))).find(Boolean)||null;};
 const telemetry=document.createElement('section');telemetry.setAttribute('aria-label','Clocks');telemetry.id='pilotTelemetry';telemetry.className='pilot-telemetry';telemetry.hidden=true;
 telemetry.innerHTML='<div id="pilotSpeedRow"><span>Speed</span><output id="pilotSpeed" aria-label="Speed">0 m/s</output></div><div id="pilotTurnRow"><span>Angular velocity</span><output id="pilotK" aria-label="Angular velocity">0 rad/s</output></div><div id="pilotOnboardRow" hidden><span id="pilotProperLabel">Proper time</span><output id="pilotOnboard" aria-live="off" aria-label="Elapsed onboard time"><span id="clockCalendar" hidden></span><span id="clockFace">00:00:00.0</span></output></div><div id="pilotDilationRow" hidden><span id="pilotDilationLabel">Clock lag</span><output id="pilotDilation" aria-label="Time difference between distant and onboard clocks since creation">0 s</output></div><div id="pilotDilationRateRow" hidden><span>Clock loss rate</span><output id="pilotDilationRate" aria-label="Time lost per onboard second">0 s/s</output><small id="pilotGravityFactor" class="clock-factor" title="Gravity’s contribution to clock loss, in distant seconds gained per onboard second. In a rotating black-hole scene the local reference follows frame dragging."></small><small id="pilotMotionFactor" class="clock-factor" title="Motion’s contribution to clock loss per onboard second, from the subject’s speed relative to the local reference."></small></div>';
 const distancePanel=scene?.querySelector('.scene-bottom');
 // Reparent the existing outputs so each measurement still has one live source.
 const instruments=document.createElement('section');instruments.id='sceneMetrics';instruments.className='scene-metrics';instruments.setAttribute('aria-label','Scene instruments');instruments.setAttribute('data-scene-control','');
 const instrumentsToggle=document.createElement('button');instrumentsToggle.setAttribute('type','button');instrumentsToggle.className='instrument-toggle';instrumentsToggle.innerHTML='<span id="instrumentSubject">Scene overview</span><small id="instrumentProfile">Overview</small>';instrumentsToggle.setAttribute('aria-controls','instrumentBody');instrumentsToggle.setAttribute('aria-expanded','true');
 const instrumentBody=document.createElement('div');instrumentBody.id='instrumentBody';
 const subjectName=instrumentsToggle.querySelector('#instrumentSubject'),profileName=instrumentsToggle.querySelector('#instrumentProfile');
 const bodyData=document.createElement('dl');bodyData.id='bodyMeasurements';bodyData.hidden=true;bodyData.setAttribute('aria-label','Body measurements');
 let lastSubject=null,bodyFields=[];
 function updateSubject(subject,profile,measurements){
  const name=subject?.name||subject?.label||crewNames[subject?.type]||subject?.id||'Scene overview',id=subject?.id||'',type=subject?.type||'overview';
  if(lastSubject!==id||subjectName.textContent!==name||profileName.textContent!==profile){
   subjectName.textContent=name;profileName.textContent=profile;instruments.setAttribute('data-subject-id',id);instruments.setAttribute('data-subject-type',type);
   instrumentsToggle.setAttribute('aria-label',name+' · '+profile+' instruments');instruments.setAttribute('aria-label',name+' instruments');lastSubject=id;
  }
  const rows=measurements?.rows||[];
  bodyData.hidden=!rows.length;if(distancePanel)distancePanel.hidden=!!rows.length;
  while(bodyFields.length>rows.length)bodyFields.pop().group.remove();
  rows.forEach(({label,value,title},i)=>{
   let field=bodyFields[i];
   if(!field){const group=document.createElement('div'),term=document.createElement('dt'),detail=document.createElement('dd');group.append(term,detail);bodyData.append(group);field={group,term,detail};bodyFields.push(field);}
   if(field.term.textContent!==label)field.term.textContent=label;
   if(field.detail.textContent!==value)field.detail.textContent=value;
   if(field.group.title!==(title||''))field.group.title=title||'';
  });
 }
 const rimData=document.createElement('dl');rimData.id='habitatMeasurements';rimData.hidden=true;rimData.setAttribute('aria-label','Habitat ring rotation');
 rimData.innerHTML='<div title="Distance from the spin axis to the occupied floor"><dt>Floor radius</dt><dd id="habitatFloorRadius"></dd></div><div title="Revolutions per minute of station proper time"><dt>Ring spin</dt><dd id="habitatSpinRate"></dd></div><div title="Acceleration provided by the rotating floor (ω²r). A freely floating person at the hub does not feel this load."><dt>Rim spin accel.</dt><dd id="habitatRimGravity"></dd></div>';
 const rimFields=['#habitatFloorRadius','#habitatSpinRate','#habitatRimGravity'].map(id=>rimData.querySelector(id));
 function updateRim(r,subject){
  const spin=subject?.type==='habitat'?r.getHabitatSpin?.(subject.id):null;
  rimData.hidden=!spin;
  if(rimData.hidden)return;
  const values=[metricDistance(spin.floorRadiusMeters),metricNumber(spin.rpm,3)+' rpm',formatGravity(spin.rimAccelerationG)];
  rimFields.forEach((field,i)=>{if(field.textContent!==values[i])field.textContent=values[i];});
 }
 const renderPill=document.getElementById('renderStatus'),renderHome=renderPill?.parentNode;
 scene?.append(instruments);instruments.append(instrumentsToggle,instrumentBody);
 // Route first, then local motion, clock/camera distance, and renderer status.
 instrumentBody.append(bodyData,tripGroup,stack,rimData,telemetry);if(distancePanel)instrumentBody.append(distancePanel);if(renderPill)instrumentBody.append(renderPill);
 instrumentsToggle.addEventListener('click',()=>{instrumentBody.hidden=!instrumentBody.hidden;instrumentsToggle.setAttribute('aria-expanded',String(!instrumentBody.hidden));});
 const dockingPanel=installDockingPanel(instrumentBody,{...api,update});
 stack.before(instrumentBody.querySelector('.docking-instruments'));
 const janusPanel=installJanusControls(instrumentBody,{...api,update});
 stack.before(instrumentBody.querySelector('.janus-instruments'));
 const $=id=>mount.querySelector('#'+id)||telemetry.querySelector('#'+id)||travelCard.querySelector('#'+id)||tripGroup.querySelector('#'+id)||motion.querySelector('#'+id)||hint.querySelector('#'+id),keyboardHeld=new Set(),listeners=[];let currentId=null,disposed=false,lastInput='',lastType=null,holdTimer=null,holdButton=null;const thrustStepTimes=new Map();
 const listen=(node,event,fn,options)=>{node.addEventListener(event,fn,options);listeners.push(()=>node.removeEventListener(event,fn,options));};
 const blocked=()=>disposed||!currentId||!!api.renderer()?.getDockingState?.(currentId)||!!api.renderer()?.getJanusBridge?.(currentId)?.active||navigation(currentId).mode!=='manual'||!!api.renderer()?.getTravelState?.()?.active||!!api.renderer()?.autopilot?.enabled||document.hidden||!!api.state().paused||!!document.querySelector('dialog[open]');
 const editable=target=>/^(INPUT|SELECT|TEXTAREA)$/.test(target?.tagName||'')||target?.isContentEditable||target?.closest?.('[contenteditable="true"]');
 const isShuttle=()=>{const f=api.renderer()?.getFlightState?.();return f?.type==='shuttle'||f?.flightMode==='impulse';};
 function send(force=false){
  const held=keyboardHeld,input={speed:0,curvature:0,torsion:0};for(const code of held){const spec=keys[code];if(spec?.[0]==='speed'&&!isShuttle())input.speed+=spec[1];}input.speed=Math.max(-1,Math.min(1,input.speed));
  const signature=Object.values(input).join('|');if(force||signature!==lastInput){lastInput=signature;api.renderer()?.setFlightInput?.(input);}
 }
 function endHold(){clearTimeout(holdTimer);holdTimer=null;holdButton?.classList.remove('is-held');holdButton=null;}
 function clear(force=false){endHold();keyboardHeld.clear();thrustStepTimes.clear();send(force);}
 function nudgeHeading(direction){if(blocked())return;const r=api.renderer(),heading=r?.getFlightState?.()?.headingTargetDegrees||0;const target=normalizeHeading(Math.round(heading/HEADING_STEP)*HEADING_STEP+direction*HEADING_STEP);r?.setFlightHeading?.(target);update();}
 function stop(){const r=api.renderer(),id=currentId||selectedCraft()?.id;if(!id)return;closeTravel();clear(true);if(navigation(id).mode==='manual')r?.setNavigationMode?.(id,'auto');api.refresh();update();}
 function showHint(){if(hintShown||(api.activePreset?.()||api.renderer()?.sceneId)!=='solar-system')return;hintShown=true;hint.hidden=false;}
 listen($('pilotHintClose'),'click',()=>{hint.hidden=true;});
 listen(hint,'pointerdown',event=>event.stopPropagation());
 function allowed(event){return !blocked()&&!editable(event.target)&&!event.ctrlKey&&!event.metaKey&&!event.altKey;}
 listen(document,'keydown',event=>{
  if(event.key==='Escape'&&currentId&&!disposed&&!document.querySelector('dialog[open]')&&!editable(event.target)){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();if(travelPreview){closeTravel();update();}else if(!hint.hidden)hint.hidden=true;else if(navigation(currentId).mode==='manual')stop();return;}
  if(!keys[event.code]||!allowed(event))return;event.preventDefault();event.stopPropagation();const first=!keyboardHeld.has(event.code);if(first)keyboardHeld.add(event.code);
  if(keys[event.code][0]==='heading'||isShuttle()&&keys[event.code][0]==='speed'){
   // Native key repeat adjusts the held acceleration setting at a readable pace.
   const now=Number.isFinite(event.timeStamp)?event.timeStamp:performance.now(),opposite={KeyW:'KeyS',KeyS:'KeyW',KeyA:'KeyD',KeyD:'KeyA'}[event.code];
   if(!keyboardHeld.has(opposite)&&(first||event.repeat&&now-(thrustStepTimes.get(event.code)??-Infinity)>=HEADING_REPEAT_MS)){thrustStepTimes.set(event.code,now);const r=api.renderer(),flight=r?.getFlightState?.();if(keys[event.code][0]==='heading')nudgeHeading(keys[event.code][1]);else {const step=isJanusPod(r?.objects?.find(o=>o.id===currentId)) ? .01 : .1;r?.setFlightPower?.((flight?.thrustSetting||0)+keys[event.code][1]*step);}}
   if(first)send();update();
  }else if(first)send();
 },true);
 listen(document,'keyup',event=>{if(!keys[event.code]||!keyboardHeld.has(event.code))return;keyboardHeld.delete(event.code);thrustStepTimes.delete(event.code);send();if(!editable(event.target)){event.preventDefault();event.stopPropagation();}},true);
 listen(window,'blur',()=>clear());listen(document,'visibilitychange',()=>{if(document.hidden)clear();});listen(document,'focusin',event=>{if(editable(event.target))clear();});
 listen(mount,'pointerdown',event=>event.stopPropagation());listen(mount,'wheel',event=>event.stopPropagation(),{passive:true});
 const observer=typeof MutationObserver==='function'?new MutationObserver(()=>{if(currentId&&document.querySelector('dialog[open]'))clear();}):null;observer?.observe(document.documentElement||document,{subtree:true,attributes:true,attributeFilter:['open']});
 for(const [id,mode] of [['pilotModeAuto','auto'],['pilotModeDrive','manual']])listen($(id),'click',()=>{if(currentId)start(currentId,mode);});
 listen(flightReadout,'pointerdown',event=>event.stopPropagation());listen(flightReadout,'wheel',event=>event.stopPropagation(),{passive:true});
 listen($('pilotBrakeSpeed'),'click',()=>{clear();const r=api.renderer();if(isShuttle())r?.brakeFlight?.('speed');else{r?.brakeFlight?.('speed');r?.brakeFlight?.('turn');}update();});
 for(const [id,direction] of [['pilotLeft',-1],['pilotRight',1]]){
  const button=$(id);
  listen(button,'pointerdown',event=>{if(event.button!=null&&event.button!==0||blocked())return;event.preventDefault();event.stopPropagation();endHold();holdButton=button;button.classList.add('is-held');button.setPointerCapture?.(event.pointerId);nudgeHeading(direction);const repeat=()=>{if(blocked()||holdButton!==button){endHold();return;}nudgeHeading(direction);holdTimer=setTimeout(repeat,HEADING_REPEAT_MS);};holdTimer=setTimeout(repeat,HEADING_HOLD_DELAY_MS);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(button,event,()=>{if(holdButton===button)endHold();});
  listen(button,'click',event=>{if(event.detail==null||event.detail===0)nudgeHeading(direction);});
  listen(button,'contextmenu',event=>event.preventDefault());
 }
 listen($('janusPropulsion'),'change',()=>{if(!currentId||blocked())return;clear();api.renderer()?.setPodPropulsion?.(currentId,$('janusPropulsion').value);update();});
 listen($('pilotPower'),'input',()=>{if(blocked())return;api.renderer()?.setFlightPower?.(Number($('pilotPower').value));update();});
 let clockSubjectKey=null,observerClockFirst=false;
 function updateTelemetry(r,flight,subject){
  const crew=subject&&hasOnboardClock(subject.type),hub=subject?.type==='habitat';
  const observer=hub||subject?.type==='iss'||subject?.type==='astronaut';
  const key=[r?.sceneId,subject?.id,subject?.type].join('|');
  if(key!==clockSubjectKey){
   // These observers have no helm. Put their clock at the top of the actual
   // reading order, before docking, rotation and motion, even on a short rail.
   if(observer!==observerClockFirst){if(observer)instrumentBody.prepend(telemetry);else rimData.after(telemetry);observerClockFirst=observer;}
   if(observer)instrumentBody.scrollTop=0;
   telemetry.setAttribute('aria-label',hub?'Station hub clock':subject?.type==='astronaut'?'Astronaut clock':subject?.type==='iss'?'Station clock':'Onboard clock');
   clockSubjectKey=key;
  }
  let clock=crew?r.getObjectClock?.(subject.id):null;
  if(crew&&typeof r.getObjectClock!=='function'&&subject.id===flight?.id&&subject.type==='shuttle'){
   clock={...flight,properSeconds:flight.properTimeSeconds,lagSeconds:flight.timeLagSeconds??Math.max(0,(flight.coordinateTimeSeconds||0)-(flight.properTimeSeconds||0)),rateFactor:flight.timeDilationFactor||1};
  }
  telemetry.hidden=!clock;scene?.classList.toggle('has-object-clock',!!clock);
  $('pilotSpeedRow').hidden=true;$('pilotTurnRow').hidden=true;
  $('pilotDilationRow').hidden=!clock;$('pilotDilationRateRow').hidden=!clock||!(clock.rateFactor>=1);
  $('pilotDilationLabel').textContent=subject?.type==='habitat'?'Hub clock lag':clock?.approachHeld?'Clock lag (frozen)':'Clock lag';
  $('pilotOnboardRow').hidden=!clock;
  if(!clock)return;
  $('pilotProperLabel').textContent=subject.type==='habitat'?'Hub proper time':clock.approachHeld?'Proper time (frozen)':'Proper time';
  const onboard=$('pilotOnboard'),elapsed=formatProperClock(clock.properSeconds);
  if(onboard.textContent!==elapsed){
   const split=elapsed.includes(':')?elapsed.lastIndexOf(' ')+1:0,calendar=$('clockCalendar'),face=$('clockFace');
   const prefix=elapsed.slice(0,split);calendar.hidden=!prefix;if(calendar.textContent!==prefix)calendar.textContent=prefix;
   face.textContent=elapsed.slice(split);
  }
  onboard.title=clock.protectedClock?'Elapsed onboard. In this protected warp model, onboard and distant time agree.':subject.type==='habitat'?'Elapsed on the nonrotating hub’s clock. Its orbital motion and gravity affect the reading; the habitat floor rotates relative to this clock.':'Elapsed on this subject’s clock since creation, integrated over the simulated journey.';
  $('pilotDilationRate').classList.toggle('metric-alert',clock.rateFactor>1.1);
  $('pilotDilation').classList.toggle('metric-alert',clock.lagSeconds>31557600);
  // dt/dτ − 1 = γ(g − 1) + (γ − 1), per onboard second. Sum the
  // small excesses rather than subtracting nearly equal floating-point
  // numbers for an ISS clock or an astronaut far from a gravity source.
  const q=clock.rateFactor,gravity=clock.gravityFactor,motionFactor=clock.kinematicFactor,product=gravity*motionFactor;
  const hasSplit=gravity>=1&&motionFactor>=1&&Number.isFinite(product)&&Number.isFinite(q)&&Math.abs(product-q)<=4*Number.EPSILON*q;
  const loss=(factor,excess)=>Number.isFinite(excess)&&excess>=0&&1+excess===factor?excess:factor-1;
  const gravityLoss=motionFactor*loss(gravity,clock.gravityExcess),motionLoss=loss(motionFactor,clock.kinematicExcess);
  const drift=hasSplit?gravityLoss+motionLoss:q-1;
  const rate=formatClockDrift(drift);if($('pilotDilationRate').textContent!==rate)$('pilotDilationRate').textContent=rate;
  for(const [id,label,value] of [['pilotGravityFactor','Gravity',gravityLoss],['pilotMotionFactor','Motion',motionLoss]]){
   const element=$(id);element.hidden=!!clock.protectedClock;
   const line=label+' '+(hasSplit?formatClockDrift(value):'—');if($(id).textContent!==line)$(id).textContent=line;
  }
  $('pilotDilationRate').title=(hub?'Measured at the nonrotating hub. ':'')+'Per onboard second: Motion compares the ship with the local observer; Gravity compares that observer with the distant clock. Their losses add before rounding.';
  const lag=clock.lagSeconds,duration=formatClockDuration(lag),value=lag>31557600&&duration==='1.0 yr'?'> 1 yr':duration;if($('pilotDilation').textContent!==value)$('pilotDilation').textContent=value;
  $('pilotDilation').title=(clock.name?clock.name+' · ':'')+'Time difference t − τ since creation: integral of (dt/dτ − 1) over onboard proper time. Guided routes advance the clock by the simulated journey. A stationary clock in flat space accumulates zero. Coasting after a burn retains speed-related dilation. Pausing stops the comparison; changing views or leaving Drive preserves it.';
  return clock;
 }
 function updateFlightReadout(trip,auto,nav,id,sequence,lapInfo){
  const arc=sequence?.orbitWait,dwell=!!sequence?.active&&!!arc;
  const timedWarp=nav.mode!=='manual'&&!!sequence?.nodes?.[sequence.index]?.transferProperSeconds;
  const active=!!trip?.active&&trip.craftId===id,radiusPhase=dwell?!!arc.radiusChange:active&&!!trip.radiusChange;
  // Same-body laps and guided radius burns are distinct maneuvers. Each has its own clock.
  const arcTime=dwell?(arc.durationSeconds||0):radiusPhase||timedWarp?0:(trip?.departureArcSeconds||0);
  const transferTime=dwell?(radiusPhase||timedWarp?0:arc.transferSeconds):(trip?.properSeconds||0),total=arcTime+(transferTime||0);
  const elapsed=dwell?arcTime*(arc.arcFraction||0):arcTime+(trip?.properElapsedSeconds||0);
  const stages=['Leaving orbit','Accelerating','Flip and burn','Decelerating','Entering orbit'];
  const blockedLeg=sequence?.holding&&sequence?.error;
  const stage=blockedLeg?'Return exceeds 1g':sequence?.error&&nav.mode==='auto'?'Route unavailable':nav.mode==='manual'?'Manual flight':dwell?(arc.replayAfterLap?'Final orbit':lapInfo?.departure?'Next: '+lapInfo.next:lapInfo?.at?'Orbiting '+lapInfo.at:'Orbital arc'):active?(Number.isFinite(trip.physicalTurns)?(trip.stage||trip.phase)+' · '+trip.physicalTurns.toLocaleString('en-US',{maximumFractionDigits:1})+' physical turns':trip.stage||stages[trip.phaseIndex]||trip.phase||stages[0]):sequence?.pointTurn?'Turning at waypoint':nav.waypoint?'At waypoint':nav.holdingOrbit?'In orbit':auto?.enabled?'Parking orbit':'Auto · coasting';
  $('pilotFlightStage').title=sequence?.error||(arc?.replayAfterLap?'The study restarts after this orbit.':'');
  if($('pilotFlightStage').textContent!==stage)$('pilotFlightStage').textContent=stage;
  $('pilotFlightMetrics').hidden=!active&&(!dwell||sequence.holding);
  const tour=isDirectTour(api.renderer()?.sceneId)&&nav.mode!=='manual';
  updateTourEstimate(tour,dwell?arc:null,active?trip:null);
  const remaining=$('pilotFlightRemaining');
  const departs=dwell&&(radiusPhase||timedWarp),replay=dwell&&arc.replayAfterLap;
  $('pilotFlightEtaLabel').textContent=replay?'Replay in':departs?'Departs in':'ETA';
  remaining.setAttribute('aria-label',replay?'Onboard time left before the scene restarts':departs?'Onboard time left before departure':radiusPhase?'Onboard time remaining in this maneuver':timedWarp?(dwell?'Onboard time until departure':'Onboard time until arrival'):tour?'Time remaining to destination on the shuttle clock':'Estimated onboard time remaining to destination');
  remaining.title=replay?'Onboard duration left on the final orbit before replay':departs?'Onboard time left on the current orbit before departure':radiusPhase?(dwell?'Onboard time left before the radius change':'Onboard time left to reach the selected radius'):timedWarp?(dwell?'Time remaining on this orbital arc':'Onboard time remaining on this warp transfer'):tour?'Remaining onboard time, including departure orbit':'Estimated onboard time remaining on this leg';
  remaining.textContent=formatClockDuration(Math.max(0,total-elapsed));
  bar.hidden=$('pilotFlightMetrics').hidden;bar.value=Math.max(0,Math.min(1,elapsed/Math.max(total,1e-10)));
  bar.setAttribute('aria-label',radiusPhase?(dwell?'Orbit progress':'Radius change progress'):timedWarp?(dwell?'Orbital arc progress':'Warp transfer progress'):'Progress to destination');
 }
 function setLine(node,content){
  node.hidden=!content;if(content&&node.textContent!==content)node.textContent=content;
 }
 function updateMotion(enterprise,speed,power,clock,effectiveWarp=false,vehicle=null){
  const localSpeed=speed;
  if(!enterprise)speed=clock?.distantSpeedMetersPerSecond??speed;
  $('pilotLegSpeed').textContent='v = '+formatFlightSpeed(speed);
  const beta=speed/FLIGHT_LIGHT_SPEED,log=$('pilotSpeedLog');
  const index=enterprise?NaN:(beta>1?Math.log10(beta):logSpeedRatio(beta,speed===localSpeed?clock?.speedLorentzFactor:undefined));
  $('pilotRatioLabel').textContent=enterprise?'v/c ~ ':'log₁₀(v/c) = ';
  log.parentElement.classList.toggle('warp-ratio',enterprise);motion.classList.toggle('enterprise-motion',enterprise);
  // A route benchmark, gravity field strength, or curvature of a chart path is
  // never an accelerometer reading. Missing support solutions remain unknown.
  const mode=enterprise?null:clock?.accelerationMode;
  const load=!enterprise&&mode!=='unavailable'&&Number.isFinite(clock?.crewLoadG)&&clock.crewLoadG>=0?clock.crewLoadG:NaN;
  const context={'free-fall':'Free fall',support:'Supported path',thrust:'Thrust',coast:'Coasting',unavailable:'Not available'}[mode];
  setLine($('pilotAccelMode'),context||'');
  $('motionPowerLabel').textContent=enterprise?'WARP FACTOR':'FELT ACCELERATION';
  log.textContent=enterprise?(Number.isFinite(beta)?(beta>=1e6?metricNumber(beta,3):String(Math.round(beta))):'—'):index===-Infinity?'−∞':metricNumber(index,2);
  if(vehicle){
   const nearLimit=!enterprise&&beta>=10**-.05&&beta<=1;
   $('pilotRatioLabel').textContent=nearLimit?'':'v/c '+(beta===0?'= ':'~ ');
   log.innerHTML=nearLimit?'10<sup>−0.1</sup> &lt; v/c &lt; 1':beta===0?'0':beta>0&&Number.isFinite(beta)?'10<sup>'+Math.log10(beta).toFixed(1).replace('-','−')+'</sup>':'—';
  }
  log.parentElement.hidden=false;
  log.parentElement.classList.toggle('metric-alert',!enterprise&&beta>Math.sqrt(1-1/1.1**2));
  log.title=enterprise?'Effective speed as a multiple of light speed':'Base-10 logarithm of distant-frame coordinate speed divided by light speed. −1 means 0.1c; the value approaches zero near light speed.';
  if(vehicle)log.title='Distant-frame speed divided by light speed. Near light speed the shuttle shows a sublight interval when the exponent would round to zero.';
  $('pilotLegSpeed').title=effectiveWarp?'Effective warp speed in the route chart.':'Coordinate distance traveled per second of distant reference time, using the scene’s chart.';
  if(Number.isFinite(speed)&&speed>=1000)$('pilotLegSpeed').title+=' '+metricNumber(speed,4)+' m/s.';
  const a=$('pilotFlightAcceleration');
  a.title=enterprise?'Warp factor':'An accelerometer measures non-gravitational push on board. A freely falling path can change speed and direction and still read zero.';
  if(mode==='support')a.title+=' This is the support needed to maintain the prescribed track.';
  if(mode==='thrust')a.title+=' This reading includes the modeled thrust.';
  if(mode==='unavailable')a.title='This track has no modeled accelerometer reading.';
  if(clock?.unavailableStationaryClock)a.title='A massive observer cannot remain fixed at these coordinates. No physical accelerometer or clock rate exists for this position hold.';
  a.setAttribute('aria-label',enterprise?'Warp factor':'Onboard accelerometer in g');
  const g=load;
  let reading;
  if(enterprise)reading='Warp '+formatFlightNumber(power);
  else if(!Number.isFinite(g))reading='a = —';
  else{
   const nearLimit=[1.5,5].find(limit=>g>limit&&Number(g.toFixed(1))===limit);
   reading=nearLimit?'a > '+formatGravity(nearLimit):'a = '+(isJanusPod(vehicle)&&mode==='thrust'?g.toFixed(2)+'g':formatGravity(g));
  }
  a.textContent=reading;
  const dilation=enterprise?1:clock?.rateFactor;
  const speedOutput=$('pilotLegSpeed');
  speedOutput.classList.toggle('metric-alert',dilation>1.1);a.classList.toggle('metric-alert',load>5);
  if(dilation>1.1)speedOutput.title+=' Time dilation: '+formatClockRate(dilation)+' (alert).';
  if(load>5)a.title+=' Above 5g: alert.';
  const returning=clock?.type==='shuttle'&&clock.minimumReturnG;
  setLine(escapeNote,returning>1&&Number.isFinite(returning)?('Return benchmark '+(returning<1.005?'> 1':'≈ '+metricNumber(returning,3)))+'g':'');
  const alert=$('pilotCrewAlert');
  const high=clock?.highGExposureSeconds??0,week=high>=7*86400,severe=load>5;
  const elapsed=high>0?(high>=1?formatClockDuration(high).replace(/\.0(?= )/,''):'<1 s'):'';
  let message='';
  if(load>1.5){
   const warning='>1.5g';
   message=severe?'Lethal acceleration':warning+(week?' (7 d limit)':elapsed?' for '+elapsed:'');
  }
  setLine(alert,message);alert.classList.toggle('metric-alert',severe);
  alert.title=(severe?'Above the simulation’s 5g warning threshold. ':'')+
   (week?'The 7-day exposure benchmark above 1.5g has been reached. ':'')+
   'Duration is continuous onboard time. Tolerance depends on the person and the direction of acceleration.';
 }

 function update(){
  const r=api.renderer(),flight=r?.getFlightState?.(),trip=r?.getTravelState?.(),auto=r?.autopilot,craft=selectedCraft(),nav=navigation(craft?.id),id=craft?.id||trip?.craftId||(r?.sceneId==='shuttle-space'?null:r?.driveId)||null;
  // The object inspector and helm can select a vehicle without moving the camera.
  // Only the camera's subject owns the readings; an unfocused orbit may still have a central body.
  const focusId=r?.focusId,focus=focusId?r?.objects?.find(o=>o.id===focusId):null;
  const observingCrew=!!focus&&Object.hasOwn(crewNames,focus.type);
  const body=r&&!observingCrew?observedBodyMeasurements(r):null;
  const subject=observingCrew?focus:body;
  const displayFlight=observingCrew&&focus.id===craft?.id;
  const bridge=isJanusPod(craft)?r.getJanusBridge?.(id):null;
  janusPanel.update(r,craft,bridge,displayFlight);
  const dockState=displayFlight&&craft.type==='shuttle'?r.getDockingState?.(id):null;
  dockingPanel.update(r,displayFlight||focus?.type==='habitat'?focus:null,dockState);
  const crewClock=updateTelemetry(r,flight,focus);
  const crewProfile=crewClock?.unavailableStationaryClock?'No static observer':crewClock?.freeFalling?(crewClock.approachHeld?'Free-fall snapshot':'Free fall'):crewClock?.radialMotionClock?(focus?.motion==='horizon'?'Supported lookout':'Prescribed path'):'Crew instruments';
  const profile=observingCrew?(isJanusPod(focus)?'Janus survey pod':focus.type==='enterprise'?'Warp flight':focus.type==='habitat'?'Rotating habitat':crewProfile):body?.kind||'Camera';
  updateSubject(subject,profile,body);updateRim(r,focus);
  const paused=!!api.state().paused,inTransit=!!trip?.active&&trip.craftId===id,guided=nav.mode!=='manual'&&(inTransit||!!auto?.enabled&&auto.craftId===id);
  if(travelSelection!==(craft?.id||null)||travelScene!==r?.sceneId){travelScene=r?.sceneId;travelSelection=craft?.id||null;tripWarp=sceneCruiseWarp(travelScene)??1;closeTravel();if(!craft)hint.hidden=true;}
  if(currentId!==id){clear(true);currentId=id;}if(blocked())clear();

  const manual=!!id&&nav.mode==='manual',visible=!!craft,readout=displayFlight&&!manual&&!dockState&&!bridge,changed=mount.hidden===visible||flightReadout.hidden===readout||scene?.classList.contains('has-playlist-launcher')!==(visible&&!manual);
  mount.hidden=!visible;flightReadout.hidden=!readout;tripGroup.hidden=!readout;mount.classList.toggle('pilot-manual',manual);scene?.classList.toggle('has-flight-controls',visible);scene?.classList.toggle('has-flight-readout',readout);scene?.classList.toggle('has-autopilot',guided);if((api.activePreset?.()||r?.sceneId)!=='solar-system')hint.hidden=true;
  const driveButton=$('pilotModeDrive');
  driveButton.disabled=!!dockState||!!bridge?.active;driveButton.title=bridge?.active?'The helm is available after the bridge closes.':dockState?'Use Docking to leave guidance or undock before taking the helm.':'Take the helm';
  let lapInfo=null;
  $('pilotManualControls').hidden=!manual;$('pilotAutoControls').hidden=manual;$('pilotLeft').hidden=!manual;$('pilotRight').hidden=!manual;$('pilotModeDrive').setAttribute('aria-pressed',String(manual));$('pilotModeAuto').setAttribute('aria-pressed',String(!manual));scene?.classList.toggle('has-playlist-launcher',visible&&!manual);const sequence=id?r?.getFlightSequence?.(id):null;if(visible&&!manual&&bridge&&sequence)$('pilotPlaylistCount').textContent=String(sequence.nodes.length);if(visible&&!manual&&!bridge&&sequence){$('pilotPlaylistCount').textContent=String(sequence.nodes.length);const target=inTransit?trip.targetId:sequence.orbitWait?.destinationId||sequence.nodes[sequence.index]?.targetId;
   const stop=auto?.craftId===id?auto.destinations?.[sequence.index]:null;
   const name=(inTransit&&trip.targetName)||(target&&(stop?.id===target?stop.name:r.getTravelTargets?.({craftId:id})?.find(t=>t.id===target)?.name))||'—';
   const current=sequence.nodes[sequence.index],radius=current?.radiusMeters;
   const radii=sequence.nodes.filter(n=>n.targetId===target&&n.radiusMeters).map(n=>n.radiusMeters);
   const nameAt=meters=>r.sceneId==='nasa-shuttle'?edgeOrbitName(r,craft,target,meters,radii):(meters===Math.min(...radii)?'Inner':meters===Math.max(...radii)?'Outer':'Intermediate')+' · '+name;
   const tiered=current?.targetId===target&&radius&&radii.some(m=>m!==radius);
   let caption=tiered?nameAt(radius):name,detail=tiered?name+' · '+metricDistance(radius)+' from center':name;
   const arc=sequence.active&&!inTransit&&sequence.orbitWait;
   if(arc){
    const actual=r.objects?.find(o=>o.id===arc.targetId)?.name||(arc.targetId===target?name:r.getFocusFrame?.(arc.targetId)?.name);
    lapInfo={at:actual,next:caption,departure:!!(arc.radiusChange||current?.transferProperSeconds)};
    // The queue index already identifies the *next* stop. During a same-body
    // dwell the countdown measures this parking arc, not the queued arrival.
    if(arc.radiusChange||arc.replayAfterLap){
     const occupied=craft.orbitMeters??arc.leg?.departureRadius;
     caption=tiered&&occupied>0?nameAt(occupied):actual||caption;
     detail=(actual||name)+(occupied>0?' · '+metricDistance(occupied)+' from center':'');
    }else if(lapInfo.departure&&actual){caption=actual;detail=actual;}
   }
   const tripTitle=caption==='—'?'Trip estimate':'Trip to '+caption;if(tourCaption.textContent!==tripTitle)tourCaption.textContent=tripTitle;
   const box=$('pilotDestination');if(box.textContent!==caption)box.textContent=caption;if(box.title!==detail)box.title=detail;
   }
  if(dialog.open){
   const editing=r?.objects?.find(o=>o.id===editorCraftId);
   if(editing&&navigation(editing.id).mode!=='manual')editor.refresh(editing,r.getFlightSequence(editing.id));else dialog.close();
  }
  if(travelPreview&&nav.mode==='manual')closeTravel();updateTravel();labelButton?.classList.remove('control-discovery');if(changed)r?.resize?.();
  // A tracked person or station carries instruments without adding a helm.
  const station=observingCrew&&['iss','astronaut','habitat'].includes(focus.type);
  const proximity=observingCrew?r.getHorizonProximity?.(focus.id):null;
  if(proximity){
   setLine(horizonNote,'Horizon gap = '+metricDistance(proximity.gapMeters));
   horizonNote.classList.toggle('distant-horizon',proximity.noticeable===false);
   horizonNote.title=proximity.name+' · Distance from the observer’s center to the nearest event horizon (radial coordinate gap). Red at 0.1g external gravity or 1% gravitational time dilation.';
  }else setLine(horizonNote,'');
  stack.hidden=!displayFlight&&!(station&&crewClock);scene?.classList.toggle('has-station-instruments',station);
  if(!readout)tourEstimate.hidden=true;
  if(station&&crewClock)updateMotion(false,crewClock.speedMetersPerSecond,0,crewClock);
  if(focus?.type==='habitat'&&crewClock){
   $('motionPowerLabel').textContent='HUB ACCELERATION';$('pilotFlightAcceleration').title='Proper acceleration of the station center. In a freely falling orbit the hub is weightless. Rim acceleration is the separate support supplied by the rotating floor.';
   $('pilotFlightAcceleration').setAttribute('aria-label','Station hub accelerometer in g');
   $('pilotLegSpeed').title='Station center speed in the distant frame. Ring spin is relative to the hub.';
  }
  if(!craft){mount.classList.remove('pilot-autopilot');return;}
  mount.classList.toggle('pilot-autopilot',guided);$('pilotStatus').hidden=true;$('pilotStatus').textContent=guided?`Autopilot engaged · ${paused?'Paused':trip?.stage||trip?.phase||auto?.phase||'Parking orbit'}${trip?.targetName?' · '+trip.targetName:''}`:paused?'Paused · press Play to continue flying.':'';
  const object=r.objects?.find(o=>o.id===id)||api.objects?.().find(o=>o.id===id)||{},type=object.type||flight?.type;
  const v=flight?.speedMetersPerSecond??0,k=flight?.curvaturePerMeter??0;
  const janus=isJanusPod(object),enterprise=janus?usesWarpHelm(object):type==='enterprise';
  $('janusPropulsion').hidden=!(manual&&janus);$('pilotVelocityLabel').hidden=!$('janusPropulsion').hidden;if(janus)$('janusPropulsion').value=enterprise?'warp':'impulse';
  const powerKey=(janus?'janus-'+(enterprise?'warp':'impulse'):type)+':'+(sceneCruiseWarp(r?.sceneId)??'');if(lastType!==powerKey){lastType=powerKey;$('pilotPower').setAttribute('min','0');$('pilotPower').setAttribute('max',String(enterprise?(sceneCruiseWarp(r?.sceneId)??9.9999):janus?JANUS_THRUST_MAX_G:1));$('pilotPower').setAttribute('step',String(enterprise||janus ? .01 : .1));$('pilotPower').setAttribute('aria-label',enterprise?'Warp level':'Commanded forward thrust in g');}
  const commandedThrust=inTransit?(trip.commandedThrustG??flight?.thrustSetting??0):guided?0:flight?.thrustSetting||0;
  const orbitalSpeed=sequence?.orbitalSpeed??r.getBridgeParkingOrbit?.(id)?.circularSpeedMetersPerSecond??r.getOrbitEditInfo?.(id)?.speedMetersPerSecond;
  const motionReading=enterprise?enterpriseMotionReading(r,object,flight,orbitalSpeed):null,warp=motionReading?.warp??0;
  const speed=motionReading?.speed??Math.abs(crewClock?.speedMetersPerSecond??(flight?.id===id&&!flight.holdingOrbit?v:orbitalSpeed??v));
  if(displayFlight)updateMotion(enterprise,speed,warp,crewClock,!!motionReading?.effectiveWarp,craft);
  if(readout)updateFlightReadout(inTransit?trip:null,auto?.craftId===id?auto:null,nav,id,sequence,lapInfo);
  if(document.activeElement!==$('pilotPower')||inTransit)$('pilotPower').value=enterprise?warp:commandedThrust;
  const heading=normalizeHeading(inTransit?(trip.headingDegrees??flight?.headingTargetDegrees??0):guided?(r.getFocusFrame?.(id)?.headingAngle||0)*180/Math.PI:flight?.headingTargetDegrees??0);$('pilotHeadingValue').textContent=heading+'°';$('pilotHeadingValue').title='Target heading relative to Drive entry. Arrows or A / D turn 5°; hold to repeat. The ship follows smoothly by the shortest turn.';
  $('pilotVelocityLabel').textContent=enterprise?'Warp':'Thrust';$('pilotV').textContent=enterprise?formatFlightNumber(warp):janus?commandedThrust.toFixed(2)+'g':formatGravity(commandedThrust);$('pilotK').textContent=formatFlightNumber(flight?.turnRateRadiansPerSecond??0)+' rad/s';$('pilotSpeed').textContent=paused?'Paused':enterprise?formatFlightNumber(v/299792458)+' × c':formatFlightNumber(v)+' m/s';
  mount.classList.toggle('pilot-shuttle',!enterprise);
  $('pilotLeft').classList.toggle('guidance-firing',inTransit&&trip.turningSign<0);$('pilotRight').classList.toggle('guidance-firing',inTransit&&trip.turningSign>0);$('pilotLeft').disabled=$('pilotRight').disabled=paused||guided||!!bridge?.active;$('pilotPower').disabled=$('pilotBrakeSpeed').disabled=guided||!!bridge?.active;$('janusPropulsion').disabled=!!bridge?.active;
  $('pilotBrakeSpeed').textContent=enterprise?'Stop motion':'Stop';$('pilotBrakeSpeed').setAttribute('data-short-label','■');$('pilotBrakeSpeed').setAttribute('aria-label',enterprise?'Stop motion':'Stop');$('pilotBrakeSpeed').title=enterprise?'Stop forward motion and turning':'Ramp engines down to zero; keep coasting';
  $('pilotPower').title=enterprise?(sceneCruiseWarp(r?.sceneId)?'Choose a warp factor up to the mission limit of '+sceneCruiseWarp(r.sceneId)+'.':'Select a warp factor. Warp 8–10 is the emergency range on this fictional scale.'):'Engine thrust setting per unit mass, up to '+(janus?JANUS_THRUST_MAX_G:1)+'g. The crew accelerometer reports the actual modeled push. To brake, turn and burn against your velocity.';
  $('pilotK').title='Angular velocity: '+formatFlightNumber(flight?.turnRateRadiansPerSecond??v*k)+' rad/s';
  mount.title=manual?(enterprise?'W / S changes warp factor. ':'W / S adjusts thrust by '+(janus?'0.01':'0.1')+'g. Turn 180° and burn forward to brake. ')+'Arrows or A / D turn 5°. Hold to repeat; release to hold heading. Drag to look; Esc returns to Auto.':'';
 }
 function closeTravel(){scene?.classList.remove('flight-preview-open');if(travelPreview)api.renderer()?.setTravelPreview?.(null);travelPreview=null;tripHeading=null;travelCard.hidden=true;scene?.classList.remove('has-travel-card');}
 function updateTravel(){
  const r=api.renderer(),data=travelPreview;if(!data){closeTravel();return;}const estimated=Number.isFinite(data.properSeconds)&&!data.error,craft=r?.objects?.find(o=>o.id===data.craftId)||selectedCraft(),shuttle=craft?.type==='shuttle';
  if(!craft||navigation(craft.id).mode!=='auto'){closeTravel();return;}
  travelCard.hidden=false;scene?.classList.add('flight-preview-open');scene?.classList.add('has-travel-card');
  $('pilotTripTarget').textContent=data.targetName||'Destination';$('pilotTripMode').textContent=shuttle?'AUTO FLIGHT · 1g':'AUTO FLIGHT · WARP';
  $('pilotTripQuestion').hidden=false;$('pilotTripQuestion').textContent=data.dockable?'Dock at the station’s lower hub port?':data.waypoint?'Stop at this waypoint?':'Move '+(craft.name|| (shuttle?'NASA Meridian':'NASA Warp Explorer'))+' into orbit here?';
  $('pilotTripHeadingRow').hidden=!data.waypoint;if(document.activeElement!==$('pilotTripHeading'))$('pilotTripHeading').value=tripHeading??'';$('pilotTripWarpRow').hidden=shuttle;$('pilotTripWarp').setAttribute('max',String(sceneCruiseWarp(r?.sceneId)??9.9999));$('pilotTripWarp').value=String(tripWarp);$('pilotTripWarpValue').textContent=formatFlightNumber(tripWarp);
  $('pilotTripTime').parentNode.hidden=!estimated;$('pilotTripTimeLabel').textContent='Onboard time from here';$('pilotTripTime').textContent=formatClockDuration(data.properSeconds||0);
  $('pilotTripProperRow').hidden=!estimated||!shuttle;$('pilotTripProper').textContent=formatClockDuration(data.coordinateSeconds||0);
  $('pilotTripDilationRow').hidden=!estimated||!shuttle;$('pilotTripDilation').textContent=formatClockDuration(data.estimatedDilationSeconds??data.dilationSeconds??0);
  $('pilotTripProgress').hidden=true;$('pilotTripNote').textContent=data.dockable?'Match the station’s orbit, then close on rim jets. Choose the upper or lower port in Playlist.':!estimated?'This stop can be queued. Flight time depends on the preceding stop.':(r.state?.bridge?'Bridge approach and crossing':data.radiusChange?'Orbit radius change · 10 s on screen':data.waypoint?'Straight flight · 10 s on screen':'Orbital arc · 5 s   /   Tangent flight · 10 s');
  $('pilotTripCancel').hidden=false;$('pilotTripQueue').disabled=false;$('pilotTripClose').setAttribute('aria-label','Close flight preview');$('pilotTripClose').title='Close and choose another destination';
 }
 function travelOption(id){const r=api.renderer(),craft=selectedCraft();if(!craft||!api.state().annotations||navigation(craft.id).mode!=='auto')return null;const options={craftId:craft.id,warpFactor:tripWarp},target=(r.getTravelTargets?.(options)||[]).find(t=>t.id===id);if(target?.waypoint&&travelPreview?.targetId===id&&tripHeading!==null)options.heading=tripHeading;return target?{r,craft,options,target}:null;}
 function previewTravel(id){
  const craftForBridge=selectedCraft();if(isJanusPod(craftForBridge)&&api.state().annotations){if(!api.renderer()?.getJanusBridge?.(craftForBridge.id)?.targets.some(t=>t.id===id))return false;return openPlaylist(craftForBridge.id,id);}
  const opening=travelPreview?.targetId!==id;if(opening)tripHeading=null;const available=travelOption(id);if(!available)return false;const {r,craft,options,target}=available,result=target.dockable?null:r.previewTravel?.(id,options);travelSelection=craft.id;travelPreview={targetId:id,targetName:target.name||target.label||id,...result,craftId:craft.id,craftType:craft.type,waypoint:!!target.waypoint,dockable:!!target.dockable};r.setTravelPreview?.(result&&!result.error?travelPreview:null);clear();api.closePanels?.();updateTravel();if(opening)$('pilotTripQueue').focus?.({preventScroll:true});return true;
 }
 function goToLabel(id){
  const r=api.renderer(),craft=selectedCraft();if(!craft||!api.state().annotations)return false;
  if(isJanusPod(craft)){const s=r.getJanusBridge?.(craft.id);if(!s||!s.targets.some(t=>t.id===id))return false;const ok=r.startTravel?.(id,{craftId:craft.id});if(ok&&!ok.error){api.setPaused?.(false);api.refresh?.();update();return true;}return false;}
  const target=r.getTravelTargets?.({craftId:craft.id})?.find(t=>t.id===id);if(!target)return false;
  const previous=r.getFlightSequence?.(craft.id)?.nodes?.find(n=>n.targetId===id);
  const node={targetId:id,...(target.dockable?{kind:'dock',port:previous?.port||'south'}:{}),...(craft.type==='enterprise'?(previous?.transferProperSeconds?{transferProperSeconds:previous.transferProperSeconds}:{warpFactor:previous?.warpFactor??tripWarp}):{})};
  closeTravel();const result=r.setFlightSequence(craft.id,[node],{flyNow:true,loop:false});
  if(!result||result.error){api.toast?.(result?.error||'Unable to reach this destination.');return true;}
  api.setPaused(false);api.refresh();update();return true;
 }
 listen(travelCard,'pointerdown',event=>event.stopPropagation());listen(travelCard,'wheel',event=>event.stopPropagation(),{passive:true});
 if(labelButton)listen(labelButton,'click',()=>{if(!api.state().annotations)closeTravel();update();});
 listen($('pilotTripClose'),'click',()=>{closeTravel();update();});
 listen($('pilotTripCancel'),'click',()=>{closeTravel();update();});
 listen($('pilotTripWarp'),'input',()=>{tripWarp=Math.max(1,Math.min(sceneCruiseWarp(api.renderer()?.sceneId)??9.9999,Number($('pilotTripWarp').value)||1));if(travelPreview)previewTravel(travelPreview.targetId);});
 listen($('pilotTripHeading'),'input',()=>{tripHeading=optionalHeading($('pilotTripHeading').value);if(travelPreview)previewTravel(travelPreview.targetId);});

 listen($('pilotTripQueue'),'click',()=>{if(!travelPreview)return;const {craftId,targetId,waypoint}=travelPreview,heading=waypoint?tripHeading:null;closeTravel();api.openFlightPlan?.(craftId,targetId,tripWarp,heading);});
 function start(id,mode=null){
  const r=api.renderer();
  if(!r?.objects?.some(o=>o.id===id&&['shuttle','enterprise'].includes(o.type)))return false;
  const previous=navigation(id).mode,next=mode||(previous==='manual'?'auto':'manual');
  const reclaim=next==='manual'&&r.sceneId==='shuttle-space'&&(r.driveId!==id||r.focusId!==id||r.focusMode!=='chase');
  if(next===previous&&!reclaim){
   if(next==='manual'&&r.sceneId==='shuttle-space'&&api.state().paused)api.setPaused(false);
   return true;
  }
  closeTravel();clear(true);
  if(r.setNavigationMode?.(id,next)===false)return false;
  r.selectObject?.(id);currentId=id;showHint();
  if(api.state().paused!==false)api.setPaused(false);
  api.refresh();update();return true;
 }

 return{start,update,releaseInput:()=>clear(true),openPlaylist,previewTravel,goToLabel,showHint,closeTravel,dispose(){if(renderPill&&renderHome)renderHome.append(renderPill);if(distancePanel){distancePanel.hidden=false;scene?.append(distancePanel);}instruments.remove();dialog.remove();dockingPanel.dispose();janusPanel.dispose();closeTravel();labelButton?.classList.remove('control-discovery');travelCard.remove();flightReadout.remove();hint.remove();escapeNote.remove();tourEstimate.remove();stack.remove();clear(true);disposed=true;observer?.disconnect();listeners.forEach(fn=>fn());mount.hidden=true;telemetry.remove();scene?.classList.remove('has-flight-controls');scene?.classList.remove('has-playlist');scene?.classList.remove('has-flight-readout');scene?.classList.remove('has-autopilot');scene?.classList.remove('has-object-clock');scene?.classList.remove('has-station-instruments');}};
}

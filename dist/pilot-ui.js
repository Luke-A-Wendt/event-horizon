import {speedForWarp,FLIGHT_LIGHT_SPEED} from './flight-dynamics.js';
import {edgeOrbitName,installPlaylistEditor} from './playlist-ui.js';
import {formatClockDuration,formatClockRate} from './object-clocks.js';
const keys={KeyW:['speed',1],KeyS:['speed',-1],KeyA:['heading',-1],KeyD:['heading',1]};
const HEADING_STEP=5,HEADING_REPEAT_MS=100,HEADING_HOLD_DELAY_MS=350;
const normalizeHeading=value=>((Math.round(value)%360)+540)%360-180;
const isDirectTour=id=>id==='shuttle-proxima-direct'||id==='shuttle-sgra-direct';
const flightNumber=new Intl.NumberFormat(undefined,{minimumSignificantDigits:2,maximumSignificantDigits:2});
const superscripts={'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
const gravityNumber=new Intl.NumberFormat("en-US",{minimumFractionDigits:1,maximumFractionDigits:1,useGrouping:false});
export const formatGravity=g=>gravityNumber.format(Math.abs(Number(g)||0))+"g";
function scientificMagnitude(value){const [m,e]=Math.abs(Number.isFinite(value)?value:0).toExponential(1).split("e");return m+'×10'+String(Number(e)).split('').map(c=>superscripts[c]).join('');}
export function formatFlightSpeed(speed){return scientificMagnitude(speed)+' m/s';}
export function formatFlightNumber(n){
 if(!Number.isFinite(n))return '—';if(n===0)return '0';
 const rounded=Number(n.toPrecision(2)),magnitude=Math.abs(rounded);
 if(magnitude>=1e5||magnitude<.001){const [mantissa,exponent]=n.toExponential(1).split('e');return mantissa+' × 10'+String(Number(exponent)).split('').map(c=>superscripts[c]).join('');}
 return flightNumber.format(rounded);
}
// Keep the legacy export name for callers; clocks use readable elapsed-time units.
export const formatFlightDilation=formatClockDuration;
export function installPilotControls(api){
 const mount=api.mount;if(!mount)return{update(){},start(){return false;},dispose(){}};
 mount.hidden=true;mount.className='pilot-console';
 mount.innerHTML=`
 <button id="pilotLeft" class="pilot-turn pilot-left" aria-label="Turn left 5 degrees; hold to repeat" title="Left 5° · A · hold to repeat">‹</button>
 <div class="pilot-main"><div class="pilot-mode-options" role="group" aria-label="Vehicle control mode"><button type="button" id="pilotModeAuto" aria-pressed="true" title="Follow the flight playlist">Auto</button><button type="button" id="pilotModeDrive" aria-pressed="false" title="Take the helm">Drive</button></div><div id="pilotManualControls" class="pilot-manual-controls" hidden><button id="pilotBrakeSpeed" title="Stop forward motion and turning">Stop motion</button><div class="pilot-sliders"><div class="pilot-info-row"><span id="pilotVelocityLabel">Warp</span><div class="pilot-heading-readout"><span>Heading</span> <output id="pilotHeadingValue" aria-label="Target heading relative to start of driving">0°</output></div></div><label class="pilot-power"><span class="pilot-range"><input id="pilotPower" type="range" min="0" max="9.9999" step=".01" value="4" aria-label="Warp level"></span><output id="pilotV">4</output></label></div></div><div id="pilotAutoControls" class="pilot-auto-controls"></div><p id="pilotStatus" class="pilot-status" role="status" hidden></p></div>
 <button id="pilotRight" class="pilot-turn pilot-right" aria-label="Turn right 5 degrees; hold to repeat" title="Right 5° · D · hold to repeat">›</button>`;
 const launcher=mount.querySelector('#pilotAutoControls');
 launcher.innerHTML='<button type="button" id="pilotPlaylist" aria-haspopup="dialog">Playlist <span id="pilotPlaylistCount">0</span></button><div class="pilot-destination"><small class="flight-sr">Destination</small><output id="pilotDestination" aria-label="Current destination">—</output></div>';
 const dialog=document.createElement('dialog');dialog.id='vehiclePlaylistDialog';dialog.setAttribute('aria-labelledby','vehiclePlaylistTitle');
 dialog.innerHTML='<div class="dialog-header"><h2 id="vehiclePlaylistTitle">Flight playlist</h2><button type="button" class="icon-button" aria-label="Close playlist">×</button></div><div class="dialog-content pilot-auto-controls"></div>';
 document.body.append(dialog);
 const editor=installPlaylistEditor(dialog.querySelector('.dialog-content'),api);
 launcher.querySelector('button').addEventListener('click',()=>{const craft=selectedCraft();if(!craft)return;editor.refresh(craft,api.renderer().getFlightSequence(craft.id));if(!dialog.open)dialog.showModal();});
 dialog.querySelector('button').addEventListener('click',()=>dialog.close());
 const scene=mount.parentElement||mount.parentNode;
 const flightReadout=document.createElement('section');flightReadout.id='pilotFlightReadout';flightReadout.className='pilot-flight-readout';flightReadout.hidden=true;flightReadout.setAttribute('aria-label','Vehicle telemetry');
 flightReadout.innerHTML='<div class="pilot-flight-body"><dl id="pilotFlightMetrics" class="pilot-flight-metrics"><div><dt id="pilotFlightEtaLabel">ETA</dt><dd><output id="pilotFlightRemaining" aria-label="Estimated duration of the entire maneuver">0 s</output></dd></div></dl><div class="pilot-flight-route"><div class="pilot-flight-stage"><output id="pilotFlightStage" aria-live="polite">In orbit</output></div></div></div>';const tripGroup=document.createElement('div');tripGroup.className='flight-trip-group';launcher.append(tripGroup);tripGroup.append(launcher.querySelector('.pilot-destination'),flightReadout);const bar=document.createElement('progress');bar.className='flight-leg-progress';bar.max=1;bar.value=0;bar.hidden=true;bar.setAttribute('aria-label','Progress to destination');tripGroup.append(bar);
 const travelCard=document.createElement('section');travelCard.id='pilotTravel';travelCard.className='pilot-travel';travelCard.hidden=true;travelCard.setAttribute('aria-label','Change orbit');travelCard.setAttribute('data-scene-control','');
 travelCard.innerHTML='<div class="pilot-travel-heading"><div><small id="pilotTripMode"></small><h3 id="pilotTripTarget"></h3></div><button id="pilotTripClose" aria-label="Close travel preview" title="Close travel preview">×</button></div><p id="pilotTripQuestion">Change orbit to this object?</p><label id="pilotTripWarpRow" class="transfer-warp" hidden><span>Trip warp <output id="pilotTripWarpValue">1</output></span><input id="pilotTripWarp" type="range" min="1" max="9.9999" step=".1" value="1" aria-label="Warp factor for this trip"></label><label id="pilotTripHeadingRow" class="arrival-heading" hidden><span>Arrival heading · degrees</span><input id="pilotTripHeading" type="number" min="-180" max="180" step="5" placeholder="Auto" aria-label="Arrival heading in degrees; leave blank for automatic alignment"></label><div class="pilot-trip-time"><span id="pilotTripTimeLabel">Onboard flight time</span><output id="pilotTripTime"></output></div><div class="pilot-trip-secondary" id="pilotTripProperRow"><span id="pilotTripProperLabel">Distant time</span><output id="pilotTripProper"></output></div><div class="pilot-trip-secondary" id="pilotTripDilationRow"><span id="pilotDilationLabel">Time dilation</span><output id="pilotTripDilation"></output></div><progress id="pilotTripProgress" max="1" value="0" hidden aria-label="Trip progress"></progress><p id="pilotTripNote"></p><div class="pilot-trip-actions"><button id="pilotTripQueue">Add to playlist</button><button id="pilotTripCancel">Cancel</button></div>';scene?.append(travelCard);
 // Keep decisions immediately below the destination, before optional estimates.
 travelCard.querySelector('#pilotTripQuestion').after(travelCard.querySelector('.pilot-trip-actions'));
 const stack=document.createElement('div');stack.className='motion-stack';stack.hidden=true;scene?.append(stack);
 const motion=document.createElement('section');motion.className='motion-hud';motion.setAttribute('aria-label','Vehicle motion');
 motion.innerHTML='<div class="motion-speed-group"><span class="eyebrow">SPEED</span><output id="pilotLegSpeed" aria-label="Speed in metres per second"></output><div class="motion-log"><span id="pilotRatioLabel">log₁₀(1 − v/c) = </span><output id="pilotSpeedLog"></output></div></div><div class="motion-power"><span class="eyebrow" id="motionPowerLabel">ACCELERATION</span><output id="pilotFlightAcceleration"></output><span id="pilotCrewAlert" class="crew-alert" hidden></span></div>';
 const escapeNote=document.createElement('aside');escapeNote.id='shuttleEscapeNote';escapeNote.className='shuttle-escape-note';escapeNote.hidden=true;escapeNote.title='Minimum average acceleration from the work needed for a straight return to the outer orbit. This benchmark is distinct from the thrust required to fly this track. It is not a limit for escape to infinity.';motion.querySelector('.motion-power').append(escapeNote);
 const horizonNote=document.createElement('aside');horizonNote.id='pilotHorizonWarning';horizonNote.className='shuttle-escape-note';horizonNote.hidden=true;motion.querySelector('.motion-power').append(horizonNote);
 const tourEstimate=document.createElement('aside');tourEstimate.className='tour-estimate';tourEstimate.id='tourEstimate';tourEstimate.hidden=true;tourEstimate.setAttribute('aria-label','Transfer time estimates');
 tourEstimate.innerHTML='<div class="trip-caption eyebrow" id="tourCaption">Trip estimate</div><dl><div><dt class="eyebrow">Distance</dt><dd id="tourDistance">—</dd></div><div><dt class="eyebrow">Onboard</dt><dd id="tourShipTime">—</dd></div></dl>';stack.append(tourEstimate,motion);
 const tourCaption=tourEstimate.querySelector('#tourCaption');
 const tourOutputs=['tourDistance','tourShipTime'].map(id=>tourEstimate.querySelector('#'+id));
 function updateTourEstimate(tour,arc,trip){
  const years=(arc?arc.transferSeconds:trip?.properSeconds)/31557600;
  tourEstimate.hidden=!tour||!(years>=1);if(tourEstimate.hidden)return;
  const ly=(arc?arc.transferDistanceMeters:trip?.pathLengthMeters)/9.4607304725808e15;
  const fmt=n=>n.toLocaleString('en-US',{maximumSignificantDigits:3});
  const values=[ly>0?fmt(ly)+' ly':'',fmt(years)+' yr'];
  values.forEach((v,i)=>{if(tourOutputs[i].textContent!==v)tourOutputs[i].textContent=v;});
 }
 const hint=document.createElement('aside');hint.id='pilotNavHint';hint.className='pilot-nav-hint';hint.hidden=true;hint.setAttribute('data-scene-control','');hint.setAttribute('aria-label','Flight controls');hint.innerHTML='<button id="pilotHintClose" aria-label="Dismiss flight hint">×</button><strong>Choose your next destination</strong><p>In Auto, choose a next stop in the playlist, on the Map, or by tapping a scene label. Hold and drag a stop to reorder it. Turn on Loop to repeat the route.</p><p>Choose Drive to take over from the current position. Set power and steer with the heading arrows. Play and Pause work in both modes.</p>';scene?.append(hint);
 const labelButton=document.getElementById('annotationShortcut');let travelPreview=null,travelSelection=null,tripWarp=1,tripHeading=null,hintShown=false;
 const optionalHeading=value=>String(value).trim()===''||!Number.isFinite(Number(value))?null:Math.max(-180,Math.min(180,Number(value)));
 const navigation=id=>api.renderer()?.getNavigationState?.(id)||{mode:api.renderer()?.driveId===id?'manual':'auto'};
 const selectedCraft=()=>{const r=api.renderer();if(r?.objects?.some(o=>o.id===r.focusId&&['astronaut','iss'].includes(o.type)))return null;if(r?.driveId&&r.focusId===r.driveId&&navigation(r.driveId).mode==='manual')return r.objects.find(o=>o.id===r.driveId);return [r?.selectedId,r?.driveId,r?.focusId].map(id=>r?.objects?.find(o=>o.id===id&&['enterprise','shuttle'].includes(o.type))).find(Boolean)||null;};
 const telemetry=document.createElement('div');telemetry.id='pilotTelemetry';telemetry.className='pilot-telemetry';telemetry.hidden=true;
 telemetry.innerHTML='<div id="pilotSpeedRow"><span>Speed</span><output id="pilotSpeed" aria-label="Speed">0 m/s</output></div><div id="pilotTurnRow"><span>Angular velocity</span><output id="pilotK" aria-label="Angular velocity">0 rad/s</output></div><div id="pilotOnboardRow" hidden><span>Onboard flight</span><output id="pilotOnboard">0 s</output></div><div id="pilotDilationRow" hidden><span id="pilotDilationLabel">Time dilation</span><output id="pilotDilation" aria-label="Time difference between distant and onboard clocks since creation">0 s</output></div><div id="pilotDilationRateRow" hidden><span>Rate</span><output id="pilotDilationRate" aria-label="Distant seconds per onboard second">1.0×</output></div>';
 const distancePanel=scene?.querySelector('.scene-bottom');
 (distancePanel||scene||mount).append(telemetry);
 const distanceSize=distancePanel&&typeof ResizeObserver==='function'?new ResizeObserver(([entry])=>{const height=entry.borderBoxSize?.[0]?.blockSize??distancePanel.offsetHeight;scene.style.setProperty('--distance-panel-height',Math.ceil(height)+'px');}):null;
 if(distanceSize)distanceSize.observe(distancePanel);
 const $=id=>mount.querySelector('#'+id)||telemetry.querySelector('#'+id)||travelCard.querySelector('#'+id)||flightReadout.querySelector('#'+id)||motion.querySelector('#'+id)||hint.querySelector('#'+id),keyboardHeld=new Set(),listeners=[];let currentId=null,disposed=false,lastInput='',lastType=null,holdTimer=null,holdButton=null;const thrustStepTimes=new Map();
 const listen=(node,event,fn,options)=>{node.addEventListener(event,fn,options);listeners.push(()=>node.removeEventListener(event,fn,options));};
 const blocked=()=>disposed||!currentId||navigation(currentId).mode!=='manual'||!!api.renderer()?.getTravelState?.()?.active||!!api.renderer()?.autopilot?.enabled||document.hidden||!!api.state().paused||!!document.querySelector('dialog[open]');
 const editable=target=>/^(INPUT|SELECT|TEXTAREA)$/.test(target?.tagName||'')||target?.isContentEditable||target?.closest?.('[contenteditable="true"]');
 const isShuttle=()=>api.renderer()?.getFlightState?.()?.type==='shuttle';
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
   if(!keyboardHeld.has(opposite)&&(first||event.repeat&&now-(thrustStepTimes.get(event.code)??-Infinity)>=HEADING_REPEAT_MS)){thrustStepTimes.set(event.code,now);const r=api.renderer(),flight=r?.getFlightState?.();if(keys[event.code][0]==='heading')nudgeHeading(keys[event.code][1]);else r?.setFlightPower?.((flight?.thrustSetting||0)+keys[event.code][1]*(isShuttle()?0.1:0.5));}
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
 listen($('pilotPower'),'input',()=>{if(blocked())return;api.renderer()?.setFlightPower?.(Number($('pilotPower').value));update();});
 function updateTelemetry(r,flight,driveId,guided=false,instrumentId=null){
  // A followed or driven Enterprise never inherits another selected clock.
  const objectType=id=>r?.objects?.find(object=>object.id===id)?.type;
  const observer=['astronaut','iss'].includes(objectType(r?.focusId))?r.focusId:null;
  const protectedEnterprise=!observer&&(objectType(instrumentId)||objectType(r?.focusId)||flight?.type)==='enterprise';
  let clock=null;
  if(!protectedEnterprise&&typeof r?.getObjectClock==='function'){
   const expedition=r.sceneId==='orbital-expedition'?r.objects?.find(o=>o.type==='iss')?.id:null;
   for(const id of new Set([observer,driveId,instrumentId,r.focusId,r.selectedId,expedition].filter(Boolean))){clock=r.getObjectClock(id);if(clock)break;}
  }else if(!protectedEnterprise&&flight?.type==='shuttle')clock={lagSeconds:flight.timeLagSeconds??Math.max(0,(flight.coordinateTimeSeconds||0)-(flight.properTimeSeconds||0)),rateFactor:flight.timeDilationFactor||1};
  telemetry.hidden=(!driveId||guided)&&!clock;scene?.classList.toggle('has-object-clock',!!clock);
  $('pilotSpeedRow').hidden=!!clock||!driveId||guided||protectedEnterprise;$('pilotTurnRow').hidden=!!clock||!driveId||guided||protectedEnterprise;
  $('pilotDilationRow').hidden=!clock;$('pilotDilationRateRow').hidden=!clock||!(clock.rateFactor>=1);
  $('pilotDilationLabel').textContent=clock?.approachHeld?'Time dilation · held':'Time dilation';
  if(!clock)return;
  $('pilotDilationRate').classList.toggle('metric-alert',clock.rateFactor>1.1);
  $('pilotDilation').classList.toggle('metric-alert',clock.lagSeconds>31557600);
  const rate=formatClockRate(clock.rateFactor);if($('pilotDilationRate').textContent!==rate)$('pilotDilationRate').textContent=rate;
  $('pilotDilationRate').title='Distant seconds per onboard second (dt/dτ). Gravity and local motion set this approximate clock comparison. The object remains outside the horizon.';
  const value=formatClockDuration(Math.max(0,clock.lagSeconds||0));if($('pilotDilation').textContent!==value)$('pilotDilation').textContent=value;
  $('pilotDilation').title=(clock.name?clock.name+' · ':'')+'Time difference t − τ since creation: integral of (dt/dτ − 1) over onboard proper time. Guided routes advance the clock by the simulated journey. A stationary clock in flat space accumulates zero. Coasting after a burn retains speed-related dilation. Pausing stops the comparison; changing views or leaving Drive preserves it.';
  return clock;
 }
 function updateFlightReadout(trip,auto,nav,id,sequence){
  const arc=sequence?.orbitWait,dwell=!!sequence?.active&&!!arc;
  const timedWarp=nav.mode!=='manual'&&!!sequence?.nodes?.[sequence.index]?.transferProperSeconds;
  const active=!!trip?.active&&trip.craftId===id,radiusPhase=dwell?!!arc.radiusChange:active&&!!trip.radiusChange;
  // Same-body laps and guided radius burns are distinct maneuvers. Each has its own clock.
  const arcTime=dwell?(arc.durationSeconds||0):radiusPhase||timedWarp?0:(trip?.departureArcSeconds||0);
  const transferTime=dwell?(radiusPhase||timedWarp?0:arc.transferSeconds):(trip?.properSeconds||0),total=arcTime+(transferTime||0);
  const elapsed=dwell?arcTime*(arc.arcFraction||0):arcTime+(trip?.properElapsedSeconds||0);
  const stages=['Leaving orbit','Accelerating','Flip and burn','Decelerating','Entering orbit'];
  const blockedLeg=sequence?.holding&&sequence?.error;
  const stage=blockedLeg?'Return exceeds 1g':sequence?.error&&nav.mode==='auto'?'Route unavailable':nav.mode==='manual'?'Manual flight':dwell?'Orbital arc':active?(trip.stage||stages[trip.phaseIndex]||trip.phase||stages[0]):sequence?.pointTurn?'Turning at waypoint':nav.waypoint?'At waypoint':nav.holdingOrbit?'In orbit':auto?.enabled?'Parking orbit':'Auto · coasting';
  $('pilotFlightStage').title=sequence?.error||'';
  if($('pilotFlightStage').textContent!==stage)$('pilotFlightStage').textContent=stage;
  $('pilotFlightMetrics').hidden=!active&&(!dwell||sequence.holding);
  const tour=isDirectTour(api.renderer()?.sceneId)&&nav.mode!=='manual';
  updateTourEstimate(tour,dwell?arc:null,active?trip:null);
  const remaining=$('pilotFlightRemaining');
  remaining.setAttribute('aria-label',radiusPhase?'Onboard time remaining in this maneuver':timedWarp?(dwell?'Onboard time until departure':'Onboard time until arrival'):tour?'Time remaining to destination on the shuttle clock':'Estimated duration of the entire maneuver');
  remaining.title=radiusPhase?(dwell?'Onboard time left before the radius change':'Onboard time left to reach the selected radius'):timedWarp?(dwell?'Time remaining on this orbital arc':'Onboard time remaining on this warp transfer'):tour?'Remaining onboard time, including departure orbit':'Total onboard time for this leg';
  remaining.textContent=formatClockDuration(tour||timedWarp||radiusPhase?Math.max(0,total-elapsed):total);
  bar.hidden=$('pilotFlightMetrics').hidden;bar.value=Math.max(0,Math.min(1,elapsed/Math.max(total,1e-10)));
  bar.setAttribute('aria-label',radiusPhase?(dwell?'Orbit progress':'Radius change progress'):timedWarp?(dwell?'Orbital arc progress':'Warp transfer progress'):'Progress to destination');
 }
 function setLine(node,content){
  node.hidden=!content;if(content&&node.textContent!==content)node.textContent=content;
 }
 function updateMotion(enterprise,speed,power,clock){
  $('pilotLegSpeed').textContent='v = '+formatFlightSpeed(speed);
  const beta=speed/FLIGHT_LIGHT_SPEED,log=$('pilotSpeedLog');
  const roundedLog=!enterprise&&beta>=0&&beta<1?Number((Math.log1p(-beta)/Math.LN10).toFixed(1)):0;
  $('pilotRatioLabel').textContent=enterprise?'v/c = ':'log₁₀(1 − v/c) = ';
  log.parentElement.classList.toggle('warp-ratio',enterprise);motion.classList.toggle('enterprise-motion',enterprise);
  const load=enterprise?NaN:clock?.crewLoadG;
  $('motionPowerLabel').textContent=enterprise?'WARP FACTOR':'ACCELEROMETER';
  log.parentElement.hidden=!enterprise&&!roundedLog;
  log.textContent=enterprise?String(Math.round(beta)):roundedLog.toFixed(1).replace('-','−');
  log.title=enterprise?'Speed as a multiple of light speed':'Base-10 logarithm of the remaining fraction of light speed';
  $('pilotLegSpeed').title=clock?.radialMotionClock?'Local speed measured in the frame dragged by the black hole. Playback is accelerated.':'Speed in the local reference frame.';
  const a=$('pilotFlightAcceleration');
  a.title=enterprise?'Warp factor':'Acceleration a person would feel following this path. This same reading triggers the exposure warning.';
  a.setAttribute('aria-label',enterprise?'Warp factor':'Onboard accelerometer in g');
  const g=load;
  let reading;
  if(enterprise)reading='Warp '+formatFlightNumber(power);
  else if(!Number.isFinite(g))reading='a = —';
  else{
   const nearLimit=[1.5,5].find(limit=>g>limit&&Number(g.toFixed(1))===limit);
   const compact=g>=1e6||(g>0&&g<.05);
   reading=nearLimit?'a > '+nearLimit+'g':'a = '+(compact?scientificMagnitude(g)+'g':Math.abs(g)>=100?Math.round(Math.abs(g)).toLocaleString('en-US')+'g':formatGravity(g));
  }
  a.textContent=reading;
  const dilation=enterprise?1:clock?.rateFactor;
  const speedOutput=$('pilotLegSpeed');
  speedOutput.classList.toggle('metric-alert',dilation>1.1);a.classList.toggle('metric-alert',load>5);
  if(dilation>1.1)speedOutput.title+=' Time dilation: '+formatClockRate(dilation)+' (alert).';
  if(load>5)a.title+=' Above 5g: alert.';
  const returning=!enterprise&&clock?.minimumReturnG;
  setLine(escapeNote,returning>1&&Number.isFinite(returning)?'Minimum escape = '+(returning<1.5?'>1':returning.toFixed(0))+'g':'');
  const required=Number.isFinite(clock?.requiredSupportG)?clock.requiredSupportG:0;
  const conditional=required>1,alert=$('pilotCrewAlert');
  const high=clock?.highGExposureSeconds??0,week=high>=7*86400,severe=load>5;
  const elapsed=high>0?(high>=1?formatClockDuration(high).replace(/\.0(?= )/,''):'<1 s'):'';
  let message='';
  if(load>1.5){
   const warning=(conditional?'>1.5g if held':'>1.5g');
   message=severe?'Lethal acceleration':warning+(week?' · 7 d limit':elapsed?' · '+elapsed:'');
  }
  setLine(alert,message);alert.classList.toggle('metric-alert',severe);
  alert.title=(conditional?'Estimated exposure if this path is maintained. ':'')+
   (severe?'Above the simulation’s 5g warning threshold. ':'')+
   (week?'The 7-day exposure benchmark above 1.5g has been reached. ':'')+
   'Duration is continuous onboard time. Tolerance depends on the person and the direction of acceleration.';
 }

 function update(){
  const r=api.renderer(),flight=r?.getFlightState?.(),trip=r?.getTravelState?.(),auto=r?.autopilot,craft=selectedCraft(),nav=navigation(craft?.id),id=craft?.id||trip?.craftId||r?.driveId||null;
  const paused=!!api.state().paused,inTransit=!!trip?.active&&trip.craftId===id,guided=nav.mode!=='manual'&&(inTransit||!!auto?.enabled&&auto.craftId===id);
  if(travelSelection!==(craft?.id||null)){travelSelection=craft?.id||null;tripWarp=1;closeTravel();if(!craft)hint.hidden=true;}
  if(currentId!==id){clear(true);currentId=id;}if(blocked())clear();

  const manual=!!id&&nav.mode==='manual',visible=!!craft,readout=!!craft&&!manual,changed=mount.hidden===visible||flightReadout.hidden===readout||scene?.classList.contains('has-playlist-launcher')!==(visible&&!manual);
  mount.hidden=!visible;flightReadout.hidden=!readout;mount.classList.toggle('pilot-manual',manual);scene?.classList.toggle('has-flight-controls',visible);scene?.classList.toggle('has-flight-readout',readout);scene?.classList.toggle('has-autopilot',guided);if((api.activePreset?.()||r?.sceneId)!=='solar-system')hint.hidden=true;
  $('pilotManualControls').hidden=!manual;$('pilotAutoControls').hidden=manual;$('pilotLeft').hidden=!manual;$('pilotRight').hidden=!manual;$('pilotModeDrive').setAttribute('aria-pressed',String(manual));$('pilotModeAuto').setAttribute('aria-pressed',String(!manual));scene?.classList.toggle('has-playlist-launcher',visible&&!manual);const sequence=id?r?.getFlightSequence?.(id):null;if(visible&&!manual&&sequence){$('pilotPlaylistCount').textContent=String(sequence.nodes.length);const target=inTransit?trip.targetId:sequence.orbitWait?.destinationId||sequence.nodes[sequence.index]?.targetId;
   const stop=auto?.craftId===id?auto.destinations?.[sequence.index]:null;
   const name=(inTransit&&trip.targetName)||(target&&(stop?.id===target?stop.name:r.getTravelTargets?.({craftId:id})?.find(t=>t.id===target)?.name))||'—';
   const current=sequence.nodes[sequence.index],radius=current?.radiusMeters;
   let caption=name,detail=name;
   if(current?.targetId===target&&radius&&sequence.nodes.some(n=>n.targetId===target&&n.radiusMeters&&n.radiusMeters!==radius)){
    const radii=sequence.nodes.filter(n=>n.targetId===target&&n.radiusMeters).map(n=>n.radiusMeters);
    caption=r.sceneId==='nasa-shuttle'?edgeOrbitName(r,craft,current.targetId,radius,radii):(radius===Math.min(...radii)?'Inner':radius===Math.max(...radii)?'Outer':'Intermediate')+' · '+name;
    detail=name+' · '+(radius/1000).toLocaleString(undefined,{maximumFractionDigits:1})+' km from center';
   }
   const tripTitle=caption==='—'?'Trip estimate':'Trip to '+caption;if(tourCaption.textContent!==tripTitle)tourCaption.textContent=tripTitle;
   const box=$('pilotDestination');if(box.textContent!==caption)box.textContent=caption;if(box.title!==detail)box.title=detail;
   if(dialog.open)editor.refresh(craft,sequence);}else if(dialog.open)dialog.close();
  const crewClock=updateTelemetry(r,flight,manual?id:null,guided,craft?.id);if(travelPreview&&nav.mode==='manual')closeTravel();updateTravel();labelButton?.classList.remove('control-discovery');if(changed)r?.resize?.();
  $('pilotOnboardRow').hidden=true;
  // A tracked person or station carries instruments without adding a helm.
  const station=!craft&&(crewClock?.type==='iss'||crewClock?.type==='astronaut');
  const proximity=(craft||station)?r.getHorizonProximity?.(craft?.id||crewClock.id):null;
  if(proximity){
   const m=proximity.gapMeters,au=149597870700,[scale,unit]=m>=au?[au,'AU']:m>=1000?[1000,'km']:m>0&&m<1?[.01,'cm']:[1,'m'];
   setLine(horizonNote,'Horizon gap = '+flightNumber.format(m/scale)+' '+unit);
   horizonNote.classList.toggle('distant-horizon',proximity.noticeable===false);
   horizonNote.title=proximity.name+' · Distance from the observer’s center to the nearest event horizon (radial coordinate gap). Red at 0.1g external gravity or 1% gravitational time dilation.';
  }else setLine(horizonNote,'');
  stack.hidden=!craft&&!station;scene?.classList.toggle('has-station-instruments',station);
  if(!craft){
   tourEstimate.hidden=true;mount.classList.remove('pilot-autopilot');
   if(station)updateMotion(false,crewClock.speedMetersPerSecond,0,crewClock);
   return;
  }
  mount.classList.toggle('pilot-autopilot',guided);$('pilotStatus').hidden=true;$('pilotStatus').textContent=guided?`Autopilot engaged · ${paused?'Paused':trip?.stage||trip?.phase||auto?.phase||'Parking orbit'}${trip?.targetName?' · '+trip.targetName:''}`:paused?'Paused · press Play to continue flying.':'';
  const object=r.objects?.find(o=>o.id===id)||api.objects?.().find(o=>o.id===id)||{},type=object.type||flight?.type;
  const v=flight?.speedMetersPerSecond??0,k=flight?.curvaturePerMeter??0;
  const enterprise=type==='enterprise',warp=flight?.warpFactor??r.state?.warpFactor??0;
  if(lastType!==type){lastType=type;$('pilotPower').setAttribute('min','0');$('pilotPower').setAttribute('max',String(enterprise?9.9999:1));$('pilotPower').setAttribute('step',String(enterprise?.01:.1));$('pilotPower').setAttribute('aria-label',enterprise?'Warp level':'Forward acceleration in g');}
  const commandedThrust=inTransit?(trip.commandedThrustG??flight?.thrustSetting??0):guided?0:flight?.thrustSetting||0;
  const orbitalSpeed=sequence?.orbitalSpeed??r.getBridgeParkingOrbit?.(id)?.circularSpeedMetersPerSecond??r.getOrbitEditInfo?.(id)?.speedMetersPerSecond;
  const speed=Math.abs(enterprise?speedForWarp(warp):crewClock?.speedMetersPerSecond??(flight?.id===id&&!flight.holdingOrbit?v:orbitalSpeed??v));
  updateMotion(enterprise,speed,warp,crewClock);
  updateFlightReadout(trip,auto,nav,id,sequence);
  if(document.activeElement!==$('pilotPower')||inTransit)$('pilotPower').value=enterprise?warp:commandedThrust;
  const heading=normalizeHeading(inTransit?(trip.headingDegrees??flight?.headingTargetDegrees??0):guided?(r.getFocusFrame?.(id)?.headingAngle||0)*180/Math.PI:flight?.headingTargetDegrees??0);$('pilotHeadingValue').textContent=heading+'°';$('pilotHeadingValue').title='Target heading relative to Drive entry. Arrows or A / D turn 5°; hold to repeat. The ship follows smoothly by the shortest turn.';
  $('pilotVelocityLabel').textContent=enterprise?'Warp':'Accel';$('pilotV').textContent=enterprise?formatFlightNumber(warp):formatGravity(commandedThrust);$('pilotK').textContent=formatFlightNumber(flight?.turnRateRadiansPerSecond??0)+' rad/s';$('pilotSpeed').textContent=paused?'Paused':enterprise?formatFlightNumber(v/299792458)+' × c':formatFlightNumber(v)+' m/s';
  mount.classList.toggle('pilot-shuttle',!enterprise);
  $('pilotLeft').classList.toggle('guidance-firing',inTransit&&trip.turningSign<0);$('pilotRight').classList.toggle('guidance-firing',inTransit&&trip.turningSign>0);$('pilotLeft').disabled=paused||guided;$('pilotRight').disabled=paused||guided;$('pilotPower').disabled=guided;$('pilotBrakeSpeed').disabled=guided;
  $('pilotBrakeSpeed').textContent=enterprise?'Stop motion':'Stop';$('pilotBrakeSpeed').setAttribute('data-short-label','■');$('pilotBrakeSpeed').setAttribute('aria-label',enterprise?'Stop motion':'Stop');$('pilotBrakeSpeed').title=enterprise?'Stop forward motion and turning':'Ramp engines down to zero; keep coasting';
  $('pilotPower').title=enterprise?'Warp 8–10: emergency/overstress range for the original Enterprise; episode limits vary.':'Forward proper acceleration, up to 1g. To brake, turn and burn against your velocity.';
  $('pilotK').title='Angular velocity: '+formatFlightNumber(flight?.turnRateRadiansPerSecond??v*k)+' rad/s';
  mount.title=manual?(enterprise?'W / S changes warp factor. ':'W / S changes forward acceleration by 0.1 g. Turn 180° and burn forward to brake. ')+'Arrows or A / D turn 5°. Hold to repeat; release to hold heading. Drag to look; Esc returns to Auto.':'';
 }
 function closeTravel(){scene?.classList.remove('flight-preview-open');if(travelPreview)api.renderer()?.setTravelPreview?.(null);travelPreview=null;tripHeading=null;travelCard.hidden=true;scene?.classList.remove('has-travel-card');}
 function updateTravel(){
  const r=api.renderer(),data=travelPreview;if(!data){closeTravel();return;}const estimated=Number.isFinite(data.properSeconds)&&!data.error,craft=r?.objects?.find(o=>o.id===data.craftId)||selectedCraft(),shuttle=craft?.type==='shuttle';
  if(!craft||navigation(craft.id).mode!=='auto'){closeTravel();return;}
  travelCard.hidden=false;scene?.classList.add('flight-preview-open');scene?.classList.add('has-travel-card');
  $('pilotTripTarget').textContent=data.targetName||'Destination';$('pilotTripMode').textContent=shuttle?'AUTO FLIGHT · 1g':'AUTO FLIGHT · ENTERPRISE';
  $('pilotTripQuestion').hidden=false;$('pilotTripQuestion').textContent=data.waypoint?'Stop at this waypoint?':'Move '+(craft.name|| (shuttle?'NASA Shuttle':'Enterprise'))+' into orbit here?';
  $('pilotTripHeadingRow').hidden=!data.waypoint;if(document.activeElement!==$('pilotTripHeading'))$('pilotTripHeading').value=tripHeading??'';$('pilotTripWarpRow').hidden=shuttle;$('pilotTripWarp').value=String(tripWarp);$('pilotTripWarpValue').textContent=formatFlightNumber(tripWarp);
  $('pilotTripTime').parentNode.hidden=!estimated;$('pilotTripTimeLabel').textContent='Onboard time from here';$('pilotTripTime').textContent=formatClockDuration(data.properSeconds||0);
  $('pilotTripProperRow').hidden=!estimated||!shuttle;$('pilotTripProper').textContent=formatClockDuration(data.coordinateSeconds||0);
  $('pilotTripDilationRow').hidden=!estimated||!shuttle;$('pilotTripDilation').textContent=formatClockDuration(data.estimatedDilationSeconds??data.dilationSeconds??0);
  $('pilotTripProgress').hidden=true;$('pilotTripNote').textContent=!estimated?'This stop can be queued. Flight time depends on the preceding stop.':(r.state?.bridge?'Bridge approach and crossing':data.radiusChange?'Orbit radius change · 10 s on screen':data.waypoint?'Straight flight · 10 s on screen':'Orbital arc · 5 s   /   Tangent flight · 10 s');
  $('pilotTripCancel').hidden=false;$('pilotTripQueue').disabled=false;$('pilotTripClose').setAttribute('aria-label','Close flight preview');$('pilotTripClose').title='Close and choose another destination';
 }
 function travelOption(id){const r=api.renderer(),craft=selectedCraft();if(!craft||!api.state().annotations||navigation(craft.id).mode!=='auto')return null;const options={craftId:craft.id,warpFactor:tripWarp},target=(r.getTravelTargets?.(options)||[]).find(t=>t.id===id);if(target?.waypoint&&travelPreview?.targetId===id&&tripHeading!==null)options.heading=tripHeading;return target?{r,craft,options,target}:null;}
 function previewTravel(id){
  const opening=travelPreview?.targetId!==id;if(opening)tripHeading=null;const available=travelOption(id);if(!available)return false;const {r,craft,options,target}=available,result=r.previewTravel?.(id,options);travelSelection=craft.id;travelPreview={targetId:id,targetName:target.name||target.label||id,...result,craftId:craft.id,craftType:craft.type,waypoint:!!target.waypoint};r.setTravelPreview?.(result&&!result.error?travelPreview:null);clear();api.closePanels?.();updateTravel();if(opening)$('pilotTripQueue').focus?.({preventScroll:true});return true;
 }
 function goToLabel(id){
  const r=api.renderer(),craft=selectedCraft();if(!craft||!api.state().annotations)return false;
  const target=r.getTravelTargets?.({craftId:craft.id})?.find(t=>t.id===id);if(!target)return false;
  const previous=r.getFlightSequence?.(craft.id)?.nodes?.find(n=>n.targetId===id);
  const node={targetId:id,...(craft.type==='enterprise'?(previous?.transferProperSeconds?{transferProperSeconds:previous.transferProperSeconds}:{warpFactor:previous?.warpFactor??tripWarp}):{})};
  closeTravel();const result=r.setFlightSequence(craft.id,[node],{flyNow:true,loop:false});
  if(!result||result.error){api.toast?.(result?.error||'Unable to reach this destination.');return true;}
  api.setPaused(false);api.refresh();update();return true;
 }
 listen(travelCard,'pointerdown',event=>event.stopPropagation());listen(travelCard,'wheel',event=>event.stopPropagation(),{passive:true});
 if(labelButton)listen(labelButton,'click',()=>{if(!api.state().annotations)closeTravel();update();});
 listen($('pilotTripClose'),'click',()=>{closeTravel();update();});
 listen($('pilotTripCancel'),'click',()=>{closeTravel();update();});
 listen($('pilotTripWarp'),'input',()=>{tripWarp=Math.max(1,Math.min(9.9999,Number($('pilotTripWarp').value)||1));if(travelPreview)previewTravel(travelPreview.targetId);});
 listen($('pilotTripHeading'),'input',()=>{tripHeading=optionalHeading($('pilotTripHeading').value);if(travelPreview)previewTravel(travelPreview.targetId);});

 listen($('pilotTripQueue'),'click',()=>{if(!travelPreview)return;const {craftId,targetId,waypoint}=travelPreview,heading=waypoint?tripHeading:null;closeTravel();api.openFlightPlan?.(craftId,targetId,tripWarp,heading);});
 function start(id,mode=null){const r=api.renderer();if(!r?.objects?.some(o=>o.id===id&&['shuttle','enterprise'].includes(o.type)))return false;const prev=navigation(id).mode,next=mode||(prev==='manual'?'auto':'manual');if(next===prev)return true;r.selectObject?.(id);closeTravel();clear(true);const result=r.setNavigationMode?.(id,next);if(result===false)return false;currentId=id;showHint();api.setPaused(false);api.refresh();update();return true;}

 return{start,update,previewTravel,goToLabel,showHint,closeTravel,dispose(){distanceSize?.disconnect();dialog.remove();closeTravel();labelButton?.classList.remove('control-discovery');travelCard.remove();flightReadout.remove();hint.remove();escapeNote.remove();tourEstimate.remove();stack.remove();clear(true);disposed=true;observer?.disconnect();listeners.forEach(fn=>fn());mount.hidden=true;telemetry.remove();scene?.classList.remove('has-flight-controls');scene?.classList.remove('has-playlist');scene?.classList.remove('has-flight-readout');scene?.classList.remove('has-autopilot');scene?.classList.remove('has-object-clock');scene?.classList.remove('has-station-instruments');}};
}

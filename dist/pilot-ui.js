import {formatClockDuration,formatClockRate} from './object-clocks.js';
const keys={KeyW:['speed',1],KeyS:['speed',-1],KeyA:['heading',-1],KeyD:['heading',1]};
const HEADING_STEP=5,HEADING_REPEAT_MS=100,HEADING_HOLD_DELAY_MS=350;
const normalizeHeading=value=>((Math.round(value)%360)+540)%360-180;
const flightNumber=new Intl.NumberFormat(undefined,{minimumSignificantDigits:2,maximumSignificantDigits:2});
const superscripts={'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
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
 <div class="pilot-main"><button id="pilotBrakeSpeed" title="Stop forward motion and turning">Stop motion</button><div class="pilot-sliders"><div class="pilot-info-row"><span id="pilotVelocityLabel">Warp</span><div class="pilot-heading-readout"><span>Heading</span> <output id="pilotHeadingValue" aria-label="Target heading relative to start of driving">0°</output></div></div><label class="pilot-power"><span class="pilot-range"><input id="pilotPower" type="range" min="0" max="9.9999" step=".01" value="4" aria-label="Warp level"></span><output id="pilotV">4</output></label></div><div class="pilot-actions"><button id="pilotStop" title="Exit driving · resume orbit · Esc" aria-label="Exit driving · resume orbit"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button><button id="pilotReverse" hidden title="Reverse wormhole travel without turning the camera" aria-label="Reverse travel">⇄</button></div><p id="pilotStatus" class="pilot-status" role="status" hidden></p></div>
 <button id="pilotRight" class="pilot-turn pilot-right" aria-label="Turn right 5 degrees; hold to repeat" title="Right 5° · D · hold to repeat">›</button>`;
 const scene=mount.parentElement||mount.parentNode;
 const travelCard=document.createElement('section');travelCard.id='pilotTravel';travelCard.className='pilot-travel';travelCard.hidden=true;travelCard.setAttribute('aria-label','Travel to an orbit');travelCard.setAttribute('data-scene-control','');
 travelCard.innerHTML='<div class="pilot-travel-heading"><div><small id="pilotTripMode"></small><h3 id="pilotTripTarget"></h3></div><button id="pilotTripClose" aria-label="Close travel preview" title="Close travel preview">×</button></div><div class="pilot-trip-time"><span id="pilotTripTimeLabel">Estimated trip</span><output id="pilotTripTime"></output></div><div class="pilot-trip-secondary" id="pilotTripProperRow"><span id="pilotTripProperLabel">Onboard</span><output id="pilotTripProper"></output></div><progress id="pilotTripProgress" max="1" value="0" hidden aria-label="Trip progress"></progress><p id="pilotTripNote"></p><button id="pilotTripGo">Go</button>';scene?.append(travelCard);
 const labelButton=document.getElementById('annotationShortcut');let travelPreview=null,travelTimer=null,labelsDiscovered=false;
 const telemetry=document.createElement('div');telemetry.id='pilotTelemetry';telemetry.className='pilot-telemetry';telemetry.hidden=true;
 telemetry.innerHTML='<div id="pilotSpeedRow"><span>Speed</span><output id="pilotSpeed" aria-label="Speed">0 m/s</output></div><div id="pilotTurnRow"><span>Angular velocity</span><output id="pilotK" aria-label="Angular velocity">0 rad/s</output></div><div id="pilotDilationRow" hidden><span>Time dilation</span><output id="pilotDilation" aria-label="Time difference between distant and onboard clocks since creation">0 s</output></div><div id="pilotDilationRateRow" hidden><span>Rate</span><output id="pilotDilationRate" aria-label="Distant seconds per onboard second">1.0×</output></div>';
 (scene?.querySelector('.scene-bottom')||scene||mount).append(telemetry);
 const $=id=>mount.querySelector('#'+id)||telemetry.querySelector('#'+id)||travelCard.querySelector('#'+id),keyboardHeld=new Set(),listeners=[];let currentId=null,disposed=false,lastInput='',lastType=null,holdTimer=null,holdButton=null;const thrustStepTimes=new Map();
 const listen=(node,event,fn,options)=>{node.addEventListener(event,fn,options);listeners.push(()=>node.removeEventListener(event,fn,options));};
 const blocked=()=>disposed||!currentId||!!api.renderer()?.getTravelState?.()?.active||document.hidden||!!api.state().paused||!!document.querySelector('dialog[open]');
 const editable=target=>/^(INPUT|SELECT|TEXTAREA)$/.test(target?.tagName||'')||target?.isContentEditable||target?.closest?.('[contenteditable="true"]');
 const isShuttle=()=>api.renderer()?.getFlightState?.()?.type==='shuttle';
 function send(force=false){
  const held=keyboardHeld,input={speed:0,curvature:0,torsion:0};for(const code of held){const spec=keys[code];if(spec?.[0]==='speed'&&!isShuttle())input.speed+=spec[1];}input.speed=Math.max(-1,Math.min(1,input.speed));
  const signature=Object.values(input).join('|');if(force||signature!==lastInput){lastInput=signature;api.renderer()?.setFlightInput?.(input);}
 }
 function endHold(){clearTimeout(holdTimer);holdTimer=null;holdButton?.classList.remove('is-held');holdButton=null;}
 function clear(force=false){endHold();keyboardHeld.clear();thrustStepTimes.clear();send(force);}
 function nudgeHeading(direction){if(blocked())return;const r=api.renderer(),heading=r?.getFlightState?.()?.headingTargetDegrees||0;const target=normalizeHeading(Math.round(heading/HEADING_STEP)*HEADING_STEP+direction*HEADING_STEP);r?.setFlightHeading?.(target);update();}
 function stop(){if(!currentId)return;closeTravel();const id=currentId;clear(true);const r=api.renderer();r?.setFreeDrive?.(id,false);if(r?.focusId===id&&r?.focusMode==='track'){r.look?.('center');r.updateCameraFrame?.();}else r?.focusTarget?.(id,'track',false,true);currentId=null;api.refresh();update();}
 function allowed(event){return !blocked()&&!editable(event.target)&&!event.ctrlKey&&!event.metaKey&&!event.altKey;}
 listen(document,'keydown',event=>{
  if(event.key==='Escape'&&currentId&&!disposed&&!document.querySelector('dialog[open]')&&!editable(event.target)){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();stop();return;}
  if(!keys[event.code]||!allowed(event))return;event.preventDefault();event.stopPropagation();const first=!keyboardHeld.has(event.code);if(first)keyboardHeld.add(event.code);
  if(keys[event.code][0]==='heading'||isShuttle()&&keys[event.code][0]==='speed'){
   // Native key repeat adjusts the held acceleration setting at a readable pace.
   const now=Number.isFinite(event.timeStamp)?event.timeStamp:performance.now(),opposite={KeyW:'KeyS',KeyS:'KeyW',KeyA:'KeyD',KeyD:'KeyA'}[event.code];
   if(!keyboardHeld.has(opposite)&&(first||event.repeat&&now-(thrustStepTimes.get(event.code)??-Infinity)>=HEADING_REPEAT_MS)){thrustStepTimes.set(event.code,now);const r=api.renderer(),flight=r?.getFlightState?.();if(keys[event.code][0]==='heading')nudgeHeading(keys[event.code][1]);else r?.setFlightPower?.((flight?.thrustSetting||0)+keys[event.code][1]*.5);}
   if(first)send();update();
  }else if(first)send();
 },true);
 listen(document,'keyup',event=>{if(!keys[event.code]||!keyboardHeld.has(event.code))return;keyboardHeld.delete(event.code);thrustStepTimes.delete(event.code);send();if(!editable(event.target)){event.preventDefault();event.stopPropagation();}},true);
 listen(window,'blur',()=>clear());listen(document,'visibilitychange',()=>{if(document.hidden)clear();});listen(document,'focusin',event=>{if(editable(event.target))clear();});
 listen(mount,'pointerdown',event=>event.stopPropagation());listen(mount,'wheel',event=>event.stopPropagation(),{passive:true});
 const observer=typeof MutationObserver==='function'?new MutationObserver(()=>{if(currentId&&document.querySelector('dialog[open]'))clear();}):null;observer?.observe(document.documentElement||document,{subtree:true,attributes:true,attributeFilter:['open']});
 listen($('pilotStop'),'click',stop);
 listen($('pilotBrakeSpeed'),'click',()=>{clear();const r=api.renderer();if(isShuttle())r?.brakeFlight?.('speed');else{r?.brakeFlight?.('speed');r?.brakeFlight?.('turn');}update();});listen($('pilotReverse'),'click',()=>{api.renderer()?.reverseFlight?.();update();});
 for(const [id,direction] of [['pilotLeft',-1],['pilotRight',1]]){
  const button=$(id);
  listen(button,'pointerdown',event=>{if(event.button!=null&&event.button!==0||blocked())return;event.preventDefault();event.stopPropagation();endHold();holdButton=button;button.classList.add('is-held');button.setPointerCapture?.(event.pointerId);nudgeHeading(direction);const repeat=()=>{if(blocked()||holdButton!==button){endHold();return;}nudgeHeading(direction);holdTimer=setTimeout(repeat,HEADING_REPEAT_MS);};holdTimer=setTimeout(repeat,HEADING_HOLD_DELAY_MS);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(button,event,()=>{if(holdButton===button)endHold();});
  listen(button,'click',event=>{if(event.detail==null||event.detail===0)nudgeHeading(direction);});
  listen(button,'contextmenu',event=>event.preventDefault());
 }
 listen($('pilotPower'),'input',()=>{api.renderer()?.setFlightPower?.(Number($('pilotPower').value));update();});
 function updateTelemetry(r,flight,driveId){
  // A followed or driven Enterprise never inherits another selected clock.
  const objectType=id=>r?.objects?.find(object=>object.id===id)?.type;
  const protectedEnterprise=flight?.type==='enterprise'||objectType(r?.focusId)==='enterprise';
  let clock=null;
  if(!protectedEnterprise&&typeof r?.getObjectClock==='function'){
   for(const id of new Set([r.focusId,r.selectedId,driveId].filter(Boolean))){clock=r.getObjectClock(id);if(clock)break;}
  }else if(!protectedEnterprise&&flight?.type==='shuttle')clock={lagSeconds:flight.timeLagSeconds??Math.max(0,(flight.coordinateTimeSeconds||0)-(flight.properTimeSeconds||0)),rateFactor:flight.timeDilationFactor||1};
  telemetry.hidden=!driveId&&!clock;scene?.classList.toggle('has-object-clock',!!clock);
  $('pilotSpeedRow').hidden=!driveId;$('pilotTurnRow').hidden=!driveId;
  $('pilotDilationRow').hidden=!clock;$('pilotDilationRateRow').hidden=!clock||!(clock.rateFactor>=1);
  if(!clock)return;
  const rate=formatClockRate(clock.rateFactor);if($('pilotDilationRate').textContent!==rate)$('pilotDilationRate').textContent=rate;
  $('pilotDilationRate').title='Distant seconds per onboard second (dt/dτ). Gravity and accumulated proper acceleration set this approximate clock comparison. The object remains outside the horizon.';
  const value=formatClockDuration(Math.max(0,clock.lagSeconds||0));if($('pilotDilation').textContent!==value)$('pilotDilation').textContent=value;
  $('pilotDilation').title=(clock.name?clock.name+' · ':'')+'Time difference t − τ since creation: integrate (dt/dτ − 1) over active wall-clock seconds, treated as onboard proper time τ. A stationary clock in flat space accumulates zero. Coasting after a burn retains speed-related dilation. Pausing stops the comparison; changing views or leaving Drive preserves it.';
 }
 function update(){
  const r=api.renderer(),flight=r?.getFlightState?.(),id=r?.driveId||flight?.id||null;
  if(currentId!==id){clear(true);currentId=id;labelsDiscovered=false;if(!id)closeTravel();}if(blocked())clear();const changed=mount.hidden===!!id;mount.hidden=!id;scene?.classList.toggle('has-flight-controls',!!id);updateTelemetry(r,flight,id);updateTravel();labelButton?.classList.toggle('control-discovery',!!id&&!labelsDiscovered&&!r?.getTravelState?.()?.active);if(changed)r?.resize?.();if(!id){return;}
  const paused=!!api.state().paused;$('pilotStatus').hidden=!paused;$('pilotStatus').textContent=paused?'Paused · press Play to continue flying.':'';
  const object=r.objects?.find(o=>o.id===id)||api.objects?.().find(o=>o.id===id)||{},type=object.type||flight?.type;
  const v=flight?.speedMetersPerSecond??0,k=flight?.curvaturePerMeter??0;
  const enterprise=type==='enterprise',warp=flight?.warpFactor??r.state?.warpFactor??0;
  if(lastType!==type){lastType=type;$('pilotPower').setAttribute('min','0');$('pilotPower').setAttribute('max',String(enterprise?9.9999:10));$('pilotPower').setAttribute('step',String(enterprise?.01:.5));$('pilotPower').setAttribute('aria-label',enterprise?'Warp level':'Forward acceleration in g');}
  if(document.activeElement!==$('pilotPower'))$('pilotPower').value=enterprise?warp:flight?.thrustSetting||0;
  const heading=normalizeHeading(flight?.headingTargetDegrees??0);$('pilotHeadingValue').textContent=heading+'°';$('pilotHeadingValue').title='Target heading relative to Drive entry. Arrows or A / D turn 5°; hold to repeat. The ship follows smoothly by the shortest turn.';
  $('pilotVelocityLabel').textContent=enterprise?'Warp':'Accel';$('pilotV').textContent=enterprise?formatFlightNumber(warp):formatFlightNumber(flight?.thrustSetting||0)+' g';$('pilotK').textContent=formatFlightNumber(flight?.turnRateRadiansPerSecond??0)+' rad/s';$('pilotSpeed').textContent=paused?'Paused':enterprise?formatFlightNumber(v/299792458)+' × c':formatFlightNumber(v)+' m/s';
  mount.classList.toggle('pilot-shuttle',!enterprise);
  const inTransit=!!r?.getTravelState?.()?.active;$('pilotLeft').disabled=paused||inTransit;$('pilotRight').disabled=paused||inTransit;$('pilotPower').disabled=inTransit;$('pilotBrakeSpeed').disabled=inTransit;
  $('pilotBrakeSpeed').textContent=enterprise?'Stop motion':'Stop';$('pilotBrakeSpeed').setAttribute('data-short-label','■');$('pilotBrakeSpeed').setAttribute('aria-label',enterprise?'Stop motion':'Stop');$('pilotBrakeSpeed').title=enterprise?'Stop forward motion and turning':'Ramp engines down to zero; keep coasting';
  $('pilotPower').title=enterprise?'Warp 8–10: emergency/overstress range for the original Enterprise; episode limits vary.':'Forward acceleration. To brake, turn 180° and burn forward. Red ≥4 g marks illustrative sustained high-g risk; tolerance depends on posture and duration.';
  $('pilotK').title='Angular velocity: '+formatFlightNumber(flight?.turnRateRadiansPerSecond??v*k)+' rad/s';
  mount.title=(enterprise?'W / S changes warp factor. ':'W / S changes forward acceleration by 0.5 g. Turn 180° and burn forward to brake. ')+'Arrows or A / D turn 5°. Hold to repeat; release to hold heading. Drag to look; Esc resumes orbit.';
  $('pilotReverse').hidden=true;
 }
 function closeTravel(){travelPreview=null;clearTimeout(travelTimer);travelTimer=null;travelCard.hidden=true;scene?.classList.remove('has-travel-card');}
 function updateTravel(){
  const r=api.renderer(),trip=r?.getTravelState?.(),active=!!trip?.active;
  if(!currentId||!active&&!travelPreview){closeTravel();return;}
  const data=active?trip:travelPreview;travelCard.hidden=false;scene?.classList.add('has-travel-card');
  $('pilotTripTarget').textContent=data.targetName||'Destination';$('pilotTripMode').textContent=active?'IN TRANSIT · TIME ACCELERATED':data.mode==='1g'?'FLIGHT PLAN · 1g':'FLIGHT PLAN · WARP 1';
  $('pilotTripTimeLabel').textContent=active?'Trip elapsed':'Estimated trip';$('pilotTripTime').textContent=formatClockDuration(active?data.coordinateElapsedSeconds||0:data.coordinateSeconds||0);
  const shuttle=(r?.getFlightState?.()?.type||'')==='shuttle';$('pilotTripProperRow').hidden=!shuttle;
  $('pilotTripProper').textContent=formatClockDuration(active?data.properElapsedSeconds||0:data.properSeconds||0);
  $('pilotTripProgress').hidden=!active;$('pilotTripProgress').value=Math.max(0,Math.min(1,data.progress||0));
  $('pilotTripNote').textContent=active?(api.state().paused?'Paused':(data.phase||'Travelling')+' · '+formatClockDuration(Math.max(0,(data.coordinateSeconds||0)-(data.coordinateElapsedSeconds||0)))+' remaining'):'Arrive in orbit · 10 seconds on screen';
  $('pilotTripGo').hidden=active;$('pilotTripGo').disabled=!!data.error;$('pilotTripClose').setAttribute('aria-label',active?'Cancel flight':'Close travel preview');$('pilotTripClose').title=active?'Cancel flight; keep manual control':'Close and choose another label';
  if(data.error)$('pilotTripNote').textContent=data.error;
  if(active&&travelTimer===null)travelTimer=setTimeout(()=>{travelTimer=null;update();},100);
 }
 function previewTravel(id){
  const r=api.renderer();if(!r?.driveId||!api.state().annotations||r.getTravelState?.()?.active)return false;
  if(!(r.getTravelTargets?.()||[]).some(t=>t.id===id))return false;
  const result=r.previewTravel?.(id);if(!result)return false;travelPreview=result;labelsDiscovered=true;clear();api.closePanels?.();updateTravel();$('pilotTripGo').focus?.({preventScroll:true});return true;
 }
 listen(travelCard,'pointerdown',event=>event.stopPropagation());listen(travelCard,'wheel',event=>event.stopPropagation(),{passive:true});
 if(labelButton)listen(labelButton,'click',()=>{labelsDiscovered=true;labelButton.classList.remove('control-discovery');if(!api.state().annotations)closeTravel();});
 listen($('pilotTripClose'),'click',()=>{api.renderer()?.cancelTravel?.();closeTravel();update();});
 listen($('pilotTripGo'),'click',()=>{if(!travelPreview)return;const result=api.renderer()?.startTravel?.(travelPreview.targetId);if(result===false||result?.error){$('pilotTripNote').textContent=result?.error||'This destination is no longer available.';return;}travelPreview=null;clear();api.setPaused(false);api.refresh();update();});
 function start(id){closeTravel();labelsDiscovered=false;const r=api.renderer();if(!r?.setFreeDrive?.(id,true))return false;r.focusTarget?.(id,'track',false,true);clear(true);currentId=id;api.setPaused(false);api.refresh();update();return true;}
 return{start,update,previewTravel,dispose(){closeTravel();labelButton?.classList.remove('control-discovery');travelCard.remove();clear(true);disposed=true;observer?.disconnect();listeners.forEach(fn=>fn());mount.hidden=true;telemetry.remove();scene?.classList.remove('has-flight-controls');scene?.classList.remove('has-object-clock');}};
}

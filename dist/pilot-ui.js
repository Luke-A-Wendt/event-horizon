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
// Keep the legacy export name for callers; the persistent clock chooses units.
export const formatFlightDilation=formatClockDuration;
function formatHorizonGap(meters){const n=Math.abs(meters);for(const [scale,unit] of [[1e9,'Gm'],[1e6,'Mm'],[1e3,'km'],[1,'m'],[1e-3,'mm'],[1e-6,'μm'],[1e-9,'nm']])if(n>=scale)return formatFlightNumber(n/scale)+' '+unit;return formatFlightNumber(n)+' m';}
export function installPilotControls(api){
 const mount=api.mount;if(!mount)return{update(){},start(){return false;},dispose(){}};
 mount.hidden=true;mount.className='pilot-console';
 mount.innerHTML=`
 <button id="pilotLeft" class="pilot-turn pilot-left" aria-label="Turn left 5 degrees; hold to repeat" title="Left 5° · A · hold to repeat">‹</button>
 <div class="pilot-main"><button id="pilotBrakeSpeed" title="Stop forward motion and turning">Stop motion</button><div class="pilot-sliders"><div class="pilot-info-row"><span id="pilotVelocityLabel">Warp</span><div class="pilot-heading-readout"><span>Heading</span> <output id="pilotHeadingValue" aria-label="Target heading relative to start of driving">0°</output></div></div><label class="pilot-power"><span class="pilot-range"><input id="pilotPower" type="range" min="0" max="9.9999" step=".01" value="4" aria-label="Warp level"></span><output id="pilotV">4</output></label></div><div class="pilot-actions"><button id="pilotCompact" title="Flight camera" aria-label="Flight camera" aria-expanded="false" aria-controls="pilotSettings"><svg class="icon" aria-hidden="true"><use href="#i-video"/></svg></button><button id="pilotStop" title="Resume orbit · Esc" aria-label="Resume orbit">↩</button><button id="pilotReverse" hidden title="Reverse wormhole travel without turning the camera" aria-label="Reverse travel">⇄</button></div><p id="pilotStatus" class="pilot-status" role="status" hidden></p></div>
 <button id="pilotRight" class="pilot-turn pilot-right" aria-label="Turn right 5 degrees; hold to repeat" title="Right 5° · D · hold to repeat">›</button>
 <section id="pilotSettings" class="pilot-settings" aria-label="Flight camera" hidden><button id="pilotChase" aria-pressed="false">Chase · 360°</button><button id="pilotOnboard" aria-pressed="false">Ride · 360°</button></section>`;
 const scene=mount.parentElement||mount.parentNode;
 const telemetry=document.createElement('div');telemetry.id='pilotTelemetry';telemetry.className='pilot-telemetry';telemetry.hidden=true;
 telemetry.innerHTML='<div id="pilotSpeedRow"><span>Speed</span><output id="pilotSpeed" aria-label="Speed">0 m/s</output></div><div id="pilotTurnRow"><span>Angular velocity</span><output id="pilotK" aria-label="Angular velocity">0 rad/s</output></div><div id="pilotDilationRow" hidden><span>Time dilation <small>(accumulated)</small></span><output id="pilotDilation" aria-label="Accumulated time dilation since creation">0 ns</output></div><div id="pilotDilationRateRow" hidden><span>Current rate</span><output id="pilotDilationRate" aria-label="Reference seconds per local second">1.0×</output></div><p id="pilotClockRelation" class="pilot-clock-relation" hidden></p><p id="pilotHorizonGap" class="pilot-clock-relation" hidden></p>';
 (scene?.querySelector('.scene-bottom')||scene||mount).append(telemetry);
 const $=id=>mount.querySelector('#'+id)||telemetry.querySelector('#'+id),keyboardHeld=new Set(),listeners=[];let currentId=null,disposed=false,lastInput='',lastType=null,holdTimer=null,holdButton=null;const thrustStepTimes=new Map();
 const listen=(node,event,fn,options)=>{node.addEventListener(event,fn,options);listeners.push(()=>node.removeEventListener(event,fn,options));};
 function setCameraOpen(open){$('pilotSettings').hidden=!open;$('pilotCompact').setAttribute('aria-expanded',String(open));scene?.classList.toggle('pilot-camera-open',open);}
 const blocked=()=>disposed||!currentId||document.hidden||!!api.state().paused||!!document.querySelector('dialog[open]');
 const editable=target=>/^(INPUT|SELECT|TEXTAREA)$/.test(target?.tagName||'')||target?.isContentEditable||target?.closest?.('[contenteditable="true"]');
 const isShuttle=()=>api.renderer()?.getFlightState?.()?.type==='shuttle';
 function send(force=false){
  const held=keyboardHeld,input={speed:0,curvature:0,torsion:0};for(const code of held){const spec=keys[code];if(spec?.[0]==='speed'&&!isShuttle())input.speed+=spec[1];}input.speed=Math.max(-1,Math.min(1,input.speed));
  const signature=Object.values(input).join('|');if(force||signature!==lastInput){lastInput=signature;api.renderer()?.setFlightInput?.(input);}
 }
 function endHold(){clearTimeout(holdTimer);holdTimer=null;holdButton?.classList.remove('is-held');holdButton=null;}
 function clear(force=false){endHold();keyboardHeld.clear();thrustStepTimes.clear();send(force);}
 function nudgeHeading(direction){if(blocked())return;const r=api.renderer(),heading=r?.getFlightState?.()?.headingTargetDegrees||0;const target=normalizeHeading(Math.round(heading/HEADING_STEP)*HEADING_STEP+direction*HEADING_STEP);r?.setFlightHeading?.(target);update();}
 function stop(){if(!currentId)return;const id=currentId;clear(true);setCameraOpen(false);const r=api.renderer();r?.setFreeDrive?.(id,false);if(r?.focusId===id&&r?.focusMode==='track'){r.look?.('center');r.updateCameraFrame?.();}else r?.focusTarget?.(id,'track',false,true);currentId=null;api.refresh();update();}
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
 listen($('pilotBrakeSpeed'),'click',()=>{clear();const r=api.renderer();if(isShuttle())r?.setFlightPower?.(0);else{r?.brakeFlight?.('speed');r?.brakeFlight?.('turn');}update();});listen($('pilotReverse'),'click',()=>{api.renderer()?.reverseFlight?.();update();});
 const chooseCamera=mode=>{if(!currentId)return;api.renderer()?.focusTarget?.(currentId,mode);setCameraOpen(false);api.refresh();update();};
 listen($('pilotChase'),'click',()=>chooseCamera('chase'));
 listen($('pilotOnboard'),'click',()=>chooseCamera('onboard'));
 for(const [id,direction] of [['pilotLeft',-1],['pilotRight',1]]){
  const button=$(id);
  listen(button,'pointerdown',event=>{if(event.button!=null&&event.button!==0||blocked())return;event.preventDefault();event.stopPropagation();endHold();holdButton=button;button.classList.add('is-held');button.setPointerCapture?.(event.pointerId);nudgeHeading(direction);const repeat=()=>{if(blocked()||holdButton!==button){endHold();return;}nudgeHeading(direction);holdTimer=setTimeout(repeat,HEADING_REPEAT_MS);};holdTimer=setTimeout(repeat,HEADING_HOLD_DELAY_MS);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(button,event,()=>{if(holdButton===button)endHold();});
  listen(button,'click',event=>{if(event.detail==null||event.detail===0)nudgeHeading(direction);});
  listen(button,'contextmenu',event=>event.preventDefault());
 }
 listen($('pilotPower'),'input',()=>{api.renderer()?.setFlightPower?.(Number($('pilotPower').value));update();});
 listen($('pilotCompact'),'click',()=>{const open=$('pilotSettings').hidden;if(open)api.closePanels?.();setCameraOpen(open);});
 listen(document,'pointerdown',event=>{if(!mount.contains(event.target))setCameraOpen(false);});
 function updateTelemetry(r,flight,driveId){
  // A followed or driven Enterprise never inherits another selected clock.
  const objectType=id=>r?.objects?.find(object=>object.id===id)?.type;
  const protectedEnterprise=flight?.type==='enterprise'||objectType(r?.focusId)==='enterprise';
  let clock=null;
  if(!protectedEnterprise&&typeof r?.getObjectClock==='function'){
   for(const id of new Set([r.focusId,r.selectedId,driveId].filter(Boolean))){clock=r.getObjectClock(id);if(clock)break;}
  }else if(!protectedEnterprise&&flight?.type==='shuttle')clock={lagSeconds:flight.timeLagSeconds||0};
  telemetry.hidden=!driveId&&!clock;scene?.classList.toggle('has-object-clock',!!clock);
  $('pilotSpeedRow').hidden=!driveId;$('pilotTurnRow').hidden=!driveId;
  $('pilotDilationRow').hidden=!clock;$('pilotDilationRateRow').hidden=!clock||!(clock.rateFactor>=1);$('pilotClockRelation').hidden=!clock||!(clock.rateFactor>=1);$('pilotHorizonGap').hidden=!clock||!Number.isFinite(clock.horizonGapMeters);
  if(!clock)return;
  const rate=formatClockRate(clock.rateFactor);if($('pilotDilationRate').textContent!==rate)$('pilotDilationRate').textContent=rate;
  const relation='1 s onboard = '+(Number.isFinite(clock.rateFactor)?formatClockDuration(clock.rateFactor):'∞')+' distant';if($('pilotClockRelation').textContent!==relation)$('pilotClockRelation').textContent=relation;
  $('pilotClockRelation').title='Comparison at the current rate. At 1× playback, one displayed second advances one second on the distant reference clock, in orbit and in Drive. The onboard clock advances less; accumulated time dilation is their difference.';
  if(Number.isFinite(clock.horizonGapMeters)){$('pilotHorizonGap').textContent=(clock.horizonGapMeters<0?'Inside horizon: ':'Horizon clearance: ')+formatHorizonGap(clock.horizonGapMeters);$('pilotHorizonGap').title='Radial coordinate clearance of the object’s center from '+(clock.referenceName||'the compact body')+' event horizon. The apparent dark shadow is larger than the horizon; matching its visible edge does not put the object at the horizon.';}
  $('pilotDilationRate').title='Distant-reference seconds per local second (dt/dτ). For example, 10× means ten reference seconds per onboard second. Gravity and local velocity both contribute; acceleration changes the trajectory. The prescribed near-horizon route stops at a finite exterior clearance. The factor can be large there, while elapsed clock difference remains bounded by elapsed reference time.'+(clock.ultrastaticBridge?' This traversable Ellis throat has no gravitational clock slowing; only the traveler’s local speed contributes.':'')+(clock.prescribedRadialClock?' Prescribed radial camera path: gravitational clock estimate at the actual center; cinematic movement is not treated as physical velocity.':'');
  const value=formatClockDuration(Math.max(0,clock.lagSeconds||0));if($('pilotDilation').textContent!==value)$('pilotDilation').textContent=value;
  $('pilotDilation').title=(clock.name?clock.name+' · ':'')+'Accumulated distant-reference time minus local proper time since creation. At 1× playback, one second advances one distant-reference second in orbit and in Drive. The total is finite and is not reset by orbit or flight changes. It can accrue at most one second per reference second; a large current-rate multiplier means the onboard clock advances very little. Gravity uses this object’s current center position; physical orbital or driven speed supplies the same SR factor for every supported object. Prescribed radial camera paths show the gravitational estimate only.';
 }
 function update(){
  const r=api.renderer(),flight=r?.getFlightState?.(),id=r?.driveId||flight?.id||null;
  if(currentId!==id){clear(true);setCameraOpen(false);currentId=id;}if(blocked())clear();const changed=mount.hidden===!!id;mount.hidden=!id;scene?.classList.toggle('has-flight-controls',!!id);updateTelemetry(r,flight,id);if(changed)r?.resize?.();if(!id){setCameraOpen(false);return;}
  const paused=!!api.state().paused;$('pilotStatus').hidden=!paused;$('pilotStatus').textContent=paused?'Paused · press Play to continue flying.':'';
  const object=r.objects?.find(o=>o.id===id)||api.objects?.().find(o=>o.id===id)||{},type=object.type||flight?.type;
  const v=flight?.speedMetersPerSecond??0,k=flight?.curvaturePerMeter??0;
  const enterprise=type==='enterprise',warp=flight?.warpFactor??r.state?.warpFactor??0;
  if(lastType!==type){lastType=type;$('pilotPower').setAttribute('min','0');$('pilotPower').setAttribute('max',String(enterprise?9.9999:10));$('pilotPower').setAttribute('step',String(enterprise?.01:.5));$('pilotPower').setAttribute('aria-label',enterprise?'Warp level':'Forward acceleration in g');}
  if(document.activeElement!==$('pilotPower'))$('pilotPower').value=enterprise?warp:flight?.thrustSetting||0;
  const heading=normalizeHeading(flight?.headingTargetDegrees??0);$('pilotHeadingValue').textContent=heading+'°';$('pilotHeadingValue').title='Target heading relative to Drive entry. Arrows or A / D turn 5°; hold to repeat. The ship follows smoothly by the shortest turn.';
  $('pilotVelocityLabel').textContent=enterprise?'Warp':'Accel';$('pilotV').textContent=enterprise?formatFlightNumber(warp):formatFlightNumber(flight?.thrustSetting||0)+' g';$('pilotK').textContent=formatFlightNumber(flight?.turnRateRadiansPerSecond??0)+' rad/s';$('pilotSpeed').textContent=paused?'Paused':enterprise?formatFlightNumber(v/299792458)+' × c':formatFlightNumber(v)+' m/s';
  mount.classList.toggle('pilot-shuttle',!enterprise);
  $('pilotLeft').disabled=paused;$('pilotRight').disabled=paused;
  $('pilotBrakeSpeed').textContent=enterprise?'Stop motion':'Cut thrust';$('pilotBrakeSpeed').setAttribute('data-short-label',enterprise?'■':'0 g');$('pilotBrakeSpeed').setAttribute('aria-label',enterprise?'Stop motion':'Cut thrust');$('pilotBrakeSpeed').title=enterprise?'Stop forward motion and turning':'Set acceleration to 0 g; keep coasting';
  $('pilotPower').title=enterprise?'Warp 8–10: emergency/overstress range for the original Enterprise; episode limits vary.':'Forward acceleration. To brake, turn 180° and burn forward. Red ≥4 g marks illustrative sustained high-g risk; tolerance depends on posture and duration.';
  $('pilotK').title='Angular velocity: '+formatFlightNumber(flight?.turnRateRadiansPerSecond??v*k)+' rad/s';
  mount.title=(enterprise?'W / S changes warp factor. ':'W / S changes forward acceleration by 0.5 g. Turn 180° and burn forward to brake. ')+'Arrows or A / D turn 5°. Hold to repeat; release to hold heading. Drag to look; Esc resumes orbit.';
  $('pilotChase').setAttribute('aria-pressed',String(r?.focusMode==='chase'));$('pilotOnboard').setAttribute('aria-pressed',String(r?.focusMode==='onboard'));$('pilotReverse').hidden=true;
 }
 function start(id){const r=api.renderer();if(!r?.setFreeDrive?.(id,true))return false;r.focusTarget?.(id,'track',false,true);clear(true);currentId=id;api.setPaused(false);api.refresh();update();return true;}
 return{start,update,dispose(){clear(true);setCameraOpen(false);disposed=true;observer?.disconnect();listeners.forEach(fn=>fn());mount.hidden=true;telemetry.remove();scene?.classList.remove('has-flight-controls');scene?.classList.remove('has-object-clock');}};
}

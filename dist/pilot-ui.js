import {formatClockDuration} from './object-clocks.js';
const keys={KeyW:['speed',1],KeyS:['speed',-1],KeyA:['curvature',1],KeyD:['curvature',-1]};
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
export function installPilotControls(api){
 const mount=api.mount;if(!mount)return{update(){},start(){return false;},dispose(){}};
 mount.hidden=true;mount.className='pilot-console';
 mount.innerHTML=`
 <button class="pilot-turn pilot-left" data-pilot-key="KeyA" aria-label="Steer left; tap to nudge, hold to turn">‹</button>
 <div class="pilot-main"><button id="pilotBrakeSpeed" title="Stop forward motion and turning">Stop motion</button><label class="pilot-power"><span id="pilotVelocityLabel">Warp</span><span class="pilot-range"><input id="pilotPower" type="range" min="0" max="9.9999" step=".01" value="4" aria-label="Warp level"></span><output id="pilotV">4</output></label><div class="pilot-actions"><button id="pilotCompact" title="Flight camera" aria-label="Flight camera" aria-expanded="false" aria-controls="pilotSettings"><svg class="icon" aria-hidden="true"><use href="#i-video"/></svg></button><button id="pilotStop" title="Resume orbit · Esc" aria-label="Resume orbit">↩</button><button id="pilotReverse" hidden title="Reverse wormhole travel without turning the camera" aria-label="Reverse travel">⇄</button></div><p id="pilotStatus" class="pilot-status" role="status" hidden></p>
 </div><button class="pilot-turn pilot-right" data-pilot-key="KeyD" aria-label="Steer right; tap to nudge, hold to turn">›</button>
 <section id="pilotSettings" class="pilot-settings" aria-label="Flight camera" hidden><button id="pilotChase" aria-pressed="false">Chase · 360°</button><button id="pilotOnboard" aria-pressed="false">Ride · 360°</button></section>`;
 const scene=mount.parentElement||mount.parentNode;
 const telemetry=document.createElement('div');telemetry.id='pilotTelemetry';telemetry.className='pilot-telemetry';telemetry.hidden=true;
 telemetry.innerHTML='<div id="pilotSpeedRow"><span>Speed</span><output id="pilotSpeed" aria-label="Speed">0 m/s</output></div><div id="pilotTurnRow"><span>Angular velocity</span><output id="pilotK" aria-label="Angular velocity">0 rad/s</output></div><div id="pilotDilationRow" hidden><span>Time dilation</span><output id="pilotDilation" aria-label="Accumulated time dilation since creation">0 ns</output></div><div id="pilotDilationRateRow" hidden><span>Current rate</span><output id="pilotDilationRate" aria-label="Time dilation accumulated per reference second">0 ns / s</output></div><div id="pilotClockRateRow" hidden><span>Distant clock rate</span><output id="pilotClockRate" aria-label="Distant-to-local clock rate at the horizon">∞</output></div>';
 (scene?.querySelector('.scene-bottom')||scene||mount).append(telemetry);
 const $=id=>mount.querySelector('#'+id)||telemetry.querySelector('#'+id),keyboardHeld=new Set(),pointerHeld=new Map(),listeners=[];let currentId=null,disposed=false,lastInput='',lastHeld='',lastType=null;const pointerTimes=new Map(),thrustStepTimes=new Map();
 const listen=(node,event,fn,options)=>{node.addEventListener(event,fn,options);listeners.push(()=>node.removeEventListener(event,fn,options));};
 function setCameraOpen(open){$('pilotSettings').hidden=!open;$('pilotCompact').setAttribute('aria-expanded',String(open));scene?.classList.toggle('pilot-camera-open',open);}
 const blocked=()=>disposed||!currentId||document.hidden||!!api.state().paused||!!document.querySelector('dialog[open]');
 const editable=target=>/^(INPUT|SELECT|TEXTAREA)$/.test(target?.tagName||'')||target?.isContentEditable||target?.closest?.('[contenteditable="true"]');
 const isShuttle=()=>api.renderer()?.getFlightState?.()?.type==='shuttle';
 function send(force=false){
  const held=new Set([...keyboardHeld,...pointerHeld.values()]),input={speed:0,curvature:0,torsion:0},shuttle=isShuttle();for(const code of held){const spec=keys[code];if(spec&&(!shuttle||spec[0]!=='speed'))input[spec[0]]+=spec[1];}for(const key of Object.keys(input))input[key]=Math.max(-1,Math.min(1,input[key]));
  const signature=Object.values(input).join('|');if(force||signature!==lastInput){lastInput=signature;api.renderer()?.setFlightInput?.(input);}
  const heldSignature=[...held].sort().join('|');if(heldSignature!==lastHeld){lastHeld=heldSignature;for(const button of mount.querySelectorAll('[data-pilot-key]'))button.classList.toggle('is-held',held.has(button.dataset.pilotKey));}
 }
 function clear(force=false){keyboardHeld.clear();pointerHeld.clear();pointerTimes.clear();thrustStepTimes.clear();send(force);}
 function stop(){if(!currentId)return;const id=currentId;clear(true);setCameraOpen(false);const r=api.renderer();r?.setFreeDrive?.(id,false);if(r?.focusId===id&&r?.focusMode==='track'){r.look?.('center');r.updateCameraFrame?.();}else r?.focusTarget?.(id,'track',false,true);currentId=null;api.refresh();update();}
 function allowed(event){return !blocked()&&!editable(event.target)&&!event.ctrlKey&&!event.metaKey&&!event.altKey;}
 listen(document,'keydown',event=>{
  if(event.key==='Escape'&&currentId&&!disposed&&!document.querySelector('dialog[open]')&&!editable(event.target)){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();stop();return;}
  if(!keys[event.code]||!allowed(event))return;event.preventDefault();event.stopPropagation();const first=!keyboardHeld.has(event.code);if(first)keyboardHeld.add(event.code);
  if(isShuttle()&&keys[event.code][0]==='speed'){
   // Native key repeat adjusts the held acceleration setting at a readable pace.
   const now=Number.isFinite(event.timeStamp)?event.timeStamp:performance.now(),opposite=event.code==='KeyW'?'KeyS':'KeyW';
   if(!keyboardHeld.has(opposite)&&(first||event.repeat&&now-(thrustStepTimes.get(event.code)??-Infinity)>=120)){thrustStepTimes.set(event.code,now);const r=api.renderer();r?.setFlightPower?.((r?.getFlightState?.().thrustSetting||0)+keys[event.code][1]*.5);}
   if(first)send();update();
  }else if(first)send();
 },true);
 listen(document,'keyup',event=>{if(!keys[event.code]||!keyboardHeld.has(event.code))return;keyboardHeld.delete(event.code);thrustStepTimes.delete(event.code);send();if(!editable(event.target)){event.preventDefault();event.stopPropagation();}},true);
 listen(window,'blur',()=>clear());listen(document,'visibilitychange',()=>{if(document.hidden)clear();});listen(document,'focusin',event=>{if(editable(event.target))clear();});
 for(const button of mount.querySelectorAll('[data-pilot-key]')){
  listen(button,'pointerdown',event=>{if(blocked())return;event.preventDefault();event.stopPropagation();try{button.setPointerCapture?.(event.pointerId);}catch{}pointerTimes.set(event.pointerId??0,performance.now());pointerHeld.set(event.pointerId??0,button.dataset.pilotKey);send();});
  const release=event=>{const id=event.pointerId??0;if(!pointerHeld.has(id))return;event.preventDefault();const code=pointerHeld.get(id),elapsed=performance.now()-(pointerTimes.get(id)||0);pointerHeld.delete(id);pointerTimes.delete(id);send();if(event.type==='pointerup'&&elapsed<120)api.renderer()?.nudgeFlightTurn?.(code==='KeyA'?1:-1);};for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(button,event,release);
 }
 // Capture fallback also releases a finger ending outside its original button.
 for(const name of ['pointerup','pointercancel'])listen(window,name,event=>{if(pointerHeld.delete(event.pointerId??0))send();});
 listen(mount,'pointerdown',event=>event.stopPropagation());listen(mount,'wheel',event=>event.stopPropagation(),{passive:true});
 const observer=typeof MutationObserver==='function'?new MutationObserver(()=>{if(currentId&&document.querySelector('dialog[open]'))clear();}):null;observer?.observe(document.documentElement||document,{subtree:true,attributes:true,attributeFilter:['open']});
 listen($('pilotStop'),'click',stop);
 listen($('pilotBrakeSpeed'),'click',()=>{clear();const r=api.renderer();if(isShuttle())r?.setFlightPower?.(0);else{r?.brakeFlight?.('speed');r?.brakeFlight?.('turn');}update();});listen($('pilotReverse'),'click',()=>{api.renderer()?.reverseFlight?.();update();});
 const chooseCamera=mode=>{if(!currentId)return;api.renderer()?.focusTarget?.(currentId,mode);setCameraOpen(false);api.refresh();update();};
 listen($('pilotChase'),'click',()=>chooseCamera('chase'));
 listen($('pilotOnboard'),'click',()=>chooseCamera('onboard'));
 listen($('pilotPower'),'input',()=>{api.renderer()?.setFlightPower?.(Number($('pilotPower').value));update();});
 listen($('pilotCompact'),'click',()=>{const open=$('pilotSettings').hidden;if(open)api.closePanels?.();setCameraOpen(open);});
 listen(document,'pointerdown',event=>{if(!mount.contains(event.target))setCameraOpen(false);});
 function updateTelemetry(r,flight,driveId){
  // Tracking takes precedence over a selected object elsewhere in the tree.
  // The clock remains visible while paused and outside the driving interface.
  let clock=null;
  if(typeof r?.getObjectClock==='function'){
   for(const id of new Set([r.focusId,r.selectedId,driveId].filter(Boolean))){clock=r.getObjectClock(id);if(clock)break;}
  }else if(flight?.type==='shuttle')clock={lagSeconds:flight.timeLagSeconds||0};
  telemetry.hidden=!driveId&&!clock;scene?.classList.toggle('has-object-clock',!!clock);
  $('pilotSpeedRow').hidden=!driveId;$('pilotTurnRow').hidden=!driveId;
  $('pilotDilationRow').hidden=!clock;$('pilotDilationRateRow').hidden=!Number.isFinite(clock?.lossRate);$('pilotClockRateRow').hidden=!clock?.horizonLimit;
  if(!clock)return;
  const rate=Number.isFinite(clock.lossRate)?formatClockDuration(clock.lossRate)+' / s':'';if($('pilotDilationRate').textContent!==rate)$('pilotDilationRate').textContent=rate;
  $('pilotDilationRate').title='Current time difference accrued per distant-reference second, at this position and velocity. Updates when the orbit changes, including while paused; the lifetime total is preserved.';
  const value=formatClockDuration(Math.max(0,clock.lagSeconds||0));if($('pilotDilation').textContent!==value)$('pilotDilation').textContent=value;
  $('pilotDilation').title=(clock.name?clock.name+' · ':'')+'Accumulated distant-reference time minus local proper time since creation. Gravitational and speed effects are approximate; flight and orbital scenes use their respective simulation clocks.'+(clock.idealizedInfall?' The idealized radial clock path reaches the horizon; the displayed camera keeps a small exterior clearance.':'');
  $('pilotClockRate').title='The distant-to-local rate ratio diverges at the coordinate horizon. The accumulated time lost above remains finite; an infalling local clock does not stop.';
 }
 function update(){
  const r=api.renderer(),flight=r?.getFlightState?.(),id=r?.driveId||flight?.id||null;
  if(currentId!==id){clear(true);setCameraOpen(false);currentId=id;}if(blocked())clear();const changed=mount.hidden===!!id;mount.hidden=!id;scene?.classList.toggle('has-flight-controls',!!id);updateTelemetry(r,flight,id);if(changed)r?.resize?.();if(!id){setCameraOpen(false);return;}
  const paused=!!api.state().paused;$('pilotStatus').hidden=!paused;$('pilotStatus').textContent=paused?'Paused · press Play to continue flying.':'';for(const button of mount.querySelectorAll('[data-pilot-key]'))button.disabled=paused;
  const object=r.objects?.find(o=>o.id===id)||api.objects?.().find(o=>o.id===id)||{},type=object.type||flight?.type;
  const v=flight?.speedMetersPerSecond??0,k=flight?.curvaturePerMeter??0;
  const enterprise=type==='enterprise',warp=flight?.warpFactor??r.state?.warpFactor??0;if(lastType!==type){lastType=type;$('pilotPower').setAttribute('min','0');$('pilotPower').setAttribute('max',String(enterprise?9.9999:10));$('pilotPower').setAttribute('step',String(enterprise?.01:.5));$('pilotPower').setAttribute('aria-label',enterprise?'Warp level':'Forward acceleration in g');}if(document.activeElement!==$('pilotPower'))$('pilotPower').value=enterprise?warp:flight?.thrustSetting||0;
  $('pilotVelocityLabel').textContent=enterprise?'Warp':'Accel';$('pilotV').textContent=enterprise?formatFlightNumber(warp):formatFlightNumber(flight?.thrustSetting||0)+' g';$('pilotK').textContent=formatFlightNumber(flight?.turnRateRadiansPerSecond??0)+' rad/s';$('pilotSpeed').textContent=paused?'Paused':enterprise?formatFlightNumber(v/299792458)+' × c':formatFlightNumber(v)+' m/s';
  mount.classList.toggle('pilot-shuttle',!enterprise);
  $('pilotBrakeSpeed').textContent=enterprise?'Stop motion':'Cut thrust';$('pilotBrakeSpeed').setAttribute('data-short-label',enterprise?'■':'0 g');$('pilotBrakeSpeed').setAttribute('aria-label',enterprise?'Stop motion':'Cut thrust');$('pilotBrakeSpeed').title=enterprise?'Stop forward motion and turning':'Set acceleration to 0 g; keep coasting and turning';
  $('pilotPower').title=enterprise?'Warp factor':'Forward acceleration. To brake, turn 180° and burn forward. Red ≥4 g marks sustained-load risk, not a survival limit.';
  $('pilotK').title='Angular velocity: '+formatFlightNumber(flight?.turnRateRadiansPerSecond??v*k)+' rad/s';
  mount.title=(enterprise?'W / S changes warp factor. ':'W / S adjusts forward acceleration by 0.5 g. Hold to repeat; release to hold thrust. To brake, turn 180° and burn forward. ')+'A / D changes angular velocity. Release to hold each value. Drag to look; Esc resumes orbit.';
  $('pilotChase').setAttribute('aria-pressed',String(r?.focusMode==='chase'));$('pilotOnboard').setAttribute('aria-pressed',String(r?.focusMode==='onboard'));$('pilotReverse').hidden=!enterprise||!api.state().bridge;const reverseLabel=flight?.travelDirection===-1?'Travel forward':'Travel backward';$('pilotReverse').setAttribute('aria-label',reverseLabel);$('pilotReverse').title=reverseLabel+' without turning the camera';
 }
 function start(id){const r=api.renderer();if(!r?.setFreeDrive?.(id,true))return false;r.focusTarget?.(id,'track',false,true);clear(true);currentId=id;api.setPaused(false);api.refresh();update();return true;}
 return{start,update,dispose(){clear(true);setCameraOpen(false);disposed=true;observer?.disconnect();listeners.forEach(fn=>fn());mount.hidden=true;telemetry.remove();scene?.classList.remove('has-flight-controls');scene?.classList.remove('has-object-clock');}};
}

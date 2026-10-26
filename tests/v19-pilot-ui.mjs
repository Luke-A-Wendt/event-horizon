import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {formatFlightNumber,installPilotControls} from '../dist/pilot-ui.js';

for(const [input,expected] of [[0,'0'],[-0,'0'],[1,'1.0'],[1.2345,'1.2'],[12.345,'12'],[1234,'1,200'],[.012345,'0.012'],[.001,'0.0010'],[.0009999,'0.0010'],[99999,'1.0 × 10⁵'],[123456,'1.2 × 10⁵'],[.0001234,'1.2 × 10⁻⁴'],[-.0001234,'-1.2 × 10⁻⁴'],[Number.MAX_VALUE,'1.8 × 10³⁰⁸'],[Infinity,'—'],[NaN,'—']])assert.equal(formatFlightNumber(input),expected,`Flight telemetry formats ${input} with two significant figures`);

const f=fixture(),document=uiDomFixture(await readFile(new URL('../dist/index.html',import.meta.url),'utf8'));
globalThis.document=document;globalThis.window=document.createElement('window');
const $=id=>document.getElementById(id),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
let closes=0,refreshes=0;
const pilot=installPilotControls({mount:$('pilotControls'),renderer:()=>r,state:()=>r.state,objects:()=>r.objects,setPaused:paused=>r.update({paused}),closePanels(){closes++;},refresh(){refreshes++;}});
assert($('pilotTelemetry').hidden,'Telemetry starts hidden before Drive');
const finishBraking=()=>{r.update({speed:1});let at=r.lastTime||1000;r.lastTime=at;for(let i=0;i<70;i++)r.advanceSimulation(at+=100);pilot.update();};
r.loadScene('warp-cruise');r.render();const ship=r.objects.find(o=>o.type==='enterprise');
assert(pilot.start(ship.id));assert.equal(r.focusId,ship.id);assert.equal(r.focusMode,'track');assert.equal(r.state.viewMode,'orbit');const before={...r.camera};
for(const id of ['pilotBubble','pilotBubbleControl','pilotBrakeTurn','pilotEngine'])assert.equal($(id),null,`${id} is no longer an independent control`);
const main=$('pilotBrakeSpeed').parentNode,power=$('pilotPower').closest('.pilot-power'),actions=$('pilotCompact').parentNode;
assert.equal(main.className,'pilot-main');assert.equal(power.parentNode,main);assert.equal(actions.parentNode,main);
assert(main.children.indexOf($('pilotBrakeSpeed'))<main.children.indexOf(power),'Stop motion comes before Warp');
assert(main.children.indexOf(power)<main.children.indexOf(actions),'Camera and return actions come after the Warp value');
assert(actions.children.indexOf($('pilotCompact'))<actions.children.indexOf($('pilotStop')),'Return to orbit follows the camera control');
assert.equal($('pilotK').closest('.pilot-telemetry'),$('pilotSpeed').closest('.pilot-telemetry'),'Speed and angular velocity share the telemetry block');
const overlay=$('pilotTelemetry').parentNode,distance=overlay.querySelector('.distance-readout');
assert.equal(overlay.className,'scene-bottom');assert(overlay.children.indexOf(distance)<overlay.children.indexOf($('pilotTelemetry')),'Flight telemetry follows the distance readout');
assert(!$('pilotControls').contains($('pilotTelemetry')),'Readouts remain outside the flight controls');assert(!$('pilotTelemetry').hidden);
assert.equal($('pilotCompact').getAttribute('aria-label'),'Flight camera');
assert.equal($('pilotSettings').querySelectorAll('button').length,2,'Camera popup contains only Chase and Ride');
assert.equal($('pilotCompact').querySelector('use').getAttribute('href'),'#i-video');
assert($('pilotSpeed').textContent.endsWith(' × c'));assert($('pilotK').textContent.endsWith(' rad/s'));
assert.equal($('pilotBrakeSpeed').textContent,'Stop motion');assert(!$('pilotNominal'));assert(!$('pilotThrustHint'));assert($('pilotDilationRow').hidden);
$('pilotCompact').click();assert(!$('pilotSettings').hidden);assert.equal(closes,1);assert.deepEqual(r.camera,before,'Opening camera choices leaves the viewpoint alone');
$('pilotPower').value='6.234';$('pilotPower').dispatch('input');assert.equal(r.getFlightState().warpFactor,6.234);assert.equal($('pilotV').textContent,'6.2','Warp display uses two significant figures without rounding the simulation value');assert.equal(r.camera.yaw,before.yaw,'Changing warp preserves the side heading');assert.equal(r.camera.pitch,before.pitch);assert.equal(r.focusMode,'track');
$('pilotChase').click();assert.equal(r.focusMode,'chase');assert.equal(r.driveId,ship.id);assert($('pilotSettings').hidden);assert.equal($('pilotCompact').getAttribute('aria-expanded'),'false');
$('pilotCompact').click();$('pilotOnboard').click();assert.equal(r.focusMode,'onboard');assert.equal(r.driveId,ship.id);assert($('pilotSettings').hidden);
$('pilotCompact').click();$('scene').dispatch('pointerdown');assert($('pilotSettings').hidden,'Tapping the scene closes camera choices');
r.nudgeFlightTurn(1);assert(r.getFlightState().turnRateRadiansPerSecond>0);pilot.update();assert.notEqual($('pilotK').textContent,'0 rad/s');
$('pilotBrakeSpeed').click();assert(ship.flight.brakeSpeed&&ship.flight.brakeTurn,'One action brakes both forward motion and turning');finishBraking();assert.equal(r.getFlightState().speedMetersPerSecond,0);assert.equal(r.getFlightState().turnRateRadiansPerSecond,0);assert.equal($('pilotK').textContent,'0 rad/s');assert.equal(r.driveId,ship.id,'Stop motion keeps Drive active');
$('pilotStop').click();assert.equal(r.driveId,null);assert($('pilotControls').hidden,'Resume orbit leaves Drive');assert($('pilotTelemetry').hidden,'Leaving Drive hides the flight readouts');
r.loadScene('nasa-shuttle');const shuttle=r.objects.find(o=>o.type==='shuttle');assert(pilot.start(shuttle.id));
assert.equal($('pilotPower').min,'0');assert.equal($('pilotPower').max,'10');assert.equal($('pilotPower').getAttribute('step'),'0.5');assert.equal($('pilotPower').value,'0');assert.equal($('pilotV').textContent,'0 g');assert.equal($('pilotVelocityLabel').textContent,'Accel');assert.equal($('pilotBrakeSpeed').textContent,'Cut thrust');assert(!$('pilotNominal'));assert(!$('pilotThrustHint'));assert.match($('pilotPower').title,/turn 180° and burn forward/i);assert(!$('pilotDilationRow').hidden);
const initialShuttleSpeed=r.getFlightState().speedMetersPerSecond,shuttleCamera={...r.camera};$('pilotPower').value='1.5';$('pilotPower').dispatch('input');assert.equal(r.getFlightState().thrustSetting,1.5);assert.equal(r.getFlightState().speedMetersPerSecond,initialShuttleSpeed,'Choosing acceleration does not directly set velocity');assert.deepEqual(r.camera,shuttleCamera,'Setting shuttle acceleration keeps its camera');r.lastTime=1000;r.advanceSimulation(1100);r.nudgeFlightTurn(1);pilot.update();assert($('pilotSpeed').textContent.endsWith(' m/s'));assert.equal($('pilotV').textContent,'1.5 g');
const beforeCut=r.getFlightState();assert(beforeCut.speedMetersPerSecond>0);assert(beforeCut.turnRateRadiansPerSecond>0);$('pilotBrakeSpeed').click();assert.equal(r.getFlightState().thrustSetting,0);assert.equal(r.getFlightState().speedMetersPerSecond,beforeCut.speedMetersPerSecond,'Cut thrust preserves the shuttle’s current velocity');assert.equal(r.getFlightState().turnRateRadiansPerSecond,beforeCut.turnRateRadiansPerSecond,'Cut thrust does not stop turning');r.advanceSimulation(1200);assert.equal(r.getFlightState().speedMetersPerSecond,beforeCut.speedMetersPerSecond,'The shuttle coasts after cutting thrust');assert.equal(r.driveId,shuttle.id);assert.equal(r.focusMode,'track');assert.deepEqual(r.camera,shuttleCamera);
r.loadScene('bridge');const traveler=r.objects.find(o=>o.type==='enterprise');assert(pilot.start(traveler.id));assert(!$('pilotReverse').hidden);assert(!$('pilotSettings').contains($('pilotReverse')),'Wormhole reversal stays out of camera choices');
const direction=r.getFlightState().travelDirection;$('pilotReverse').click();assert.equal(r.getFlightState().travelDirection,-direction);assert($('pilotSettings').hidden);
r.setBridgeTraveler('shuttle');const bridgeShuttle=r.objects.find(o=>o.type==='shuttle');assert(pilot.start(bridgeShuttle.id));assert($('pilotReverse').hidden,'Shuttle braking requires a physical turn and burn even inside a bridge');assert.equal($('pilotBrakeSpeed').textContent,'Cut thrust');
// Taking the helm re-centers the driven craft from every navigation context.
for(const preset of ['nasa-shuttle','warp-orbit','bridge-planets']){
 for(const mode of ['other','onboard','chase','free']){
  r.loadScene(preset);const craft=r.objects.find(o=>['enterprise','shuttle'].includes(o.type));
  if(mode==='other')r.focusTarget(r.state.bridge?'bridge':'primary','track');
  else if(mode==='free')r.freeRoamRelative(craft.id);
  else{r.focusTarget(craft.id,mode);r.rotate(1.8,.5);r.camera={...r.target};}
  assert(pilot.start(craft.id));assert.equal(r.driveId,craft.id);assert.equal(r.focusId,craft.id);assert.equal(r.focusMode,'track');assert.equal(r.state.viewMode,'orbit');
  assert.equal(r.camera.lookYaw,0);assert(r.camera.focusDistance>1.15,'Orbit starts outside the vehicle');
  const frame=r.getFocusFrame(craft.id),view=r.cameraFrame,delta=frame.position.map((v,i)=>v-view.observer[i]);
  assert(delta.reduce((s,v,i)=>s+v*view.forward[i],0)>frame.radius,'Driven vehicle is ahead of the camera');
 }
}
assert(refreshes>=4);pilot.dispose();assert.equal($('pilotTelemetry'),null,'Disposal removes the separate flight readouts');r.dispose();
console.log('PASS: ordered flight control row, separate two-significant-figure telemetry, Enterprise stop-motion brake, Shuttle acceleration range without a nominal marker, cut-thrust coasting, camera-only auto-closing choices, Drive target/orbit selection and heading-preserving power framing, Enterprise-only wormhole reversal, and return to orbit. DOM and renderer contracts; no browser layout emulation.');

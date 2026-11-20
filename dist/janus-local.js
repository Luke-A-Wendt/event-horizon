// The visible lap is paced in display seconds; angular motion and cabin time
// both advance through the same physical parking orbit. A bridge has no cruise
// speed: it only consumes the seconds spent opening and closing in each chart.
import {REFERENCE_RG_METERS} from './objects.js';
import {warpForSpeed,FLIGHT_LIGHT_SPEED} from './flight-dynamics.js';
const TAU=2*Math.PI;
const SECONDS_PER_SCENE=18*REFERENCE_RG_METERS/FLIGHT_LIGHT_SPEED;
export function janusLapSample(r,pod){
 if(pod?.hullModel!=='janusPod'||pod.placement!=='orbit'||!(pod.orbitMeters>0)||pod.waypointHoldId)return null;
 const omega=Math.abs(r.orbitalOmega(pod));
 if(!(omega>0))return null;
 const simulatorPeriod=TAU/omega,periodSeconds=simulatorPeriod*SECONDS_PER_SCENE,localSpeed=TAU*pod.orbitMeters/periodSeconds;
 return {periodSeconds,simulatorPeriod,localSpeed,warpFactor:warpForSpeed(localSpeed),phase:r.currentPhase(pod)};
}
export function janusChartOwner(r){
 // A local graphics change is never allowed to move or re-time another
 // ship's active flight. One navigation route owns the shared ephemeris.
 if(r.transfer?.active||r.dockingMission)return null;
 const routes=Object.values(r.janusRoutes||{});
 return (routes.find(p=>p.auto&&(!r.driveId||r.driveId===p.craftId))||routes.find(p=>p.stage!=='orbit'&&(!r.driveId||r.driveId===p.craftId)))?.craftId||null;
}
export function janusScheduledRate(r,craft,p){
 const id=craft?.id||r.janusStepOwner||janusChartOwner(r),pod=craft||r.objectById?.get(id),route=p||r.janusRoutes?.[id];
 if(!route||!pod)return r.simulationTimeScale();
 if(route.stage!=='orbit')return 1/SECONDS_PER_SCENE;
 const orbit=janusLapSample(r,pod);
 return orbit?orbit.simulatorPeriod/(r.sceneId==='earth-andromeda-bridge'?7.5:12):1/SECONDS_PER_SCENE;
}
export function advanceJanusChart(r,pod,p,displayDt){
 if(!pod||!(displayDt>0)||(r.janusStepOwner||janusChartOwner(r))!==pod.id)return false;
 r.time+=displayDt*janusScheduledRate(r,pod,p);
 return true;
}
export function isJanusParkingWarp(r,id=r.warpObjectId){
 const pod=id&&r.objectById?.get(id),p=r.janusRoutes?.[id];
 return !!(p&&pod?.hullModel==='janusPod'&&pod.warpEnabled&&r.state.warp&&r.warpObjectId===id&&(p.stage==='local'||p.stage==='orbit'&&pod.placement==='orbit'&&r.navigationModes?.[id]!=='manual'));
}
export function syncJanusLocal(r,pod,p){
 if(!pod||r.navigationModes?.[pod.id]==='manual'&&p?.stage!=='local'||r.driveId&&r.driveId!==pod.id)return false;
 const sample=p?.stage==='local'?{warpFactor:warpForSpeed(p.localSpeed||0)}:p?.stage==='orbit'?janusLapSample(r,pod):null;
 if(sample&&r.warpObjectId&&r.warpObjectId!==pod.id)return false;
 if(sample){
  if(r.state.warp&&r.warpObjectId===pod.id&&r.state.warpFactor===sample.warpFactor&&pod.warpEnabled)return true;
  r.state.warp=true;r.warpObjectId=pod.id;pod.warpEnabled=true;r.state.warpScenario='orbit';r.state.warpFactor=sample.warpFactor;
 }else{
  if(r.warpObjectId!==pod.id)return false;
  r.state.warp=false;r.state.warpFactor=0;r.warpObjectId=null;pod.warpEnabled=false;
 }
 // Only the local field intensity changes. Both the model and the optical
 // branches already exist in the Janus program, including during exchange.
 r.lastGeometryTime=NaN;
 return !!sample;
}
export function janusTrimJets(orbit){
 // +X points towards the planet in the orbital tangent frame. The outward
 // nozzle exhausts along −X, supplying an inward trim impulse. The two aft
 // nozzles provide constant low forward thrust inside the bubble.
 const angle=orbit?.phase||0,pulse=Math.pow(.5+.5*Math.cos(8*angle),5);
 return {aft:.30,side:-.46*pulse};
}

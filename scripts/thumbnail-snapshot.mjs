// Offline only: records one real live High frame for shared scene thumbnails.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {advanceToDestination,arrivalView} from './thumbnail-arrival.mjs';
import {advanceToWarpShot,warpShotView,reachProximaSunset,proximaSunsetView} from './thumbnail-interstellar.mjs';
import {advanceToNeptuneCapture,ferryThumbnailView} from './thumbnail-docking.mjs';
import {warpStudyId} from '../dist/warp-studies.js';
import {thumbnailLocators} from './thumbnail-locators.mjs';
import {fixture} from '../tests/render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {VERTEX,createFragment} from '../dist/shaders.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {PLANET_TEXTURE_DATA} from '../dist/planet-texture-data.js';
const out=process.argv[2];if(!out)throw Error('Usage: node scripts/thumbnail-snapshot.mjs /absolute/output-directory [scene] [command|latched (ferry) or hub (station)]');
await mkdir(out,{recursive:true});
const dependencies=['config','janus-solar-tour','janus-local','janus-scene','janus-charts','janus-maneuver','janus-exchange','janus-pod-glsl','janus-hull','janus-mesh','janus-aperture','janus-aperture-glsl','janus-lens','scene-catalog','warp-studies','solar-catalog','objects','renderer','disc-rainbow','shaders','bridge-glsl','proxima-gate-layout','paired-gate-flight','bridge-gate-glsl','bridge-gate-layout','craft-glsl','meridian-glsl','meridian-port','meridian-rcs','docking-flight','station-docking','contact-playback','flight-attitude','flight-sequence','travel-routes','travel-math','weak-field-glsl','meridian-radiation','heritage-shuttle-glsl','habitat-glsl','legacy-enterprise-glsl','habitat-spin','dyson-glsl','garden-waters','kardashev-earth','kardashev-solar','matrioshka','oneill-cylinder','oneill-cylinder-glsl','dyson','dyson-swarm','toroid-swarm','shkadov','grid-glsl','geometry-tracer','geometry-rain','annotations','velocity-arrows','planet-glsl','warp-glsl','warp-grid-profile','warp-plumes','warp-thrusters','flight-dynamics','stellar-physics','pelagia-tide','pelagia-glsl','pelagia-geography','tidal-shape','planet-texture-data'];
const hash=createHash('sha256');for(const name of dependencies)hash.update(await readFile(new URL('../dist/'+name+'.js',import.meta.url)));const sourceHash=hash.digest('hex');
await writeFile(out+'/textures.json',JSON.stringify(PLANET_TEXTURE_DATA));
const textureHash=createHash('sha256').update(JSON.stringify(PLANET_TEXTURE_DATA)).digest('hex');
const ids=[];
for(const scene of SCENE_PRESETS.filter(s=>!process.argv[3]||s.id===process.argv[3])){
 const f=fixture({width:960,height:632}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene(scene.id);
 let arrival=null;
 const arrivalTarget={'shuttle-earth-moon-loop':'Moon','shuttle-earth-mars-loop':'Mars'}[scene.id];
 if(arrivalTarget){
  arrival=advanceToDestination(r,arrivalTarget);
 }else if(scene.id==='janus-solar-tour'&&['cabin','copilot'].includes(process.argv[4])){
  const pilot=r.objects.find(o=>o.catalogId==='nasa-janus');
  r.focusTarget(pilot.id,'onboard',false,true);
  if(process.argv[4]==='copilot'){r.target.lookYaw=-2.01;r.target.lookPitch=-.29;}
 }else if(scene.id==='janus-solar-tour'&&process.argv[4]!=='earth'){
  // Photograph the first bridge after the full Earth orbit, with the receiving
  // sky inside the opening and the departure planet outside. Follow tour
  // state rather than a fixed time: capture still works if pacing changes.
  const pod=r.objects.find(o=>o.catalogId==='nasa-janus');
  r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
  let seen=false;
  for(let tick=1;tick<=900;tick++){
   r.advanceSimulation(1000+100*tick);
   const phase=r.getJanusBridge(pod.id);
   if(phase.stage==='charge'&&phase.exchanges===0&&phase.progress>=.40){seen=true;break;}
  }
  if(!seen)throw Error('Solar tour card requires the first active bridge.');
 }else if(scene.id==='earth-andromeda-bridge'&&(!process.argv[4]||process.argv[4]==='aster')){
  // Let the actual first exchange complete, then photograph the cabin and
  // divided icy rings from the real arrival orbit, after the caustic clears.
  const pod=r.objects.find(o=>o.catalogId==='nasa-janus');
  r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
  const unit=v=>v.map(x=>x/Math.hypot(...v)),dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
  const planet=r.objects.find(o=>o.catalogId==='aster-vale'),sun=r.objects.find(o=>o.catalogId==='m31-lyra');
  let composed=false;
  for(let tick=1;tick<=260;tick++){
   r.advanceSimulation(1000+tick*100);
   const state=r.getJanusBridge(pod.id);
   if(state.stage!=='orbit'||state.exchanges!==1)continue;
   r.fillObjects();
   const cabin=r.frameById.get(pod.id),world=r.frameById.get(planet.id),star=r.frameById.get(sun.id);
   const fromWorld=body=>unit(body.janusLocalPosition.map((x,i)=>x-world.janusLocalPosition[i]));
   const radial=fromWorld(cabin);
   if(dot(radial,fromWorld(star))<.75)continue;
   // Photograph the lit hemisphere from the day side of the actual orbit.
   // Offset the planet from the cabin so its limb and rings remain visible.
   const tangent=unit([radial[2],0,-radial[0]]);
   const arm=unit(radial.map((x,i)=>x+.43*tangent[i]+(i===1?.14:0)));
   const axes=r.focusReferenceFrame?.id===pod.id?r.focusReferenceFrame.basis:cabin.frame;
   const local=axes.map(axis=>dot(arm,axis));
   r.target.yaw=Math.atan2(local[0],local[2]);r.target.pitch=Math.asin(local[1]);r.target.focusDistance=4.1;
   composed=true;break;
  }
  if(!composed)throw Error('Janus gallery capture requires a sunlit arrival orbit at Aster Vale.');
 }else if(scene.id==='earth-proxima-gates'&&process.argv[4]!=='earth'){
  // Sample the first real gate opening on the scheduled flight. Keep the
  // departure orbit available to compare the on-screen framing with the card.
  r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
  const pose=process.argv[4]||'gate';
  let reached=false;
  for(let tick=1;tick<=3600;tick++){
   r.advanceSimulation(1000+tick*50);r.fillObjects();
   const stage=r.getBridgeStage();
   const arrival=pose==='proxima'&&stage.far&&r.flightSequences?.[r.bridgeObjectId]?.orbitWait;
   if(arrival||(pose==='gate'&&stage.open>=.72&&!stage.far)||(pose==='crossing'&&stage.open===1&&stage.far)){
    reached=true;break;
   }
  }
  if(!reached)throw Error('Earth–Proxima flight did not reach the requested pose: '+pose);
 }else if(scene.id==='warp-proxima-direct'){
  arrival=reachProximaSunset(r);
 }else if(['earth-vulcan','warp-sgra-direct'].includes(scene.id)){
  advanceToWarpShot(r,scene.id==='warp-sgra-direct');
 }else if(scene.id==='radiant-descent'){
  // Sample the helmet on the physical infall. Aim at the shadow rather
  // than its right limb for this still, with room for the outer blue rings.
  r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
  for(let i=1;i<=500;i++){
   r.advanceSimulation(1000+i*100);r.fillObjects();
   if(Math.hypot(...r.getFocusFrame().position)<=52*r.massScale)break;
  }
  if(process.argv[4]!==undefined){r.time=Number(process.argv[4]);r.fillObjects();r.updateCameraFrame();}
 }else if(scene.id==='earth-mars-station-ferry'){
  advanceToNeptuneCapture(r,process.argv[4]);
 }else if(scene.id==='earth-andromeda-bridge'&&process.argv[4]){
  const key=process.argv[4],timeline={earth:0,opening:8.8,contact:10.699,andromeda:13.1};
  if(!(key in timeline))throw Error('Unknown Janus proof pose');
  r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;r.fillHoles();r.fillObjects();
  for(let t=0;t<timeline[key];){t=Math.min(t+.05,timeline[key]);r.advanceSimulation(1000+1000*t);r.fillObjects();}
 }else if(scene.id==='nasa-shuttle'){
  // Capture the actual disc-edge arrival, when the ship is above the tilted
  // gas. A manually placed circular orbit need not have this arrival phase.
  const ship=r.objects.find(o=>o.type==='shuttle'),discStop=r.getFlightSequence(ship.id).nodes[2];
  r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
  let arrival=0;
  for(let tick=1;tick<=6000;tick++){
   r.advanceSimulation(1000+100*tick);
   if(!r.transfer&&ship.orbitMeters===discStop.radiusMeters){
    if(!arrival)arrival=tick;
    if(tick-arrival===20)break; // Wait for the burn-to-coast yaw to reveal the ship broadside.
   }
  }
  if(!arrival)throw Error('Disc-edge thumbnail did not reach its orbital stop.');
 }else if(scene.id==='matrioshka-brain'&&!process.argv[4]){
  for(const tier of r.objects.filter(o=>o.catalogId?.startsWith('brain-')))r.updateObject(tier.id,{dysonCutaway:.60});
  r.cameraGuide=null;
  r.target.yaw=-2.62;r.target.pitch=.21;r.target.focusDistance*=1.10;
 }else if(scene.id==='dyson-garden'&&!process.argv[4]){
  const shell=r.objects.find(o=>o.type==='dyson');r.updateObject(shell.id,{dysonCutaway:.60});
  r.cameraGuide=null;r.target.yaw=-2.55;r.target.pitch=.12;
  r.target.focusDistance=3.0*shell.radiusMeters/r.objects.find(o=>o.type==='star').radiusMeters;
 }else if(scene.id==='oneill-cylinder'&&(!process.argv[4]||process.argv[4]==='exterior')){
  if(!process.argv[4])r.updateObject(r.objects[0].id,{dysonCutaway:.60});
  r.focusTarget(r.objects.find(o=>o.type==='cylinder').id,'track',false,true);
  r.target.yaw=-.98;r.target.pitch=.32;r.target.focusDistance=2.4;
 }else if(['ringworld','dyson-garden'].includes(scene.id)&&process.argv[4]==='garden'){
  const garden=r.objects.find(o=>o.type==='dyson');r.focusTarget(garden.id,'onboard',false,true);
 }else if(scene.id==='dyson-swarm'&&process.argv[4]==='habitat'){
  // Photograph the actual member of the outer fleet with Helios and the
  // inner formations behind it. The default card still shows all six tracks.
  const aster=r.objects.find(o=>o.catalogId==='swarm-aster');r.focusTarget(aster.id,'track',false,true);
  r.target.focusDistance=3.6;r.target.yaw=.25;r.target.pitch=.33;
 }else if(scene.id==='orbital-expedition'){
  // Readable garden rim at gallery size, with room for the blue disc.
  const hubStudy=process.argv[4]==='hub';
  r.target.focusDistance=hubStudy?2.25:3.1;
  if(hubStudy){r.target.pitch=.68;r.target.yaw=-.92;}
 }else if(scene.id==='geometry-freefall-kerr'){
  // A late point on the actual release shows the angular sweep near the hole.
  r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
  for(let elapsed=100;elapsed<=10800;elapsed+=100)r.advanceSimulation(1000+elapsed);
  r.target.distance*=.65; // Frame the near-horizon twist at gallery-card size.
 }else if(scene.id==='warp-cruise'){
  // Reveal both nacelles against the full, moving magenta field.
  r.cameraGuide=null;r.target.yaw=-1.14;r.target.pitch=.25;r.target.focusDistance*=.85;
 }else if(scene.id==='warp-lab'){
  // The laboratory card shows both open field coils without cropping the wall.
  // This is a gallery camera only; keep the live scene's authored broadside.
  r.target.yaw=-1.04;r.target.pitch=.16;r.fitWarpCamera(true);
 }else if(scene.id==='enterprise-solar-tour'){
  // The opening solar limb pairs the two tours; bring the warp ship's hull
  // forward so the two ships can be told apart at gallery-card size.
  r.target.focusDistance*=.55;
 }else if(warpStudyId(scene.id)==='warp-excursion'){
  // On the inward leg the horizon's dark limb folds across the warp wall.
  // Capture the actual approach rather than the parked, idle field at launch.
  r.sceneLoad=null;r.state.paused=false;r.advanceChartStages(.001);
  const leg=r.transfer;
  if(!leg?.waypoint)throw Error('Beyond the Horizon thumbnail requires the inward waypoint leg.');
  r.advanceTravel(.72*leg.wallSeconds-leg.elapsed);
 }else if(scene.id==='bridge'){
  // Capture the energized hardware surrounding the opening throat.
  r.sceneLoad=null;r.state.paused=false;r.advanceChartStages(.001);
  const trip=r.transfer;if(!trip?.crossing)throw Error('Gate photograph requires an active crossing.');
  r.advanceTravel(trip.wallSeconds*.4-trip.elapsed);
  if(r.getBridgeStage().open<=0)throw Error('Expected an opening throat');
 }else if(scene.id==='bridge-nebulae'){
  // Photograph the outbound crossing, with the live hull, heading and sky
  // on the throat (isotropic radius b/2). Loading the scene still starts at Fire.
  r.sceneLoad=null;r.state.paused=false;r.advanceChartStages(.001);
  const trip=r.transfer;
  if(!trip?.crossing)throw Error('Fire and Ice thumbnail requires an outbound bridge crossing.');
  r.advanceTravel(trip.wallSeconds*.5-trip.elapsed);
  const ship=r.objects.find(o=>o.id===trip.craftId),throat=r.configCache.bridgeRadius*.5;
  if(!ship?.drivePosition||!(Math.abs(Math.hypot(...ship.drivePosition)/throat-1)<1e-6))
   throw Error('Fire and Ice thumbnail must show the traveler at the throat.');
  // An elevated quarter view separates the saucer and both nacelles.
  r.target.yaw=-1.17;r.target.pitch=.28;r.target.focusDistance=2.65;
 }
 r.setQuality('high');r.resize();r.camera={...r.target};r.fillHoles();r.fillObjects();r.updateMeridianIrises();r.updateCameraFrame();
 r.requestProgram();const view=scene.id==='warp-proxima-direct'?proximaSunsetView(r,arrival):arrival?arrivalView(r,arrival):['earth-vulcan','warp-sgra-direct'].includes(scene.id)?warpShotView(r,scene.id==='warp-sgra-direct'):scene.id==='earth-mars-station-ferry'?ferryThumbnailView(r,process.argv[4]):r.cameraFrame;if(scene.id==='bridge'){
  // A camera outside the machine shows the open pentagons and the depth of the frame.
  // Offset sideways to keep the ship from eclipsing the optical throat.
  const b=r.configCache.bridgeRadius,[x,y,z]=r.configCache.primaryBasis;
  const norm=v=>v.map(q=>q/Math.hypot(...v)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  view.observer=x.map((v,i)=>b*(2.7*v+.52*y[i]+8.99*z[i]));
  view.forward=norm(view.observer.map(v=>-v));view.right=norm(cross(view.forward,y));view.up=cross(view.right,view.forward);r.focusId=null;view.eyeOrigin=[0,0,0];view.eyeOffset=view.observer;view.inspectIndex=-1;view.hideIndex=-1;
 }else if(scene.id==='radiant-descent'&&process.argv[4]===undefined){
  if(view.hideIndex<0)throw Error('Blue Fire thumbnail must be inside the helmet');
  const norm=v=>v.map(x=>x/Math.hypot(...v)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  // Keep the visible disc horizontal while looking down from the actual helmet position.
  view.forward=norm(view.observer.map(x=>-x));view.right=norm(cross(view.forward,r.configCache.primaryDiscAxis));view.up=cross(view.right,view.forward);
 }r.drawScene(view,{width:640,height:422,steps:192,detail:2});
 const snapshot={focusSurfaceId:r.focusSurfaceId||0,features:{...r.shaderFeatures(),ultra:false},uniforms:[...f.uniforms].map(([name,value])=>({name,...value})),width:640,height:422,time:r.time};
 if(['geometry-orbit','geometry-freefall','geometry-freefall-kerr','shuttle-space'].includes(scene.id))snapshot.overlay=thumbnailLocators(r,snapshot.width,snapshot.height);
 const fragment=createFragment({...snapshot.features,derivatives:true,derivativeExtension:false});
 const vertex='#version 300 es\n'+VERTEX.replace(/\battribute\b/g,'in');
 const shader='#version 300 es\n'+fragment.replace(/\btexture2D\b/g,'texture').replace(/\bgl_FragColor\b/g,'outColor').replace(/precision highp float;/,'precision highp float;\nout vec4 outColor;');
 const renderHash=createHash('sha256').update(JSON.stringify({vertex,fragment:shader,...snapshot,textureHash:snapshot.features.planetary?textureHash:null})).digest('hex');
 await writeFile(out+'/'+scene.id+'.json',JSON.stringify({id:scene.id,title:scene.title,sourceHash,renderHash,vertex,fragment:shader,...snapshot}));ids.push(scene.id);r.dispose();
}
await writeFile(out+'/scenes.json',JSON.stringify(ids));console.log(JSON.stringify({count:ids.length,sourceHash,out}));

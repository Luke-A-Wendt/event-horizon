// Offline only: records one real live High frame for shared scene thumbnails.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fixture} from '../tests/render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {VERTEX,createFragment} from '../dist/shaders.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {PLANET_TEXTURE_DATA} from '../dist/planet-texture-data.js';
const out=process.argv[2];if(!out)throw Error('Usage: node scripts/thumbnail-snapshot.mjs /absolute/output-directory [scene]');
await mkdir(out,{recursive:true});
const dependencies=['config','scene-catalog','solar-catalog','objects','renderer','shaders','bridge-glsl','craft-glsl','grid-glsl','planet-glsl','warp-glsl','stellar-physics','tidal-shape','planet-texture-data'];
const hash=createHash('sha256');for(const name of dependencies)hash.update(await readFile(new URL('../dist/'+name+'.js',import.meta.url)));const sourceHash=hash.digest('hex');
await writeFile(out+'/textures.json',JSON.stringify(PLANET_TEXTURE_DATA));
const textureHash=createHash('sha256').update(JSON.stringify(PLANET_TEXTURE_DATA)).digest('hex');
const ids=[];
for(const scene of SCENE_PRESETS.filter(s=>!process.argv[3]||s.id===process.argv[3])){
 const f=fixture({width:960,height:632}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene(scene.id);
 if(scene.id==='nasa-shuttle'){
  // Preview the disc edge independently of the playable return-limit orbit.
  const craft=r.objects.find(o=>o.type==='shuttle');
  r.setOrbitRadiusMeters(craft.id,r.configCache.diskOuter[0]*REFERENCE_RG_METERS);
 }else if(scene.id==='enterprise-solar-tour'){
  // The opening solar limb pairs the two tours; bring the Enterprise hull
  // forward so the two ships can be told apart at gallery-card size.
  r.target.focusDistance*=.55;
 }else if(scene.id==='warp-excursion'){
  // On the inward leg the horizon's dark limb folds across the warp wall.
  // Capture the actual approach rather than the parked, idle field at launch.
  r.sceneLoad=null;r.state.paused=false;r.advanceChartStages(.001);
  const leg=r.transfer;
  if(!leg?.waypoint)throw Error('Beyond the Horizon thumbnail requires the inward waypoint leg.');
  r.advanceTravel(.72*leg.wallSeconds-leg.elapsed);
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
  // A closer broadside keeps both skies and the hull legible on a small card.
  r.target.focusDistance=2.35;
 }
 r.setQuality('high');r.resize();r.camera={...r.target};r.fillHoles();r.fillObjects();r.updateCameraFrame();
 r.requestProgram();r.drawScene(r.cameraFrame,{width:640,height:422,steps:192,detail:2});
 const snapshot={focusSurfaceId:r.focusSurfaceId||0,features:{...r.shaderFeatures(),ultra:false},uniforms:[...f.uniforms].map(([name,value])=>({name,...value})),width:640,height:422,time:r.time};
 const fragment=createFragment({...snapshot.features,derivatives:true,derivativeExtension:false});
 const vertex='#version 300 es\n'+VERTEX.replace(/\battribute\b/g,'in');
 const shader='#version 300 es\n'+fragment.replace(/\btexture2D\b/g,'texture').replace(/\bgl_FragColor\b/g,'outColor').replace(/precision highp float;/,'precision highp float;\nout vec4 outColor;');
 const renderHash=createHash('sha256').update(JSON.stringify({vertex,fragment:shader,...snapshot,textureHash:snapshot.features.planetary?textureHash:null})).digest('hex');
 await writeFile(out+'/'+scene.id+'.json',JSON.stringify({id:scene.id,title:scene.title,sourceHash,renderHash,vertex,fragment:shader,...snapshot}));ids.push(scene.id);r.dispose();
}
await writeFile(out+'/scenes.json',JSON.stringify(ids));console.log(JSON.stringify({count:ids.length,sourceHash,out}));

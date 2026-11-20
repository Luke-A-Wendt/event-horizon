import {savedDockingMission,readDockingMission} from './docking-file.js';
import {validExtraLaps} from './orbit-laps.js';
import {SCENE_ORIGIN} from './scene-origin.js';
import { naturalParentReason } from './object-taxonomy.js';
// Versioned, local scene files. Only the deliberately small YAML data subset
// emitted below is accepted: mappings, sequences, finite scalars and JSON arrays.
// No tags, executable values, aliases, merge keys, or prototype-bearing keys.
import { DEFAULTS, SCENE_PRESETS, GRID_DENSITY_RANGE } from './config.js';
import { OBJECT_CLASS, OBJECT_KIND, MAX_WORLD_METERS, JANUS_THRUST_MAX_G, compactSatellite, acceptsHull, hullType, importedObjectName } from './objects.js';
import { snapshotRenderer } from './render-state.js';
import { FLIGHT_LIGHT_SPEED,SHUTTLE_THRUST_MAX_G } from './flight-dynamics.js';
export const SCENE_FILE_VERSION='1.65.0';
export const MAX_SCENE_FILE_BYTES=4*1024*1024;
const FORMAT='event-horizon-scene',MAX_OBJECTS=1024,MAX_DEPTH=48;
const forbidden=new Set(['__proto__','prototype','constructor']);
const own=(v,k)=>Object.hasOwn(v,k),plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export class SceneFileError extends Error{constructor(message){super('Cannot load: '+message);this.name='SceneFileError';}}
const fail=message=>{throw new SceneFileError(message);};
const check=(condition,message)=>{if(!condition)fail(message);};
const fields=(v,allowed,path)=>{check(plain(v),`${path} must be a mapping.`);for(const k of Object.keys(v))check(allowed.includes(k)&&!forbidden.has(k),`Unknown property ${path}.${k}.`);};
const number=(v,path,lo=-1e25,hi=1e25)=>check(typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi,`${path} must be a finite number between ${lo} and ${hi}.`);
const string=(v,path,max=1000)=>check(typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),`${path} must be a short text value.`);
const enumeration=(v,values,path)=>check(values.includes(v),`${path} is not a supported value.`);
const vector=(v,path)=>{check(Array.isArray(v)&&v.length===3,`${path} must have three numbers.`);v.forEach((x,i)=>number(x,`${path}[${i}]`));};
const basis=(v,path)=>{check(Array.isArray(v)&&v.length===3,`${path} must have three axes.`);v.forEach((a,i)=>vector(a,`${path}[${i}]`));for(let i=0;i<3;i++){check(Math.abs(v[i].reduce((s,x)=>s+x*x,0)-1)<.01,`${path} axes must have unit length.`);for(let j=0;j<i;j++)check(Math.abs(v[i].reduce((s,x,k)=>s+x*v[j][k],0))<.01,`${path} axes must be perpendicular.`);}};
const id=(v,path)=>{string(v,path,80);check(/^[A-Za-z][A-Za-z0-9_-]*$/.test(v),`${path} must be a simple object identifier.`);};
const DISPLAY=['paused','speed','exposure','grid','lensing','horizonGuide','annotations','metrics','autoRotate','spectrum','viewMode','objectScaleMode','warpGrid','warpGridOnly','velocityArrows','sceneGridDensity','warpGridDensity'];
const OPTIONAL_DISPLAY=new Set(['warpGridOnly','velocityArrows','sceneGridDensity','warpGridDensity']);
const COMPONENTS={
 primary:['mass','spin','whiteHole','primaryName','primaryTilt','primaryAzimuth'],
 secondary:['secondaryWhiteHole','binaryRatio','binarySeparation','secondarySpin','secondaryName','secondaryTilt','secondaryAzimuth'],
 disk:['diskPalette','diskStyle','diskColor','diskOuter','diskThickness','diskDensity'],
 jets:['jetStructure','jetColor','jetSpread','jetLength','jetIntensity'],
 'secondary-disk':['secondaryDiskPalette','secondaryDiskStyle','secondaryDiskColor','secondaryDiskOuter','secondaryDiskThickness','secondaryDiskDensity'],
 'secondary-jets':['secondaryJetStructure','secondaryJetColor','secondaryJetSpread','secondaryJetLength','secondaryJetIntensity'],
 planet:['planetMass','planetRadius','planetDistance','planetColor'],
 tidalStar:['starRadius','starColor','disruptionStrength','starDistance']
};
const VIRTUAL={primary:['blackhole','space'],secondary:['blackhole','primary'],disk:['disk','primary'],jets:['jets','primary'],'secondary-disk':['disk','secondary'],'secondary-jets':['jets','secondary'],planet:['planet',null],tidalStar:['star',null]};
const NAVIGATION=['camera','target','cameraGuide','focusReferenceFrame','sceneFocusId','freePosition','freeTarget','freeBasis','selectedId','focusId','focusMode','savedOverview','freeReferenceId','freeReferencePosition','navigationModes','flightSequences','bridgeParking'];
const SIMULATION=['janusRoutes','dockingCoastId','dockingMission','gapOrbitTime','routeChartY','routeVisualTime','time','nextObjectId','bridgeObjectId','bridgeTime','bridgeTravelTime','warpObjectId','warpLocalGridPhase','warpTravelWorld','warpTravelPosition','warpTravelTime','travel','driveId','orbitOverrides'];
const CAMERA=['yaw','pitch','distance','lookYaw','lookPitch','focusDistance'];
const STATE_ENUM={mergerOutcome:['coalescence','illustrative-cancellation'],spectrum:['visible','infrared','xray','radio','gamma','geometry'],viewMode:['orbit','look','free'],objectScaleMode:['physical'],warpScenario:['isolated','orbit','excursion'],bridgeTravelerType:['enterprise','shuttle','astronaut','heighliner','blackhole','whitehole'],binaryMotion:['orbit','merger'],bridgeMode:['single','crossed'],bridgeGridOrientation:['perpendicular','parallel'],bridgeLifecycle:['steady','open-transit-close'],bridgeWorlds:['caladan','earth-proxima','earth-proxima-star'],diskPalette:['physical','artistic','rainbow'],secondaryDiskPalette:['physical','artistic','rainbow'],jetStructure:['steady','knots','helix'],secondaryJetStructure:['steady','knots','helix'],diskStyle:['thermal','hydrogen','helium','dust','nebula','radiant','ribbons','aurora'],secondaryDiskStyle:['thermal','hydrogen','helium','dust','nebula','radiant','ribbons','aurora'],nebulaVolumePreset:['wisps','clouds','storm'],nebulaShape:['cloud','shell','filaments','spiral'],bridgeOtherShape:['cloud','shell','filaments','spiral']};
const STATE_RANGE={sceneGridDensity:GRID_DENSITY_RANGE,warpGridDensity:GRID_DENSITY_RANGE,waveAmplitude:[0,5],waveFrequency:[.01,10],mergerDuration:[1,10000],mass:[.000001,100000],spin:[0,.998],secondarySpin:[0,.998],speed:[0,10],exposure:[.1,5],starDensity:[0,3],starBrightness:[0,5],starVariety:[0,2],bridgeOtherStarDensity:[0,3],bridgeOtherStarBrightness:[0,5],bridgeOtherStarVariety:[0,2],diskOuter:[6.1,60],diskThickness:[.15,6],diskDensity:[0,4],secondaryDiskOuter:[6.1,60],secondaryDiskThickness:[.15,6],secondaryDiskDensity:[0,4],nebulaVolumeDensity:[0,2],nebulaVolumeDepth:[.25,3],nebulaVolumeScale:[.25,4],nebulaVolumeSpeed:[0,3],nebulaColorMix:[0,1],nebulaScale:[.2,4],nebulaIntensity:[0,4],nebulaRotation:[-360,360],planetMass:[.01,10000],planetRadius:[.1,15],planetDistance:[4,1e7],starRadius:[.1,5],disruptionStrength:[.1,3],starDistance:[5,1e7],binaryRatio:[.1,4],binarySeparation:[12,1e7],primaryTilt:[0,180],primaryAzimuth:[-360,360],secondaryTilt:[0,180],secondaryAzimuth:[-360,360],jetSpread:[.15,5],jetLength:[.2,3],jetIntensity:[0,4],secondaryJetSpread:[.15,5],secondaryJetLength:[.2,3],secondaryJetIntensity:[0,4],warpFactor:[0,10],warpRadius:[1.3,8],warpThickness:[1,20],bridgeRadius:[.61,30],bridgeOtherScale:[.2,4],bridgeOtherIntensity:[0,4],bridgeOtherRotation:[-360,360]};
const OBJECT_RANGE={anomalyStrength:[0,3],anomalyScale:[.3,3],anomalyMotion:[0,2],dysonCutaway:[0,.8],tidalDeformation:[0,1],diskThickness:[.15,6],diskDensity:[0,4],jetSpread:[.15,5],jetIntensity:[0,4],angularVelocity:[-1000000,1000000],collapsePeriod:[1,10000],collapseRadiusMin:[.01,1e15],collapseRadiusMax:[.01,1e15],radius:[0,1e7],phase:[-1e20,1e20],height:[-30,30],scale:[.001,1000],epoch:[0,1e20],x:[-MAX_WORLD_METERS,MAX_WORLD_METERS],y:[-MAX_WORLD_METERS,MAX_WORLD_METERS],z:[-MAX_WORLD_METERS,MAX_WORLD_METERS],motionEpoch:[0,1e20],logLuminosity:[0,8],surfaceId:[0,100],axialTilt:[-360,360],surfaceRotationPhase:[-1e6,1e6],rotationPeriodSeconds:[-1e12,1e12],orbitInclination:[-180,180],orbitNode:[-360,360],argumentPeriapsis:[-360,360],orbitalPeriodSeconds:[-1e20,1e20],opacity:[0,1],eccentricity:[0,.99],heightMeters:[-1e17,1e17],routeParkingHeightMeters:[0,1e17],radiusMeters:[.01,1e15],massSolar:[0,1e12],radiusProxyMeters:[0,1e15],orbitMeters:[0,1e17],spots:[0,1],corona:[0,2],rotation:[0,10],innerRadiusRatio:[.01,.9999],thicknessRatio:[.00001,.2]};
const OBJECT_BOOL=['completedTransfer','collapseEnabled','warpEnabled','tidallyLocked','radiusEstimated','massEstimated','physicalRadiusKnown','barycentric','orbitBarycenter'];
const OBJECT_TEXT=['catalogId','dataNote','sourceKey','reference','bodyClass','sourceFrame','orbitReferenceFrame'];
const OBJECT_ENUM={janusChartAnchor:['sol','m31','deep'],podPropulsion:['warp','impulse'],hullModel:['classicEnterprise','heritageShuttle','janusPod'],diskStyle:['thermal','hydrogen','helium','dust','nebula','radiant','ribbons','aurora'],diskPalette:['physical','artistic','rainbow'],jetStructure:['steady','knots','helix'],placement:['orbit','local'],motion:['orbit','infall','horizon'],starStyle:['main','protostar','redgiant','supergiant','dwarf','whitedwarf','neutron','tzo'],planetStyle:['rocky','gas','ice','ocean'],material:['rocky','icy','metallic'],shapeStyle:['contact','rubble','ellipsoid']};
const OBJECT_SPECIAL=['janusAddressLy','wheelPlayback','transferSpindle','waypointHoldId','waypointHoldBasis','clock','referenceId','shapeAxes','drivePosition','driveBasis','driveReturn','driveRestore','flight','color','surfaceTint'];
function stateValue(key,value,path){
 check(own(DEFAULTS,key),`Unknown setting ${path}.`);const type=typeof DEFAULTS[key];check(typeof value===type,`${path} must be ${type}.`);
 if(type==='number')number(value,path,...(STATE_RANGE[key]||[-1e12,1e12]));
 if(type==='string'){string(value,path,key.endsWith('Name')?64:100);if(STATE_ENUM[key])enumeration(value,STATE_ENUM[key],path);if(/Color$/.test(key))check(/^#[\da-f]{6}$/i.test(value),`${path} must use #rrggbb.`);}
}
function camera(value,path){fields(value,CAMERA,path);for(const key of CAMERA){check(own(value,key),`${path}.${key} is required.`);number(value[key],`${path}.${key}`,['distance','focusDistance'].includes(key)?1e-20:-1e20,1e20);}}
function optionalVector(v,path){if(v!==null)vector(v,path);}
function freeBasis(v,path){if(v===null)return;fields(v,['right','up','forward'],path);basis([v.right,v.up,v.forward],path);}
function objectProperties(p,path,dockGuidance=false){
 fields(p,[...Object.keys(OBJECT_RANGE),...OBJECT_BOOL,...OBJECT_TEXT,...Object.keys(OBJECT_ENUM),...OBJECT_SPECIAL],path);
 for(const [k,v]of Object.entries(p)){
  const q=`${path}.${k}`;
  if(OBJECT_RANGE[k])number(v,q,...OBJECT_RANGE[k]);else if(OBJECT_BOOL.includes(k))check(typeof v==='boolean',`${q} must be true or false.`);else if(OBJECT_TEXT.includes(k))string(v,q);else if(OBJECT_ENUM[k])enumeration(v,OBJECT_ENUM[k],q);
  else if(k==='referenceId'){if(v!==null)id(v,q);}else if(k==='color'||k==='surfaceTint')check(typeof v==='string'&&/^#[\da-f]{6}$/i.test(v),`${q} must use #rrggbb.`);
  else if(k==='shapeAxes'){vector(v,q);v.forEach(x=>number(x,q,.05,5));}
  else if(k==='wheelPlayback'){fields(v,['proper','shown'],q);for(const key of ['proper','shown'])number(v[key],q+'.'+key,0,1e300);}
  else if(k==='transferSpindle'){fields(v,['t','p','a','b','duration'],q);if(own(v,'duration'))number(v.duration,q+'.duration',1e-6,1e9);number(v.t,q+'.t',0,1e300);number(v.p,q+'.p',0,2*Math.PI);for(const key of ['a','b'])number(v[key],q+'.'+key,0,1);}
  else if(k==='janusAddressLy'){vector(v,q);for(const c of v)number(c,q,-5e10,5e10);}
  else if(k==='clock'){
   fields(v,['properSeconds','coordinateSeconds','lagSeconds','properCompensation','coordinateCompensation','lagCompensation','rapidityVector','highGExposureSeconds','extremeGExposureSeconds'],q);
   for(const key of ['highGExposureSeconds','extremeGExposureSeconds'])if(own(v,key))number(v[key],q+'.'+key,0,1e300);
   for(const key of ['properSeconds','coordinateSeconds','lagSeconds']){check(own(v,key),q+'.'+key+' is required');number(v[key],q+'.'+key,0,1e300);}
   if(own(v,'rapidityVector')){vector(v.rapidityVector,q+'.rapidityVector');check(Math.hypot(...v.rapidityVector)<=300.000001,q+'.rapidityVector is too large');}
   for(const key of ['properCompensation','coordinateCompensation','lagCompensation'])if(own(v,key))number(v[key],q+'.'+key,-1e300,1e300);
   check(v.lagSeconds<=v.coordinateSeconds,q+'.lagSeconds cannot exceed coordinate time');
   check(v.properSeconds<=v.coordinateSeconds,q+'.properSeconds cannot exceed coordinate time');
  }
  else if(k==='flight'){if(own(v,'coastDirection')){vector(v.coastDirection,q+'.coastDirection');check(Math.abs(Math.hypot(...v.coastDirection)-1)<1e-6,q+'.coastDirection must be a unit vector');}if(own(v,'mode'))enumeration(v.mode,['warp','impulse'],q+'.mode');if(own(v,'warpSetting'))number(v.warpSetting,q+'.warpSetting',0,9.9999);if(own(v,'starBeta'))number(v.starBeta,q+'.starBeta',0,200000);if(own(v,'gridPhase'))number(v.gridPhase,q+'.gridPhase',0,4096);if(own(v,'impulseVelocity')){vector(v.impulseVelocity,q+'.impulseVelocity');check(Math.hypot(...v.impulseVelocity)<FLIGHT_LIGHT_SPEED,q+'.impulseVelocity must remain below light speed');}if(own(v,'thrust')){number(v.thrust,q+'.thrust',0,1000);check(dockGuidance||v.brakeSpeed===true||Math.abs(v.thrust*10-Math.round(v.thrust*10))<1e-8,q+'.thrust must use 0.1 g steps outside a shutdown ramp');}if(own(v,'velocity'))vector(v.velocity,q+'.velocity');for(const key of ['coordinateTimeSeconds','timeLagSeconds'])if(own(v,key))number(v[key],q+'.'+key,0,1e20);for(const key of ['coordinateTimeCompensation','timeLagCompensation'])if(own(v,key))number(v[key],q+'.'+key,-1e5,1e5);if(own(v,'timeLagSeconds')&&own(v,'coordinateTimeSeconds'))check(v.timeLagSeconds<=v.coordinateTimeSeconds,q+'.timeLagSeconds cannot exceed coordinate time');for(const key of ['brakeSpeed','brakeTurn','orbitHold'])if(own(v,key))check(typeof v[key]==='boolean',q+'.'+key+' must be boolean');if(own(v,'travelDirection'))enumeration(v.travelDirection,[-1,1],q+'.travelDirection');if(own(v,'brakeInitialSpeed'))number(v.brakeInitialSpeed,q+'.brakeInitialSpeed',0,1e14);for(const key of ['headingAngle','headingTarget','jetStart'])if(own(v,key))number(v[key],q+'.'+key,-1e12,1e12);if(own(v,'starPhase'))number(v.starPhase,q+'.starPhase',0,1024);if(own(v,'escapeBlend'))number(v.escapeBlend,q+'.escapeBlend',0,1);if(own(v,'escapeRadiusMeters'))number(v.escapeRadiusMeters,q+'.escapeRadiusMeters',1e-6,1e25);if(own(v,'escapeAnchor'))vector(v.escapeAnchor,q+'.escapeAnchor');if(own(v,'visualJet'))number(v.visualJet,q+'.visualJet',-1,1);fields(v,['coastDirection','jetStart','visualJet','orbitHold','escapeBlend','escapeRadiusMeters','escapeAnchor','mode','warpSetting','impulseVelocity','starBeta','gridPhase','starPhase','headingAngle','headingTarget','speed','curvature','torsion','angularVelocity','position','basis','travelCompression','travelDirection','brakeSpeed','brakeTurn','brakeInitialSpeed','thrust','velocity','coordinateTimeSeconds','timeLagSeconds','coordinateTimeCompensation','timeLagCompensation'],q);number(v.speed,q+'.speed',0,1e14);if(own(v,'angularVelocity'))number(v.angularVelocity,q+'.angularVelocity',-.65,.65);number(v.curvature,q+'.curvature',-1e12,1e12);number(v.torsion,q+'.torsion',-1e12,1e12);vector(v.position,q+'.position');basis(v.basis,q+'.basis');if(own(v,'travelCompression'))number(v.travelCompression,q+'.travelCompression',1e-15,1);}
  else if(k==='driveRestore'){fields(v,['warp','warpObjectId','warpFactor','warpScenario','warpTravelWorld','warpTravelPosition','warpTravelTime'],q);check(typeof v.warp==='boolean',q+'.warp must be boolean');if(v.warpObjectId!==null)id(v.warpObjectId,q+'.warpObjectId');number(v.warpFactor,q+'.warpFactor',0,10);enumeration(v.warpScenario,['isolated','orbit','excursion'],q+'.warpScenario');number(v.warpTravelWorld,q+'.warpTravelWorld',-1e25,1e25);optionalVector(v.warpTravelPosition,q+'.warpTravelPosition');number(v.warpTravelTime,q+'.warpTravelTime',0,1e20);}
  else if(k==='waypointHoldId')id(v,q);else if(k==='waypointHoldBasis')basis(v,q);else if(k==='drivePosition')vector(v,q);else if(k==='driveBasis')basis(v,q);else if(k==='driveReturn'&&v!==null){fields(v,['position','basis','elapsed','attitudeOnly','referenceBasis'],q);if(own(v,'referenceBasis'))basis(v.referenceBasis,q+'.referenceBasis');if(own(v,'attitudeOnly'))check(typeof v.attitudeOnly==='boolean',q+'.attitudeOnly must be boolean.');vector(v.position,q+'.position');basis(v.basis,q+'.basis');number(v.elapsed,q+'.elapsed',0,1e20);}
 }
 for(const k of ['radius','phase','height','scale','epoch','placement','x','y','z','warpEnabled','motion','motionEpoch','logLuminosity'])check(own(p,k),`${path}.${k} is required.`);
}
function plainData(value,depth=0,counter={n:0}){
 check(depth<=MAX_DEPTH&&++counter.n<=150000,'The scene contains too much nested data.');
 if(value===null||typeof value==='boolean')return;if(typeof value==='number'){number(value,'value');return;}if(typeof value==='string'){string(value,'value',2000);return;}
 check(Array.isArray(value)||plain(value),'The scene contains an unsupported value.');if(Array.isArray(value))check(value.length<=2048,'A sequence contains too many entries.');
 for(const [k,v]of Object.entries(value)){check(!forbidden.has(k),'Unsafe mapping key.');plainData(v,depth+1,counter);}
}
function yamlScalar(value){if(Object.is(value,-0))return '-0';if(Array.isArray(value))return '['+value.map(yamlScalar).join(', ')+']';return JSON.stringify(value);}
function yamlLines(value,indent=0){
 const pad=' '.repeat(indent),lines=[];
 if(Array.isArray(value))for(const item of value){if(plain(item)&&Object.keys(item).length){const entries=Object.entries(item),[k,v]=entries.shift();lines.push(`${pad}- ${k}: ${yamlScalar(v)}`);for(const [key,val]of entries)lines.push(...yamlProperty(key,val,indent+2));}else lines.push(`${pad}- ${yamlScalar(item)}`);}
 else for(const [key,val]of Object.entries(value))lines.push(...yamlProperty(key,val,indent));return lines;
}
function yamlProperty(key,value,indent){const pad=' '.repeat(indent);if(plain(value)&&Object.keys(value).length||Array.isArray(value)&&value.some(plain))return[`${pad}${key}:`,...yamlLines(value,indent+2)];return[`${pad}${key}: ${yamlScalar(value)}`];}
function stripComment(text){let quote='',escaped=false;for(let i=0;i<text.length;i++){const c=text[i];if(quote){if(quote==='"'&&escaped){escaped=false;continue;}if(quote==='"'&&c==='\\'){escaped=true;continue;}if(c===quote){if(quote==="'"&&text[i+1]==="'"){i++;continue;}quote='';}}else if(c==='"'||c==="'")quote=c;else if(c==='#'&&(i===0||/\s/.test(text[i-1])))return text.slice(0,i).trimEnd();}return text.trimEnd();}
function parseScalar(text,line){
 if(text==='null'||text==='~')return null;if(text==='true')return true;if(text==='false')return false;
 if(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text)){const n=Number(text);check(Number.isFinite(n),`Non-finite number on line ${line}.`);return n;}
 if(text.startsWith('"')||text.startsWith('[')||text==='{}'){try{const v=JSON.parse(text);plainData(v);return v;}catch(error){if(error instanceof SceneFileError)throw error;fail(`Invalid quoted value or array on line ${line}.`);}}
 if(text.startsWith("'")){check(/^'(?:[^']|'')*'$/.test(text),`Invalid quoted text on line ${line}.`);return text.slice(1,-1).replace(/''/g,"'");}
 check(text.length>0&&!/^[!&*|>{}\[\]@`%]/.test(text)&&!/[\r\n]/.test(text)&&!/^[-+]?(?:\.inf|\.nan)$/i.test(text)&&!/:\s/.test(text),`Unsupported YAML value on line ${line}.`);
 return text;
}
function readYaml(text){
 check(typeof text==='string','Choose a YAML text file.');check(text.length<=MAX_SCENE_FILE_BYTES&&new TextEncoder().encode(text).length<=MAX_SCENE_FILE_BYTES,'The scene file is larger than 4 MB.');
 check(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text),'Control characters are not supported.');
 const rows=[];for(const [n,line]of text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n').entries()){
  check(!/^\s*\t/.test(line),'Use spaces, not tabs, for YAML indentation.');const content=stripComment(line);if(!content.trim())continue;if(content==='---'&&!rows.length)continue;check(content!=='---'&&content!=='...','Only one YAML document is allowed.');const indent=content.length-content.trimStart().length;check(indent%2===0&&indent<=MAX_DEPTH*2,`Use two-space indentation on line ${n+1}.`);rows.push({indent,text:content.slice(indent),line:n+1});}
 check(rows.length>0&&rows.length<=100000,'The scene file is empty or too large.');let at=0;
 const pair=(text,line)=>{const match=/^([A-Za-z_][A-Za-z0-9_-]*):(?:\s+(.*))?$/.exec(text);check(match&&!forbidden.has(match[1]),`Invalid or unsafe mapping key on line ${line}.`);return[match[1],match[2]??''];};
 function block(indent,depth=0){check(depth<=MAX_DEPTH,'The scene nesting is too deep.');check(rows[at]?.indent===indent,`Unexpected indentation on line ${rows[at]?.line||1}.`);const sequence=/^-(?:\s|$)/.test(rows[at].text),value=sequence?[]:{};
  const entry=(target,text,line,entryIndent)=>{const [key,raw]=pair(text,line);check(!own(target,key),`Duplicate key ${key} on line ${line}.`);if(raw)target[key]=parseScalar(raw,line);else{check(rows[at]&&rows[at].indent===entryIndent+2,`Missing value for ${key} on line ${line}.`);target[key]=block(entryIndent+2,depth+1);}};
  while(at<rows.length&&rows[at].indent===indent){const row=rows[at++];if(sequence){check(/^-(?:\s|$)/.test(row.text),`Expected a list item on line ${row.line}.`);const raw=row.text.slice(1).trimStart();if(!raw){check(rows[at]?.indent===indent+2,`Missing list item on line ${row.line}.`);value.push(block(indent+2,depth+1));}else if(/^[A-Za-z_][A-Za-z0-9_-]*:/.test(raw)){const item={};entry(item,raw,row.line,indent+2);while(at<rows.length&&rows[at].indent===indent+2){const next=rows[at++];entry(item,next.text,next.line,indent+2);}value.push(item);}else value.push(parseScalar(raw,row.line));check(value.length<=MAX_OBJECTS+16,'Too many items in a list.');}else{check(!/^-(?:\s|$)/.test(row.text),`Unexpected list item on line ${row.line}.`);entry(value,row.text,row.line,indent);}}
  if(at<rows.length)check(rows[at].indent<indent,`Unexpected indentation on line ${rows[at].line}.`);return value;
 }
 const result=block(0);check(at===rows.length,'Unexpected content after the scene.');plainData(result);return result;
}
// Persist the editable route, not an in-flight curve cache. A loaded file keeps
// the saved spacecraft pose and clocks, with guidance stopped and the queue
// ready to start explicitly. This prevents an unexpected compressed-time jump.
function savedFlightSequences(value,mission){
 const result={};for(const [craftId,sequence]of Object.entries(value||{}))result[craftId]={craftId,nodes:(sequence.nodes||[]).map(node=>({targetId:node.targetId,...(node.extraLaps!==undefined&&node.extraLaps!==node.defaultExtraLaps?{extraLaps:node.extraLaps}:{}),...(node.radiusMeters!==undefined?{radiusMeters:node.radiusMeters}:{}),...(node.kind!==undefined?{kind:node.kind}:{}),...(node.port!==undefined?{port:node.port}:{}),...(node.transferProperSeconds!==undefined?{transferProperSeconds:node.transferProperSeconds}:{}),...(node.warpFactor!==undefined?{warpFactor:node.warpFactor}:{}),...(node.heading!==undefined?{heading:node.heading}:{})})),loop:!!sequence.loop,...(mission?.playlist&&mission.craftId===craftId?{dockProgress:{active:!!sequence.active,inFlight:!!sequence.inFlight,holding:!!sequence.holding,pendingAtContact:!!sequence.pendingAtContact}}:{}),...(sequence.restartOnLoop?{restartOnLoop:true,replayPhase:sequence.replayPhase}:{}),index:sequence.index||0,legsCompleted:sequence.legsCompleted||0};return result;
}
export function prepareSceneFile(renderer){const source=renderer.delegate||renderer;return {snapshot:snapshotRenderer(source),nodes:source.getObjectTree()};}
export function serializeScene(renderer){const {snapshot,nodes}=prepareSceneFile(renderer);return serializeSceneData(snapshot,nodes);}
export function serializeSceneData(snapshot,nodes){
 check(plain(snapshot)&&Array.isArray(snapshot.objects)&&snapshot.objects.length<=MAX_OBJECTS&&Array.isArray(nodes)&&nodes.length<=MAX_OBJECTS+10,'The scene is too large or incomplete.');
 snapshot={gapOrbitTime:0,routeChartY:null,routeVisualTime:0,cameraGuide:null,focusReferenceFrame:null,driveId:null,freeReferenceId:null,freeReferencePosition:null,orbitOverrides:{},navigationModes:{},flightSequences:{},bridgeParking:{},...snapshot};
 const objects=new Map(snapshot.objects.map((o,i)=>[o.id,{o,i}])),state={...snapshot.state},display={quality:snapshot.quality==='cpu'?'adaptive':snapshot.quality};
 for(const key of DISPLAY){display[key]=state[key];delete state[key];}
 const tree=new Map();for(const node of nodes){const item={id:node.id,type:node.type,properties:{}};if(objects.has(node.id)){const {o,i}=objects.get(node.id);if(o.name!==undefined)item.name=o.name;item.order=i;item.properties=Object.fromEntries(Object.entries(o).filter(([k,v])=>!['id','type','name','parentId'].includes(k)&&v!==undefined));}
  // Saves resume in a coast, not midway through a compressed cinematic flip.
  // Keep the world velocity and orientation. Screen-time angular rates and
  // exhaust commands do not describe a physical control input at this pose.
  if(snapshot.transfer?.active&&snapshot.transfer.craftId===node.id&&item.properties.flight){
   const f=item.properties.flight;item.properties.flight={...f,angularVelocity:0,curvature:0,torsion:0,headingTarget:f.headingAngle,thrust:0,visualJet:0};
  }
  if(!objects.has(node.id)&&node.id!=='space'){item.properties={};for(const key of COMPONENTS[node.id]||[]){item.properties[key]=state[key];delete state[key];}}
  item.children=[];tree.set(node.id,item);
 }
 tree.get('space').properties=state;for(const node of nodes)if(node.id!=='space')tree.get(node.parentId||'space')?.children.push(tree.get(node.id));
 const navigation={},simulation={};for(const key of NAVIGATION)if(own(snapshot,key))navigation[key]=snapshot[key];for(const key of SIMULATION)if(own(snapshot,key))simulation[key]=snapshot[key];
 navigation.flightSequences=savedFlightSequences(snapshot.flightSequences,snapshot.dockingMission);
 simulation.dockingCoastId=snapshot.dockingCoastId||null;
 simulation.janusRoutes=snapshot.janusRoutes||{};
 simulation.dockingMission=savedDockingMission(snapshot.dockingMission);
 const document={format:FORMAT,version:SCENE_FILE_VERSION,scene:snapshot.sceneId,display,space:tree.get('space'),navigation,simulation};
 // Use the same validator on our own output; a partial save is never downloaded.
 const text='# Event Horizon scene — exact-version files; no backward compatibility.\n# Children orbit/belong to their enclosing object. SI properties end in Meters/Seconds; radius is in the parent black hole r_g.\n# Routes use object IDs and heading degrees; guidance resumes only when started after loading.\n# Two-space YAML, finite values, no aliases or tags. Scene files never contain image assets.\n'+yamlLines(document).join('\n')+'\n';
 parseScene(text);return text;
}
export function parseScene(text){
 const doc=readYaml(text);fields(doc,['format','version','scene','display','space','navigation','simulation'],'scene file');check(doc.format===FORMAT,'This is not an Event Horizon scene file.');
 if(doc.version!==SCENE_FILE_VERSION)fail(`Scene version ${String(doc.version??'missing').slice(0,60)} does not match app version ${SCENE_FILE_VERSION}.`);
 // A saved shortcut still contains its full bridge, traveler and object tree.
 if(doc.scene==='bridge-earth-proxima')doc.scene='bridge';
 // Keep existing local files usable without exposing the retired solar atlas as a scene.
 const preset=SCENE_PRESETS.find(p=>p.id===doc.scene)||(doc.scene==='kardashev-2'?{patch:{}}:null);check(!!preset,'Unknown scene preset.');fields(doc.display,['quality',...DISPLAY],'display');enumeration(doc.display.quality,['adaptive','low','medium','high','ultra'],'display.quality');
 const state={},objects=[],nodes=new Map(),orders=new Set();for(const key of DISPLAY){if(OPTIONAL_DISPLAY.has(key)&&!own(doc.display,key)){state[key]=key==='warpGridOnly'?false:(preset.patch[key]??DEFAULTS[key]);continue;}check(own(doc.display,key),`display.${key} is required.`);stateValue(key,doc.display[key],`display.${key}`);state[key]=doc.display[key];}
 const compactMass=node=>node?.id==='primary'?state.mass*1e6:node?.id==='secondary'?state.mass*1e6*state.binaryRatio:Number(node?.properties?.massSolar)||10;
 const smallCompact=(child,parent)=>compactSatellite(child?.type,compactMass(child),parent?.type,compactMass(parent));
 function visit(node,parent=null,depth=0){check(depth<=MAX_DEPTH&&nodes.size<MAX_OBJECTS+10,'The object tree is too large or too deep.');fields(node,['id','type','name','order','properties','children'],'object');id(node.id,'object.id');check(!nodes.has(node.id),`Duplicate object id ${node.id}.`);check(Array.isArray(node.children),`${node.id}.children must be a list.`);nodes.set(node.id,{...node,parentId:parent?.id||null});
  if(!parent){check(node.id==='space'&&node.type==='space','Space must be the root object.');fields(node.properties,Object.keys(DEFAULTS).filter(k=>!DISPLAY.includes(k)),'space.properties');for(const [key,value]of Object.entries(node.properties)){stateValue(key,value,`space.${key}`);state[key]=value;}}
  else if(own(VIRTUAL,node.id)){const [type,requiredParent]=VIRTUAL[node.id];check((node.type===type||['primary','secondary'].includes(node.id)&&node.type==='whitehole')&&(!requiredParent||parent.id===requiredParent),`Invalid component ${node.id}.`);fields(node.properties,COMPONENTS[node.id],`${node.id}.properties`);for(const key of COMPONENTS[node.id]){check(own(node.properties,key)&&!own(state,key),`Missing or duplicate setting ${key}.`);stateValue(key,node.properties[key],`${node.id}.${key}`);state[key]=node.properties[key];}}
  else{check(own(OBJECT_KIND,node.type),`Unsupported object type ${node.type}.`);if(node.properties?.hullModel)check(acceptsHull(node.type,node.properties.hullModel),'Hull does not match the spacecraft drive.');objectProperties(node.properties,`${node.id}.properties`,doc.simulation?.dockingMission?.craftId===node.id);if(node.type==='shuttle'&&node.properties.flight){const old=node.properties.flight;check((old.thrust||0)<=10,'Invalid legacy Shuttle command.');if(own(old,'thrust'))old.thrust=Math.min(SHUTTLE_THRUST_MAX_G,old.thrust);if(own(old,'brakeInitialSpeed'))old.brakeInitialSpeed=Math.min(SHUTTLE_THRUST_MAX_G,old.brakeInitialSpeed);check(node.properties.flight.mode!=='warp','A Shuttle cannot use warp drive.');const flight=node.properties.flight;check(flight.speed<FLIGHT_LIGHT_SPEED&&(!flight.velocity||Math.hypot(...flight.velocity)<FLIGHT_LIGHT_SPEED),'Shuttle flight velocity must remain below the speed of light.');}if(node.properties.podPropulsion)check(node.properties.hullModel==='janusPod','Only Janus can select propulsion.');if(node.properties.hullModel==='janusPod'&&node.properties.flight&&(node.properties.flight.mode==='impulse'||!node.properties.flight.mode&&node.properties.podPropulsion!=='warp')){const f=node.properties.flight;check(f.speed<FLIGHT_LIGHT_SPEED&&(!f.velocity||Math.hypot(...f.velocity)<FLIGHT_LIGHT_SPEED)&&(f.thrust||0)<=3,'Invalid Janus impulse state.');
   // Retain velocity and accumulated clocks when importing older 3g helms.
   if(own(f,'thrust'))f.thrust=Math.min(JANUS_THRUST_MAX_G,f.thrust);
   if(own(f,'brakeInitialSpeed'))f.brakeInitialSpeed=Math.min(JANUS_THRUST_MAX_G,f.brakeInitialSpeed);
  }if(node.type==='enterprise'&&node.properties.hullModel!=='janusPod'&&node.properties.flight)check(node.properties.flight.mode!=='impulse','Manual warp flight uses warp only.');if(node.name!==undefined)string(node.name,`${node.id}.name`,64);if(node.order!==undefined){number(node.order,`${node.id}.order`,0,MAX_OBJECTS-1);check(Number.isInteger(node.order)&&!orders.has(node.order),'Object order must be a unique integer.');orders.add(node.order);}check(objects.length<MAX_OBJECTS,'This scene has more than 1,024 bodies.');objects.push({...node.properties,type:node.type,id:node.id,parentId:parent.id,...(node.name!==undefined?{name:importedObjectName(node.type,node.name,node.properties.hullModel)}:{}),_fileOrder:node.order??MAX_OBJECTS+objects.length});}
  if(parent){if(node.type==='waypoint'){check(parent.type==='space'&&node.properties.placement==='local'&&!node.properties.referenceId&&node.properties.massSolar===0&&!node.properties.drivePosition&&!node.properties.driveReturn&&!node.properties.flight&&!node.properties.warpEnabled&&(!node.properties.motion||node.properties.motion==='orbit'),'A stationary waypoint must be a fixed, massless coordinate in Space.');check(!node.children.length,'A stationary waypoint cannot have children.');}check(!naturalParentReason(node.type,parent.type),naturalParentReason(node.type,parent.type));check(!['disk','jets','ring','belt','dyson','anomaly'].includes(parent.type),'Discs, jets, rings, belts and Dyson shells cannot have children.');if(node.type==='anomaly'){check(parent.type==='space','A gravity anomaly must belong directly to Space.');check(node.properties.placement==='local','A gravity anomaly has local placement, not an orbit.');}if(node.type==='dyson'){check(['star','blackhole','whitehole'].includes(parent.type),'A Dyson sphere needs a central star or compact body.');check(!parent._dyson,'A central body can have one Dyson sphere.');parent._dyson=true;}else if(['disk','jets'].includes(node.type)){check(['blackhole','whitehole','star'].includes(parent.type),'Discs and jets must belong to stars or black holes.');const componentKey='_component_'+node.type;check(!parent[componentKey],'An object can own only one disc and one pair of jets.');parent[componentKey]=true;}else if(['ring','belt'].includes(node.type))check(['star','planet','planetoid','asteroid'].includes(parent.type),'Rings and belts must belong to stars or planets.');else check(OBJECT_CLASS[node.type]<=OBJECT_CLASS[parent.type],`${node.type} cannot orbit ${parent.type}.`);if(OBJECT_CLASS[node.type]===OBJECT_CLASS[parent.type]&&!smallCompact(node,parent)){check(!parent._sameClass,'Comparable compact masses and equal-class objects are limited to a pair.');parent._sameClass=true;const grand=nodes.get(parent.parentId);check(!grand||OBJECT_CLASS[grand.type]!==OBJECT_CLASS[parent.type]||smallCompact(parent,grand),'Comparable compact masses and equal-class chains are limited to a pair.');}}
  const ownNode=nodes.get(node.id);for(const child of node.children)visit(child,ownNode,depth+1);
 }
 visit(doc.space);check(objects.filter(o=>o.type==='anomaly').length<=4,'A scene supports up to four gravity anomaly regions.');for(const key of Object.keys(DEFAULTS))check(own(state,key),`Missing setting ${key}.`);
 const enabled={primary:state.blackHole,secondary:state.blackHole&&state.binary,disk:state.blackHole&&state.disk,jets:state.blackHole&&state.jets,'secondary-disk':state.blackHole&&state.binary&&state.secondaryDisk,'secondary-jets':state.blackHole&&state.binary&&state.secondaryJets,planet:state.planet,tidalStar:state.tidalStar};
 for(const [key,white]of [['primary',state.whiteHole],['secondary',state.secondaryWhiteHole]])if(nodes.has(key))check(nodes.get(key).type===(white?'whitehole':'blackhole'),`The type of ${key} does not match its white-hole setting.`);
 for(const [key,on]of Object.entries(enabled))check(nodes.has(key)===!!on,`${key} does not match the enabled scene components.`);
 for(const key of ['planet','tidalStar'])if(nodes.has(key))check(nodes.get(key).parentId===(state.blackHole?'primary':'space'),`Invalid parent for ${key}.`);
 check(!state.bridge||!state.blackHole&&!state.binary&&!state.whiteHole&&(!state.warp||doc.simulation?.driveId===doc.simulation?.bridgeObjectId&&objects.some(o=>o.id===doc.simulation.driveId&&o.type==='enterprise'&&o.flight?.mode==='warp')),'A bridge warp field requires a manually driven warp ship.');check(!state.binary||state.blackHole,'A binary needs a primary black hole.');check(!state.whiteHole||state.blackHole,'A white hole needs a primary body.');check(state.grid===state.warpGrid,'The grid settings must agree.');check(!state.warpGridOnly||!state.grid,'Choose all grids or the warp grid only.');check(state.spectrum!=='geometry'||state.grid,'Geometry view requires the grid.');
 objects.sort((a,b)=>a._fileOrder-b._fileOrder);for(const object of objects){delete object._fileOrder;if(object.referenceId!==null&&object.referenceId!==undefined){check(objects.some(o=>o.id===object.referenceId),`Unknown reference ${object.referenceId}.`);check(object.referenceId===object.parentId,'A local reference must match the enclosing parent.');}if(object.placement==='orbit'&&!['ring','belt'].includes(object.type))check(object.parentId!=='space','An orbit needs an enclosing physical parent.');}
 fields(doc.navigation,NAVIGATION,'navigation');fields(doc.simulation,SIMULATION,'simulation');
 const nav=doc.navigation,sim=doc.simulation;for(const key of NAVIGATION)check(own(nav,key),`navigation.${key} is required.`);if(!own(sim,'janusRoutes'))sim.janusRoutes={};if(!own(sim,'dockingCoastId'))sim.dockingCoastId=null;if(!own(sim,'dockingMission'))sim.dockingMission=null;if(!own(sim,'gapOrbitTime'))sim.gapOrbitTime=0;if(!own(sim,'warpLocalGridPhase'))sim.warpLocalGridPhase=0;number(sim.warpLocalGridPhase,'warpLocalGridPhase',0,4096);for(const key of SIMULATION)check(own(sim,key),`simulation.${key} is required.`);camera(nav.camera,'camera');camera(nav.target,'target');
 for(const key of ['freePosition','freeTarget','freeReferencePosition'])if(own(nav,key))optionalVector(nav[key],key);if(own(nav,'freeBasis'))freeBasis(nav.freeBasis,'freeBasis');
 if(nav.savedOverview!==null){fields(nav.savedOverview,['camera','target','viewMode','travel','freePosition','freeTarget','freeBasis'],'savedOverview');camera(nav.savedOverview.camera,'savedOverview.camera');camera(nav.savedOverview.target,'savedOverview.target');enumeration(nav.savedOverview.viewMode,STATE_ENUM.viewMode,'savedOverview.viewMode');check(typeof nav.savedOverview.travel==='boolean','savedOverview.travel must be boolean.');optionalVector(nav.savedOverview.freePosition,'savedOverview.freePosition');optionalVector(nav.savedOverview.freeTarget,'savedOverview.freeTarget');freeBasis(nav.savedOverview.freeBasis,'savedOverview.freeBasis');}
 const validId=(value,key,nullable=true)=>{if(nullable&&value===null)return;id(value,key);check(nodes.has(value)||(value==='bridge'&&state.bridge),`Unknown target ${key}: ${value}.`);};
 for(const key of ['sceneFocusId','selectedId','focusId','freeReferenceId'])if(own(nav,key))validId(nav[key],key);
 if(nav.focusReferenceFrame!==null){fields(nav.focusReferenceFrame,['id','basis'],'focusReferenceFrame');validId(nav.focusReferenceFrame.id,'focusReferenceFrame.id',false);check(nav.focusReferenceFrame.id===nav.focusId&&nav.focusMode==='track','A stabilized camera frame must belong to the tracked body.');basis(nav.focusReferenceFrame.basis,'focusReferenceFrame.basis');}
 enumeration(nav.cameraGuide,[null,'dyson-approach','dyson-orbit','warp-side','blue-fire-edge','dock-ferry'],'cameraGuide');enumeration(nav.focusMode,[null,'track','onboard','chase'],'focusMode');check(nav.focusId===null?nav.focusMode===null:nav.focusMode!==null,'The camera target and mode must agree.');
 if(sim.routeChartY!==null)number(sim.routeChartY,'routeChartY',-1e20,1e20);
 number(sim.gapOrbitTime,'gapOrbitTime',0,1e20);
 for(const key of ['time','routeVisualTime','nextObjectId','bridgeTime','bridgeTravelTime','warpTravelWorld','warpTravelTime'])number(sim[key],key,key==='warpTravelWorld'?-1e20:0,1e20);check(Number.isSafeInteger(sim.nextObjectId)&&sim.nextObjectId>=1,'nextObjectId must be a positive integer.');
 for(const object of objects){const match=/^body-(\d+)$/.exec(object.id);if(match)check(Number(match[1])<sim.nextObjectId,'nextObjectId must exceed all saved body identifiers.');}
 vector(sim.warpTravelPosition,'warpTravelPosition');check(typeof sim.travel==='boolean','travel must be true or false.');
 for(const key of ['driveId','bridgeObjectId','warpObjectId'])if(own(sim,key))validId(sim[key],key);
 if(sim.orbitOverrides!==undefined){fields(sim.orbitOverrides,['planet','secondary'],'orbitOverrides');for(const [key,value]of Object.entries(sim.orbitOverrides)){fields(value,['phase','epoch'],`orbitOverrides.${key}`);number(value.phase,`${key}.phase`,-1e20,1e20);number(value.epoch,`${key}.epoch`,0,1e20);}}
 const objectById=new Map(objects.map(o=>[o.id,o]));if(sim.driveId){const driven=objectById.get(sim.driveId);check(driven&&['enterprise','shuttle'].includes(driven.type)&&driven.drivePosition&&driven.driveBasis,'Free drive requires a positioned spacecraft.');}
 if(sim.dockingCoastId!==null)check(sim.dockingCoastId===sim.driveId&&hullType(objectById.get(sim.dockingCoastId))==='shuttle'&&!sim.dockingMission,'Released docking coast must identify the controlled Meridian.');
 check(plain(sim.janusRoutes)&&Object.keys(sim.janusRoutes).length<=64,'Invalid Janus itineraries.');
 for(const [craftId,p] of Object.entries(sim.janusRoutes)){
  check(objectById.get(craftId)?.hullModel==='janusPod'&&p.craftId===craftId,'An exchange must belong to a Janus pod.');
  fields(p,['craftId','stops','laps','radii','arrivalRadius','localLeg','localSpeed','localVelocity','localYawJet','cursor','auto','loop','stage','elapsed','exchanges','sourceId','destinationId','locationId','locationName','coordinate','coordinateName','oldOffset','lastChart','addressLy','targetAddressLy','targetChart','home','sourceSky','initiatedByAuto'],'exchange');
  check(Array.isArray(p.stops)&&p.stops.length<=64&&p.stops.every(id=>['star','planet','moon','planetoid','asteroid','waypoint'].includes(objectById.get(id)?.type)),'Invalid exchange destinations.');
  if(p.radii!=null)check(Array.isArray(p.radii)&&p.radii.length===p.stops.length&&p.radii.every(x=>x===null||Number.isFinite(x)&&x>0&&x<=1e17),'Invalid Janus parking radius.');
  if(p.arrivalRadius!=null)number(p.arrivalRadius,'arrival radius',0,1e17);
  if(p.localLeg!=null){
   fields(p.localLeg,['start','basis','initialVelocity','radius','oldRadius','seconds'],'local warp maneuver');
   vector(p.localLeg.start,'local departure');vector(p.localLeg.initialVelocity,'local velocity');basis(p.localLeg.basis,'local basis');number(p.localLeg.seconds,'local maneuver duration',1,60);number(p.localLeg.radius,'local radius',0,1e17);number(p.localLeg.oldRadius,'local departure radius',0,1e17);
  }
  if(p.localSpeed!=null)number(p.localSpeed,'local field speed',0,1e20);
  if(p.localVelocity!=null)vector(p.localVelocity,'local warp velocity');
  if(p.localYawJet!=null)number(p.localYawJet,'local trim',-1,1);
  if(p.laps!=null)check(Array.isArray(p.laps)&&p.laps.length===p.stops.length&&p.laps.every(n=>Number.isInteger(n)&&n>=0&&n<=99),'Invalid Janus orbit count.');
  for(const id of [p.sourceId,p.destinationId,p.locationId])if(id!==null)check(['star','planet','moon','planetoid','asteroid','waypoint'].includes(objectById.get(id)?.type),'Missing exchange destination.');
  check(typeof p.auto==='boolean'&&typeof p.loop==='boolean'&&Number.isSafeInteger(p.cursor)&&p.cursor>=0&&p.cursor<Math.max(1,p.stops.length)&&Number.isSafeInteger(p.exchanges)&&p.exchanges>=0,'Invalid exchange itinerary.');
  enumeration(p.stage,['orbit','local','charge','settle'],'exchange stage');number(p.elapsed,'exchange time',0,p.stage==='orbit'?1e9:p.stage==='local'?p.localLeg?.seconds:p.stage==='charge'?3.2:2.2);
  if(p.stage==='local')check(p.localLeg&&p.destinationId,'A local maneuver needs its departure state and destination.');
  if(p.stage!=='orbit')check(p.destinationId||p.coordinate,'An exchange needs a destination.');
  if(p.initiatedByAuto!=null)check(typeof p.initiatedByAuto==='boolean','Invalid exchange authority.');
  if(p.sourceSky!=null)string(p.sourceSky,'departure sky',120);
  for(const k of ['locationName','coordinateName'])if(p[k]!=null)string(p[k],k,60);
  for(const k of ['coordinate','oldOffset','addressLy','targetAddressLy'])if(p[k]!=null){vector(p[k],k);if(k==='addressLy'||k==='targetAddressLy')p[k].forEach(x=>number(x,k,-5e10,5e10));else if(k==='coordinate'&&(!p.home||!p[k].every((x,i)=>x===p.home.position?.[i])))p[k].forEach(x=>number(x,k,-1e12,1e12));}
  for(const k of ['lastChart','targetChart'])if(p[k]!=null)enumeration(p[k],['sol','m31','deep'],k);
  if(p.home!=null){fields(p.home,['position','chart','addressLy'],'departure bookmark');vector(p.home.position,'departure position');enumeration(p.home.chart,['sol','m31','deep'],'departure chart');if(p.home.addressLy!=null)vector(p.home.addressLy,'departure address');}
 }
 sim.dockingMission=readDockingMission(sim.dockingMission,objectById,sim.driveId,{check,fields,number,vector,basis,enumeration,string});
 // Older ferries owned a second queue inside the docking pilot. Migrate
 // the stops and their actual ports once; the ordinary playlist owns replay.
 const mission=sim.dockingMission;
 if(mission&&!own(mission,'playlist')&&mission.loop&&mission.route.length){
  check(plain(nav.flightSequences),'Invalid flightSequences.');
  nav.flightSequences[mission.craftId]={craftId:mission.craftId,nodes:mission.route.map(n=>({kind:'dock',targetId:n.stationId,port:n.side>0?'north':'south'})),
   loop:true,index:mission.index,legsCompleted:mission.index+Number(['docked','undock'].includes(mission.phase)),dockProgress:{active:true,inFlight:mission.phase!=='docked',holding:false,pendingAtContact:false}};
  Object.assign(mission,{loop:false,route:[],index:0,playlist:true});
 }else if(mission&&!own(mission,'playlist'))Object.assign(mission,{loop:false,route:[],index:0,playlist:false});
 const spacecraft=(craftId,path)=>{id(craftId,path);check(['enterprise','shuttle'].includes(objectById.get(craftId)?.type),`${path} must identify a Shuttle or NASA Warp Explorer.`);};
 for(const obj of objects){if(obj.waypointHoldId!==undefined||obj.waypointHoldBasis!==undefined){spacecraft(obj.id,'Stationary hold');const marker=obj.waypointHoldId===SCENE_ORIGIN.id?SCENE_ORIGIN:objectById.get(obj.waypointHoldId);check(marker?.type==='waypoint'&&!!obj.waypointHoldBasis&&obj.placement==='local','A stationary hold needs a local spacecraft, an orientation and a fixed waypoint.');check(['x','y','z'].every(k=>Math.abs(obj[k]-marker[k])<Math.max(.05,Math.abs(marker[k])*1e-13)),'The held spacecraft must be at its waypoint.');}}
 const bridgeGates=doc.scene==='earth-proxima-gates'?['bridge-earth-gate','bridge-proxima-gate']:['bridge-throat'];
 const bridgeTargets=['bridge-near-world','bridge-far-world',...bridgeGates];
 const routeTarget=(targetId,craftId,path)=>{id(targetId,path);check(targetId!==craftId,`${path} cannot target its own vehicle.`);if(bridgeTargets.includes(targetId)){check(state.bridge&&craftId===sim.bridgeObjectId,`${path} is only available to this bridge's traveler.`);return;}if(targetId===SCENE_ORIGIN.id&&!state.bridge)return;const target=nodes.get(targetId);if(target?.type==='waypoint'&&!state.bridge)return;check(target&&targetId!=='space'&&OBJECT_CLASS[target.type]>=OBJECT_CLASS[objectById.get(craftId).type]&&target.properties.massSolar!==0,`${path} must identify an orbitable body or bridge waypoint.`);for(let ancestor=target;ancestor;ancestor=nodes.get(ancestor.parentId))check(ancestor.id!==craftId,`${path} cannot target a descendant of its vehicle.`);};
 check(plain(nav.navigationModes)&&Object.keys(nav.navigationModes).length<=MAX_OBJECTS,'navigationModes must be a bounded mapping.');
 for(const [craftId,mode]of Object.entries(nav.navigationModes)){spacecraft(craftId,'navigationModes craft');enumeration(mode,['manual','auto'],`navigationModes.${craftId}`);}
 check(plain(nav.flightSequences)&&Object.keys(nav.flightSequences).length<=64,'flightSequences must contain at most 64 spacecraft routes.');
 for(const [craftId,sequence]of Object.entries(nav.flightSequences)){
  spacecraft(craftId,'flightSequences craft');fields(sequence,['craftId','nodes','loop','index','legsCompleted','restartOnLoop','replayPhase','dockProgress'],`flightSequences.${craftId}`);check(sequence.craftId===craftId,'A route must belong to its enclosing spacecraft.');check(Array.isArray(sequence.nodes)&&sequence.nodes.length<=64,'A flight sequence supports at most 64 stops.');check(typeof sequence.loop==='boolean','A route loop flag must be boolean.');
  number(sequence.index,'route index',0,Math.max(0,sequence.nodes.length));check(Number.isInteger(sequence.index),'A route index must be an integer.');number(sequence.legsCompleted,'route legsCompleted',0,1e12);check(Number.isInteger(sequence.legsCompleted),'Completed route legs must be an integer.');
  for(const [i,node]of sequence.nodes.entries()){const path=`flightSequences.${craftId}.nodes[${i}]`;fields(node,['targetId','kind','port','warpFactor','heading','radiusMeters','extraLaps','transferProperSeconds'],path);
   if(node.kind==='dock'){
    fields(node,['targetId','kind','port'],path);
    check(!state.bridge&&hullType(objectById.get(craftId))==='shuttle'&&objectById.get(node.targetId)?.type==='habitat',path+' docking requires Meridian and a Garden Station.');
    for(let ancestor=nodes.get(node.targetId);ancestor;ancestor=nodes.get(ancestor.parentId))check(ancestor.id!==craftId,path+' cannot dock to a descendant of its vehicle.');
    node.port??='south';enumeration(node.port,['south','north'],path+'.port');continue;
   }
   check(!own(node,'port'),path+'.port is only available on a docking stop.');if(own(node,'extraLaps'))check(validExtraLaps(node.extraLaps)&&node.kind!=='waypoint'&&node.targetId!==SCENE_ORIGIN.id&&!bridgeGates.includes(node.targetId)&&nodes.get(node.targetId)?.type!=='waypoint'&&(!state.bridge||state.bridgeSurfaces),path+'.extraLaps must be a whole number from 0 to 99 on an orbital stop.');if(own(node,'radiusMeters'))number(node.radiusMeters,path+'.radiusMeters',1,1e25);if(own(node,'kind'))enumeration(node.kind,['orbit','waypoint'],path+'.kind');routeTarget(node.targetId,craftId,path+'.targetId');if(own(node,'transferProperSeconds')){check(objectById.get(craftId)?.type==='enterprise',path+'.transferProperSeconds requires a warp ship.');number(node.transferProperSeconds,path+'.transferProperSeconds',1,1e10);}if(own(node,'warpFactor'))number(node.warpFactor,path+'.warpFactor',0,9.9999);if(own(node,'heading'))number(node.heading,path+'.heading',-360,360);}
  if(own(sequence,'restartOnLoop')||own(sequence,'replayPhase')){
   check(sequence.restartOnLoop===true&&doc.scene==='nasa-shuttle'&&objectById.get(craftId)?.type==='shuttle'&&sequence.nodes.length>1&&sequence.nodes.every(n=>n.kind==='orbit'&&n.radiusMeters>0&&n.targetId==='primary'),'Instant replay requires the shuttle proximity study.');number(sequence.replayPhase,'replayPhase',-1e10,1e10);
  }
  const progress=sequence.dockProgress;delete sequence.dockProgress;
  if(progress!==undefined){
   check(mission?.craftId===craftId&&mission.playlist&&nav.navigationModes[craftId]==='auto','Docking progress must belong to the guided playlist.');
   const flags=['active','inFlight','holding','pendingAtContact'];fields(progress,flags,'dockProgress');for(const key of flags)check(typeof progress[key]==='boolean','Invalid docking progress.');
   check(!progress.inFlight||!progress.holding,'A flight cannot be held while approaching.');
  }
  Object.assign(sequence,{active:false,inFlight:false,holding:false,orbitWait:null,resumeOnPlay:!progress&&(nav.navigationModes[craftId]||'auto')==='auto'&&sequence.nodes.length>0,waitSeconds:0,error:'',advanceCount:1,...progress});
 }
 if(mission?.playlist)check(own(nav.flightSequences,mission.craftId),'Docking playlist is missing.');
 check(plain(nav.bridgeParking)&&Object.keys(nav.bridgeParking).length<=1,'bridgeParking must contain at most one bridge traveler.');
 for(const [craftId,parking]of Object.entries(nav.bridgeParking)){spacecraft(craftId,'bridgeParking craft');check(state.bridge&&craftId===sim.bridgeObjectId,'Bridge parking belongs to the active bridge traveler.');fields(parking,['targetId','phase','heading'],'bridgeParking');enumeration(parking.targetId,bridgeTargets,'bridgeParking.targetId');number(parking.phase,'bridgeParking.phase',-Math.PI,Math.PI);if(own(parking,'heading'))number(parking.heading,'bridgeParking.heading',-360,360);}
 if(state.warp)check(objectById.get(sim.warpObjectId)?.type==='enterprise'&&objectById.get(sim.warpObjectId)?.warpEnabled,'Warp requires its enabled warp ship.');else check(sim.warpObjectId===null,'Inactive warp must not have an owner.');
 check(objects.filter(o=>o.warpEnabled).length===(state.warp?1:0),'Only the active warp ship can own a warp field.');
 if(state.bridge){check(objects.length===1&&['enterprise','shuttle','astronaut','heighliner','blackhole','whitehole'].includes(objectById.get(sim.bridgeObjectId)?.type),'A bridge scene must contain one supported traveler.');check(objectById.get(sim.bridgeObjectId).type===state.bridgeTravelerType,'The bridge traveler type does not match.');}
 else check(sim.bridgeObjectId===null,'Inactive bridge must not have a traveler.');
 return{autopilot:null,transfer:null,travelPreview:null,lastTransfer:null,parkedCamera:null,state,objects,sceneId:doc.scene,quality:doc.display.quality,...nav,...sim};
}

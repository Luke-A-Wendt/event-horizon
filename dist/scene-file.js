// Versioned, local scene files. Only the deliberately small YAML data subset
// emitted below is accepted: mappings, sequences, finite scalars and JSON arrays.
// No tags, executable values, aliases, merge keys, or prototype-bearing keys.
import { DEFAULTS, SCENE_PRESETS } from './config.js';
import { OBJECT_CLASS, OBJECT_KIND } from './objects.js';
import { snapshotRenderer } from './render-state.js';
import { FLIGHT_LIGHT_SPEED } from './flight-dynamics.js';
export const SCENE_FILE_VERSION='1.27.0';
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
const DISPLAY=['paused','speed','exposure','grid','lensing','horizonGuide','annotations','metrics','autoRotate','spectrum','viewMode','objectScaleMode','warpGrid'];
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
const NAVIGATION=['camera','target','cameraGuide','sceneFocusId','freePosition','freeTarget','freeBasis','selectedId','focusId','focusMode','savedOverview','freeReferenceId','freeReferencePosition'];
const SIMULATION=['time','nextObjectId','bridgeObjectId','bridgeTime','bridgeTravelTime','warpObjectId','warpTravelWorld','warpTravelPosition','warpTravelTime','travel','driveId','orbitOverrides'];
const CAMERA=['yaw','pitch','distance','lookYaw','lookPitch','focusDistance'];
const STATE_ENUM={spectrum:['visible','infrared','xray','radio','gamma','geometry'],viewMode:['orbit','look','free'],objectScaleMode:['physical'],warpScenario:['isolated','orbit','excursion'],bridgeTravelerType:['enterprise','shuttle','astronaut','blackhole','whitehole'],binaryMotion:['orbit','merger'],bridgeMode:['single','crossed'],diskPalette:['physical','artistic','rainbow'],secondaryDiskPalette:['physical','artistic','rainbow'],jetStructure:['steady','knots','helix'],secondaryJetStructure:['steady','knots','helix'],diskStyle:['thermal','hydrogen','helium','dust','nebula','radiant','ribbons'],secondaryDiskStyle:['thermal','hydrogen','helium','dust','nebula','radiant','ribbons'],nebulaShape:['cloud','shell','filaments','spiral'],bridgeOtherShape:['cloud','shell','filaments','spiral']};
const STATE_RANGE={waveAmplitude:[0,5],waveFrequency:[.01,10],mergerDuration:[1,10000],mass:[.000001,100000],spin:[0,.998],secondarySpin:[0,.998],speed:[0,10],exposure:[.1,5],starDensity:[0,3],starBrightness:[0,5],starVariety:[0,2],bridgeOtherStarDensity:[0,3],bridgeOtherStarBrightness:[0,5],bridgeOtherStarVariety:[0,2],diskOuter:[6.1,60],diskThickness:[.15,6],diskDensity:[0,4],secondaryDiskOuter:[6.1,60],secondaryDiskThickness:[.15,6],secondaryDiskDensity:[0,4],nebulaScale:[.2,4],nebulaIntensity:[0,4],nebulaRotation:[-360,360],planetMass:[.01,10000],planetRadius:[.1,15],planetDistance:[4,1e7],starRadius:[.1,5],disruptionStrength:[.1,3],starDistance:[5,1e7],binaryRatio:[.1,4],binarySeparation:[12,1e7],primaryTilt:[0,180],primaryAzimuth:[-360,360],secondaryTilt:[0,180],secondaryAzimuth:[-360,360],jetSpread:[.15,5],jetLength:[.2,3],jetIntensity:[0,4],secondaryJetSpread:[.15,5],secondaryJetLength:[.2,3],secondaryJetIntensity:[0,4],warpFactor:[0,10],warpRadius:[1.3,8],warpThickness:[1,20],bridgeRadius:[3,30],bridgeOtherScale:[.2,4],bridgeOtherIntensity:[0,4],bridgeOtherRotation:[-360,360]};
const OBJECT_RANGE={tidalDeformation:[0,1],diskThickness:[.15,6],diskDensity:[0,4],jetSpread:[.15,5],jetIntensity:[0,4],angularVelocity:[-1000000,1000000],collapsePeriod:[1,10000],collapseRadiusMin:[.01,1e15],collapseRadiusMax:[.01,1e15],radius:[0,1e7],phase:[-1e20,1e20],height:[-30,30],scale:[.001,1000],epoch:[0,1e20],x:[-1e17,1e17],y:[-1e17,1e17],z:[-1e17,1e17],motionEpoch:[0,1e20],logLuminosity:[0,8],surfaceId:[0,100],axialTilt:[-360,360],surfaceRotationPhase:[-1e6,1e6],rotationPeriodSeconds:[-1e12,1e12],orbitInclination:[-180,180],orbitNode:[-360,360],argumentPeriapsis:[-360,360],orbitalPeriodSeconds:[-1e20,1e20],opacity:[0,1],eccentricity:[0,.99],heightMeters:[-1e17,1e17],radiusMeters:[.01,1e15],massSolar:[0,1e12],radiusProxyMeters:[0,1e15],orbitMeters:[0,1e17],spots:[0,1],corona:[0,2],rotation:[0,10],innerRadiusRatio:[.01,.9999],thicknessRatio:[.00001,.2]};
const OBJECT_BOOL=['collapseEnabled','warpEnabled','tidallyLocked','radiusEstimated','massEstimated','physicalRadiusKnown','barycentric','orbitBarycenter'];
const OBJECT_TEXT=['catalogId','dataNote','sourceKey','reference','bodyClass','sourceFrame','orbitReferenceFrame'];
const OBJECT_ENUM={diskStyle:['thermal','hydrogen','helium','dust','nebula','radiant','ribbons'],diskPalette:['physical','artistic','rainbow'],jetStructure:['steady','knots','helix'],placement:['orbit','local'],motion:['orbit','infall','horizon'],starStyle:['main','protostar','redgiant','supergiant','dwarf','whitedwarf','neutron','tzo'],planetStyle:['rocky','gas','ice','ocean'],material:['rocky','icy','metallic'],shapeStyle:['contact','rubble','ellipsoid']};
const OBJECT_SPECIAL=['referenceId','shapeAxes','drivePosition','driveBasis','driveReturn','flight','color','surfaceTint'];
function stateValue(key,value,path){
 check(own(DEFAULTS,key),`Unknown setting ${path}.`);const type=typeof DEFAULTS[key];check(typeof value===type,`${path} must be ${type}.`);
 if(type==='number')number(value,path,...(STATE_RANGE[key]||[-1e12,1e12]));
 if(type==='string'){string(value,path,key.endsWith('Name')?64:100);if(STATE_ENUM[key])enumeration(value,STATE_ENUM[key],path);if(/Color$/.test(key))check(/^#[\da-f]{6}$/i.test(value),`${path} must use #rrggbb.`);}
}
function camera(value,path){fields(value,CAMERA,path);for(const key of CAMERA){check(own(value,key),`${path}.${key} is required.`);number(value[key],`${path}.${key}`,['distance','focusDistance'].includes(key)?1e-20:-1e20,1e20);}}
function optionalVector(v,path){if(v!==null)vector(v,path);}
function freeBasis(v,path){if(v===null)return;fields(v,['right','up','forward'],path);basis([v.right,v.up,v.forward],path);}
function objectProperties(p,path){
 fields(p,[...Object.keys(OBJECT_RANGE),...OBJECT_BOOL,...OBJECT_TEXT,...Object.keys(OBJECT_ENUM),...OBJECT_SPECIAL],path);
 for(const [k,v]of Object.entries(p)){
  const q=`${path}.${k}`;
  if(OBJECT_RANGE[k])number(v,q,...OBJECT_RANGE[k]);else if(OBJECT_BOOL.includes(k))check(typeof v==='boolean',`${q} must be true or false.`);else if(OBJECT_TEXT.includes(k))string(v,q);else if(OBJECT_ENUM[k])enumeration(v,OBJECT_ENUM[k],q);
  else if(k==='referenceId'){if(v!==null)id(v,q);}else if(k==='color'||k==='surfaceTint')check(typeof v==='string'&&/^#[\da-f]{6}$/i.test(v),`${q} must use #rrggbb.`);
  else if(k==='shapeAxes'){vector(v,q);v.forEach(x=>number(x,q,.05,5));}
  else if(k==='flight'){if(own(v,'thrust')){number(v.thrust,q+'.thrust',0,10);check(Number.isInteger(v.thrust*2),q+'.thrust must use 0.5 g steps');}if(own(v,'velocity'))vector(v.velocity,q+'.velocity');for(const key of ['coordinateTimeSeconds','timeLagSeconds'])if(own(v,key))number(v[key],q+'.'+key,0,1e20);for(const key of ['coordinateTimeCompensation','timeLagCompensation'])if(own(v,key))number(v[key],q+'.'+key,-1e5,1e5);if(own(v,'timeLagSeconds')&&own(v,'coordinateTimeSeconds'))check(v.timeLagSeconds<=v.coordinateTimeSeconds,q+'.timeLagSeconds cannot exceed coordinate time');for(const key of ['brakeSpeed','brakeTurn'])if(own(v,key))check(typeof v[key]==='boolean',q+'.'+key+' must be boolean');if(own(v,'travelDirection'))enumeration(v.travelDirection,[-1,1],q+'.travelDirection');if(own(v,'brakeInitialSpeed'))number(v.brakeInitialSpeed,q+'.brakeInitialSpeed',0,1e14);fields(v,['speed','curvature','torsion','angularVelocity','position','basis','travelCompression','travelDirection','brakeSpeed','brakeTurn','brakeInitialSpeed','thrust','velocity','coordinateTimeSeconds','timeLagSeconds','coordinateTimeCompensation','timeLagCompensation'],q);number(v.speed,q+'.speed',0,1e14);if(own(v,'angularVelocity'))number(v.angularVelocity,q+'.angularVelocity',-.65,.65);number(v.curvature,q+'.curvature',-1e12,1e12);number(v.torsion,q+'.torsion',-1e12,1e12);vector(v.position,q+'.position');basis(v.basis,q+'.basis');if(own(v,'travelCompression'))number(v.travelCompression,q+'.travelCompression',1e-15,1);}
  else if(k==='drivePosition')vector(v,q);else if(k==='driveBasis')basis(v,q);else if(k==='driveReturn'&&v!==null){fields(v,['position','basis','elapsed'],q);vector(v.position,q+'.position');basis(v.basis,q+'.basis');number(v.elapsed,q+'.elapsed',0,1e20);}
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
export function prepareSceneFile(renderer){const source=renderer.delegate||renderer;return {snapshot:snapshotRenderer(source),nodes:source.getObjectTree()};}
export function serializeScene(renderer){const {snapshot,nodes}=prepareSceneFile(renderer);return serializeSceneData(snapshot,nodes);}
export function serializeSceneData(snapshot,nodes){
 check(plain(snapshot)&&Array.isArray(snapshot.objects)&&snapshot.objects.length<=MAX_OBJECTS&&Array.isArray(nodes)&&nodes.length<=MAX_OBJECTS+10,'The scene is too large or incomplete.');
 snapshot={cameraGuide:null,driveId:null,freeReferenceId:null,freeReferencePosition:null,orbitOverrides:{},...snapshot};
 const objects=new Map(snapshot.objects.map((o,i)=>[o.id,{o,i}])),state={...snapshot.state},display={quality:snapshot.quality==='cpu'?'adaptive':snapshot.quality};
 for(const key of DISPLAY){display[key]=state[key];delete state[key];}
 const tree=new Map();for(const node of nodes){const item={id:node.id,type:node.type,properties:{}};if(objects.has(node.id)){const {o,i}=objects.get(node.id);if(o.name!==undefined)item.name=o.name;item.order=i;item.properties=Object.fromEntries(Object.entries(o).filter(([k,v])=>!['id','type','name','parentId'].includes(k)&&v!==undefined));}
  else if(node.id!=='space'){item.properties={};for(const key of COMPONENTS[node.id]||[]){item.properties[key]=state[key];delete state[key];}}
  item.children=[];tree.set(node.id,item);
 }
 tree.get('space').properties=state;for(const node of nodes)if(node.id!=='space')tree.get(node.parentId||'space')?.children.push(tree.get(node.id));
 const navigation={},simulation={};for(const key of NAVIGATION)if(own(snapshot,key))navigation[key]=snapshot[key];for(const key of SIMULATION)if(own(snapshot,key))simulation[key]=snapshot[key];
 const document={format:FORMAT,version:SCENE_FILE_VERSION,scene:snapshot.sceneId,display,space:tree.get('space'),navigation,simulation};
 // Use the same validator on our own output; a partial save is never downloaded.
 const text='# Event Horizon scene — exact-version files; no backward compatibility.\n# Children orbit/belong to their enclosing object. SI properties end in Meters/Seconds; radius is in the parent black hole r_g.\n# Two-space YAML, finite values, no aliases or tags. Scene files never contain image assets.\n'+yamlLines(document).join('\n')+'\n';
 parseScene(text);return text;
}
export function parseScene(text){
 const doc=readYaml(text);fields(doc,['format','version','scene','display','space','navigation','simulation'],'scene file');check(doc.format===FORMAT,'This is not an Event Horizon scene file.');
 if(doc.version!==SCENE_FILE_VERSION)fail(`Scene version ${String(doc.version??'missing').slice(0,60)} does not match app version ${SCENE_FILE_VERSION}.`);
 enumeration(doc.scene,SCENE_PRESETS.map(p=>p.id),'scene');fields(doc.display,['quality',...DISPLAY],'display');enumeration(doc.display.quality,['adaptive','low','medium','high','ultra'],'display.quality');
 const state={},objects=[],nodes=new Map(),orders=new Set();for(const key of DISPLAY){check(own(doc.display,key),`display.${key} is required.`);stateValue(key,doc.display[key],`display.${key}`);state[key]=doc.display[key];}
 function visit(node,parent=null,depth=0){check(depth<=MAX_DEPTH&&nodes.size<MAX_OBJECTS+10,'The object tree is too large or too deep.');fields(node,['id','type','name','order','properties','children'],'object');id(node.id,'object.id');check(!nodes.has(node.id),`Duplicate object id ${node.id}.`);check(Array.isArray(node.children),`${node.id}.children must be a list.`);nodes.set(node.id,{...node,parentId:parent?.id||null});
  if(!parent){check(node.id==='space'&&node.type==='space','Space must be the root object.');fields(node.properties,Object.keys(DEFAULTS).filter(k=>!DISPLAY.includes(k)),'space.properties');for(const [key,value]of Object.entries(node.properties)){stateValue(key,value,`space.${key}`);state[key]=value;}}
  else if(own(VIRTUAL,node.id)){const [type,requiredParent]=VIRTUAL[node.id];check((node.type===type||['primary','secondary'].includes(node.id)&&node.type==='whitehole')&&(!requiredParent||parent.id===requiredParent),`Invalid component ${node.id}.`);fields(node.properties,COMPONENTS[node.id],`${node.id}.properties`);for(const key of COMPONENTS[node.id]){check(own(node.properties,key)&&!own(state,key),`Missing or duplicate setting ${key}.`);stateValue(key,node.properties[key],`${node.id}.${key}`);state[key]=node.properties[key];}}
  else{check(own(OBJECT_KIND,node.type),`Unsupported object type ${node.type}.`);objectProperties(node.properties,`${node.id}.properties`);if(node.type==='shuttle'&&node.properties.flight){const flight=node.properties.flight;check(flight.speed<FLIGHT_LIGHT_SPEED&&(!flight.velocity||Math.hypot(...flight.velocity)<FLIGHT_LIGHT_SPEED),'Shuttle flight velocity must remain below the speed of light.');}if(node.name!==undefined)string(node.name,`${node.id}.name`,64);if(node.order!==undefined){number(node.order,`${node.id}.order`,0,MAX_OBJECTS-1);check(Number.isInteger(node.order)&&!orders.has(node.order),'Object order must be a unique integer.');orders.add(node.order);}check(objects.length<MAX_OBJECTS,'This scene has more than 1,024 bodies.');objects.push({...node.properties,type:node.type,id:node.id,parentId:parent.id,...(node.name!==undefined?{name:node.name}:{}),_fileOrder:node.order??MAX_OBJECTS+objects.length});}
  if(parent){check(!['disk','jets','ring','belt'].includes(parent.type),'Discs, jets, rings and belts cannot have children.');if(['disk','jets'].includes(node.type)){check(['blackhole','whitehole','star'].includes(parent.type),'Discs and jets must belong to stars or black holes.');const componentKey='_component_'+node.type;check(!parent[componentKey],'An object can own only one disc and one pair of jets.');parent[componentKey]=true;}else if(['ring','belt'].includes(node.type))check(['star','planet'].includes(parent.type),'Rings and belts must belong to stars or planets.');else check(OBJECT_CLASS[node.type]<=OBJECT_CLASS[parent.type],`${node.type} cannot orbit ${parent.type}.`);if(OBJECT_CLASS[node.type]===OBJECT_CLASS[parent.type]){check(!parent._sameClass,'Equal-class objects are limited to a pair.');parent._sameClass=true;const grand=nodes.get(parent.parentId);check(!grand||OBJECT_CLASS[grand.type]!==OBJECT_CLASS[parent.type],'Equal-class chains are limited to a pair.');}}
  const ownNode=nodes.get(node.id);for(const child of node.children)visit(child,ownNode,depth+1);
 }
 visit(doc.space);for(const key of Object.keys(DEFAULTS))check(own(state,key),`Missing setting ${key}.`);
 const enabled={primary:state.blackHole,secondary:state.blackHole&&state.binary,disk:state.blackHole&&state.disk,jets:state.blackHole&&state.jets,'secondary-disk':state.blackHole&&state.binary&&state.secondaryDisk,'secondary-jets':state.blackHole&&state.binary&&state.secondaryJets,planet:state.planet,tidalStar:state.tidalStar};
 for(const [key,white]of [['primary',state.whiteHole],['secondary',state.secondaryWhiteHole]])if(nodes.has(key))check(nodes.get(key).type===(white?'whitehole':'blackhole'),`The type of ${key} does not match its white-hole setting.`);
 for(const [key,on]of Object.entries(enabled))check(nodes.has(key)===!!on,`${key} does not match the enabled scene components.`);
 for(const key of ['planet','tidalStar'])if(nodes.has(key))check(nodes.get(key).parentId===(state.blackHole?'primary':'space'),`Invalid parent for ${key}.`);
 check(!state.bridge||!state.blackHole&&!state.binary&&!state.warp&&!state.whiteHole,'The bridge cannot be combined with a black hole or warp field.');check(!state.binary||state.blackHole,'A binary needs a primary black hole.');check(!state.whiteHole||state.blackHole,'A white hole needs a primary body.');check(state.grid===state.warpGrid,'The grid settings must agree.');check(state.spectrum!=='geometry'||state.grid,'Geometry view requires the grid.');
 objects.sort((a,b)=>a._fileOrder-b._fileOrder);for(const object of objects){delete object._fileOrder;if(object.referenceId!==null&&object.referenceId!==undefined){check(objects.some(o=>o.id===object.referenceId),`Unknown reference ${object.referenceId}.`);check(object.referenceId===object.parentId,'A local reference must match the enclosing parent.');}if(object.placement==='orbit'&&!['ring','belt'].includes(object.type))check(object.parentId!=='space','An orbit needs an enclosing physical parent.');}
 fields(doc.navigation,NAVIGATION,'navigation');fields(doc.simulation,SIMULATION,'simulation');
 const nav=doc.navigation,sim=doc.simulation;for(const key of NAVIGATION)check(own(nav,key),`navigation.${key} is required.`);for(const key of SIMULATION)check(own(sim,key),`simulation.${key} is required.`);camera(nav.camera,'camera');camera(nav.target,'target');
 for(const key of ['freePosition','freeTarget','freeReferencePosition'])if(own(nav,key))optionalVector(nav[key],key);if(own(nav,'freeBasis'))freeBasis(nav.freeBasis,'freeBasis');
 if(nav.savedOverview!==null){fields(nav.savedOverview,['camera','target','viewMode','travel','freePosition','freeTarget','freeBasis'],'savedOverview');camera(nav.savedOverview.camera,'savedOverview.camera');camera(nav.savedOverview.target,'savedOverview.target');enumeration(nav.savedOverview.viewMode,STATE_ENUM.viewMode,'savedOverview.viewMode');check(typeof nav.savedOverview.travel==='boolean','savedOverview.travel must be boolean.');optionalVector(nav.savedOverview.freePosition,'savedOverview.freePosition');optionalVector(nav.savedOverview.freeTarget,'savedOverview.freeTarget');freeBasis(nav.savedOverview.freeBasis,'savedOverview.freeBasis');}
 const validId=(value,key,nullable=true)=>{if(nullable&&value===null)return;id(value,key);check(nodes.has(value)||(value==='bridge'&&state.bridge),`Unknown target ${key}: ${value}.`);};
 for(const key of ['sceneFocusId','selectedId','focusId','freeReferenceId'])if(own(nav,key))validId(nav[key],key);
 enumeration(nav.cameraGuide,[null,'warp-side','blue-fire-edge'],'cameraGuide');enumeration(nav.focusMode,[null,'track','onboard','chase'],'focusMode');check(nav.focusId===null?nav.focusMode===null:nav.focusMode!==null,'The camera target and mode must agree.');
 for(const key of ['time','nextObjectId','bridgeTime','bridgeTravelTime','warpTravelWorld','warpTravelTime'])number(sim[key],key,key==='warpTravelWorld'?-1e20:0,1e20);check(Number.isSafeInteger(sim.nextObjectId)&&sim.nextObjectId>=1,'nextObjectId must be a positive integer.');
 for(const object of objects){const match=/^body-(\d+)$/.exec(object.id);if(match)check(Number(match[1])<sim.nextObjectId,'nextObjectId must exceed all saved body identifiers.');}
 vector(sim.warpTravelPosition,'warpTravelPosition');check(typeof sim.travel==='boolean','travel must be true or false.');
 for(const key of ['driveId','bridgeObjectId','warpObjectId'])if(own(sim,key))validId(sim[key],key);
 if(sim.orbitOverrides!==undefined){fields(sim.orbitOverrides,['planet','secondary'],'orbitOverrides');for(const [key,value]of Object.entries(sim.orbitOverrides)){fields(value,['phase','epoch'],`orbitOverrides.${key}`);number(value.phase,`${key}.phase`,-1e20,1e20);number(value.epoch,`${key}.epoch`,0,1e20);}}
 const objectById=new Map(objects.map(o=>[o.id,o]));if(sim.driveId){const driven=objectById.get(sim.driveId);check(driven&&['enterprise','shuttle'].includes(driven.type)&&driven.drivePosition&&driven.driveBasis,'Free drive requires a positioned spacecraft.');}
 if(state.warp)check(objectById.get(sim.warpObjectId)?.type==='enterprise'&&objectById.get(sim.warpObjectId)?.warpEnabled,'Warp requires its enabled Enterprise.');else check(sim.warpObjectId===null,'Inactive warp must not have an owner.');
 check(objects.filter(o=>o.warpEnabled).length===(state.warp?1:0),'Only the active Enterprise can own a warp field.');
 if(state.bridge){check(objects.length===1&&['enterprise','shuttle','astronaut','blackhole','whitehole'].includes(objectById.get(sim.bridgeObjectId)?.type),'A bridge scene must contain one supported traveler.');check(objectById.get(sim.bridgeObjectId).type===state.bridgeTravelerType,'The bridge traveler type does not match.');}
 else check(sim.bridgeObjectId===null,'Inactive bridge must not have a traveler.');
 return{state,objects,sceneId:doc.scene,quality:doc.display.quality,...nav,...sim};
}

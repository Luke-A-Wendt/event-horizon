import assert from 'node:assert/strict';
import {OBJECT_TYPES,OBJECT_DIMENSIONS,REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {captureTransferPath} from '../dist/transfer-path.js';
import {fixture} from './render-fixture.mjs';

const shipName='NASA Warp Explorer',catalog=OBJECT_TYPES.filter(o=>o.id==='enterprise');
assert.deepEqual(catalog.map(o=>o.label),[shipName]);
assert.deepEqual(OBJECT_TYPES.filter(o=>/Enterprise/i.test(o.label)).map(o=>o.id),['classicEnterprise']);
assert.equal(OBJECT_DIMENSIONS.enterprise.lengthMeters,288.6456);
assert.equal(OBJECT_DIMENSIONS.enterprise.normalizedExtent,1.84);
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});
for(const id of ['warp-lab','warp-orbit','warp-excursion','bridge','gravity-anomaly','enterprise-solar-tour']){
 r.loadScene(id);
 const ship=r.getObjects().find(o=>o.type==='enterprise');assert(ship,id);assert.equal(ship.label,shipName,id);
 assert.equal(r.getObjectContext().allowedTypes.filter(k=>k==='enterprise').length,1);
}
for(const scene of SCENE_PRESETS)for(const object of scene.objects||[])if(object.type==='enterprise'&&object.name)
 if(object.hullModel==='classicEnterprise'){assert.equal(object.name,'USS Enterprise');assert.equal(object.hullModel,'classicEnterprise');}else assert(!/Enterprise/i.test(object.name),scene.id);
r.loadScene('bridge');r.objects.find(o=>o.type==='enterprise').name=shipName;
const saved=serializeScene(r);assert(saved.includes('name: "'+shipName+'"'));
for(const name of ['Starship Enterprise','USS Enterprise','Enterprise','USS Enterprise II','Orion']){
 const file=saved.replace('name: "'+shipName+'"','name: "'+name+'"'),ship=parseScene(file).objects.find(o=>o.type==='enterprise');
 assert.equal(ship.name,['Starship Enterprise','USS Enterprise','Enterprise'].includes(name)?shipName:name);
}
// Stock scenes use the new designs; hand-placed legacy objects round-trip intact.
assert(!SCENE_PRESETS.some(scene=>scene.id!=='iss-earth-orbit'&&scene.objects?.some(o=>['iss','classicEnterprise'].includes(o.type))));
r.loadScene('orbital-expedition');
assert(r.getObjects().some(o=>o.type==='habitat'&&o.label==='NASA Garden Station'));
for(const [type,label] of [['classicEnterprise','Starship Enterprise'],['iss','ISS']]){
 assert(r.getObjectContext().allowedTypes.includes(type));const placed=r.addObject(type);
 assert.equal(r.getObjects().find(o=>o.id===placed.id).label,label);
}
const restored=parseScene(serializeScene(r)).objects.map(o=>o.type);
for(const type of ['classicEnterprise','iss','habitat'])assert(restored.includes(type));
r.dispose();

// Looking along the longitudinal axis, route segments should remain visible
// through the open space between the rings, cabin and four diagonal supports.
const view={origin:[0,0,0],observer:[0,0,10],forward:[0,0,-1],right:[1,0,0],up:[0,1,0],aspect:1,fov:1,width:600,height:600,bodies:[],holes:[],occluders:[],lensing:false,hideIndex:-1};
const craft={type:'enterprise',id:'ship',position:[0,0,0],radius:1,frame:[[1,0,0],[0,1,0],[0,0,1]]};
const polys=captureTransferPath({cameraFrame:view,getFocusFrame:()=>craft,travelPreview:{craftId:'ship',pathPoints:[[-RG,0,0],[RG,0,0]]}},view).craftSilhouette;
function occluded(x,y){return polys.some(p=>p.every((a,i)=>{const b=p[(i+1)%p.length];return (b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x)>=-1e-14;}));}
assert(occluded(0,0),'Hull masks a route behind it');
assert(occluded(.047,0),'Ring masks a route behind the wall');
assert(!occluded(.031,0),'An open sector of the ring admits the route');
console.log('PASS: stock warp scenes, catalog, saved names, physical scale, and open annular route mask.');

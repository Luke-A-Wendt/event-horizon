import assert from 'node:assert/strict';
import {OBJECT_TYPES,OBJECT_KIND,OBJECT_CLASS,objectRadiusMeters} from '../dist/objects.js';
import {DEFAULT_MAP_FILTERS,objectCategory,mapCategoryVisible,naturalParentReason,annotationLabelContext,annotationLabelVisible} from '../dist/object-taxonomy.js';
import {mapModel,renderOrbitMap} from '../dist/orbit-map.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {captureAnnotationFrame} from '../dist/annotations.js';
import {cpuPlanetSubpixel} from '../dist/cpu-renderer.js';
import {fixture} from './render-fixture.mjs';

for(const type of ['planetoid','asteroid']){assert(OBJECT_TYPES.some(o=>o.id===type));assert.equal(OBJECT_KIND[type],0);assert(OBJECT_CLASS[type]<OBJECT_CLASS.planet);assert(objectRadiusMeters(type)>0);}
assert.equal(objectCategory({type:'planet',bodyClass:'dwarf planet'}),'planetoids');
assert.equal(objectCategory({type:'asteroid',bodyClass:'comet'}),'other');
assert.equal(objectCategory('moon'),'moons');
assert(mapCategoryVisible({type:'star'},DEFAULT_MAP_FILTERS));
assert(Object.values(DEFAULT_MAP_FILTERS).every(Boolean));
assert(!naturalParentReason('moon','asteroid'),'Asteroid moonlets remain natural satellites');
assert(naturalParentReason('moon','star'));
assert(naturalParentReason('planetoid','planet'));
assert(!naturalParentReason('asteroid','blackhole'));

const f=fixture({width:900,height:600});const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene('solar-system');
const sun=r.objects.find(o=>o.name==='Sun'),earth=r.objects.find(o=>o.name==='Earth'),moon=r.objects.find(o=>o.name==='Moon'),shuttle=r.objects.find(o=>o.type==='shuttle');
assert(sun&&earth&&moon&&shuttle);const count=r.objects.length;
const full=mapModel(r,sun.id,{filters:DEFAULT_MAP_FILTERS}),planets=mapModel(r,sun.id,{filters:{planets:true}});
assert.equal(planets.children.filter(o=>o.category==='planets').length,8);
assert.equal(planets.children.length,8,'Planet-only map shows the eight planets, not minor bodies');
assert(full.children.length>planets.children.length);assert(planets.hiddenCount>0);
const minors=mapModel(r,sun.id,{filters:{planetoids:true,asteroids:true}});assert(minors.children.length>=20);assert(!minors.children.some(o=>o.category==='planets'));
assert.equal(r.objects.length,count,'Map filtering never removes scene objects');
const earthMoons=mapModel(r,earth.id,{filters:{moons:true}});assert(earthMoons.children.some(o=>o.id===moon.id));assert(!earthMoons.children.some(o=>o.type==='shuttle'));
assert(renderOrbitMap(planets).svg.includes('Earth'));

r.focusTarget(earth.id,'track');r.fillObjects();r.updateCameraFrame();
const context=annotationLabelContext(r);assert.equal(context.planetId,earth.id);
assert(annotationLabelVisible(moon,context));assert(annotationLabelVisible(sun,context));assert(annotationLabelVisible(earth,context));
assert(!annotationLabelVisible(shuttle,context));
const otherMoon=r.objects.find(o=>o.type==='moon'&&o.parentId!==earth.id);assert(otherMoon);assert(!annotationLabelVisible(otherMoon,context));
r.focusTarget(sun.id,'track');assert.equal(annotationLabelContext(r).planetId,null);assert(!annotationLabelVisible(moon,annotationLabelContext(r)));
r.state.annotations=true;const labels=captureAnnotationFrame(r);assert(labels);
for(const body of labels.objectFrames)if(body.labelEligible)assert(['planet','star','blackhole','whitehole'].includes(body.type)||body.collapsed);

const frame={observer:[0,0,0],forward:[0,0,1],right:[1,0,0],up:[0,1,0]};
for(const type of ['planet','moon','planetoid','asteroid'])assert(cpuPlanetSubpixel({type,radius:1e-7,position:[0,0,10]},frame,400,600),type+' shares the subpixel cutoff');
r.dispose();
console.log('PASS: natural-body categories, planet-only map filters, unchanged catalog, current-planet moon labels and small-body CPU culling.');

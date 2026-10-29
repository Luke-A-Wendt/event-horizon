import assert from 'node:assert/strict';
import {PLANET_TEXTURE_DATA} from '../dist/planet-texture-data.js';
import {PlanetTextureCache} from '../dist/planet-textures.js';
import {SURFACE_PROFILES} from '../dist/planet-profiles.js';
import {createFragment} from '../dist/shaders.js';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
const original={image:globalThis.Image,bitmap:globalThis.createImageBitmap,document:globalThis.document};
const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.loadScene('empty-space');const planet=r.addChildObject('space','planet',{surfaceId:1,axialTilt:23.44,shapeAxes:[1.1,.9,1],surfaceRotationPhase:.25});r.focusTarget(planet.id,'track');r.render();
assert(r.shaderFeatures().planetary);assert.equal(r.bodyParamData[0],4);assert.equal(r.bodyShapeData.length,48);
assert(Math.abs(r.bodyShapeData[3]-23.44*Math.PI/180)<1e-6);assert(Math.abs(r.bodyShapeData[1]-.9/1.1)<1e-6);
const photo=r.beginPhotoCapture();r.endPhotoCapture();assert(photo.features.planetary);assert.equal(photo.focusSurfaceId,1);r.dispose();
assert.equal(SURFACE_PROFILES.find(p=>p.id===2).label,'Moon');assert.equal(SURFACE_PROFILES.find(p=>p.id===11).label,'Charon');
const ids=[1,2,3,4,10,11,12,13,14,15,17,18,21];assert.deepEqual(Object.keys(PLANET_TEXTURE_DATA.maps).map(Number).sort((a,b)=>a-b),ids);
function dimensions(uri){
 assert(uri.startsWith('data:image/jpeg;base64,'));const data=Buffer.from(uri.split(',')[1],'base64');assert.equal(data.readUInt16BE(0),0xffd8);
 let p=2;while(p<data.length){while(data[p]===255)p++;const marker=data[p++];if(marker===0xd9||marker===0xda)break;const size=data.readUInt16BE(p);if([0xc0,0xc1,0xc2].includes(marker))return [data.readUInt16BE(p+5),data.readUInt16BE(p+3)];p+=size;}throw Error('JPEG frame missing');
}
assert.deepEqual(dimensions(PLANET_TEXTURE_DATA.atlas),[1024,1024]);
for(const id of ids)assert.deepEqual(dimensions(PLANET_TEXTURE_DATA.maps[id]),[PLANET_TEXTURE_DATA.meta[id].width,PLANET_TEXTURE_DATA.meta[id].height]);
assert.equal(PLANET_TEXTURE_DATA.meta[1].width,4096);assert.equal(PLANET_TEXTURE_DATA.meta[2].width,4096);
const full=createFragment({planetary:true,rings:true,bodyGravity:true,stellar:true,objectSlots:6});
assert(full.includes('uObjects[6]')&&!full.includes('uObjects[12]'));assert(!full.includes('uBodySurface['),'Metadata packing avoids a redundant uniform array');
assert(full.includes('fract(.5-atan(n.z,n.x)/(2.0*PI))'),'NASA maps preserve east-west handedness');
assert(full.includes('surfaceProfile(')&&full.includes('planetShapeHit('));assert(full.includes('ringNearest<nearest'),'A foreground ring must depth-test against the planet');assert(full.includes('trans*=1.0-obj.a'),'Unfocused rings transmit the remainder of the ray');
assert(full.includes('1.0-exp(-max(0.0,uBodyParams[j].w)'),'Ring opacity reaches optical depth');
assert(full.includes('ringPlanetShadow(')&&full.includes('previous+rd*t*obj.w'),'Ring shadows use the actual segment intersection');
assert(!full.includes('k<12'),'Ring shadow loops respect the small uniform-slot budget');
assert(full.includes('#define planetTexture texture\n')&&full.includes('#define planetTexture texture2D'),'Both WebGL shading language versions use their legal sampling builtin');
assert(!createFragment().includes('mappedPlanet('),'Ordinary black-hole shaders do not compile named planetary textures');
const globe=/bool missingRegion=([^;]+);/.exec(full)?.[1];assert(globe.includes('9.5')&&globe.includes('17.5'));assert(!globe.includes('20.5'),'Iapetus real dark hemisphere is not mistaken for missing imagery');

function glFixture(max=2048){let count=0,error=0;return {
 TEXTURE_2D:3553,TEXTURE0:33984,RGB:6407,UNSIGNED_BYTE:5121,MAX_TEXTURE_SIZE:3379,LINEAR:9729,LINEAR_MIPMAP_LINEAR:9987,TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,CLAMP_TO_EDGE:33071,UNPACK_ALIGNMENT:3317,UNPACK_FLIP_Y_WEBGL:37440,
 uploads:[],deleted:[],bindings:[],uniforms:new Map(),fail:false,
 createTexture(){return {id:++count};},deleteTexture(t){this.deleted.push(t);},getParameter(){return max;},bindTexture(target,t){this.bindings.push(t);},activeTexture(){},pixelStorei(){},texParameteri(){},generateMipmap(){},
 texImage2D(...args){const image=args[5];if(image&&typeof image==='object')this.uploads.push([image.width,image.height]);if(this.fail)error=1285;},getError(){const e=error;error=0;return e;},uniform1i(k,v){this.uniforms.set(k,v);},uniform1f(k,v){this.uniforms.set(k,v);}
};}
let closed=0;
globalThis.createImageBitmap=async(source,options)=>({width:options?.resizeWidth||4096,height:options?.resizeHeight||2048,close(){closed++;}});delete globalThis.Image;
const gl=glFixture(),cache=new PlanetTextureCache(gl);assert(cache.atlas,'Even the unsupported/decoding path has a valid neutral texture');await cache.ensure(1);assert(cache.ready(1));assert.equal(cache.focusId,1);assert.equal(cache.focusSize,2048);assert(gl.uploads.every(([w])=>w<=2048));
await cache.ensure(2,{high:true});assert.equal(cache.focusSize,2048,'Hardware texture limit wins over requested 4K');
const locations={uPlanetAtlas:'atlas',uPlanetFocus:'focus',uPlanetAtlasReady:'ready',uPlanetFocusId:'id'};cache.bind(locations);assert.equal(gl.uniforms.get('ready'),1);assert.equal(gl.uniforms.get('id'),2);cache.dispose();assert.equal(gl.deleted.length,2);assert(closed>=3,'Bounded decode produces one bitmap per image, without a full-resolution intermediate');
// A high-detail request arriving during a smaller decode must really upgrade.
const highGl=glFixture(4096),high=new PlanetTextureCache(highGl);const a=high.ensure(1),b=high.ensure(1,{high:true});await Promise.all([a,b]);assert.equal(high.focusSize,4096);high.dispose();
// Main-window Image fallback resizes before upload on old browsers.
delete globalThis.createImageBitmap;globalThis.Image=class{constructor(){this.width=this.naturalWidth=4096;this.height=this.naturalHeight=2048;}set src(_){queueMicrotask(()=>this.onload());}};
globalThis.document={createElement(){return {width:0,height:0,getContext(){return {drawImage(){}};}};}};
const oldGl=glFixture(512),oldCache=new PlanetTextureCache(oldGl);await oldCache.ensure(1);assert(oldGl.uploads.every(([w])=>w<=512),'Image-only path honors MAX_TEXTURE_SIZE');oldCache.dispose();
// Numeric GL errors must become an explicit failure, not a ready gray scene.
globalThis.createImageBitmap=async()=>({width:1024,height:512,close(){closed++;}});const brokenGl=glFixture(),broken=new PlanetTextureCache(brokenGl);brokenGl.fail=true;await assert.rejects(broken.ensure(1),/GPU could not upload/);assert(broken.error);assert.equal(broken.atlasReady,false);broken.dispose();
// Cancel/dispose while decode is pending closes the decoded bitmap.
let resolve;globalThis.createImageBitmap=()=>new Promise(r=>{resolve=r;});const pending=new PlanetTextureCache(glFixture());const waiting=pending.ensure(0);pending.dispose();resolve({width:1024,height:1024,close(){closed++;}});await waiting;assert.equal(pending.atlasReady,false);
globalThis.Image=original.image;globalThis.createImageBitmap=original.bitmap;globalThis.document=original.document;
console.log('PASS: real embedded NASA map dimensions, packed profiles/shape/tilt, 6-slot shader path, depth-ordered ring transmission, bounded texture loading/upgrades, old-browser resize, GL failure reporting, and disposal. Native map renders checked separately.');

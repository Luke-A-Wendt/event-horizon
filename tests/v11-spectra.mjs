import assert from 'node:assert/strict';
import {createFragment} from '../dist/shaders.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';

// Exercise the public state through the same renderer uniforms captured for
// worker, live, stereo and still rendering, rather than testing a UI-only tint.
const bands=['visible','infrared','xray','radio','gamma'];
const f=fixture(),renderer=new BlackHoleRenderer(f.canvas);
for(const scene of ['disk','bridge','orbital-expedition','nasa-shuttle','warp-lab']){
 renderer.loadScene(scene);
 assert.equal(renderer.sceneId,scene,'The test must exercise the requested scene');
 if(scene==='nasa-shuttle')renderer.focusObject(renderer.getObjects()[0].id,'onboard');
 for(const [index,spectrum] of bands.entries()){
  renderer.update({spectrum,paused:true});renderer.render();
  if(scene==='nasa-shuttle')assert.equal(f.uniforms.get('uCockpitMode').args[0],0);
  assert.equal(renderer.state.spectrum,spectrum);
  assert.equal(f.uniforms.get('uSpectrum').args[0],index,`${scene}: ${spectrum} reaches the live shader`);
  const snapshot=renderer.beginPhotoCapture();renderer.endPhotoCapture();
  assert.equal(snapshot.uniforms.find(u=>u.name==='uSpectrum').args[0],index,`${scene}: picture mode preserves the chosen band`);
 }
}
for(const [scene,band] of [['radio-observatory','radio'],['gamma-engine','gamma']]){
 renderer.loadScene(scene);renderer.render();
 assert.equal(renderer.state.spectrum,band);
 assert.equal(renderer.state.jets,true);
}
renderer.dispose();

function body(source,name){
 const start=source.indexOf(`${name}(`);assert(start>=0,`${name} exists`);
 const open=source.indexOf('{',start);let depth=1,end=open+1;
 while(depth&&end<source.length){if(source[end]==='{')depth++;if(source[end]==='}')depth--;end++;}
 return source.slice(open+1,end-1);
}
const full=createFragment({craft:true,craftMask:15,warp:true,grid:true,bridge:true,probe:true});
// Each physical source class has a response; annotations are intentionally not
// spectrum-filtered. This also catches accidental visible-color bypasses.
for(const name of ['surfaceSpectrum','stellarSpectrum','skyWithEnvironment','discAt','jetField','probeEmissionRay','whiteBoundaryEmission','debris','bridgeRegionSky']){
 const implementation=body(full,name);
 for(const band of [1,3,4])assert(implementation.includes(`uSpectrum==${band}`),`${name} handles band ${band}`);
 if(!['surfaceSpectrum','stellarSpectrum'].includes(name))assert(implementation.includes('uSpectrum==2'),`${name} handles X-rays`);
}
assert(body(full,'whiteHoleEmission').includes('whiteBoundaryEmission('),'Primary white holes use the shared spectral boundary source');
assert(!body(full,'whiteBoundaryEmission').includes('uSpectrum==5'),'Geometry keeps the visible white boundary source');
for(const name of ['coordinateGridSegment']){
 assert(!body(full,name).includes('uSpectrum'),'Coordinate annotations retain readable colors in every band');
}
assert(body(full,'inspector').includes('surfaceSpectrum('),'Tracked objects use their material response');
assert(body(full,'objectHit').includes('surfaceSpectrum('),'Untracked objects use the same material response');
assert(body(full,'warpLocalTrace').includes('surfaceSpectrum('),'The warp-local ship cannot bypass its material response');
assert(!full.includes('surfaceSpectrum(cabin.rgb'),'Removed cockpit adds no spectral overlay');
assert(body(full,'surfaceSpectrum').includes('if(uSpectrum==0)return visible;'),'Visible material appearance is unchanged');
assert(body(full,'stellarSpectrum').includes('if(uSpectrum==0)return visible;'),'Visible stellar appearance is unchanged');

// These large values occur when metre-scale objects share astronomical world
// coordinates. A distance-only miss sentinel rounds onto a valid segment end.
assert.equal(Math.fround(Math.fround(131072)+.001),Math.fround(131072));
const hits=body(full,'objectHit');
assert(hits.includes('bool found=false')&&hits.includes('found=true')&&hits.includes('if(found)'),
 'A rounded miss sentinel cannot turn empty space into an opaque surface');
assert(hits.includes('disc=1.0-dot(offAxis,offAxis)'),
 'Bounding spheres avoid subtracting enormous near-equal squared distances');
assert(hits.includes('normalSize>.5&&normalSize<1.5'),
 'A missing or invalid primitive normal cannot become a gray craft hit');
assert(hits.includes('localMaximum=min(maximum-advance,2.1)'),
 'Craft primitive intersections run near their bounding sphere, not at astronomical local coordinates');

for(const options of [{},{ultra:true},{photo:true,photoSteps:1024},{photo:true,photoSteps:3072}]){
 const source=createFragment(options);
 assert(!source.includes('vec3 probeEmissionRay('),'Unrelated scenes do not compile the probe integrator');
 assert(source.includes(`i<${options.photo?options.photoSteps:options.ultra?768:288}`),
  'Adding spectral responses must not raise ray-step budgets');
}
console.log('PASS: five physical source-response bands reach live and still shaders; both bridge ends, cockpit and warp craft inherit them; grids remain legible; large-distance misses and invalid craft hits are guarded; ray budgets are unchanged.');

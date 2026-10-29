import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bridgeJourney,bridgeMetricScale,bridgeGradient,HEIGHLINER_PASSAGE} from '../dist/bridge-math.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {fixture} from './render-fixture.mjs';
const journey=t=>bridgeJourney(t,1,'open-transit-close'),endpoint=HEIGHLINER_PASSAGE.endpoint/HEIGHLINER_PASSAGE.throatRadius;
assert.equal(journey(0).l,endpoint);assert.equal(journey(0).open,0);assert.equal(journey(7).open,1);assert.equal(journey(40).l,-endpoint);
assert(journey(3).open<journey(4).open&&journey(4).open<journey(5).open);
for(const open of [.01,.1,.5,1])assert.equal(bridgeMetricScale(open)*bridgeMetricScale(open,true),1);
const force=b=>Math.hypot(...bridgeGradient([2,0,0],b));assert(force(.01)<force(.1)&&force(.1)<force(1),'Opening radius changes curvature, not opacity');
for(const Cls of [BlackHoleRenderer,CpuRenderer])for(const scene of ['bridge-planets','bridge-earth-proxima','bridge']){
 const f=fixture(),canvas=Cls===CpuRenderer?new CpuCommandCanvas():f.canvas;if(Cls===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Cls(canvas,{autoStart:false,bindControls:false});r.loadScene(scene);r.update({grid:true});
 for(const time of scene==='bridge-planets'?[0,3.4,7,18,35,50]:[7,21]){r.time=time;r.fillObjects();r.updateCameraFrame();assert(r.validateFrameGeometry());if(Cls===CpuRenderer){canvas.beginFrame();for(const _ of r.paintStages()){} }else r.render();}
 if(scene==='bridge'&&Cls===BlackHoleRenderer){assert.equal(f.uniforms.get('uBridgeBubble').args[3],0);assert.equal(f.uniforms.get('uWarpStrength').args[0],0);}
 r.dispose();
}
const shader=readFileSync(new URL('../dist/bridge-glsl.js',import.meta.url),'utf8');assert(!shader.includes('mix(bridgeFlatTrace(camera,original,pixelAngle),color+metricColor,blend)'));assert(shader.includes('bodySurface(normal,ray,vec3(.62353,.50588,.44706)'));assert(shader.includes('bridgeBubbleGrid(previous,p,travelled,pixelAngle)'));assert(shader.includes('coordinateGridSegment(previous*throat,p*throat'));
console.log('PASS: growing/closing metric radius, nearby Heighliner, shared Proxima material, impulse bridge travel without warp envelopes, finite CPU/GPU frame geometry at six lifecycle milestones.');

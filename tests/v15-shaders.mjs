import assert from 'node:assert/strict';
import { fixture } from './render-fixture.mjs';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { createFragment } from '../dist/shaders.js';

const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.loadScene('disk');r.render();
assert.equal(r.shaderFeatures().diagnostics,false);
assert(!f.activeSources[1].source.includes('float metricStroke('),'Ordinary scenes do not compile the diagnostic segment solver');
r.update({spectrum:'geometry',grid:false});r.render();
assert.equal(f.uniforms.get('uSpectrum').args[0],5);
assert.equal(f.uniforms.get('uFlags').args[0],1,'Geometry mode always retains its reference grid');
assert.equal(r.shaderFeatures().diagnostics,true);
assert(!f.activeSources[1].source.includes('captureEdge'),'Geometry uses visible capture without an artificial outline');
r.update({spectrum:'visible',metrics:true,annotations:false,binary:true,secondaryWhiteHole:true,gravitationalWaves:true,waveAmplitude:.7,jetStructure:'knots'});r.time=7;r.render();
assert.equal(f.uniforms.get('uMetricOptions').args[0],0);
assert.equal(f.uniforms.get('uMetricOptions').args[1],.7);
assert.equal(f.uniforms.get('uSceneOptions').args[0],1);
assert.equal(f.uniforms.get('uWhiteHole').args[0],0,'Primary and secondary time orientations stay independent');
assert.equal(Math.floor(f.uniforms.get('uJetStructure').args[0]),1,'Packed velocity leaves the selected jet structure intact');

// Decode the bounded, exact-float payload independently against the renderer's
// physical orbit tangent. This catches decorative headings replacing motion.
function direction(code){
 if(code<.5)return [0,0,0];const n=Math.round(code)-1;
 let x=(n%1024)/1023*2-1,y=Math.floor(n/1024)/1023*2-1,z=1-Math.abs(x)-Math.abs(y);
 if(z<0){const old=x;x=(1-Math.abs(y))*Math.sign(old||1);y=(1-Math.abs(old))*Math.sign(y||1);}
 const length=Math.hypot(x,y,z);return [x/length,y/length,z/length];
}
for(let k=0;k<2;k++){
 const packed=f.uniforms.get('uJetStructure').args[k],actual=direction((packed-Math.floor(packed))*4194304),velocity=r.holeVelocities[k];
 const size=Math.hypot(...velocity);assert(actual.every((x,i)=>Math.abs(x-velocity[i]/size)<.005));
}
r.update({metrics:false,annotations:true});r.render();assert.equal(f.uniforms.get('uMetricOptions').args[0],0,'Locator labels cannot enable physics vectors');
r.dispose();

for(const slots of [6,12]){
 const geometry=createFragment({grid:true,diagnostics:true,derivatives:true,derivativeExtension:true,objectSlots:slots});
 assert(geometry.includes(`uObjects[${slots}]`));
 assert(geometry.includes('#extension GL_OES_standard_derivatives : enable'));
 assert(geometry.includes('metricColor=max(metricColor,trans*diagnosticSegment'));
 assert(!geometry.includes('color=color*vignette+horizonOverlay'),'Unlensed horizon overlay stays removed');
 const bridge=createFragment({bridge:true,grid:true,objectSlots:slots});
 assert(bridge.includes('bridgeTrace(camera,original,pixelAngle)'));
 assert(!bridge.slice(bridge.lastIndexOf('void main()')).includes('force(midP,midV)'),'Bridge keeps its specialized cold path');
 const ordinary=createFragment({objectSlots:slots});
 assert(!ordinary.includes('vec4 attachmentEmissionSegment('),'Unused stellar attachments do not add a per-step loop');
}
console.log('PASS: geometry grid/spectrum coupling, independent locator/metric controls, exact-float physical binary directions, white-hole independence, specialized metric/attachment work, bounded ES1 slots, and exclusive bridge integrator.');

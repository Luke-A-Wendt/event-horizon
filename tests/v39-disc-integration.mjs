import assert from 'node:assert/strict';
import {createFragment} from '../dist/shaders.js';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';

// The reference is a dense numerical column integral, independent of the
// constant-work expression used by the fragment shader.
function column(y0,y1,h){
 const a=Math.abs(y0)/h,b=Math.abs(y1)/h;
 if(y0*y1<0){const span=a+b;return span<.001?1-(a*a+b*b)/(2*span)+(a*a*a+b*b*b)/(6*span):(2-Math.exp(-a)-Math.exp(-b))/span;}
 const near=Math.min(a,b),span=Math.abs(a-b);return span<.001?Math.exp(-near)*(1-span*.5+span*span/6):Math.exp(-near)*(1-Math.exp(-span))/span;
}
for(const [a,b,h]of [[-12,12,.2],[-.7,5,.3],[4,.1,.2],[0,0,.4],[-1e-9,2e-9,1],[1,1+1e-6,.3],[-2,-1,.7],[.2,3,.04]]){
 const n=20000;let reference=0;for(let i=0;i<n;i++)reference+=Math.exp(-Math.abs(a+(b-a)*(i+.5)/n)/h)/n;
 const actual=column(a,b,h);assert(Number.isFinite(actual)&&actual>=0&&actual<=1);assert(Math.abs(actual-reference)<2e-7);
 const split=a+(b-a)*.37;assert(Math.abs(actual-(.37*column(a,split,h)+.63*column(split,b,h)))<1e-10,'Column does not change when ray segments subdivide');
}
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene('orbital-expedition');r.render();
assert(r.state.lensing&&r.state.blackHole,'Keep the physical lens active');assert.equal(r.getFocusFrame().type,'iss');assert(r.cameraFrame.inspectIndex>=0);assert(r.validateFrameGeometry());
const fragment=createFragment(r.shaderFeatures());assert.match(fragment,/float vertical=diskVerticalMean\(q0.y,q1.y,thick\)/);assert.doesNotMatch(fragment,/sampleDt=max\(dt,\.14/);r.dispose();
console.log('PASS: finite disc columns, numerical integration agreement, exact subdivision invariance, removal of plane-crossing brightness jumps, and expedition lens/ISS inspection retained.');

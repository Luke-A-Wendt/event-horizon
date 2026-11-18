import assert from 'node:assert/strict';
import {makePreset} from '../dist/config.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {cpuNebulaColor,cpuNebulaCloudLimit} from '../dist/cpu-renderer.js';
import {fixture} from './render-fixture.mjs';
const state=makePreset('bridge-nebulae'),rgb=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
assert(state.nebulaVolume&&!state.nebulaMulticolor);assert.equal(state.nebulaShape,'filaments');assert.equal(state.bridgeOtherShape,'cloud');
for(let i=0;i<=20;i++){
 const red=rgb(cpuNebulaColor(state,false,i/20)),blue=rgb(cpuNebulaColor(state,true,i/20));
 assert(red[0]>red[1]*1.4&&red[0]>red[2]*2,'Ember chart stays red');assert(blue[2]>blue[0]*1.35&&blue[2]>blue[1],'Ice chart stays blue');
}
const ordinary={...state,bridge:false,nebulaColor:'#ad598e'};assert.equal(cpuNebulaColor(ordinary,false,1),'#ad598e');
const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene('bridge-nebulae');r.render(1000);
const near=f.uniforms.get('uNebulaColor').args[0],far=f.uniforms.get('uBridgeSkyColor').args[0];assert(near[0]>near[2]*5&&far[2]>far[0]*5);assert.equal(f.uniforms.get('uNebulaMulticolor').args[0],0);
assert([3,4,8,12].includes(f.uniforms.get('uNebulaVolumeStyle').args[3]));assert.equal(cpuNebulaCloudLimit({width:224}),4);r.dispose();
console.log('PASS: independent red/blue bridge charts, warm/cold CPU cloud highlights, correct GPU chart colors, and unchanged cloud sample budgets.');

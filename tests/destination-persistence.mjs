import assert from 'node:assert/strict';
import {installAnnotations} from '../dist/annotations.js';
let layer;globalThis.document={createElementNS(){return layer={style:{},setAttribute(){},remove(){}};}};
const ui=installAnnotations({append(){},getBoundingClientRect:()=>({width:400,height:650})},()=>null);
const dest={id:'moon',name:'Moon',type:'moon',position:[0,0,1]},f={kind:'annotation-frame',annotations:true,destinationId:'moon',destinationBearing:dest,objectFrames:[],holes:[],cameraFrame:{observer:[0,0,0],forward:[0,0,1],right:[1,0,0],up:[0,1,0]}};
for(const [p,hint] of [[[0,0,1],'line of sight'],[[5,0,1],'off screen'],[[0,0,-1],'behind you']]){dest.position=p;ui.update(f);assert(!layer.innerHTML.includes(hint));assert(layer.innerHTML.includes('>Destination</text>'));assert(layer.innerHTML.includes('>Moon</text>'));}
f.objectFrames=[{...dest,position:[0,0,1],anchor:{x:0,y:0,z:1},radius:.001}];ui.update(f);assert.equal(layer.innerHTML.split('>Moon</text>').length,2);assert(!layer.innerHTML.includes('behind you'));
f.annotations=false;ui.update(f);assert.equal(layer.style.display,'none');ui.dispose();console.log('PASS: destination survives missing, off-screen and rearward projections, returns to one visible label, and respects Labels off.');

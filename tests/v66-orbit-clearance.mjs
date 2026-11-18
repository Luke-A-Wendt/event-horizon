import assert from 'node:assert/strict';
import {orbitClearance} from '../dist/orbit-clearance.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene('warp-orbit');r.fillObjects();const ship=r.objects.find(o=>o.type==='enterprise'),clearance=orbitClearance(r,ship,ship.parentId),frame=r.getFocusFrame(ship.id),parent=r.getFocusFrame(ship.parentId),up=r.configCache.primaryBasis[1];assert(clearance>r.objectRadius(ship)*3);assert(frame.position.reduce((n,v,i)=>n+(v-parent.position[i])*up[i],0)>=clearance-1e-8);r.dispose();
const mock={state:{},massScale:1,objects:[{id:'planet',axialTilt:30},{type:'ring',parentId:'planet',radius:10}],objectRadius:o=>o.radius||1};assert(orbitClearance(mock,{type:'shuttle'},'planet')>9);assert.equal(orbitClearance(mock,{type:'shuttle'},'other'),0);console.log('PASS disk clearance, tilted ring envelope and unchanged ringless systems');

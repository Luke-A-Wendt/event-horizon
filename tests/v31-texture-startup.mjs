import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {PlanetTextureCache} from '../dist/planet-textures.js';
import {PLANET_TEXTURE_DATA} from '../dist/planet-texture-data.js';
import {RenderHost} from '../dist/render-host.js';
import {LatestStateMailbox} from '../dist/render-state.js';
const original=globalThis.createImageBitmap;
let resolve;
globalThis.createImageBitmap=()=>new Promise(done=>{resolve=done;});
const f=fixture(),errors=[],r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false,onError:e=>{if(e)errors.push(e);}});
r.loadScene('solar-system');r.render(1);
assert(f.draws>0,'A complete procedural scene is drawn while included maps decode');
assert(r.planetTextures.pending);assert.equal(r.getState().surfaceRefining,true);
r.planetTextures.error=new Error('Simulated decode failure');const before=f.draws;r.render(50);
assert(f.draws>before);assert.equal(errors.length,0);assert(r.getState().surfaceWarning.includes('procedural'));
r.dispose();resolve({width:1024,height:1024,close(){}});await new Promise(done=>setTimeout(done,0));
const decoded=[];globalThis.createImageBitmap=async(_,options)=>{decoded.push(options.resizeWidth);return {width:options.resizeWidth,height:options.resizeWidth/2,close(){}};};
const c=new PlanetTextureCache(f.gl);await c.ensure(1,{maxSize:512});assert.equal(c.focusSize,512);assert(decoded.every(w=>w<=512));
await c.ensure(1,{maxSize:256});assert.equal(c.focusSize,512);assert.equal(decoded.length,2);
await c.ensure(1,{maxSize:1024});assert.equal(c.focusSize,1024);c.dispose();
// A deferred hosted data script can arrive after a paused scene has rendered.
// Its arrival must bypass the unchanged-scene optimization, exactly once.
const hf=fixture(),host=new BlackHoleRenderer(hf.canvas,{autoStart:false,bindControls:false}),sent=[];
host.loadScene('solar-system');host.workerReady=true;host.workerAssetsSent=false;host.hostViewport={width:640,height:400,dpr:1};host.mailbox=new LatestStateMailbox(message=>sent.push(message));
const atlas=PLANET_TEXTURE_DATA.atlas;PLANET_TEXTURE_DATA.atlas='';let requested=0;globalThis.__EVENT_HORIZON_LOAD_PLANETS=()=>{requested++;};
try{
 RenderHost.prototype.queueSnapshot.call(host);assert.equal(requested,1);assert.equal(sent.length,1);assert.equal(sent[0].assets,undefined);assert.equal(host.workerAssetsSent,false);
 host.mailbox.acknowledge(1);PLANET_TEXTURE_DATA.atlas=atlas;
 RenderHost.prototype.queueSnapshot.call(host);assert.equal(sent.length,2);assert.equal(sent[1].assets.atlas,atlas);assert.equal(host.workerAssetsSent,true);
 host.mailbox.acknowledge(2);RenderHost.prototype.queueSnapshot.call(host);assert.equal(sent.length,2);
 host.cpu=true;PLANET_TEXTURE_DATA.atlas='';RenderHost.prototype.queueSnapshot.call(host);assert.equal(requested,1,'CPU does not request detailed surface bytes');
}finally{PLANET_TEXTURE_DATA.atlas=atlas;delete globalThis.__EVENT_HORIZON_LOAD_PLANETS;host.dispose();}
if(original)globalThis.createImageBitmap=original;else delete globalThis.createImageBitmap;
console.log('PASS: complete first frame during map decode, soft map-failure fallback, viewport-bounded decode, later detail upgrade, deferred data reaches paused worker exactly once.');

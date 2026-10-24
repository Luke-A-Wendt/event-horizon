import { readFileSync } from 'node:fs';
import { fixture } from './render-fixture.mjs';
import { BlackHoleRenderer } from '../dist/renderer.js';
const options=process.argv[2]?JSON.parse(readFileSync(process.argv[2],'utf8')):{};
const f=fixture(options),errors=[];
const renderer=new BlackHoleRenderer(f.canvas,{onError:e=>{if(e)errors.push(e)}});
renderer.loadScene(options.preset||'disk');
renderer.update({...options.state,paused:true});
if (options.warpScenario) {
 renderer.loadWarpScenario(options.warpScenario);
 renderer.update({...options.state,paused:true});
}
for (const object of options.objects || []) {
 const placed=renderer.addObject(object.type, object.radius, object.phase, object.scale);
 if(placed && object.height!==undefined) renderer.updateObject(placed.id,{height:object.height});
}
renderer.setQuality(options.quality||'high');
if(options.resetCamera)renderer.resetCamera();
if(options.distanceRg)renderer.setDistanceRg(options.distanceRg);
if(options.focusIndex!==undefined){const object=renderer.getObjects()[options.focusIndex];if(object)renderer.focusObject(object.id,options.focusMode||'track');}
if(options.focusDistance!==undefined)renderer.target.focusDistance=options.focusDistance;
if(options.look)renderer.look(options.look);
if(options.yaw!==undefined)renderer.target.yaw=options.yaw;
if(options.pitch!==undefined)renderer.target.pitch=options.pitch;
for(let i=0;i<(options.frames??160);i++)f.step(renderer,1000+i*(options.frameIntervalMs??16.667));
renderer.time=options.time??3;
renderer.render();
if(errors.length)throw Error(errors.join('\n'));
console.log(JSON.stringify({sources:f.activeSources,uniforms:Object.fromEntries(f.uniforms),width:f.canvas.width,height:f.canvas.height,state:renderer.getState()}));
renderer.dispose();

import assert from 'node:assert/strict';
import {captureTransferPath} from '../dist/transfer-path.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';

// Broadside looking down the Y axis; X maps to the horizontal and Z up.
const frame=[[1,0,0],[0,1,0],[0,0,1]],craft={id:'ship',type:'shuttle',position:[0,0,0],frame,radius:1};
const view={origin:[0,0,0],observer:[0,10,0],forward:[0,-1,0],right:[1,0,0],up:[0,0,1],aspect:1,fov:1,width:600,height:600,bodies:[],holes:[],occluders:[],lensing:false,hideIndex:-1};
const polys=captureTransferPath({cameraFrame:view,getFocusFrame:()=>craft,travelPreview:{craftId:'ship',pathPoints:[[-RG,0,0],[RG,0,0]]}},view).craftSilhouette;
function hidden(x,z){return polys.some(poly=>poly.every((a,i)=>{const b=poly[(i+1)%poly.length];return (b.x-a.x)*(z/10-a.y)-(b.y-a.y)*(x/10-a.x)>=-1e-12;}));}
assert(hidden(.45,.5)&&hidden(0,.84),'Both the deck edge and glass nose occlude a path');
assert(!hidden(.42,-.5),'A path stays visible where the old delta wings would be');
assert(hidden(.13,-.8)&&!hidden(.4,-.8),'Only the new bells mask the path aft');

const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
try{
 r.loadScene('shuttle-space');const active=r.objects.find(o=>o.type==='shuttle'),legacy=r.addChildObject('space','heritageShuttle');
 r.focusTarget(active.id,'onboard');r.render();
 const [x,y,z]=r.cameraFrame.inspectCamera,rad=Math.hypot(x,y),angle=Math.atan2(y,x);
 assert(z>.685 && (rad/.405)**2+((z-.68)/.18)**2<1,'Eye is above the floor and under the transparent dome');
 assert(rad*Math.abs(Math.sin(8*angle))*.125>.004&&Math.min(Math.abs(rad-.237),Math.abs(rad-.352))>.004,'Default forward view is through a clear pane');
 assert.equal(f.uniforms.get('uCockpitMode').args[0],1);
 r.focusTarget(legacy.id,'onboard');r.render();
 assert.deepEqual(r.cameraFrame.inspectCamera,[0,.28,.65]);assert.equal(f.uniforms.get('uCockpitMode').args[0],0);
 assert.equal(r.setFreeDrive(legacy.id,true),false,'Heritage object does not take the navigable slot');
}finally{r.dispose();}
console.log('PASS: Meridian circular route mask, pressurized upper-deck eye and independent heritage camera.');

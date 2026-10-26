import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer,cpuVisibleBodies} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {dysonShellHit,dysonHabitableRadius,dysonIllumination,stellarLuminositySolar,ASTRONOMICAL_UNIT} from '../dist/dyson.js';
import {STELLAR_CLASSES} from '../dist/stellar-physics.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {createFragment,VERTEX} from '../dist/shaders.js';

assert.equal(dysonHabitableRadius({type:'star',massSolar:1}),ASTRONOMICAL_UNIT);
assert.equal(dysonIllumination({type:'star',massSolar:1},ASTRONOMICAL_UNIT),1);
assert.equal(dysonIllumination({type:'star',massSolar:1,collapsed:true},ASTRONOMICAL_UNIT),0);
const luminosity=style=>stellarLuminositySolar({type:'star',starStyle:style,...STELLAR_CLASSES[style]});
for(const style of Object.keys(STELLAR_CLASSES))assert(luminosity(style)>0&&Number.isFinite(luminosity(style)));
assert(luminosity('dwarf')<.01,'The red-dwarf class is cool and faint');
assert(luminosity('whitedwarf')>.003&&luminosity('whitedwarf')<.01,'A compact hot white dwarf remains bolometrically faint');
assert(luminosity('supergiant')>1e4,'The blue-supergiant class is hot and luminous');
assert(dysonHabitableRadius({type:'star',starStyle:'dwarf',...STELLAR_CLASSES.dwarf})<.1*ASTRONOMICAL_UNIT);
assert(dysonHabitableRadius({type:'star',starStyle:'supergiant',...STELLAR_CLASSES.supergiant})>100*ASTRONOMICAL_UNIT);
const front=dysonShellHit([0,0,3],[0,0,-1],0);
assert.equal(front.t,2);assert.equal(front.inside,false);
const far=dysonShellHit([0,0,3],[0,0,-1],.38);
assert.equal(far.t,4);assert.equal(far.inside,true);
assert.equal(dysonShellHit([0,0,0],[0,0,1],.38),null,'Cutaway opens to the sky from inside');
assert.equal(dysonShellHit([0,0,0],[0,0,-1],.38).inside,true);
assert.equal(dysonShellHit([0,0,3],[0,1,0]),null);
assert.equal(dysonShellHit([0,0,3],[0,0,-1],0,1),null,'Foreground segment cannot intersect distant shell');

for(const Renderer of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture({width:480,height:320}),canvas=Renderer===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(Renderer===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Renderer(canvas,{autoStart:false,bindControls:false});r.loadScene('empty-space');
 const star=r.addChildObject('space','star',{name:'Helios',massSolar:1,radiusMeters:696340000,angularVelocity:0,x:1e11,y:2e10,z:-4e10});
 assert(star);assert(!r.canParentObject('dyson','space').ok);
 const shell=r.addChildObject(star.id,'dyson',{name:'Habitat'});assert(shell);
 assert.equal(shell.radiusMeters,ASTRONOMICAL_UNIT);assert.equal(shell.massSolar,0);
 assert(!r.canParentObject('dyson',star.id).ok,'Only one shell per central body');
 assert(!r.canParentObject('planet',shell.id).ok,'The shell is a leaf attachment');
 assert(!r.getOrbitEditInfo(shell.id).editable,'Concentric center has no nonzero orbital-radius control');
 r.fillHoles();r.fillObjects();let sf=r.getFocusFrame(shell.id),st=r.getFocusFrame(star.id);
 assert.deepEqual(sf.position,st.position);
 r.updateObject(shell.id,{orbitMeters:1e14,height:20,radius:50});sf=r.getFocusFrame(shell.id);st=r.getFocusFrame(star.id);
 assert.deepEqual(sf.position,st.position,'Legacy orbital controls cannot displace the shell');
 r.focusTarget(shell.id,'onboard',false,true);r.updateCameraFrame();
 assert.equal(r.cameraFrame.hideIndex,-1,'Interior camera does not hide the habitat surface');
 assert(Math.hypot(...r.cameraFrame.observer.map((v,i)=>v-sf.position[i]))<sf.radius);
 assert(r.renderObjects.some(o=>o.id===shell.id),'Enclosing shell remains in the visible object slots');
 assert(cpuVisibleBodies(r.objectFrames,r.cameraFrame,480,320,shell.id).some(o=>o.id===shell.id),'CPU retains the enclosure even when its center is behind the view');
 assert(r.validateFrameGeometry());
 r.updateStellar(star.id,{radiusMeters:1000,angularVelocity:0});
 assert(r.getFocusFrame(star.id).collapsed);
 assert.equal(r.getFocusFrame(shell.id).bodyParams[1],0,'Collapsing star removes stellar interior illumination');
 assert.deepEqual(r.getFocusFrame(shell.id).position,r.getFocusFrame(star.id).position);
 r.updateObject(shell.id,{radiusMeters:2*ASTRONOMICAL_UNIT});
 assert(Math.abs(r.getFocusFrame(shell.id).radius*REFERENCE_RG_METERS-2*ASTRONOMICAL_UNIT)<1e-3);
 r.update({spectrum:'geometry'});assert(r.validateFrameGeometry());
 if(Renderer===CpuRenderer){canvas.beginFrame();for(const _ of r.renderStages(1000,false,true)){}assert(canvas.takeFrame().commands.length>0);}
 r.removeTreeObject(star.id);assert(!r.objects.some(o=>o.id===shell.id),'Deleting the parent removes its shell');r.dispose();
}
const cases=[];
for(const webgl2 of [false,true])for(const detail of [{},{ultra:true},{photo:true,photoSteps:1024}]){
 const features={dyson:true,stellar:true,bodyGravity:true,rings:true,attachments:true,craft:true,planetary:true,derivatives:true,derivativeExtension:!webgl2,...detail};
 let vertex=VERTEX,fragment=createFragment(features);
 assert.match(fragment,/vec4 dysonSurfaceHit/);assert.match(fragment,/kind<8\.5\|\|kind>10\.5/,'Shell is never mistaken for a polar jet');
 if(webgl2){vertex='#version 300 es\n'+vertex.replace('attribute','in');fragment='#version 300 es\n'+fragment.replace('precision highp float;','precision highp float;\nout vec4 outColor;').replaceAll('gl_FragColor','outColor');}
 cases.push({name:`Dyson/WebGL${webgl2?2:1}/${detail.photo?'photo':detail.ultra?'ultra':'normal'}`,vertex,fragment});
}
const compile=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:2*1024*1024,timeout:180000});
if(compile.error?.code==='ENOENT')console.log('SKIP: Python unavailable; native shader compilation not run.');
else{if(compile.stdout)process.stdout.write(compile.stdout);if(compile.stderr)process.stderr.write(compile.stderr);assert(!compile.error,compile.error?.message);assert([0,77].includes(compile.status));}
console.log('PASS: hollow shell exterior/interior/cutaway intersections, physical habitable radius, concentric parenting, collapse illumination, GPU/CPU visibility and native GLSL variants.');

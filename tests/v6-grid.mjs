// Grid contracts use conservation/limits and the actual renderer's uniforms.
// Image alignment/lensing itself is verified separately with native GPU renders.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { DEFAULTS, SCENE_PRESETS } from '../dist/config.js';
import { gridMaterialRadius, gridInfallVelocity, gridSpinAngularRate } from '../dist/grid-glsl.js';
import { createFragment } from '../dist/shaders.js';
import { fixture } from './render-fixture.mjs';
const near=(a,b,tolerance=1e-7)=>assert(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);

// Independently integrate the stated free-fall velocity. The advected material
// label must remain constant as the marker falls, with no angular flow at a*=0.
for(const start of [4,10,40]){
 const label=gridMaterialRadius(start,0),speed=2;
 const position=time=>Math.pow(Math.pow(label,1.5)-1.5*Math.SQRT2*speed*time,2/3);
 for(const time of [.01,.1,.4]){
  const radius=position(time),epsilon=1e-5;
  assert(radius<start);near(gridMaterialRadius(radius,time),label);
  near((position(time+epsilon)-position(time-epsilon))/(2*epsilon),gridInfallVelocity(radius),1e-6);
  assert.equal(gridSpinAngularRate(radius,0),0);
  assert(gridSpinAngularRate(radius,.98)>0);near(gridSpinAngularRate(radius,-.98),-gridSpinAngularRate(radius,.98));
 }
}
assert(Math.abs(gridInfallVelocity(1e12))<1e-5,'Radial flow must tend to zero far from the hole');
assert(Math.abs(gridSpinAngularRate(5000,.98))<1e-10,'Spin cue must vanish asymptotically');
assert(Math.abs(gridInfallVelocity(8))>.5,'Near-field infall should remain visibly animated at display speed');

const f=fixture(),r=new BlackHoleRenderer(f.canvas);
const flags=enabled=>{
 r.render();assert.equal(r.state.grid,enabled);assert.equal(r.state.warpGrid,enabled);
 assert.equal(f.uniforms.get('uFlags').args[0],Number(enabled));assert.equal(f.uniforms.get('uWarpFlags').args[2],Number(enabled));
};
assert.equal(DEFAULTS.grid,false);assert.equal(DEFAULTS.warpGrid,false);flags(false);
for(const scene of SCENE_PRESETS){
 r.loadScene(scene.id);assert.equal(r.state.grid,r.state.warpGrid,`${scene.id} must load one coherent grid state`);
 for(const control of ['grid','warpGrid']){r.update({[control]:true});flags(true);r.update({[control]:false});flags(r.state.spectrum==='geometry');}
}
for(const scenario of ['isolated','orbit','excursion']){
 r.loadWarpScenario(scenario);assert.equal(r.state.grid,r.state.warpGrid);
 r.update({spectrum:'visible'});
 r.update({warpGrid:false});flags(false);r.update({grid:true});flags(true);
 // A binary is meaningful only with the black-hole spacetime enabled; isolated
 // open-space contexts deliberately suppress black-hole-only components.
 r.update({blackHole:true,binary:true,primaryTilt:73,primaryAzimuth:41,secondaryTilt:124,secondaryAzimuth:-19});r.time=13;r.render();
 const holes=f.uniforms.get('uHoles[0]').args[0],origin=f.uniforms.get('uWorldOrigin').args[0];near(holes[1]+origin[1],0,Math.max(1e-7,Math.abs(origin[1])*1e-7));near(holes[5]+origin[1],0,Math.max(1e-7,Math.abs(origin[1])*1e-7));
 assert.notEqual(holes[0],holes[4],'Distinct binary centers must remain available to the common grid');
}
r.dispose();

// Prevent the costly, unbent duplicate overlays from returning. The regular
// and Ultra variants must both use the existing curved ray segments instead.
for(const features of [{},{craft:true},{warp:true},{ultra:true,warp:true}]){
 const shader=createFragment({...features,grid:true});
 assert(shader.includes('coordinateGridSegment(previous,p,travelled,pixelAngle)'));
 assert(shader.includes('coordinateGridEscape(p,unit(v),travelled,pixelAngle)'));
 assert(!/connectedGrid\(|gridResidual\(|warpGridOverlay\(/.test(shader),'Grid must not run an independent straight-ray overlay');
 assert(shader.includes('p-uHoles[k].xyz'),'Each hole must distort grid coordinates around its actual center');
 const main=shader.slice(shader.lastIndexOf('void main()'));
 assert(!/uFlags\.x[^;\n{}]*!localWarp\b|!localWarp\b[^;\n{}]*uFlags\.x/.test(main),'Inspecting a local warp field must retain the black-hole grid behind it');
 if(features.warp){
  assert(shader.includes('grid*=1.0-smoothstep(1.6,2.5,length(hit.xz))'),'The local warp guide must be bounded when combined with the global black-hole guide');
  assert(main.includes('else if(uWarpFlags.w<.5)miss=true;'),'Only an isolated warp view may skip the black-hole ray continuation');
 }
}
const shaderSource=readFileSync(new URL('../dist/shaders.js',import.meta.url),'utf8');
assert(!shaderSource.includes('coordinateGridEscape(camera,original'),'Far continuation must start after the curved ray');
console.log('PASS: radial infall conservation, exact zero-spin angular flow, visible near/fading far motion, unified grid aliases across all scenes, shared binary centers, and reuse of curved ray segments.');

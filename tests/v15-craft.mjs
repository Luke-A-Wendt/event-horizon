const SHUTTLE_COCKPIT_EYE=[0,.28,.65];
import assert from 'node:assert/strict';
import { CRAFT_GLSL } from '../dist/craft-glsl.js';
import { COCKPIT_GLSL, SHUTTLE_COCKPIT_EYE as LEGACY_COCKPIT_EYE } from '../dist/cockpit-glsl.js';
import { fixture } from './render-fixture.mjs';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { snapshotRenderer, restoreRenderer } from '../dist/render-state.js';

// The physical pilot/right seat is -x when forward is +z and up is +y:
// right = forward × up. The central console must appear to the viewer's left.
assert(LEGACY_COCKPIT_EYE[0]<0);
const cabin=CRAFT_GLSL.slice(CRAFT_GLSL.indexOf('vec4 shuttleCabinHit'),CRAFT_GLSL.indexOf('// Closed tapered engine bell'));
assert(!cabin.includes('vec3(0,1,0)'),'No horizontal roof clip can reintroduce the old flat forebody cap');
const shape=cabin.match(/center=vec3\(([^)]+)\),radii=vec3\(([^)]+)\)/);
const center=shape[1].split(',').map(Number),radii=shape[2].split(',').map(Number);
assert(LEGACY_COCKPIT_EYE.reduce((sum,v,i)=>sum+((v-center[i])/radii[i])**2,0)<1,'Pilot eye remains physically inside the curved exterior cabin');
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
// Boresight, angled forward, and lateral viewing rays really pass through
// their respective glazing openings in the shader's shared physical frame.
for(const [ray,normal,offset,bounds] of [
 [[0,0,1],[0,1,.8],.580,p=>p[1]>.091&&p[1]<.141&&Math.abs(p[0])>.0045&&Math.abs(p[0])<.052],
 [[-.4,0,1],[-.70,.85,.80],.611,p=>p[1]>.088&&p[1]<.136&&Math.abs(p[0])>.057&&Math.abs(p[0])<.121],
 [[-1,0,0],[-1,0,0],.127,p=>p[2]>.421&&p[2]<.515&&p[1]>.081&&p[1]<.131],
]){
 const t=(offset-dot(normal,LEGACY_COCKPIT_EYE))/dot(normal,ray);
 assert(t>0);assert(bounds(LEGACY_COCKPIT_EYE.map((v,i)=>v+ray[i]*t)),'Forward/corner/side window is unobstructed at the pilot eye height');
}
assert(COCKPIT_GLSL.includes('if(s.material<0.0)return vec4(environment,0)'),'Clear glazing transmits the actual scene');
assert(!/sampler2D|texture2D|https?:/.test(CRAFT_GLSL+COCKPIT_GLSL));
for(const quality of ['low','high']){
 const f=fixture(),r=new BlackHoleRenderer(f.canvas);r.loadScene('nasa-shuttle');r.setQuality(quality);
 const shuttle=r.objects.find(o=>o.type==='shuttle');r.focusObject(shuttle.id,'onboard');r.render();
 assert.deepEqual(f.uniforms.get('uInspectCamera').args[0],SHUTTLE_COCKPIT_EYE);
 const shader=f.activeSources.find(s=>s.type===f.gl.FRAGMENT_SHADER).source;
 assert(!shader.includes('cockpitInstrument')&&!shader.includes('cockpitSwitches'));
 const saved=snapshotRenderer(r),g=fixture(),copy=new BlackHoleRenderer(g.canvas);restoreRenderer(copy,saved);copy.render();
 assert.deepEqual(g.uniforms.get('uInspectCamera').args[0],SHUTTLE_COCKPIT_EYE,'Right seat survives worker/camera snapshot transfer');
 copy.dispose();r.dispose();
}
console.log('PASS: curved shuttle roof, physically contained right-seat eye, clear forward/corner/side window rays, active low/high cockpit and camera snapshot transfer. Native exterior/cockpit render QA is separate.');

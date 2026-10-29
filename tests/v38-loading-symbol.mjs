import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadingOrbitSample, LOADING_VISUAL_WORKER_SOURCE } from '../dist/loading-visual.js';

// Near-side motion remains one image; rear-side light paths bend around
// opposite sides of the shadow, returning to the same limb without jumps.
const near = loadingOrbitSample(.25), rear = loadingOrbitSample(.75);
assert.deepEqual(near, [[64,43,1],[64,43,0]]);
assert(Math.abs(rear[0][0]-64)<1e-10);
assert.equal(rear[0][1],13); assert.equal(rear[1][1],57);
assert.equal(rear[0][2],1); assert.equal(rear[1][2],1);
for(let i=1;i<100;i++){
 const p=loadingOrbitSample(.5+i/200);
 for(const [x,y] of p)assert(Math.hypot(x-64,y-35)>13,'Rear images must remain outside the shadow');
}
const epsilon=1e-6;
for(const seam of [.5,1]){
 const before=loadingOrbitSample(seam-epsilon),at=loadingOrbitSample(seam),after=loadingOrbitSample(seam+epsilon);
 for(let axis=0;axis<2;axis++){
  assert(Math.abs(before[0][axis]-after[0][axis])<.001);
  const incoming=(at[0][axis]-before[0][axis])/epsilon,outgoing=(after[0][axis]-at[0][axis])/epsilon;
  assert(Math.abs(incoming-outgoing)<.01,'Primary image velocity must join continuously');
 }
 assert(before[1][2]<1e-8&&after[1][2]<1e-8,'Secondary image disappears smoothly at the join');
}

// The independent worker uses the exact same image positions and alpha.
let now=3000;const dots=[];
const ctx=new Proxy({globalAlpha:1,arc(x,y,r){if(r===2)dots.push([x,y,this.globalAlpha]);}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
const self={close(){}},scope={self,performance:{now:()=>now},Date:{now:()=>now},Math,Error,setTimeout(){return 1;},clearTimeout(){}};
vm.runInNewContext(LOADING_VISUAL_WORKER_SOURCE,scope);
self.onmessage({data:{type:'init',canvas:{getContext:()=>ctx}}});dots.length=0;
self.onmessage({data:{type:'state',running:true,elapsedMs:3000,revision:1,sentAt:now}});
assert.equal(dots.length,2);
for(let i=0;i<2;i++)for(let k=0;k<3;k++)assert(Math.abs(dots[i][k]-rear[i][k])<1e-9);

const js=readFileSync(new URL('../dist/loading-visual.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
const symbol=js.match(/const loadingSymbolMarkup='([^']+)';/)[1];
assert(html.includes(symbol),'Before-JS bootstrap and runtime fallback use the same symbol');
assert.equal((symbol.match(/<path /g)||[]).length,3,'Two rear branches and one normal front arc');
assert(!symbol.includes('<ellipse'));
assert(!LOADING_VISUAL_WORKER_SOURCE.includes('ctx.ellipse'));
assert(css.includes('@keyframes loading-lensed-primary'));
assert(css.includes('@keyframes loading-lensed-secondary'));
assert(css.includes('loading-lensed-primary 4s linear infinite'));
console.log('PASS: single near-side star, split lensed rear images, continuous joins, shadow clearance, and matched worker/compositor/bootstrap geometry.');

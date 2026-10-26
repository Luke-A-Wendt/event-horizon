import assert from 'node:assert/strict';
import {cancellationMasses,illustrativeCancellationPair} from '../dist/compact-merger.js';
const close=(a,b)=>assert(Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a),Math.abs(b)),`${a} ≠ ${b}`);

// No change before contact; half overlap removes half each equal mass;
// complete overlap reaches an exact zero rather than a tiny optical remnant.
for(const mass of [1e-8,1,6.5,1e8]){
 const contact=4*mass;
 assert.deepEqual(cancellationMasses(mass,mass,contact*2,contact),{primary:mass,secondary:mass,overlap:0,removedEach:0,remainingFraction:1,flat:false});
 const half=cancellationMasses(mass,mass,contact/2,contact);close(half.primary,mass/2);close(half.secondary,mass/2);close(half.overlap,.5);
 const end=cancellationMasses(mass,mass,0,contact);assert.equal(end.primary,0);assert.equal(end.secondary,0);assert.equal(end.remainingFraction,0);assert(end.flat);
}

for(const spin of [0,.65,.86,.998]){
 let previousMass=Infinity,previousSeparation=Infinity;
 for(let i=0;i<=1000;i++){
  const p=i/1000,r=illustrativeCancellationPair({primaryMass:6.5,secondaryMass:6.5,primarySpin:spin,secondarySpin:spin,initialSeparation:156,progress:p});
  assert(r.primary<=previousMass&&r.separation<=previousSeparation);assert(r.primary>=0&&r.secondary>=0);close(r.primary,r.secondary);
  assert(Object.values(r).every(x=>typeof x!=='number'||Number.isFinite(x)));
  if(r.separation>=r.contactSeparation)assert.equal(r.primary,6.5);
  if(p<1)assert(!r.complete);else{assert(r.complete&&r.flat);assert.equal(r.separation,0);assert.equal(r.separationRate,0);}
  previousMass=r.primary;previousSeparation=r.separation;
 }
}

// If the user edits the pair away from equality, cancellation removes only
// matching mass. The heavier body's excess and original polarity survive.
for(const [a,b]of [[3,1],[1,3]]){
 const r=illustrativeCancellationPair({primaryMass:a,secondaryMass:b,progress:1});
 assert.equal(r.primary,Math.max(0,a-b));assert.equal(r.secondary,Math.max(0,b-a));assert(!r.flat);assert(r.complete);
}
const params={primaryMass:2,secondaryMass:2,primarySpin:.8,secondarySpin:.4,initialSeparation:48,progress:.9};
const original=illustrativeCancellationPair(params),scaled=illustrativeCancellationPair({...params,primaryMass:20,secondaryMass:20,initialSeparation:480});
close(scaled.primary,original.primary*10);close(scaled.overlap,original.overlap);close(scaled.separation,original.separation*10);
assert(illustrativeCancellationPair({progress:2}).flat);assert.equal(illustrativeCancellationPair({progress:-1}).progress,0);
console.log('PASS: illustrative mixed-hole overlap fade is linear, monotonic, scale independent, exact-zero for equal masses, preserves unequal residuals, and has a finite smooth center trajectory.');

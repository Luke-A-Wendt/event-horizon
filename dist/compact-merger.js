// An explicitly fictional overlap-to-flat comparison, not a GR collision
// solution. A white hole has positive mass; time reversal does not turn its
// gravitational mass negative. Only the curated cancellation example uses
// this rule. Ordinary binaries/black-hole mergers retain their usual masses.
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const positive=n=>Number.isFinite(n)?Math.max(0,n):0;
const horizon=(mass,spin)=>mass*(1+Math.sqrt(Math.max(0,1-clamp(Number(spin)||0,-1,1)**2)));

// Measure overlap against the ORIGINAL horizons. Using shrinking horizons
// would remove the overlap which caused the fade, leaving a stalled remnant.
// Equal masses lose the same fraction linearly with overlap. Edited unequal
// masses retain their unmatched excess; no mass becomes negative.
export function cancellationMasses(primaryMass,secondaryMass,separation,contactSeparation){
 const a=positive(primaryMass),b=positive(secondaryMass),distance=positive(separation),contact=positive(contactSeparation);
 const overlap=contact>0?clamp(1-distance/contact,0,1):(distance===0?1:0),removedEach=Math.min(a,b)*overlap;
 const primary=a-removedEach,secondary=b-removedEach;
 return {primary,secondary,overlap,removedEach,remainingFraction:a+b>0?(primary+secondary)/(a+b):0,flat:primary===0&&secondary===0};
}

// The two centers follow a prescribed smooth inspiral ending at coincidence.
// separationRate is per unit progress, not per second; the caller divides it
// by the configured duration when deriving displayed velocity vectors.
export function illustrativeCancellationPair({primaryMass=1,secondaryMass=1,primarySpin=0,secondarySpin=0,initialSeparation=24,progress=0}={}){
 const a=positive(primaryMass),b=positive(secondaryMass),p=clamp(Number.isFinite(progress)?progress:0,0,1),start=positive(initialSeparation);
 const smooth=p*p*(3-2*p),separation=start*(1-smooth),separationRate=p>0&&p<1?-6*start*p*(1-p):0;
 const contactSeparation=horizon(a,primarySpin)+horizon(b,secondarySpin),masses=cancellationMasses(a,b,separation,contactSeparation),total=a+b;
 return {...masses,progress:p,separation,separationRate,contactSeparation,primaryOrbitFraction:total>0?b/total:.5,secondaryOrbitFraction:total>0?a/total:.5,complete:p>=1};
}

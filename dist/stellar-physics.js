/* Compactness controls are a geometric comparison, not a stellar equation of
 * state, collapse solver, or reversible astrophysical evolution. */
export const SOLAR_RG_METERS=1476.62504;
export const LIGHT_SPEED=299792458;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const STELLAR_CLASSES={
 main:{label:'Main sequence',massSolar:1,radiusMeters:696340000,angularVelocity:2.9e-6,color:'#ffe2af',spots:.22,corona:.3},
 redgiant:{label:'Red giant',massSolar:1.5,radiusMeters:5e10,angularVelocity:1e-8,color:'#ff7949',spots:.3,corona:.4},
 dwarf:{label:'Red dwarf',massSolar:.15,radiusMeters:1.4e8,angularVelocity:7e-5,color:'#ff6d43',spots:.6,corona:.7},
 neutron:{label:'Neutron star',massSolar:1.4,radiusMeters:12000,angularVelocity:60,color:'#adcfff',spots:.1,corona:.4},
 protostar:{label:'Protostar',massSolar:.7,radiusMeters:2e9,angularVelocity:1e-5,color:'#ffc48a',spots:.6,corona:.8},
 supergiant:{label:'Blue supergiant',massSolar:30,radiusMeters:2e10,angularVelocity:1e-6,color:'#accbff',spots:.2,corona:.6},
 whitedwarf:{label:'White dwarf',massSolar:.6,radiusMeters:7e6,angularVelocity:.002,color:'#e9f3ff',spots:.08,corona:.15},
 tzo:{label:'Thorne–Żytkow Object',massSolar:15,radiusMeters:700*696340000,angularVelocity:1e-9,color:'#ff7949',spots:.72,corona:.3}
};
// Append styles: shader indices and existing scene files keep their meaning.
export const STELLAR_STYLE_IDS=['main','redgiant','dwarf','neutron','protostar','supergiant','whitedwarf','tzo'];
// An illustrative interior of one composite star, never another gravitating
// body. The editable total mass includes this core. These are not measurements
// of a confirmed TZO, nor an equation-of-state or stellar-structure solution.
export const TZO_INTERIOR=Object.freeze({coreMassSolar:1.4,coreRadiusMeters:12000,envelopeTemperatureKelvin:3500});
export function stellarInfo(object={},time=0){
 const defaults=STELLAR_CLASSES[object.starStyle]||STELLAR_CLASSES.main;
 const massSolar=Math.max(1e-12,Number(object.massSolar) || defaults.massSolar),baseRadius=Math.max(.01,(Number(object.radiusMeters)||defaults.radiusMeters)*(Number.isFinite(object.scale)?object.scale:1)),angularVelocity=Number.isFinite(object.angularVelocity)?object.angularVelocity:defaults.angularVelocity;
 let radiusMeters=baseRadius;
 if(object.collapseEnabled){const lo=Math.max(.01,Number(object.collapseRadiusMin)||SOLAR_RG_METERS*massSolar*.8),hi=Math.max(lo,Number(object.collapseRadiusMax)||SOLAR_RG_METERS*massSolar*4),period=Math.max(4,Number(object.collapsePeriod)||30),t=.5+.5*Math.cos(2*Math.PI*time/period);radiusMeters=lo+(hi-lo)*t;}
 const rg=SOLAR_RG_METERS*massSolar,k=object.starStyle==='neutron'?.35:.2;
 const spinParameter=k*radiusMeters*radiusMeters*angularVelocity/(LIGHT_SPEED*rg),canFormKerrHorizon=Math.abs(spinParameter)<=1;
 const horizonMeters=canFormKerrHorizon?rg*(1+Math.sqrt(Math.max(0,1-spinParameter*spinParameter))):0;
 const innerHorizonMeters=canFormKerrHorizon?rg*(1-Math.sqrt(Math.max(0,1-spinParameter*spinParameter))):0;
 // Holding mass and physical Omega fixed, solve x + b² x³ = 2 in x=R/rg.
 const b=k*angularVelocity*rg/LIGHT_SPEED;let lo=0,hi=2;
 for(let i=0;i<60;i++){const x=(lo+hi)/2;if(x+b*b*x*x*x>2)hi=x;else lo=x;}
 const criticalRadiusMeters=rg*(lo+hi)/2,rotationRatio=k*radiusMeters*angularVelocity/LIGHT_SPEED;
 const criticalMassSolar=radiusMeters*(1+rotationRatio*rotationRatio)/(2*SOLAR_RG_METERS);
 const interior=object.starStyle==='tzo'?{...TZO_INTERIOR,envelopeMassSolar:Math.max(0,massSolar-TZO_INTERIOR.coreMassSolar),compatible:massSolar>TZO_INTERIOR.coreMassSolar&&radiusMeters>TZO_INTERIOR.coreRadiusMeters}:null;
 return {massSolar,radiusMeters,baseRadiusMeters:baseRadius,angularVelocity,surfaceSpeedMetersPerSecond:Math.abs(angularVelocity)*radiusMeters,surfaceSpeedFractionC:Math.abs(angularVelocity)*radiusMeters/LIGHT_SPEED,spinParameter,momentOfInertiaFactor:k,gravitationalRadiusMeters:rg,criticalRadiusMeters,criticalMassSolar,compactness:2*rg/radiusMeters,canFormKerrHorizon,thresholdReachable:Math.abs(rotationRatio)<=1,collapsed:canFormKerrHorizon&&radiusMeters<=horizonMeters,horizonMeters,innerHorizonMeters,singularityRadiusMeters:Math.abs(spinParameter)*rg,classLabel:defaults.label,starStyle:object.starStyle||'main',collapseEnabled:!!object.collapseEnabled,interior};
}
export function stellarPatch(object,patch={}){
 const result={...patch};if('radiusMeters'in patch||'starStyle'in patch)result.scale=1;if(patch.starStyle&&patch.starStyle!==object.starStyle&&STELLAR_CLASSES[patch.starStyle])Object.assign(result,STELLAR_CLASSES[patch.starStyle],patch);
 if('massSolar'in result)result.massSolar=clamp(Number(result.massSolar)||1e-6,1e-6,1e12);
 if('radiusMeters'in result)result.radiusMeters=clamp(Number(result.radiusMeters)||.01,.01,1e15);
 if('angularVelocity'in result)result.angularVelocity=clamp(Number(result.angularVelocity)||0,-1e5,1e5);
 delete result.label;return result;
}

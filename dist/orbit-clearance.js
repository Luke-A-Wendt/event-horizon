import {edgeKerrMetric} from './kerr-transfer.js';
import {compactExteriorRadius} from './object-clocks.js';
import {REFERENCE_RG_METERS} from './objects.js';
const RG=REFERENCE_RG_METERS;
export const limitedCrew=type=>type==='shuttle'||type==='astronaut';
export const oneGravityRadius=(type,massSolar)=>limitedCrew(type)?Math.sqrt(1.32712440018e20*Math.max(0,massSolar||0)/9.80665):0;
// Bridge worlds use the same Earth-radius calibration as the trip clock.
export const bridgeMassSolar=far=>(far?1.02:1)*3.00349e-6;
export const bridgeRadiusFloor=(type,far,chartSurface)=>oneGravityRadius(type,bridgeMassSolar(far))*chartSurface/6371000;
// Both lengths use the same units (metres in presets, reference r_g at runtime).
const parkingHeight=(surface,hullRadius)=>surface+Math.max(4*hullRadius,.15*surface);
export function diskParkingHeight(diskThickness,holeRg,hullRadius){
 return parkingHeight(2*Math.max(.1,Number(diskThickness)||.5)*holeRg,hullRadius);
}
// Elevated cinematic parking circles; not unpowered Keplerian orbits.
export function orbitClearance(r,craft,parentId){
 if(!['enterprise','shuttle','iss','classicEnterprise','heritageShuttle','astronaut'].includes(craft?.type)||r.state.bridge)return 0;
 // The edge itinerary is defined in the Kerr equator through the hole.
 // The tilted luminous disc is an emitter, not a supporting surface.
 if(edgeKerrMetric(r,craft,parentId))return 0;
 let height=0;const hull=r.objectRadius(craft);
 if(r.state.blackHole&&r.state.disk&&['primary','secondary'].includes(parentId)){height=diskParkingHeight(r.state.diskThickness,r.massScale,hull);}
 for(const ring of r.objects||[]){if(ring.parentId!==parentId||!['ring','disk'].includes(ring.type))continue;
 if(craft.hullModel==='janusPod'&&craft.orbitMeters>1.05*r.objectRadius(ring)*RG)continue; // circular orbit entirely beyond this ring
 const parent=r.objects.find(o=>o.id===parentId),tilt=(ring.axialTilt??parent?.axialTilt??0)*Math.PI/180;
 height=Math.max(height,parkingHeight(r.objectRadius(ring)*(Math.abs(Math.sin(tilt))+Math.max(.02,ring.thicknessRatio||.015)*2),hull));
 }
 return height;
}

// Playlist radii describe circles in the flight plane. Collision clearance
// is measured from the centre of the hole, including the plane's elevation.
// This preset samples a clock worldline; its drawn hull is not the radial ruler.
export const clockHullMeters=(r,craft,meters)=>r.sceneId==='nasa-shuttle'&&craft.type==='shuttle'?Math.min(.49,meters):meters;
export function compactCircleMinimum(horizon,craftRadius,height=0){
 const exterior=compactExteriorRadius(horizon,craftRadius),h=Math.abs(height);
 return Math.sqrt(Math.max(0,(exterior-h)*(exterior+h)));
}
export function stopMinimumMeters(r,craft,target,heightMeters){
 const f=r.getFocusFrame(target),bodyRadius=(f?.physicalRadius||f?.radius||0)*RG,craftRadius=r.objectRadius(craft)*RG;
 const metric=edgeKerrMetric(r,craft,target);
 if(metric)return 1.01*r.configCache.isco[0]*metric.rg;
 if(!f?.collapsed)return Math.max(1,bodyRadius+craftRadius);
 const height=heightMeters??Math.max(orbitClearance(r,craft,target)*RG,craft.parentId===target?craft.routeParkingHeightMeters||0:0);
 // Round *up* to a millimetre so the km input and a saved itinerary can
 // round-trip the exterior limit without falling a floating-point ulp short.
 return Math.max(1,Math.ceil(compactCircleMinimum((f.horizonRadius||f.radius)*RG,clockHullMeters(r,craft,craftRadius),height)*1000)/1000);
}

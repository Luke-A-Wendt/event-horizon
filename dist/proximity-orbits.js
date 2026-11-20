// Named landmarks are evaluated from the live mass, disc and vehicle, not
// the order of the playlist. Editing or reordering a stop cannot relabel it
// as a physical boundary it no longer represents.
import {REFERENCE_RG_METERS} from './objects.js';
import {orbitClearance,oneGravityRadius,compactCircleMinimum,stopMinimumMeters} from './orbit-clearance.js';
import {closestReturnOrbit} from './travel-routes.js';

const RG=REFERENCE_RG_METERS,cache=new WeakMap();
export function proximityOrbits(r,craft,body){
 if(!body?.collapsed||!craft||!r.objectRadius)return null;
 const mu=1.32712440018e20*body.massSolar,fieldDistance=oneGravityRadius(craft.type,body.massSolar);
 if(!(fieldDistance>0))return null;
 const elevation=Math.max(orbitClearance(r,craft,body.id)*RG,craft.parentId===body.id?craft.routeParkingHeightMeters||0:0);
 const horizon=(body.horizonRadius||body.radius)*RG,hull=r.objectRadius(craft)*RG;
 const disc=r.state.disk&&body.id==='primary'?r.configCache.diskOuter[0]*RG:0;
 const key=[body.id,mu,elevation,horizon,hull,disc,r.state.spin,r.sceneId].join(':');
 const saved=cache.get(r);if(saved?.key===key)return saved.radii;
 const floor=stopMinimumMeters(r,craft,body.id,elevation);
 // The playlist's radius is horizontal; the 1g field and horizon gap
 // refer to true centre distance, including the elevated flight plane.
 const outer=Math.max(floor,Math.sqrt(Math.max(0,(fieldDistance-elevation)*(fieldDistance+elevation))));
 // Keep the full rendered shuttle outside the horizon at the authored stop.
 // The interactive clock comparison still permits a closer reference point.
 const nearHorizon=Math.max(floor,Math.ceil(1000*compactCircleMinimum(horizon,hull,elevation))/1000);
 const radii={outer,stable:r.sceneId==='nasa-shuttle'?floor:null,inner:closestReturnOrbit(mu,outer,floor),disc,horizon:nearHorizon};
 cache.set(r,{key,radii});return radii;
}

export function edgeOrbitName(r,craft,targetId,radius,radii){
 const ref=targetId==='primary'?proximityOrbits(r,craft,r.getFocusFrame?.(targetId)):null;
 if(ref)for(const [key,name]of [['outer','Field orbit'],['inner','Return benchmark'],['disc','Disc edge'],['stable','Innermost stable stop'],['horizon','Horizon approach']]){
  const expected=ref[key];if(expected>0&&Math.abs(radius-expected)<=Math.max(.001,Number.EPSILON*expected*8))return name;
 }
 const ordered=[...new Set(radii)].sort((a,b)=>b-a);
 return ordered.length===1?'Custom orbit':'Custom orbit '+(ordered.indexOf(radius)+1);
}

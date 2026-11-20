import {AU_METERS,SOLAR_RADIUS_METERS,solarBodies} from './solar-catalog.js';

// Chart origins are separate from the local SI orbits: adding a cabin radius
// to a 2.5-million-light-year coordinate would discard the entire cabin.
const asterRadius=4.6e7;
const home=solarBodies().filter(o=>['sun','earth','moon-301'].includes(o.key)).map(o=>o.key==='earth'?{...o,phase:1.05,eccentricity:0,orbitInclination:0,orbitNode:0,argumentPeriapsis:0}:o);
const objects=[
 ...home,
 {key:'m31-lyra',catalogId:'m31-lyra',type:'star',name:'Lyris',parentId:'space',x:0,y:0,z:0,massSolar:.76,radiusMeters:.79*SOLAR_RADIUS_METERS,color:'#ffd39c',starStyle:'main',spots:.18,corona:.22,dataNote:'Fictional orange star in the Andromeda Galaxy. The two system origins are approximately 2.5 million light-years apart.'},
 {key:'aster-vale',catalogId:'aster-vale',type:'planet',name:'Aster Vale',parentKey:'m31-lyra',planetStyle:'gas',surfaceId:26,color:'#61baae',radiusMeters:asterRadius,massSolar:.00038,axialTilt:27,rotationPeriodSeconds:37600,shapeAxes:[1,.947,1],orbitReferenceFrame:'ecliptic',orbitMeters:1.55*AU_METERS,phase:-1.76,height:0,dataNote:'A fictional gas giant in M31. Two icy ring bands surround a jade atmosphere threaded with indigo storm belts.'},
 {key:'aster-inner-ring',catalogId:'aster-inner-ring',type:'ring',name:'Aster Vale · inner veil',parentKey:'aster-vale',radiusMeters:asterRadius*1.69,innerRadiusRatio:1.43/1.69,thicknessRatio:.0015,material:'icy',color:'#c3c5b7',axialTilt:27,opacity:.53},
 {key:'aster-rings',catalogId:'aster-rings',type:'ring',name:'Aster Vale · ribbon ring',parentKey:'aster-vale',radiusMeters:asterRadius*2.035,innerRadiusRatio:1.78/2.035,thicknessRatio:.001,material:'icy',color:'#f5dfb8',axialTilt:27,opacity:.86},
 {key:'cinder',catalogId:'cinder',type:'moon',name:'Cinder',parentKey:'aster-vale',planetStyle:'rocky',surfaceId:24,surfaceTint:'#d49b61',color:'#cb986c',radiusMeters:1.93e6,massSolar:4.4e-8,orbitReferenceFrame:'ecliptic',orbitInclination:27,orbitMeters:asterRadius*5.7,phase:-.52,tidallyLocked:true,height:0,dataNote:'An invented amber moon outside Aster Vale’s rings.'},
 {key:'janus',catalogId:'nasa-janus',type:'enterprise',hullModel:'janusPod',name:'NASA Janus',parentKey:'earth',orbitReferenceFrame:'ecliptic',orbitMeters:6371000*1.70,orbitInclination:21,phase:-2.23,height:0,dataNote:'An experimental spherical capsule with two flight seats, a flight console and 0.3g maneuvering thrusters. Its fictional bridge drive exchanges the local cabin volume between two orbital endpoints.'}
];
export const JANUS_SCENE={
 id:'earth-andromeda-bridge',title:'Earth to Andromeda',heading:'Earth to Andromeda',subtitle:'Two orbits, one cabin',category:'Wormholes',className:'mini-bridge',
 tags:['NASA Janus','Einstein–Rosen bridge','Andromeda'],
 description:'A two-seat NASA capsule exchanges its place above Earth with an orbit around Aster Vale, a fictional ringed giant in Andromeda.',
 explore:'Press Play to follow the round trip. The local warp bubble surrounds the cabin before and after each crossing. Choose Ride to look around the flight deck as the world outside changes. The bridge exchange and the Lyris system are fictional.',
 janusRoute:{craftKey:'nasa-janus',destinations:['earth','aster-vale'],loop:true},
 patch:{blackHole:false,binary:false,disk:false,secondaryDisk:false,jets:false,nebula:false,planet:false,tidalStar:false,warp:false,bridge:false,grid:false,annotations:true,stars:true,starDensity:1.12},
 objects,camera:{focusIndex:objects.length-1,mode:'track',focusDistance:4.75,pitch:.14,yaw:-.94}
};

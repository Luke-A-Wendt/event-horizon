import {solarBodies} from './solar-catalog.js';

// A real parking-orbit body is always first. Keys here are IAU/NASA catalog
// IDs, not display names or array indices, so imported/user-edited routes
// remain independent of the order in which the full hierarchy is loaded.
const natural=solarBodies().filter(o=>['star','planet','moon','planetoid','asteroid','ring'].includes(o.type));
const earth=natural.find(o=>o.key==='earth');
const stops=['earth','301','sun','mercury','venus','mars','1','jupiter','saturn','uranus','neptune','134340'];
const pod={key:'janus',catalogId:'nasa-janus',type:'enterprise',hullModel:'janusPod',name:'NASA Janus',
 parentKey:'earth',orbitReferenceFrame:'ecliptic',orbitMeters:1.70*earth.radiusMeters,eccentricity:0,phase:-2.23,height:0,
 dataNote:'A spherical survey pod with two flight seats and a console. A comoving warp bubble holds its parking orbit and stays with the cabin across the exchange. The fictional onboard bridge exchanges its surroundings between destinations.'};
const bodies=[...natural.map(o=>o.key==='earth'?{...o,phase:1.05}:o),pod];
export const JANUS_SOLAR_TOUR={
 id:'janus-solar-tour',title:'Wormhole tour of the solar system',subtitle:'One orbit, then a bridge',category:'Wormholes',className:'mini-bridge',
 tags:['12 stops','Local warp','NASA Janus'],
 description:'Janus circles each world once under local warp, then opens a bridge to the next stop on its solar system tour.',
 explore:'Start at Earth and press Play. Open Playlist to change the order, add a moon, or turn off Loop to finish at Pluto.',
 janusRoute:{craftKey:'nasa-janus',destinations:stops,loop:true,laps:1},
 patch:{blackHole:false,binary:false,disk:false,secondaryDisk:false,jets:false,nebula:false,planet:false,tidalStar:false,bridge:false,warp:false,grid:false,stars:true,starDensity:1.1,annotations:true},
 objects:bodies,camera:{focusIndex:bodies.length-1,mode:'track',focusDistance:4.75,pitch:.14,yaw:-.94}
};

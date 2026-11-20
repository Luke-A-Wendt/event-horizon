// Each chart co-rotates with its gate around the local primary. The gate is
// the origin and +Z points toward the primary. World and satellite angular
// sizes follow their physical radii and separations. The gate and spacecraft
// are drawn at the bridge experiment's magnified scale in each chart.
export const PROXIMA_GATE_SCENE_ID='earth-proxima-gates';
const localDistance=24;
function worldLayout(orbitMeters,radiusMeters,massSolar){
 return Object.freeze({orbitMeters,radiusMeters,massSolar,distance:localDistance,radius:localDistance*radiusMeters/orbitMeters});
}
const earth=worldLayout(384400e3,6371e3,3.00349e-6);
const proxima=worldLayout(3.2e9,.1542*696340000,.1221);
export const PROXIMA_GATE_MOON=Object.freeze({
 distance:2*earth.distance,radius:earth.radius*1737400/earth.radiusMeters,radiusMeters:1737400
});
const legacyWorlds=[false,true].map(far=>Object.freeze({
 distance:15,radius:3,radiusMeters:6371000,orbitMeters:31855000,massSolar:(far?1.02:1)*3.00349e-6
}));
export function bridgeWorldLayout(far,sceneId){
 return sceneId===PROXIMA_GATE_SCENE_ID?(far?proxima:earth):legacyWorlds[far?1:0];
}

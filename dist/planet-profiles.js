// Stable material identifiers shared by catalog, inspector, and GPU.
export const SURFACE_PROFILES = [
 [0,'Generic'],[1,'Earth'],[2,'Moon'],[3,'Mars'],[4,'Jupiter'],[5,'Saturn'],[6,'Venus'],[7,'Mercury'],[8,'Uranus'],[9,'Neptune'],[10,'Pluto'],[11,'Charon'],[12,'Io'],[13,'Europa'],[14,'Ganymede'],[15,'Callisto'],[16,'Titan'],[17,'Enceladus'],[18,'Triton'],[19,'Ceres'],[20,'Vesta'],[21,'Iapetus'],[22,'Asteroid'],[23,'Icy moon'],[24,'Rocky moon'],[25,'Vulcan · desert highlands'],[26,'Aster Vale · jade storm belts']
].map(([id,label])=>Object.freeze({id,label}));

// Illustrative optical scale heights, modestly enlarged to keep the limb
// readable at interactive resolution. Airless bodies have no visible halo.
export const PLANET_ATMOSPHERES=Object.freeze({
 1:{height:.015,strength:1.22,color:[.21,.54,1]},
 3:{height:.0035,strength:.16,color:[.78,.38,.19]},
 4:{height:.004,strength:.36,color:[.66,.70,.85]},
 5:{height:.005,strength:.42,color:[.85,.72,.45]},
 6:{height:.009,strength:.80,color:[1,.74,.38]},
 8:{height:.006,strength:.45,color:[.35,.76,.88]},
 9:{height:.006,strength:.45,color:[.20,.45,1]},
 10:{height:.0025,strength:.035,color:[.34,.52,.87]},
 16:{height:.014,strength:.85,color:[1,.56,.17]},
 18:{height:.002,strength:.025,color:[.30,.49,.72]},
 25:{height:.0035,strength:.19,color:[.96,.59,.33]},
 26:{height:.0055,strength:.50,color:[.31,.86,.79]}
});
const GENERIC_ATMOSPHERES={gas:{height:.006,strength:.45,color:[.44,.64,.90]},ocean:{height:.0068,strength:.8,color:[.15,.43,1]}};
export function planetAtmosphereProfile(surfaceId=0,style='rocky'){
 return Number(surfaceId)>0?PLANET_ATMOSPHERES[Number(surfaceId)]||null:GENERIC_ATMOSPHERES[style]||null;
}

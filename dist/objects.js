// Local placements are uncompressed SI metres; allow galactic as well as stellar routes.
export const MAX_WORLD_METERS=1e21;
// The serialized 'enterprise' type and shader slot are stable across the model change.
export const SHUTTLE_NAME='NASA Meridian';
export const WARP_SHIP_NAME='NASA Warp Explorer';
const formerWarpShipNames=new Set(['Starship Enterprise','USS Enterprise','Enterprise']);
// Guidance uses the drive type; the selected hull controls its dimensions and appearance.
// The serialized drive type specifies the flight model. Variants keep that
// same helm and clock while using their own physical dimensions and hull.
export const DRIVABLE_HULLS=Object.freeze([
 {type:'shuttle',model:'shuttle',name:SHUTTLE_NAME},
 {type:'shuttle',model:'heritageShuttle',name:'NASA Shuttle'},
 {type:'enterprise',model:'enterprise',name:WARP_SHIP_NAME},
 {type:'enterprise',model:'classicEnterprise',name:'USS Enterprise'},
 {type:'enterprise',model:'janusPod',name:'NASA Janus'},
].map(h=>Object.freeze(h)));
const helmTypes=new Set(DRIVABLE_HULLS.map(h=>h.type)),driveVariants=new Map(DRIVABLE_HULLS.filter(h=>h.model!==h.type).map(h=>[h.model,h.type]));
export const isDriveCraft=object=>helmTypes.has(object?.type);
export const acceptsHull=(type,model)=>driveVariants.has(model)&&driveVariants.get(model)===type;
export function hullType(object){return acceptsHull(object?.type,object?.hullModel)?object.hullModel:object?.type;}
export const isJanusPod=object=>object?.type==='enterprise'&&object.hullModel==='janusPod';
export const usesWarpHelm=object=>object?.type==='enterprise'&&(!isJanusPod(object)||object.podPropulsion==='warp');
export const JANUS_THRUST_MAX_G=.3;
export function importedObjectName(type,name,hullModel){if(acceptsHull(type,hullModel))return name;return type==='shuttle'&&name==='NASA Shuttle'?SHUTTLE_NAME:type==='enterprise'&&formerWarpShipNames.has(name)?WARP_SHIP_NAME:name;}
// Procedural catalog. Every model uses its reference physical dimensions.
export const OBJECT_TYPES = [
 {id:'cylinder',label:'O’Neill cylinder',description:'An enclosed rotating habitat with six atmosphere districts around a fusion-lit axis.'},
 {id:'anomaly',label:'Gravity anomaly',description:'A fictional, smooth region of turbulent lensing with no body or singularity.'},
 {id:'blackhole',label:'Black hole',description:'A compact mass with orbiting children, plasma discs, and polar jets.'},
 {id:'whitehole',label:'White hole',description:'A time-reversed compact-object illustration.'},
 {id:'disk',label:'Accretion disc',description:'An emitting plasma disc attached to a star or black hole.'},
 {id:'jets',label:'Polar jets',description:'A pair of outflows attached to a star or black hole.'},
 {id:'dyson',label:'Dyson sphere',description:'A rotating collector shell with a sealed, sunlit garden at its equator.'},
 {id:'planet',label:'Planet',description:'A small orbiting world with procedural terrain and clouds.'},
 {id:'moon',label:'Moon',description:'A natural satellite of a planet or smaller world, including small moonlets.'},
 {id:'planetoid',label:'Planetoid',description:'A dwarf planet or small world orbiting a star or black hole.'},
 {id:'asteroid',label:'Asteroid',description:'A small rocky or metallic body with an irregular surface and shape.'},
 {id:'star',label:'Star',description:'A luminous sphere of plasma.'},
 {id:'waypoint',label:'Stationary waypoint',description:'A fixed coordinate in the scene. Add it to a route to arrive at rest, with no body or gravity at the marker.'},
 {id:'probe',label:'Luminous probe',description:'A bright marker for tracing an orbit.'},
 {id:'habitat',label:'NASA Garden Station',description:'A pressurized microgravity hub with a docking port at each pole. Three enclosed lift spokes connect it to the rotating garden deck, one kilometre from the axis at standard scale.'},
 {id:'iss',label:'ISS',description:'A stylized International Space Station with modules, radiators, and solar arrays.'},
 {id:'shuttle',label:SHUTTLE_NAME,description:'A wingless deep-space ship with circular crew decks and a glass-roofed observation garden. Noseward thrust makes the floors feel down toward the engines.'},
 {id:'heritageShuttle',label:'NASA Shuttle',description:'A heritage model of Enterprise (OV-101), the original NASA test orbiter, with delta wings and test-era markings.'},
 {id:'astronaut',label:'Astronaut',description:'A suited explorer with a gold visor and life-support backpack.'},
 {id:'heighliner',label:'Guild Heighliner',description:'A Dune-inspired cylindrical Guild transport with a hollow ship bay and layered metal hull.'},
 {id:'enterprise',label:WARP_SHIP_NAME,description:'A fictional NASA exploration ship with twin warp rings, a forward command cabin, and a central service hull.'},
 {id:'janusPod',label:'NASA Janus',description:'A spherical two-seat survey pod with flush maneuvering ports, 0.3g impulse thrust, a local warp bubble and an onboard Einstein–Rosen bridge.'},
 {id:'classicEnterprise',label:'Starship Enterprise',description:'The classic starship with a saucer, an engineering hull, and twin nacelles. Place it alongside the NASA Warp Explorer.'},
 {id:'ring',label:'Planetary rings',description:'An annular population of icy, rocky, or metallic material.'},
 {id:'belt',label:'Asteroid belt',description:'A procedural annulus of small bodies around a star or planet.'}
];
// Stable shader IDs retain the original planet/probe/star encoding.
export const OBJECT_KIND = {janusPod:18,cylinder:17,waypoint:-1,anomaly:13,habitat:14,classicEnterprise:15,heritageShuttle:16,planet:0,moon:0,planetoid:0,asteroid:0,probe:1,star:2,iss:3,shuttle:4,astronaut:5,enterprise:6,ring:7,belt:8,disk:9,jets:10,dyson:11,heighliner:12,blackhole:2,whitehole:2};
export const OBJECT_CLASS = {janusPod:2,cylinder:2,waypoint:0,anomaly:0,space:6,blackhole:5,whitehole:5,hole:5,star:4,planet:3,planetoid:2.8,asteroid:2.6,moon:2.5,probe:2,habitat:2,classicEnterprise:2,heritageShuttle:2,iss:2,shuttle:2,enterprise:2,heighliner:2,astronaut:1,disk:0,jets:0,ring:0,belt:0,dyson:0};

// SI dimensions are independent of the visualization's black-hole mass.
// normalizedExtent is the longest dimension of the procedural model.
export const REFERENCE_RG_METERS = 1.47662504e3 * 4.3e6;
export const OBJECT_DIMENSIONS = {
 janusPod:{lengthMeters:5.4,normalizedExtent:1.60,description:"5.4 m spherical pressure hull with flush thruster ports"},
 cylinder:{lengthMeters:4320000,normalizedExtent:4320/2300,description:'4,320 km long; 1,440 km inner diameter'},
 waypoint:{lengthMeters:0,normalizedExtent:1,description:'Fixed origin-frame navigation point'},
 anomaly:{lengthMeters:12000,normalizedExtent:2,description:'Six-kilometer-radius optical disturbance'},
 blackhole:{lengthMeters:59065.0016,normalizedExtent:2,description:"10 solar-mass Schwarzschild horizon diameter"},
 whitehole:{lengthMeters:59065.0016,normalizedExtent:2,description:"10 solar-mass time-reversed horizon diameter"},
 disk:{lengthMeters:7000000000,normalizedExtent:2,description:"Disc outer diameter"},
 jets:{lengthMeters:20000000000,normalizedExtent:2,description:"Paired jet extent"},
 dyson:{lengthMeters:299195741400,normalizedExtent:2,description:'One-AU-radius hollow habitat shell'},
 moon:{lengthMeters:3474800,normalizedExtent:2,description:'Lunar mean diameter'},
 planet:{lengthMeters:12742000,normalizedExtent:2,description:'Earth diameter'},
 planetoid:{lengthMeters:939400,normalizedExtent:2,description:'Ceres reference diameter'},
 asteroid:{lengthMeters:20000,normalizedExtent:2,description:'20 km reference asteroid extent'},
 star:{lengthMeters:1392680000,normalizedExtent:2,description:'Solar diameter'},
 ring:{lengthMeters:280000000,normalizedExtent:2,description:'Ring outer diameter'},
 belt:{lengthMeters:900000000000,normalizedExtent:2,description:'Belt outer diameter'},
 probe:{lengthMeters:2,normalizedExtent:2,description:'Two-meter spherical reference probe'},
 habitat:{lengthMeters:1000*1.94/.92,normalizedExtent:1.94,description:'2.11 km habitat diameter; 1 km inhabited deck radius'},
 classicEnterprise:{lengthMeters:288.6456,normalizedExtent:1.84,description:'288.65 m classic starship length'},
 iss:{lengthMeters:109,normalizedExtent:1.64,description:'109 m maximum solar-array span'},
 shuttle:{lengthMeters:37.24,normalizedExtent:1.72,description:'37.24 m from observation dome to engine bells'},
 heritageShuttle:{lengthMeters:37.24,normalizedExtent:1.72,description:'37.24 m orbiter length'},
 astronaut:{lengthMeters:1.9,normalizedExtent:1.72,description:'1.90 m reference suited height'},
 heighliner:{lengthMeters:10000,normalizedExtent:1.8,description:'Illustrative 10 km Guild transport; scale is adjustable, not a fixed canon dimension'},
 enterprise:{lengthMeters:288.6456,normalizedExtent:1.84,description:'288.65 m reference length, nose to aft engines'}
};
export function objectRadiusMeters(type,scale=1){const d=OBJECT_DIMENSIONS[type]||OBJECT_DIMENSIONS.planet;return d.lengthMeters/d.normalizedExtent*scale;}

// Prescribed compact hierarchies neglect recoil for satellites at or below
// one tenth of their host mass; comparable compact bodies remain pairs.
export function isCompactType(type){return type==='blackhole'||type==='whitehole';}
export function compactSatellite(childType,childMass,parentType,parentMass){return isCompactType(childType)&&isCompactType(parentType)&&Number.isFinite(childMass)&&childMass>0&&Number.isFinite(parentMass)&&parentMass>0&&childMass<=parentMass*.1;}

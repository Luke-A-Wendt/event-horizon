// Procedural catalog. Every model uses its reference physical dimensions.
export const OBJECT_TYPES = [
 {id:'anomaly',label:'Gravity anomaly',description:'A fictional, smooth region of turbulent lensing with no body or singularity.'},
 {id:'blackhole',label:'Black hole',description:'A compact mass with orbiting children, plasma discs, and polar jets.'},
 {id:'whitehole',label:'White hole',description:'A time-reversed compact-object illustration.'},
 {id:'disk',label:'Accretion disc',description:'An emitting plasma disc attached to a star or black hole.'},
 {id:'jets',label:'Polar jets',description:'A pair of outflows attached to a star or black hole.'},
 {id:'dyson',label:'Dyson sphere',description:'A concentric hollow habitat shell: metallic outside, gardens and cities inside.'},
 {id:'planet',label:'Planet',description:'A small orbiting world with procedural terrain and clouds.'},
 {id:'moon',label:'Moon',description:'A natural satellite with its own physical size, surface, and orbit.'},
 {id:'star',label:'Star',description:'A luminous sphere of plasma.'},
 {id:'probe',label:'Luminous probe',description:'A bright marker for tracing an orbit.'},
 {id:'iss',label:'ISS',description:'A stylized International Space Station with modules, radiators, and solar arrays.'},
 {id:'shuttle',label:'NASA Shuttle',description:'An Enterprise-era NASA shuttle study with a rounded nose, delta wings, test-era markings, and object-relative Ride and Chase cameras.'},
 {id:'astronaut',label:'Astronaut',description:'A suited explorer with a gold visor and life-support backpack.'},
 {id:'heighliner',label:'Guild Heighliner',description:'A Dune-inspired cylindrical Guild transport with a hollow ship bay and layered metal hull.'},
 {id:'enterprise',label:'Starship Enterprise',description:'A stylized classic Enterprise with a saucer, engineering hull, and twin nacelles.'},
 {id:'ring',label:'Planetary rings',description:'An annular population of icy, rocky, or metallic material.'},
 {id:'belt',label:'Asteroid belt',description:'A procedural annulus of small bodies around a star or planet.'}
];
// Stable shader IDs retain the original planet/probe/star encoding.
export const OBJECT_KIND = {anomaly:13,planet:0,moon:0,probe:1,star:2,iss:3,shuttle:4,astronaut:5,enterprise:6,ring:7,belt:8,disk:9,jets:10,dyson:11,heighliner:12,blackhole:2,whitehole:2};
export const OBJECT_CLASS = {anomaly:0,space:6,blackhole:5,whitehole:5,hole:5,star:4,planet:3,moon:2.5,probe:2,iss:2,shuttle:2,enterprise:2,heighliner:2,astronaut:1,disk:0,jets:0,ring:0,belt:0,dyson:0};

// SI dimensions are independent of the visualization's black-hole mass.
// normalizedExtent is the longest dimension of the procedural model.
export const REFERENCE_RG_METERS = 1.47662504e3 * 4.3e6;
export const OBJECT_DIMENSIONS = {
 anomaly:{lengthMeters:12000,normalizedExtent:2,description:'Six-kilometer-radius optical disturbance'},
 blackhole:{lengthMeters:59065.0016,normalizedExtent:2,description:"10 solar-mass Schwarzschild horizon diameter"},
 whitehole:{lengthMeters:59065.0016,normalizedExtent:2,description:"10 solar-mass time-reversed horizon diameter"},
 disk:{lengthMeters:7000000000,normalizedExtent:2,description:"Disc outer diameter"},
 jets:{lengthMeters:20000000000,normalizedExtent:2,description:"Paired jet extent"},
 dyson:{lengthMeters:299195741400,normalizedExtent:2,description:'One-AU-radius hollow habitat shell'},
 moon:{lengthMeters:3474800,normalizedExtent:2,description:'Lunar mean diameter'},
 planet:{lengthMeters:12742000,normalizedExtent:2,description:'Earth diameter'},
 star:{lengthMeters:1392680000,normalizedExtent:2,description:'Solar diameter'},
 ring:{lengthMeters:280000000,normalizedExtent:2,description:'Ring outer diameter'},
 belt:{lengthMeters:900000000000,normalizedExtent:2,description:'Belt outer diameter'},
 probe:{lengthMeters:2,normalizedExtent:2,description:'Two-meter spherical reference probe'},
 iss:{lengthMeters:109,normalizedExtent:1.64,description:'109 m maximum solar-array span'},
 shuttle:{lengthMeters:37.24,normalizedExtent:1.72,description:'37.24 m orbiter length'},
 astronaut:{lengthMeters:1.9,normalizedExtent:1.72,description:'1.90 m reference suited height'},
 heighliner:{lengthMeters:10000,normalizedExtent:1.8,description:'Illustrative 10 km Guild transport; scale is adjustable, not a fixed canon dimension'},
 enterprise:{lengthMeters:288.6456,normalizedExtent:1.84,description:'947 ft (288.65 m), original Constitution-class Enterprise'}
};
export function objectRadiusMeters(type,scale=1){const d=OBJECT_DIMENSIONS[type]||OBJECT_DIMENSIONS.planet;return d.lengthMeters/d.normalizedExtent*scale;}

// Prescribed compact hierarchies neglect recoil for satellites at or below
// one tenth of their host mass; comparable compact bodies remain pairs.
export function isCompactType(type){return type==='blackhole'||type==='whitehole';}
export function compactSatellite(childType,childMass,parentType,parentMass){return isCompactType(childType)&&isCompactType(parentType)&&Number.isFinite(childMass)&&childMass>0&&Number.isFinite(parentMass)&&parentMass>0&&childMass<=parentMass*.1;}

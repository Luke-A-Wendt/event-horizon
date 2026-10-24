// Procedural catalog. Every model uses its reference physical dimensions.
export const OBJECT_TYPES = [
 {id:'planet',label:'Planet',description:'A small orbiting world with procedural terrain and clouds.'},
 {id:'star',label:'Star',description:'A luminous sphere of plasma.'},
 {id:'probe',label:'Luminous probe',description:'A bright marker for tracing an orbit.'},
 {id:'iss',label:'ISS',description:'A stylized International Space Station with modules, radiators, and solar arrays.'},
 {id:'shuttle',label:'NASA Shuttle',description:'An Enterprise-era NASA shuttle study with a rounded nose, delta wings, test-era markings, and a stable flight-deck camera.'},
 {id:'astronaut',label:'Astronaut',description:'A suited explorer with a gold visor and life-support backpack.'},
 {id:'enterprise',label:'Starship Enterprise',description:'A stylized classic Enterprise with a saucer, engineering hull, and twin nacelles.'}
];
// Stable shader IDs retain the original planet/probe/star encoding.
export const OBJECT_KIND = {planet:0,probe:1,star:2,iss:3,shuttle:4,astronaut:5,enterprise:6};

// SI dimensions are independent of the visualization's black-hole mass.
// normalizedExtent is the longest dimension of the procedural model.
export const REFERENCE_RG_METERS = 1.47662504e3 * 4.3e6;
export const OBJECT_DIMENSIONS = {
 planet:{lengthMeters:12742000,normalizedExtent:2,description:'Earth diameter'},
 star:{lengthMeters:1392680000,normalizedExtent:2,description:'Solar diameter'},
 probe:{lengthMeters:2,normalizedExtent:2,description:'Two-meter spherical reference probe'},
 iss:{lengthMeters:109,normalizedExtent:1.64,description:'109 m maximum solar-array span'},
 shuttle:{lengthMeters:37.24,normalizedExtent:1.72,description:'37.24 m orbiter length'},
 astronaut:{lengthMeters:1.9,normalizedExtent:1.72,description:'1.90 m reference suited height'},
 enterprise:{lengthMeters:288.6456,normalizedExtent:1.84,description:'947 ft (288.65 m), original Constitution-class Enterprise'}
};
export function objectRadiusMeters(type,scale=1){const d=OBJECT_DIMENSIONS[type]||OBJECT_DIMENSIONS.planet;return d.lengthMeters/d.normalizedExtent*scale;}

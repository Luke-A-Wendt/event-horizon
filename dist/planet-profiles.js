// Stable material identifiers shared by catalog, inspector, and GPU.
export const SURFACE_PROFILES = [
 [0,'Generic'],[1,'Earth'],[2,'Moon'],[3,'Mars'],[4,'Jupiter'],[5,'Saturn'],[6,'Venus'],[7,'Mercury'],[8,'Uranus'],[9,'Neptune'],[10,'Pluto'],[11,'Charon'],[12,'Io'],[13,'Europa'],[14,'Ganymede'],[15,'Callisto'],[16,'Titan'],[17,'Enceladus'],[18,'Triton'],[19,'Ceres'],[20,'Vesta'],[21,'Iapetus'],[22,'Asteroid'],[23,'Icy moon'],[24,'Rocky moon']
].map(([id,label])=>Object.freeze({id,label}));

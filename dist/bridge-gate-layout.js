// Gate-local lengths in throat radii. Opposite pentagons face the flight
// axis (+Z and -Z). Faces describe openings; only edges and nodes are solid.
export const GATE_RADIUS=2.95;
export const GATE_RAIL_SCALE=.60;
export const GATE_NODE_SCALE=.70;
export const GATE_OPTIC_INSET=.274*GATE_NODE_SCALE;
const sector=2*Math.PI/5,sin=Math.sin,cos=Math.cos;
// Construct first at unit edge length: the polar ring spans a pentagonal
// face, its longitudinal edges slope outward to the wider equatorial ring.
const polar=.5/sin(sector/2),run=cos(sector)/sin(sector/2),equator=polar+run;
const low=.5*Math.sqrt(1-(2*equator*sin(sector/4))**2),high=low+Math.sqrt(1-run**2);
const scale=GATE_RADIUS/Math.hypot(polar,high);
const rows=[[polar,high,0],[equator,low,0],[equator,-low,sector/2],[polar,-high,sector/2]];
export const GATE_VERTICES=rows.flatMap(([r,z,offset])=>Array.from({length:5},(_,k)=>[scale*r*cos(offset+k*sector),scale*r*sin(offset+k*sector),scale*z]));
// Each representative and its four 72-degree rotations exhaust one orbit.
// The GPU can use the same vertices as the polygonal CPU renderer without
// walking all thirty accelerator banks for each distance evaluation.
export const GATE_SECTOR_VERTICES=[0,5,10,15];
export const GATE_SECTOR_EDGES=[[0,1],[0,5],[5,10],[5,14],[10,15],[15,16]];
const turn=(i,k)=>i-i%5+(i%5+k)%5;
const copies=items=>Array.from({length:5},(_,k)=>items.map(ids=>ids.map(i=>turn(i,k)))).flat();
export const GATE_EDGES=copies(GATE_SECTOR_EDGES);
export const GATE_FACES=[[0,1,2,3,4],[19,18,17,16,15],...copies([[5,10,6,1,0],[15,16,11,6,10]])];

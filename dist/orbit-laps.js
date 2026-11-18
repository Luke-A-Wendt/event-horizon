// A lap belongs to the circular stop being *left*, never the incoming burn.
// Keep the automatic value distinct from an explicit zero: adding a second
// radius to an existing single-circle playlist can change the default.
export const MAX_EXTRA_LAPS=99;
export function validExtraLaps(value){
 return Number.isInteger(value)&&value>=0&&value<=MAX_EXTRA_LAPS;
}
export function resolveOrbitLaps(nodes,isCompact){
 for(const node of nodes){
  if(node.kind!=='orbit')continue;
  if(node.extraLaps===undefined||node.defaultExtraLaps===node.extraLaps){
   const repeated=nodes.some(other=>other!==node&&other.targetId===node.targetId&&other.radiusMeters>0&&node.radiusMeters>0&&Math.abs(other.radiusMeters-node.radiusMeters)>Math.max(.001,32*Number.EPSILON*Math.max(other.radiusMeters,node.radiusMeters)));
   node.extraLaps=node.defaultExtraLaps=isCompact(node.targetId)||repeated?1:0;
  }else delete node.defaultExtraLaps;
 }
 return nodes;
}

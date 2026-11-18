// Presentation categories are independent of the shared rocky-body shader.
// “Planetoid” is a useful informal grouping here, not a mass-only IAU rule.
export const PLANETARY_SURFACE_TYPES=Object.freeze(['planet','moon','planetoid','asteroid']);
export const isPlanetarySurface=type=>PLANETARY_SURFACE_TYPES.includes(type);
export const MAP_FILTERS=Object.freeze([
 {id:'planets',label:'Planets'},
 {id:'moons',label:'Moons'},
 {id:'planetoids',label:'Planetoids'},
 {id:'asteroids',label:'Asteroids'},
 {id:'other',label:'Other'}
]);
export const DEFAULT_MAP_FILTERS=Object.freeze({planets:true,moons:true,planetoids:true,asteroids:true,other:true});
export function objectCategory(body={}){
 const type=typeof body==='string'?body:body.type;
 if(['space','star','blackhole','whitehole','hole','waypoint'].includes(type)||body.collapsed)return 'anchors';
 if(type==='moon')return 'moons';
 if(body.bodyClass==='comet')return 'other';
 if(type==='planetoid'||body.bodyClass==='dwarf planet')return 'planetoids';
 if(type==='asteroid')return 'asteroids';
 if(type==='planet')return body.bodyClass==='small body'?'planetoids':'planets';
 return 'other';
}
export function mapCategoryVisible(body,filters){
 if(!filters)return true;
 const category=body.category||objectCategory(body);
 return category==='anchors'||!!filters[category];
}
// Natural satellites have no lower size cutoff. A small moonlet remains a
// moon; asteroids and dwarf planets can also have natural satellites.
export function naturalParentReason(type,parentType){
 if(type==='moon'&&!['planet','planetoid','asteroid'].includes(parentType))return 'Moons orbit planets, planetoids, or asteroids.';
 if(['planetoid','asteroid'].includes(type)&&!['space','star','blackhole','whitehole','hole'].includes(parentType))return 'Planetoids and asteroids orbit stars or black holes, or can be placed in empty Space.';
 return '';
}
export function annotationLabelContext(renderer){
 const objects=renderer.objectById||new Map((renderer.objects||[]).map(o=>[o.id,o]));
 let id=renderer.focusId||renderer.freeReferenceId,planetId=null;const visited=new Set();
 while(id&&!visited.has(id)){
  visited.add(id);const body=objects.get(id)||renderer.getFocusFrame?.(id);
  if(id==='planet'&&renderer.state?.planet||body&&objectCategory(body)==='planets'){planetId=id;break;}
  id=body?.parentId||body?.referenceId;
 }
 return {planetId,objects};
}
export function annotationLabelVisible(body,context){
 const original=context.objects.get(body.id)||body,category=objectCategory(original);
 if(body.collapsed||category==='anchors'||category==='planets')return body.type!=='space';
 return category==='moons'&&!!context.planetId&&(original.parentId||body.parentId)===context.planetId;
}

export const SCENE_ORIGIN=Object.freeze({id:'scene-origin',name:'Origin',label:'Origin',type:'waypoint',waypoint:true,position:Object.freeze([0,0,0]),radius:0,x:0,y:0,z:0});
export function originLabelVisible(r){
 const s=r.state,objects=r.objects||[];
 return !s.blackHole&&!s.planet&&!s.tidalStar&&!s.bridge&&(objects.length===0||objects.length===1&&['shuttle','enterprise','astronaut'].includes(objects[0].type));
}

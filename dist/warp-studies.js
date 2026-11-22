// Both variants use the same orbit and waypoint studies as their originals.
// The scene ID remains distinct for links, saved scenes and gallery cards.
const enterpriseStudies=[
 {id:'enterprise-warp-orbit',original:'warp-orbit',title:'Warp field in orbit · Enterprise',
  subtitle:'The Enterprise above the accretion disc',
  description:'The USS Enterprise circles a black hole above the luminous accretion disc. Its warp shield bends the image of the disc and the stars behind it.'},
 {id:'enterprise-warp-excursion',original:'warp-excursion',title:'Beyond the horizon · Enterprise',
  subtitle:'The Enterprise at the horizon',
  description:'The USS Enterprise flies toward the edge of a black hole surrounded by luminous plasma, stops outside the horizon and returns to its outer waypoint.'}
];
const originalIds=new Map(enterpriseStudies.map(s=>[s.id,s.original]));
export function warpStudyId(id){return originalIds.get(id)||id;}
export function enterpriseWarpPresets(presets){
 return enterpriseStudies.map(({id,original,title,subtitle,description})=>{
  const template=presets.find(p=>p.id===original);
  // The original excursion creates this ship implicitly in loadScene.
  const objects=template.objects||[{type:'enterprise',radius:14,phase:1.3,scale:1}];
  return {...template,id,title,subtitle,description,tags:['USS Enterprise',...template.tags],
   patch:{...template.patch},
   objects:objects.map(body=>body.type==='enterprise'?{...body,hullModel:'classicEnterprise',name:'USS Enterprise'}:{...body})};
 });
}

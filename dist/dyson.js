// A fictional rigid habitat shell. The radius is physical; the habitable-zone
// estimate is an Earth-equivalent bolometric flux, not a climate prediction.
export const ASTRONOMICAL_UNIT=149597870700;
export function stellarLuminositySolar(star){
 if(!star||star.type!=='star'||star.collapsed||star.stellar?.collapsed)return 0;
 const mass=Math.max(.000001,Number(star.massSolar)||1);
 // Low-cost main-sequence mass/luminosity relation; evolved classes use a
 // clearly approximate temperature and the editable photospheric radius.
 if(!star.starStyle||star.starStyle==='main')return mass<.43?.23*mass**2.3:mass<2?mass**4:mass<55?1.4*mass**3.5:32000*mass;
 const temperature={redgiant:3500,dwarf:3000,neutron:600000,protostar:4000,supergiant:20000,whitedwarf:15000,tzo:3500}[star.starStyle]||5772;
 const radius=star.stellar?.radiusMeters||star.radiusMeters||696340000;
 return (radius/696340000)**2*(temperature/5772)**4;
}
export function dysonHabitableRadius(star){return ASTRONOMICAL_UNIT*Math.sqrt(Math.max(.0001,stellarLuminositySolar(star)||1));}
export function dysonIllumination(star,radiusMeters){return Math.min(4,Math.pow(Math.max(0,stellarLuminositySolar(star))/(Math.max(1,radiusMeters)/ASTRONOMICAL_UNIT)**2,.25));}

// Reference intersection used by the Canvas preview and geometric checks.
// The cap opens toward +Z; cutaway is its fraction of total shell area.
export function dysonShellHit(origin,direction,cutaway=0,maximum=Infinity,bandOnly=false){
 const b=origin.reduce((n,v,i)=>n+v*direction[i],0),cross=[origin[1]*direction[2]-origin[2]*direction[1],origin[2]*direction[0]-origin[0]*direction[2],origin[0]*direction[1]-origin[1]*direction[0]],disc=1-cross.reduce((n,v)=>n+v*v,0);
 if(disc<0)return null;
 const root=Math.sqrt(disc),cap=1-2*Math.max(0,Math.min(.8,cutaway));
 for(const t of [-b-root,-b+root]){
  if(t<1e-7||t>maximum)continue;
  const point=origin.map((v,i)=>v+direction[i]*t);
  if((cutaway>0&&point[2]>cap)||(bandOnly&&Math.abs(point[1])>.075))continue;
  return {t,point,inside:point.reduce((n,v,i)=>n+v*direction[i],0)>0};
 }
 return null;
}



// Weak-field Newtonian model at the walking deck. The star pulls toward
// the centre, so the floor supplies only the rest of the centripetal force.
export function dysonSpin(radiusMeters,massSolar){
 if(!(radiusMeters>0)||!Number.isFinite(radiusMeters)||!Number.isFinite(massSolar)||massSolar<0)return null;
 const stellarGravity=1.32712440018e20*massSolar/(radiusMeters*radiusMeters);
 const floorGravity=9.80665,angularVelocity=Math.sqrt((floorGravity+stellarGravity)/radiusMeters);
 if(angularVelocity*radiusMeters>=299792458)return null; // No physical rigid rotation at this speed.
 return {angularVelocity,periodSeconds:2*Math.PI/angularVelocity,stellarGravity,floorGravity};
}

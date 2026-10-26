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
export function dysonShellHit(origin,direction,cutaway=0,maximum=Infinity){
 const b=origin.reduce((n,v,i)=>n+v*direction[i],0),cross=[origin[1]*direction[2]-origin[2]*direction[1],origin[2]*direction[0]-origin[0]*direction[2],origin[0]*direction[1]-origin[1]*direction[0]],disc=1-cross.reduce((n,v)=>n+v*v,0);
 if(disc<0)return null;
 const root=Math.sqrt(disc),cap=1-2*Math.max(0,Math.min(.8,cutaway));
 for(const t of [-b-root,-b+root]){
  if(t<1e-7||t>maximum)continue;
  const point=origin.map((v,i)=>v+direction[i]*t);
  if(cutaway>0&&point[2]>cap)continue;
  return {t,point,inside:point.reduce((n,v,i)=>n+v*direction[i],0)>0};
 }
 return null;
}

// A low-detail material approximation for the explicitly selected CPU mode.
export function dysonPreviewMaterial(point,inside,illumination=1){
 const [x,y,z]=point,u=Math.atan2(z,x)/Math.PI,v=Math.asin(Math.max(-1,Math.min(1,y)))/Math.PI;
 const n=Math.sin(x*19+Math.sin(z*11))*Math.cos(z*17-y*9)+Math.sin(y*25+x*8)*.35;
 if(!inside){const seam=Math.abs(Math.sin(u*80))<.08||Math.abs(Math.sin(v*50))<.08;return seam?'#172431':n>.15?'#a2adb7':'#627687';}
 if(illumination<.01)return n>.85?'#b88640':'#020805';
 if(n<-.32||Math.abs(Math.sin(u*24+Math.sin(v*17)*2))<.07)return '#327da3';
 if(Math.sin(u*62)*Math.sin(v*87)>.75)return '#203654';
 if(n>.7)return '#b8b5a5';
 return n>.1?'#759d4c':'#315c38';
}

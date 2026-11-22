// Floor: unit sphere. Roof: inward-facing half of a torus around +Y. Trace its
// eight conical strips analytically; use the smooth circular normal for glass.
import {GARDEN_WATER_GLSL} from './garden-waters.js';
export const DYSON_GLSL=`
const float DYSON_TUBE=.075;
vec4 dysonSurfaceHit(vec3 ro,vec3 rd,float maximum,float cutaway,bool bandOnly,float phase){
 float b=dot(ro,rd),h=1.0-dot(cross(ro,rd),cross(ro,rd));
 if(h<0.0)return vec4(0,0,0,-1);
 float root=sqrt(h),cap=1.0-2.0*cutaway;
 for(int side=0;side<2;side++){
  float t=-b+(side==0?-root:root);if(t<.0000001||t>maximum)continue;
  vec3 point=ro+rd*t;
  if(bandOnly&&(abs(point.y)>DYSON_TUBE||(cutaway>0.&&point.z>cap)))continue;
  if(cutaway>0.&&!bandOnly&&side==0){
   float lon=(atan(point.z,point.x)+phase)*12./(2.*PI),lat=acos(clamp(point.y,-1.,1.))*8./PI;
   vec3 seam=abs(fract(vec3(lon,lat,lon+lat)+.5)-.5);
   if(all(greaterThanEqual(seam,vec3(.025,.032,.026))))continue;
  }
  return vec4(unit(point),t);
 }
 return vec4(0,0,0,-1);
}
float dysonRoofHit(vec3 ro,vec3 rd,float maximum,float cutaway){
 float a0=dot(rd.xz,rd.xz),b0=dot(ro.xz,rd.xz),c0=dot(ro.xz,ro.xz);
 float endY=ro.y+maximum*rd.y;
 if(min(ro.y,endY)>DYSON_TUBE||max(ro.y,endY)<-DYSON_TUBE)return -1.0;
 // Reject segments confined to the central cavity before testing the arches.
 float radialBase=sqrt(1.0-DYSON_TUBE*DYSON_TUBE),minR=radialBase-DYSON_TUBE;
 if(max(c0,dot(ro.xz+rd.xz*maximum,ro.xz+rd.xz*maximum))<minR*minR)return -1.0;
 float best=maximum;bool found=false;vec2 arc=vec2(0,-1);
 for(int i=0;i<8;i++){
  vec2 next=vec2(arc.x*.92387953-arc.y*.38268343,arc.x*.38268343+arc.y*.92387953);
  float low=DYSON_TUBE*arc.y,high=DYSON_TUBE*next.y;
  if(min(ro.y,endY)<=high&&max(ro.y,endY)>=low){
   float slope=-(next.x-arc.x)/(next.y-arc.y);
   float base=radialBase-DYSON_TUBE*arc.x+slope*(ro.y-low),delta=slope*rd.y;
   float a=a0-delta*delta,b=b0-base*delta,c=c0-base*base,h=b*b-a*c;
   if(h>=0.0){
    // q-form avoids cancellation (including the near-linear cone-generator case).
    float q=-b-(b<0.0?-1.0:1.0)*sqrt(h);
    for(int side=0;side<2;side++){
     float num=side==0?q:c,den=side==0?a:q;if(abs(den)<1e-10)continue;
     float t=num/den;if(t<=.0000001||t>best)continue;
     vec3 p=ro+rd*t;
     if(p.y>=low-.000001&&p.y<=high+.000001&&(cutaway<=0.0||p.z<=1.0-2.0*cutaway)){found=true;best=t;}
    }
   }
  }
  arc=next;
 }
 return found?best:-1.0;
}
// A longitudinal repeat at fixed material coordinates follows the rotating
// shell. The viewing cutaway stays in world space.
vec3 dysonMaterialPoint(vec3 p,float phase){
 float c=cos(phase),s=sin(phase);
 return vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z);
}
float dysonLine(float x,float width,float footprint){
 float d=abs(fract(x+.5)-.5),aa=clamp(footprint,.001,.3);
 return mix(1.0-smoothstep(max(0.0,width-aa),width+aa,d),min(1.0,2.0*width),smoothstep(.25,.7,footprint));
}
vec3 dysonCollectors(vec2 uv,float footprint,vec3 n,vec3 ray){
 // Staggered fields of absorber cassettes, sized along parallels so the
 // polar arrays don't collapse into radial streaks.
 float row=min(25.0,floor(uv.y*26.0)),rowLat=(row+.5)/26.0;
 float columns=max(6.0,2.0*floor(30.0*sin(PI*rowLat)+.5));
 vec2 coord=vec2(uv.x*columns+.5*mod(row,2.0),uv.y*26.0);
 float seam=max(dysonLine(coord.x,.023,footprint*9.0),dysonLine(coord.y,.023,footprint*9.0));
 float ribbon=max(dysonLine(uv.y*6.0,.008,footprint*2.0),dysonLine(uv.x*12.0,.009,footprint*3.0));
 return vec3(mix(mix(.036,.086,seam),.43,ribbon));
}
${GARDEN_WATER_GLSL}
vec3 dysonPark(vec3 n,vec2 uv,float footprint){
 float across=n.y/DYSON_TUBE;
 float fine=fbm(n*65.0+vec3(2,4,7)),meadow=fbm(n*26.0);
 vec3 green=mix(vec3(.094,.24,.074),vec3(.48,.60,.205),smoothstep(.22,.72,fine));
 green=mix(green,vec3(.28,.39,.13),.25*smoothstep(.35,.65,meadow));
 float shore=gardenWaterDistance(uv.x,across);
 vec3 water=mix(vec3(.021,.14,.21),vec3(.07,.44,.47),smoothstep(-.27,-.016,shore)*(.78+.22*fine));
 // Alternate open lawns, orchard terraces and low residential courts. Their
 // footprint is intentionally enlarged enough to read from inside the dome.
 vec2 plots=vec2(uv.x*192.0,across*3.7),lot=fract(plots);
 float zone=hash(floor(plots)+vec2(15,62));
 float border=min(min(lot.x,1.0-lot.x),min(lot.y,1.0-lot.y));
 float occupation=smoothstep(.035,.09,border)*smoothstep(.07,.30,shore);
 float aa=footprint*52.0;
 if(zone<.54){
  vec2 orchard=plots*vec2(4.0,3.0),leaf=fract(orchard)-.5;
  float tree=hash(floor(orchard)),d=length(leaf);
  float crowns=1.0-smoothstep(.19,.34+min(.14,aa),d);
  float shadow=1.0-smoothstep(.23,.41,length(leaf+vec2(.075,.048)));
  vec3 planted=mix(green*1.10,green*.62,shadow);
  vec3 foliage=mix(vec3(.059,.145,.047),vec3(.246,.36,.091),clamp(.65+leaf.x+leaf.y+tree*.18,0.0,1.0));
  planted=mix(planted,foliage,crowns);
  green=mix(green,mix(planted,green*.83,smoothstep(.21,.55,aa)),occupation);
 }else if(zone>.83){
  vec2 court=fract(plots*vec2(2.0,2.0))-.5;
  float building=1.0-smoothstep(.87,1.0,max(abs(court.x)/.32,abs(court.y)/.19));
  float roofSlope=.70+.30*smoothstep(-.01,.02,court.y);
  vec3 roof=mix(vec3(.64,.60,.49),vec3(.55,.35,.215),step(.934,zone))*roofSlope;
  green=mix(green,roof,occupation*building*(1.0-smoothstep(.24,.7,aa)));
 }else{
  float beds=dysonLine(plots.y*9.0,.23,aa*2.0);
  green=mix(green,mix(green,vec3(.49,.49,.168),.27+.31*beds),occupation);
 }
 vec3 bank=mix(vec3(.48,.52,.32),green,smoothstep(.01,.055,shore));
 vec3 park=mix(water,bank,smoothstep(-.009,.011,shore));
 float promenade=(1.0-smoothstep(.005,.016,abs(shore-.063)))*smoothstep(.44,.64,meadow);
 float lane=dysonLine(uv.x*48.0,.013,footprint*8.0)*smoothstep(.12,.35,shore);
 park=mix(park,vec3(.73,.645,.46),max(promenade*.82,lane*.68));
 float edge=smoothstep(.87,.99,abs(across));
 return mix(park,vec3(.42,.40,.33),edge*.92);
}
vec3 dysonShade(vec3 point,vec3 ray,vec4 properties,vec3 metalTint,float footprint){
 vec3 n=unit(point),material=dysonMaterialPoint(n,properties.z);
 bool inside=dot(n,ray)>0.0;
 vec2 uv=vec2(fract(atan(material.z,material.x)/(2.0*PI)+.5),asin(clamp(n.y,-1.0,1.0))/PI+.5);
 vec2 panel=uv*vec2(96,48),edge=abs(fract(panel)-.5);
 float seam=smoothstep(.46,.49,max(edge.x,edge.y));
 if(uSpectrum==5){vec3 grey=vec3(.39+.21*abs(dot(n,ray)));return mix(grey,vec3(.16),seam*.8);}
 if(!inside&&properties.w>.5&&properties.w<1.5){
  // Exposed back of the garden: radiator cassettes between transverse ribs,
  // two continuous edge girders and small service beacons on their flanges.
  float y=n.y/DYSON_TUBE,ax=abs(y),bay=uv.x*96.0;
  float girder=smoothstep(.77,.83,ax),shoe=dysonLine(bay,.035,footprint*15.0);
  float fins=dysonLine(y*14.0,.12,footprint*27.0),skin=hash(vec2(floor(bay),floor(y*4.0)));
  vec3 plate=mix(vec3(.13,.17,.18),vec3(.25,.29,.29),skin)*(.73+.27*fins);
  plate=mix(plate,vec3(.46,.52,.51),max(shoe,girder*.86));
  plate=mix(plate,vec3(.13,.16,.16),smoothstep(.90,.95,ax));
  float light=.48+.45*max(0.0,dot(n,unit(vec3(-.5,.8,.4))));
  float beacon=dysonLine(bay-.26,.027,footprint*12.0)*(1.0-smoothstep(.015,.05,abs(ax-.857)));
  return surfaceSpectrum(plate*light+beacon*vec3(.88,.62,.28),light,.48,.8);
 }
 if(!inside){
  float section=hash(floor(panel)),light=max(.0,dot(n,unit(vec3(-.5,.8,.4))));
  vec3 steel=mix(vec3(.225,.22,.213),vec3(.65,.64,.62),section)*(.65+.35*dot(metalTint,vec3(.2126,.7152,.0722)));
  float spec=pow(max(0.0,dot(reflect(ray,n),unit(vec3(-.5,.8,.4)))),28.0);
  steel=steel*(.22+.65*light)+vec3(.74,.73,.71)*spec*.7;
  steel=mix(steel,vec3(.029,.028,.027),seam*.85);
  return surfaceSpectrum(steel,light,.2,.95);
 }
 float light=properties.y;
 bool garden=abs(n.y)<=DYSON_TUBE;
 vec3 surface=garden?dysonPark(material,uv,footprint):dysonCollectors(uv,footprint,n,ray);
 return surfaceSpectrum(surface*(.014+.96*light),min(1.0,light),garden?.30:.43,garden?.10:.88);
}
vec4 dysonGlazing(vec3 p,vec3 ray,vec4 properties,float footprint){
 vec2 radial=p.xz/max(.0001,length(p.xz));
 vec3 normal=unit(p-vec3(radial.x*sqrt(1.0-DYSON_TUBE*DYSON_TUBE),0,radial.y*sqrt(1.0-DYSON_TUBE*DYSON_TUBE)));
 vec3 material=dysonMaterialPoint(p,properties.z);
 float angle=atan(material.z,material.x)/(2.0*PI)+.5;
 float arch=atan(normal.y,-dot(normal.xz,radial))/PI+.5;
 float crossRib=dysonLine(angle*96.0,.035,footprint*16.0);
 float runner=dysonLine(arch*8.0,.035,footprint*34.0);
 float rim=smoothstep(.92,.985,abs(p.y)/DYSON_TUBE);
 float rib=max(max(crossRib,runner*.81),rim);
 float grazing=pow(1.0-abs(dot(normal,ray)),3.0);
 float glint=pow(max(0.0,dot(reflect(ray,normal),-unit(p))),85.0);
 float light=properties.y;
 vec3 glazing=vec3(.66,.79,.80)+vec3(.72,.70,.58)*glint;
 vec3 frame=mix(vec3(.33,.34,.325),vec3(.81,.80,.73),.26+.67*abs(dot(normal,-unit(p))));
 vec3 c=mix(glazing,frame,rib)*(.02+.98*light);
 float alpha=mix(.063+.48*grazing+.31*glint,.95,rib);
 if(uSpectrum==5)return vec4(vec3(.59+.31*rib),alpha);
 return vec4(surfaceSpectrum(c,min(1.0,light),.16,.44),alpha);
}
`;

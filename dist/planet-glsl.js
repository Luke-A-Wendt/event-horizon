// Geographic source maps are included locally; unmapped geology is explicitly
// illustrative. Fine procedural material detail never invents map landmarks.
import {PLANET_ATMOSPHERES} from './planet-profiles.js';

// A finite column through a thin exponential atmosphere. This is evaluated
// on the existing bent ray segments, already clipped by solid intersections;
// the halo therefore shares the surface's lensing and foreground occlusion.
// No separate volume march, texture fetch, or quality-dependent loop is used.
export function planetAtmosphereGLSL({photo=false}={}){return `
vec4 atmosphereProfile(float materialCode){
 float id=floor(materialCode/4.0),style=mod(materialCode,4.0);
 ${Object.entries(PLANET_ATMOSPHERES).map(([id,p])=>`if(abs(id-${Number(id).toFixed(1)})<.1)return vec4(${p.color.map(v=>(v*p.strength).toFixed(5)).join(',')},${p.height.toFixed(5)});`).join('\n ')}
 if(id>.5)return vec4(0);
 if(style>.5&&style<1.5)return vec4(.198,.288,.405,.006);
 if(style>2.5)return vec4(.12,.344,.8,.0068);
 return vec4(0);
}
float atmosphereErf(float x){
 x=clamp(x,-6.0,6.0);return sign(x)*sqrt(max(0.0,1.0-exp(-1.27323954*x*x)));
}
vec3 planetAtmosphereSegment(vec3 first,vec3 last){
 if(uSpectrum>1)return vec3(0);
 vec3 delta=last-first;float distance=length(delta);if(distance<1e-20)return vec3(0);
 vec3 direction=delta/distance,sum=vec3(0);
 for(int j=0;j<12;j++){
  if(j>=uObjectCount)break;if(uColors[j].a>.5||j==uHideObjectIndex)continue;
  vec4 profile=atmosphereProfile(uBodyParams[j].x);if(profile.w<=0.0)continue;
  float radius=max(uObjects[j].w,1e-20);if(uBodyParams[j].z>3.5)radius*=min(uBodyShape[j].x,min(uBodyShape[j].y,uBodyShape[j].z));
  float span=distance/radius;
  vec3 start=(first-uObjects[j].xyz)/radius;
  float along=-dot(start,direction),impact=length(cross(start,direction)),height=profile.w;
  if(impact>1.0+height*6.0||along<-.5||along>span+.5)continue;
  float rho=max(1.0,impact),width=sqrt(2.0*rho*height);
  float column=exp(-max(0.0,impact-1.0)/height)*sqrt(PI*rho*height*.5)*
    (atmosphereErf((span-along)/width)-atmosphereErf(-along/width));
  if(column<=0.0)continue;
  vec3 normal=unit(start+direction*clamp(along,0.0,span));
  float sunlight=smoothstep(-.12,.35,dot(normal,bodyLight(uObjects[j].xyz)));
  vec3 hue=profile.rgb;if(abs(floor(uBodyParams[j].x/4.0)-1.0)<.1&&uSpectrum==0){
   // Dense, pale lower limb fades through blue into the thinner upper air.
   // The sunset belt follows the illuminator rather than the camera.
   float h=max(0.0,impact-1.0)/height,mu=dot(normal,bodyLight(uObjects[j].xyz));
   hue=mix(vec3(.105,.36,.98),vec3(1.03,1.48,1.88),exp(-h*1.85));
   float dusk=exp(-pow((mu+.016)/.13,2.0));
   hue=mix(hue,vec3(.78,.43,.47),dusk*.56*exp(-h*1.2));
   sunlight=smoothstep(-.21,.32,mu);
  }if(uSpectrum==1)hue=vec3(.65,.20,.06)*max(hue.r,max(hue.g,hue.b))*.14;
  sum+=hue*(1.0-exp(-column/max(.01,width)*1.25))*(.025+.975*sunlight)*bodyOpacity(j);
 }
 return sum;
}
${photo?`
// Capture-only, dimensionless single-scattering transfer. Clip the ray to
// the shell before sampling: even an interplanetary step sees the thin limb.
// Profiles are illustrative, rather than measured weather or gas mixtures.
void photoAtmosphere(vec3 first,vec3 last,inout vec3 color,inout float trans,inout vec3 bend){
 if(uSpectrum>1)return;
 vec3 delta=last-first;float distance=length(delta);if(distance<=1e-20)return;
 vec3 dir=delta/distance;
 for(int j=0;j<12;j++){
  if(j>=uObjectCount)break;if(uColors[j].a>.5||j==uHideObjectIndex)continue;
  vec4 air=atmosphereProfile(uBodyParams[j].x);if(air.w<=0.0)continue;
  float radius=max(uObjects[j].w,1e-20);if(uBodyParams[j].z>3.5)radius*=min(uBodyShape[j].x,min(uBodyShape[j].y,uBodyShape[j].z));
  float H=air.w;
  vec3 start=(first-uObjects[j].xyz)/radius,impact=cross(dir,cross(start,dir));
  float outer=1.0+6.0*H,b2=dot(impact,impact);if(b2>=outer*outer)continue;
  float halfChord=sqrt(outer*outer-b2),z0=dot(start,dir);
  float lo=max(-halfChord,z0),hi=min(halfChord,z0+distance/radius);if(hi<=lo)continue;
  vec3 sun=bodyLight(uObjects[j].xyz);float mu=clamp(dot(dir,sun),-1.0,1.0);
  float rayleigh=.75*(1.0+mu*mu),g=.70,aerosol=(1.0-g*g)/pow(1.0+g*g-2.0*g*mu,1.5);
  float densityScale=max(air.r,max(air.g,air.b))*bodyOpacity(j);
  vec3 tint=air.rgb/max(1e-6,max(air.r,max(air.g,air.b)));
  float ds=(hi-lo)/8.0;
  for(int k=0;k<8;k++){
   vec3 point=impact+dir*(lo+(float(k)+.5)*ds);float r=length(point);
   if(r<1.0)continue;
   float density=exp(-(r-1.0)/H),column=density*ds*densityScale;
   vec3 normal=point/r;
   // Light grazes the solid body's shadow; longer slant columns redden the limb.
   float solarCos=dot(normal,sun),sunlit=smoothstep(-.008,.008,solarCos+sqrt(max(0.0,1.0-1.0/(r*r))));
   float solarColumn=.06*density*densityScale/max(.035,solarCos+.08);
   vec3 illumination=exp(-solarColumn*(.2+tint));
   float opticalDepth=column*.075/H*(uSpectrum==1?.18:1.0);
   float alpha=1.0-exp(-opticalDepth);
   vec3 radiance=(.78*rayleigh*tint+.11*aerosol*mix(tint,vec3(1),.72))*illumination;
   if(abs(floor(uBodyParams[j].x/4.0)-1.0)<.1&&uSpectrum==0)radiance+=(.42+.32*rayleigh)*vec3(.90,1.04,1.17)*density*illumination;
   if(uSpectrum==1)radiance=vec3(.66,.24,.09)*dot(radiance,vec3(.33));
   color+=trans*sunlit*alpha*radiance;trans*=1.0-alpha;
   // Weak gradient-index optics: integral of grad_perp ln(n) along the ray.
   if(uFlags.z>.5)bend-=column*(2.9e-4/H)*(normal-dir*dot(normal,dir));
  }
 }
}
`:''}`; }

export function planetMaterialGLSL({photo=false}={}){return `
#if __VERSION__ >= 300
#define planetTexture texture
#else
#define planetTexture texture2D
#endif
uniform sampler2D uPlanetAtlas,uPlanetFocus;
uniform float uPlanetAtlasReady,uPlanetFocusId;
float planetMapAvailable(float id){
 return (abs(id-1.0)<.1||abs(id-2.0)<.1||abs(id-3.0)<.1||abs(id-4.0)<.1||abs(id-10.0)<.1||abs(id-11.0)<.1||abs(id-12.0)<.1||abs(id-13.0)<.1||abs(id-14.0)<.1||abs(id-15.0)<.1||abs(id-17.0)<.1||abs(id-18.0)<.1||abs(id-21.0)<.1)?1.0:0.0;
}
vec3 mappedPlanet(vec3 n,float id){
 // In a right-handed Y-up frame, east increases toward -Z at +X.
 // The negative longitude sign preserves coastlines rather than mirroring them.
 vec2 uv=vec2(fract(.5-atan(n.z,n.x)/(2.0*PI)),.5-asin(clamp(n.y,-1.0,1.0))/PI);
 if(abs(uPlanetFocusId-id)<.1)return planetTexture(uPlanetFocus,uv).rgb;
 // Each 256x128 cell has a two-pixel edge gutter, preserving bilinear seams.
 float cell=id-1.0;vec2 tile=vec2(mod(cell,4.0),floor(cell/4.0));
 return planetTexture(uPlanetAtlas,(tile+mix(vec2(2.5/256.0,2.5/128.0),vec2(253.5/256.0,125.5/128.0),uv))/vec2(4.0,8.0)).rgb;
}
float planetFine(vec3 n){
 float value=noise(n*64.0)*.6+noise(n*131.0)*.4;
 if(uDetail>1.5)value=value*.8+noise(n*267.0)*.2;
 ${photo?'value=value*.9+noise(n*541.0)*.1;':''}
 return value;
}
float featureOval(vec3 n,float longitude,float latitude,vec2 spread){
 float lon=atan(n.z,n.x),lat=asin(clamp(n.y,-1.0,1.0));
 float dl=atan(sin(lon-longitude),cos(lon-longitude));
 return exp(-dot(vec2(dl,lat-latitude)/spread,vec2(dl,lat-latitude)/spread));
}
// Weather is synthesized on a sphere, independent of the fixed NASA map.
// Midlatitude shear stretches fronts eastward. Vortices rotate only the
// surrounding cloud coordinates; no repeating symbols or longitude seam.
vec3 earthWeatherCurl(vec3 p,vec3 axis,float sense,float size){
 vec3 tangent=p-axis*dot(p,axis);float strength=exp(-(1.0-dot(p,axis))*size);
 float angle=sense*strength;return p+tangent*(cos(angle)-1.0)+cross(axis,p)*sin(angle);
}
vec2 earthWeather(vec3 n){
 float season=sin(uTime*.00072),drift=.09*sin(uTime*.0016);
 vec3 p=vec3(n.x*cos(drift)-n.z*sin(drift),n.y,n.x*sin(drift)+n.z*cos(drift));
 p=earthWeatherCurl(p,vec3(-.671,.500,.548),1.45,62.0);
 p=earthWeatherCurl(p,vec3(-.540,-.454,-.708),-1.32,76.0);
 p=earthWeatherCurl(p,vec3(.603,.602,-.523),1.26,66.0);
 p=earthWeatherCurl(p,vec3(.554,-.547,.627),-1.56,72.0);
 float mid=smoothstep(.17,.65,abs(p.y));
 float twist=(.12+.075*mid)*sin(4.35*p.y+.20*season)+.048*(noise(p*3.0)-.5);
 vec3 q=vec3(cos(twist)*p.x-sin(twist)*p.z,p.y,sin(twist)*p.x+cos(twist)*p.z);
 float banks=fbm(q*vec3(8.0,13.0,8.0)+vec3(4.2,.7,-2.1));
 float ribs=fbm(q*vec3(21.0,39.0,21.0)+vec3(.8,1.2,0));
 // Independent cells interrupt the sheared fronts instead of winding all
 // frequencies around a storm center. Higher, translucent cirrus are sparse.
 float cumulus=fbm(n*49.0+vec3(0,0,.80*drift));
 float lace=noise(n*142.0+vec3(3.1,0,.6*drift));
 float coverage=.46*banks+.22*ribs+.23*cumulus+.09*lace;
 float deck=smoothstep(.495,.665,coverage);
 float broken=smoothstep(.40,.67,cumulus+.095*(lace-.5));
 float veil=(1.0-smoothstep(.013,.074,abs(banks-.565)))*smoothstep(.46,.66,ribs)*(.12+.88*mid)*(.3+.7*broken);
 return vec2(clamp(deck+.19*veil,0.0,1.0),clamp(.29*ribs+.46*cumulus+.25*lace,0.0,1.0));
}
vec3 namedPlanetSurface(vec3 n,vec3 normal,vec3 rd,vec3 tint,vec4 properties,vec4 profile,vec3 lightDirection){
 float id=profile.x,lat=asin(clamp(n.y,-1.0,1.0)),lon=atan(n.z,n.x);
 float light=max(dot(normal,lightDirection),0.0),terrain=fbm(n*8.0),fine=planetFine(n),limb=pow(1.0-max(dot(normal,-rd),0.0),3.0);
 vec3 base=vec3(.52,.49,.43)*(.65+.55*terrain);float atmosphere=0.0,ocean=0.0;
 bool mapped=uPlanetAtlasReady>.5&&planetMapAvailable(id)>.5;
 if(mapped){
  vec3 map=mappedPlanet(n,id);
  // Unobserved black areas in mission mosaics retain neutral illustrative
  // terrain instead of falsely presenting black holes in the surface.
  bool missingRegion=(id>9.5&&id<11.5)||(id>17.5&&id<18.5);
  if(!missingRegion||max(map.r,max(map.g,map.b))>.025)base=map;
  else base=vec3(.44,.40,.36)*(.85+.25*terrain);
  if(id<1.5){
   ocean=smoothstep(.005,.06,base.b-base.r)*smoothstep(.0,.04,base.b-base.g);
   // Lift dark, mapped forest and ocean tones without displacing coasts.
   vec3 oceanDay=vec3(.022,.095,.185)+map*vec3(.50,.64,.82);
   vec3 groundDay=pow(max(map,vec3(0)),vec3(.83))*(.93+.14*fine);
   base=mix(groundDay,oceanDay,ocean);atmosphere=1.0;
  }else if(id>2.5&&id<3.5){atmosphere=.14;}
  else if(id>3.5&&id<4.5){atmosphere=.35;}
  else if(id>9.5&&id<11.5){base=mix(base,base*vec3(1.06,.94,.85),.25);}
 }else if(id<1.5){
  // A lightweight blue-world fallback while the local geographic map loads.
  // Only the bundled map defines the actual continents.
  float land=smoothstep(.49,.54,fbm(n*3.7+vec3(1.1,0,2.4)));
  ocean=1.0-land;base=mix(vec3(.025,.12,.31),mix(vec3(.13,.22,.09),vec3(.38,.31,.17),terrain),land);
  atmosphere=1.0;
 }else if(id>3.5&&id<5.5){
  // Gas-giant jets and vortices remain a procedural weather illustration.
  float flow=sin(lon*5.0+sin(lat*24.0)*1.4)+.35*sin(lon*13.0+lat*36.0);
  float bands=.5+.5*sin(lat*33.0+flow*.35);
  if(id<4.5){
   base=mix(vec3(.44,.26,.14),vec3(.87,.78,.63),smoothstep(.1,.8,bands));
   float red=featureOval(n,.45,-.38,vec2(.22,.10));base=mix(base,vec3(.63,.23,.10),red*.9);
  }else{
   // Saturn's haze softens its irregular latitude bands. Their unequal
   // widths and restrained contrast avoid a corrugated, carved appearance.
   float latitudeFlow=lat+noise(vec3(n.x*3.0,lat*10.0,n.z*3.0))*.012;
   float haze=.53+.105*sin(latitudeFlow*19.0+.7*sin(latitudeFlow*6.0))+.055*sin(latitudeFlow*43.0+1.6)+.025*sin(latitudeFlow*79.0+flow*.12);
   base=mix(vec3(.63,.54,.39),vec3(.91,.82,.63),haze);
   // A six-sided jet centered at the north pole, around 78 degrees N.
   float theta=atan(n.z,n.x),sector=mod(theta+PI/6.0,PI/3.0)-PI/6.0;
   float hexRadius=.208/cos(sector),polarRadius=length(n.xz);
   float polarMask=smoothstep(.92,.98,n.y),hexDistance=polarRadius-hexRadius;
   float hexagon=exp(-pow(hexDistance/.019,2.0))*polarMask;
   float polarInterior=(1.0-smoothstep(-.014,.018,hexDistance))*polarMask;
   base=mix(base,vec3(.47,.55,.48)*(.95+.1*terrain),polarInterior*.48);
   base=mix(base,vec3(.31,.43,.41),hexagon*.38);
   base=mix(base,vec3(.17,.25,.23),exp(-polarRadius*polarRadius/ .0015)*smoothstep(.95,.99,n.y));
  }atmosphere=.28;
 }else if(id>5.5&&id<6.5){
  float cloud=fbm(vec3(n.x*5.0,n.y*13.0,n.z*5.0)+vec3(sin(lon*4.0)*.3,0,0));
  base=mix(vec3(.64,.52,.32),vec3(.96,.87,.67),.3+cloud*.65);atmosphere=.8;
 }else if(id>7.5&&id<9.5){
  float bands=.5+.5*sin(lat*37.0+noise(n*10.0)*.55);
  base=id<8.5?mix(vec3(.36,.66,.69),vec3(.61,.82,.82),bands*.25):mix(vec3(.13,.27,.56),vec3(.24,.47,.75),bands*.43);
  if(id>8.5)base=mix(base,vec3(.055,.14,.32),featureOval(n,1.0,-.32,vec2(.21,.085))*.6);
  atmosphere=.4;
 }else if(abs(id-26.0)<.1){
  // Meridional shear and two localized rotating weather systems bend the
  // cloud deck. Longitude is wrapped to keep the anti-meridian seamless.
  float jet=lat+.037*sin(lon*3.0+sin(lat*9.0))+.029*(terrain-.5);
  vec2 storm=vec2(atan(sin(lon-.78),cos(lon-.78))/.32,(lat+.22)/.125);
  vec2 storm2=vec2(atan(sin(lon+2.18),cos(lon+2.18))/.22,(lat-.38)/.095);
  float v=exp(-dot(storm,storm)),v2=exp(-dot(storm2,storm2));
  jet+=(storm.x*v-storm2.x*v2)*.20;
  float current=.55+.29*sin(jet*17.0+1.55*sin(jet*5.0))+.14*sin(jet*48.0+1.3*terrain);
  base=mix(vec3(.13,.17,.32),vec3(.20,.60,.55),smoothstep(.10,.65,current));
  base=mix(base,vec3(.61,.86,.72),smoothstep(.54,.91,current)*.93);
  float wisp=noise(vec3(n.x*12.0,jet*91.0,n.z*12.0))*smoothstep(.18,.78,current);
  base*=.85+.24*wisp+.15*fine;
  float eyeRing=(exp(-abs(length(storm)-.72)*5.0)+exp(-abs(length(storm2)-.65)*6.0))*.60;
  base=mix(base,vec3(.87,.84,.64),min(1.,eyeRing));base=mix(base,vec3(.12,.22,.27),max(v*v*v,v2*v2*v2)*.84);
  atmosphere=.54;
 }else if(abs(id-25.0)<.1){
  // Vulcan is fictional. A seamless, body-fixed mineral terrain: dark mesa
  // country, rust slopes and pale dust deposited across sheltered basins.
  float massif=.72*terrain+.28*noise(n*23.0+vec3(8.2,-3.1,1.4));
  float basin=1.0-smoothstep(.33,.59,massif);
  vec3 rock=mix(vec3(.32,.13,.085),vec3(.66,.31,.15),smoothstep(.36,.69,terrain));
  vec3 sand=mix(vec3(.65,.34,.19),vec3(.89,.63,.36),smoothstep(.25,.69,fine));
  base=mix(rock,sand,basin);
  // Wind-scoured, broken ridges. Stretch noise along the prevailing wind;
  // avoid repeating contours or long uninterrupted latitude bands.
  vec3 drift=vec3(n.x+.38*n.z,n.y-.22*n.x,n.z-.38*n.x)*vec3(36.0,119.0,64.0);
  float lee=noise(drift+vec3(2.1*terrain,4.0*massif,0.0));
  base*=.79+.34*fine+.13*(lee-.5);
  base=mix(base,vec3(.91,.69,.45),smoothstep(.55,.84,lee)*(.11+.19*basin));
 }else if(id>15.5&&id<16.5){
  base=mix(vec3(.48,.30,.10),vec3(.83,.62,.29),.45+.35*fbm(n*6.0));atmosphere=.95;
 }else{
  float crater=pow(max(0.0,1.0-abs(noise(n*23.0)-.48)*8.0),6.0);
  base*=.85+.25*fine-crater*.18;
  if(id>18.5&&id<19.5){base=vec3(.29,.29,.28)*(.7+.5*terrain);float bright=featureOval(n,4.2,.35,vec2(.015));base+=vec3(.6)*bright;}
  if(id>19.5&&id<20.5){base=vec3(.49,.45,.39)*(.65+.55*terrain);base*=1.0-.16*smoothstep(.6,.9,-n.y);}
  if(id>22.5&&id<23.5){base=mix(vec3(.49,.59,.61),vec3(.86,.89,.85),terrain);float cracks=pow(1.0-abs(noise(n*17.0)-.5)*2.0,28.0);base*=1.0-cracks*.27;}
 }
 if(abs(id-1.0)<.1){
  vec2 weather=earthWeather(n);
  // The brightest cloud tops and thinner blue-gray cloud edges leave clear
  // surface windows in every hemisphere.
  vec3 cloud=mix(vec3(.49,.59,.68),vec3(1.06,1.085,1.12),smoothstep(.13,.91,weather.x)*.74+.26*weather.y);
  base=mix(base*(1.0-.13*weather.x),cloud,weather.x);ocean*=1.0-weather.x;
 }
 // The maps define geography. Only subtle material grain is added below a
 // map texel; it is not claimed as observed kilometre-scale relief.
 base*=tint*(.97+.06*fine);
 float diffuse=.028+light*.98;
 if(abs(id-1.0)<.1)diffuse=.023+1.08*pow(light,.83)+.031*smoothstep(-.20,.22,dot(normal,lightDirection));
 vec3 shaded=base*diffuse;
 ${photo?`// Water's reflected energy depends on the incidence angle, not a painted spot.
 if(ocean>.01&&light>0.0&&uSpectrum==0){
  float nl=max(dot(normal,lightDirection),.0001),nv=max(dot(normal,-rd),.0001);
  vec3 h=unit(lightDirection-rd);float nh=max(dot(normal,h),0.0),vh=clamp(dot(-rd,h),0.0,1.0);
  float a2=.018,d=nh*nh*(a2-1.0)+1.0;
  float distribution=a2/(PI*d*d),visibility=.5/max(.001,nl*sqrt(nv*nv*(1.0-a2)+a2)+nv*sqrt(nl*nl*(1.0-a2)+a2));
  float fresnel=.0204+.9796*pow(1.0-vh,5.0);
  shaded+=vec3(1.0,.97,.9)*nl*distribution*visibility*fresnel*ocean;
 }`:`if(ocean>.01){vec3 halfVector=unit(lightDirection-rd);shaded+=vec3(.8,.9,1)*pow(max(dot(normal,halfVector),0.0),80.0)*ocean*.45;}`}
 shaded+=vec3(.17,.37,.66)*limb*atmosphere*(.025+.16*light);
 if(abs(id-1.0)<.1&&uSpectrum==0){
  float slant=pow(1.0-clamp(dot(normal,-rd),0.,1.),2.35);
  float day=smoothstep(-.20,.48,dot(normal,lightDirection));
  shaded=mix(shaded,vec3(.31,.63,1.03),slant*(.016+.39*day));
 }
 return surfaceSpectrum(shaded,light,.09+.11*terrain,id<1.5?.18:.03);
}
`;}

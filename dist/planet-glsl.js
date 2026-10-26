// Geographic source maps are included locally; unmapped geology is explicitly
// illustrative. Fine procedural material detail never invents map landmarks.
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
   float cloudShape=fbm(n*9.0+vec3(.15*sin(uTime*.001),0,.1*cos(uTime*.001)));
   float clouds=smoothstep(.56,.76,cloudShape)*(.5+.5*noise(n*35.0));
   base=mix(base,vec3(.93,.96,1),clouds*.82);ocean*=1.0-clouds;atmosphere=1.0;
  }else if(id>2.5&&id<3.5){atmosphere=.14;}
  else if(id>3.5&&id<4.5){atmosphere=.35;}
  else if(id>9.5&&id<11.5){base=mix(base,base*vec3(1.06,.94,.85),.25);}
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
 }else if(id>15.5&&id<16.5){
  base=mix(vec3(.48,.30,.10),vec3(.83,.62,.29),.45+.35*fbm(n*6.0));atmosphere=.95;
 }else{
  float crater=pow(max(0.0,1.0-abs(noise(n*23.0)-.48)*8.0),6.0);
  base*=.85+.25*fine-crater*.18;
  if(id>18.5&&id<19.5){base=vec3(.29,.29,.28)*(.7+.5*terrain);float bright=featureOval(n,4.2,.35,vec2(.015));base+=vec3(.6)*bright;}
  if(id>19.5&&id<20.5){base=vec3(.49,.45,.39)*(.65+.55*terrain);base*=1.0-.16*smoothstep(.6,.9,-n.y);}
  if(id>22.5&&id<23.5){base=mix(vec3(.49,.59,.61),vec3(.86,.89,.85),terrain);float cracks=pow(1.0-abs(noise(n*17.0)-.5)*2.0,28.0);base*=1.0-cracks*.27;}
 }
 // The maps define geography. Only subtle material grain is added below a
 // map texel; it is not claimed as observed kilometre-scale relief.
 base*=tint*(.97+.06*fine);
 float diffuse=.028+light*.98;
 vec3 shaded=base*diffuse;
 if(ocean>.01){vec3 halfVector=unit(lightDirection-rd);shaded+=vec3(.8,.9,1)*pow(max(dot(normal,halfVector),0.0),80.0)*ocean*.45;}
 shaded+=vec3(.17,.37,.66)*limb*atmosphere*(.025+.16*light);
 return surfaceSpectrum(shaded,light,.09+.11*terrain,id<1.5?.18:.03);
}
`;}

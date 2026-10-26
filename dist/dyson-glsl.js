// Analytic hollow shell: only two surface candidates, with no volume marching.
// Procedural settlement detail scales with the normal shader quality settings.
export const DYSON_GLSL=`
vec4 dysonSurfaceHit(vec3 ro,vec3 rd,float maximum,float cutaway){
 float b=dot(ro,rd),h=1.0-dot(cross(ro,rd),cross(ro,rd));
 if(h<0.0)return vec4(0,0,0,-1);
 float root=sqrt(h),cap=1.0-2.0*cutaway;
 for(int side=0;side<2;side++){
  float t=-b+(side==0?-root:root);if(t<.0000001||t>maximum)continue;
  vec3 point=ro+rd*t;if(cutaway>0.0&&point.z>cap)continue;
  return vec4(unit(point),t);
 }
 return vec4(0,0,0,-1);
}
vec3 dysonShade(vec3 point,vec3 ray,vec4 properties,vec3 metalTint){
 vec3 n=unit(point);bool inside=dot(n,ray)>0.0;
 vec2 uv=vec2(atan(n.z,n.x)/(2.0*PI)+.5,asin(clamp(n.y,-1.0,1.0))/PI+.5);
 vec2 panel=uv*vec2(96,48),edge=abs(fract(panel)-.5);
 float seam=smoothstep(.46,.49,max(edge.x,edge.y));
 if(uSpectrum==5){vec3 grey=vec3(.39+.21*abs(dot(n,ray)));return mix(grey,vec3(.16),seam*.8);}
 if(!inside){
  float section=hash(floor(panel)),light=max(.0,dot(n,unit(vec3(-.5,.8,.4))));
  vec3 steel=mix(vec3(.18,.25,.31),vec3(.57,.64,.69),section)*(.65+.35*metalTint);
  float spec=pow(max(0.0,dot(reflect(ray,n),unit(vec3(-.5,.8,.4)))),28.0);
  steel=steel*(.22+.65*light)+vec3(.5,.7,.85)*spec*.7;
  steel=mix(steel,vec3(.018,.032,.045),seam*.85);
  return surfaceSpectrum(steel,light,.2,.95);
 }
 float terrain=fbm(n*7.0+vec3(2,1,5)),fine=fbm(n*48.0);
 float water=1.0-smoothstep(.40,.445,terrain);
 float river=1.0-smoothstep(.007,.024,abs(terrain-.48+.025*sin(uv.y*84.0)));
 water=max(water,river*.85);
 vec3 gardens=mix(vec3(.07,.22,.075),vec3(.39,.51,.15),smoothstep(.25,.76,fine));
 vec3 lakes=mix(vec3(.018,.12,.20),vec3(.08,.39,.50),fine);
 vec3 habitat=mix(gardens,lakes,water);
 vec2 block=uv*vec2(420,210);float cell=hash(floor(block));
 float urban=smoothstep(.59,.70,terrain)*(1.0-water),panels=step(.80,cell)*(1.0-water)*step(.48,fine);
 float roads=1.0-smoothstep(.025,.055,min(abs(fract(block.x)-.5),abs(fract(block.y)-.5)));
 habitat=mix(habitat,vec3(.22,.25,.23)+cell*.22,urban*.82);
 habitat=mix(habitat,vec3(.018,.055,.105),panels*.88);
 habitat=mix(habitat,vec3(.47,.48,.42),roads*urban*.7);
 habitat=mix(habitat,vec3(.16,.21,.20),seam*.32);
 float light=properties.y;
 vec3 cityLights=vec3(1.0,.53,.15)*urban*step(.72,cell)*.035/(1.0+light*5.0);
 habitat=habitat*(.015+light*.96)+cityLights;
 return surfaceSpectrum(habitat,min(1.0,light),.32,.12);
}
`;

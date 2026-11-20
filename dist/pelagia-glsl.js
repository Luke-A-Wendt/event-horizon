import {CREST_GAIN,CREST_DATUM_METERS,CREST_BLEND_METERS} from './pelagia-tide.js';
import {PELAGIA_BED_GLSL} from './pelagia-geography.js';

// Tide-frame X points to the hole; geography rotates with the solid planet.
// Tide data = relative amplitude [m], sea datum [m], bed phase, 1/bound [1/m].
export const PELAGIA_GLSL=PELAGIA_BED_GLSL+`
vec3 pelagiaCrust(vec3 n,float a){
 float c=cos(a),s=sin(a);return vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);
}
float pelagiaDepth(vec3 n,vec4 tide){
 return tide.y+tide.x*(1.5*n.x*n.x-.5)-pelagiaBedMeters(pelagiaCrust(n,tide.z));
}
float pelagiaHeight(vec3 n,vec3 axes,vec4 tide){
 return 1./length(n/axes)+max(0.,-pelagiaDepth(n,tide))*tide.w;
}
float pelagiaGap(vec3 p,vec3 axes,vec4 tide){
 float r=max(1.e-9,length(p));return r-pelagiaHeight(p/r,axes,tide);
}
vec3 pelagiaNormal(vec3 n,vec3 axes,vec4 tide){
 if(pelagiaDepth(n,tide)>=0.)return unit(n/(axes*axes));
 vec3 e=unit(cross(n,abs(n.y)<.9?vec3(0,1,0):vec3(0,0,1))),f=cross(n,e);
 float h=pelagiaHeight(n,axes,tide),eps=.0004;
 return unit(n-(e*(pelagiaHeight(unit(n+eps*e),axes,tide)-h)+f*(pelagiaHeight(unit(n+eps*f),axes,tide)-h))/(eps*h));
}
vec4 pelagiaSolidHit(vec3 ro,vec3 rd,vec3 axes,vec4 tide){
 float impact=dot(cross(ro,rd),cross(ro,rd)),mid=-dot(ro,rd);
 if(impact>1.)return vec4(0,0,0,-1);
 float wing=sqrt(max(0.,1.-impact)),lo=max(0.,mid-wing),exitT=mid+wing;
 if(exitT<=lo)return vec4(0,0,0,-1);
 vec4 water=ellipsoidHit(ro,rd,vec3(0),axes);
 // The chord up to the sea surface is very short except at a grazing limb.
 // Resolve dry ground in that chord; the ocean itself has an analytic hit.
 bool inside=lo==0.&&pelagiaGap(ro,axes,tide)<0.;
 float hi=inside?exitT:water.w;
 if(!inside&&hi>=lo&&pelagiaDepth(unit(ro+rd*hi),tide)>=0.&&impact<.98*min(axes.x,min(axes.y,axes.z))*min(axes.x,min(axes.y,axes.z)))return water;
 if(!inside&&(hi<lo||impact>=.98*min(axes.x,min(axes.y,axes.z))*min(axes.x,min(axes.y,axes.z)))){
  // Mountains can occult even a ray that entirely misses the ocean.
  float start=lo,end=hi>=lo?hi:exitT;bool bracket=false;
  for(int i=1;i<=12;i++){
   float t=mix(start,end,float(i)/12.);
   if(pelagiaGap(ro+rd*t,axes,tide)<=.0000001){hi=t;bracket=true;break;}lo=t;
  }
  if(!bracket)return water;
 }
 for(int i=0;i<9;i++){
  float t=(lo+hi)*.5;bool below=pelagiaGap(ro+rd*t,axes,tide)<0.;
  if(below==inside)lo=t;else hi=t;
 }
 float t=(lo+hi)*.5;vec3 n=unit(ro+rd*t);
 return vec4(pelagiaNormal(n,axes,tide),t);
}
float pelagiaCrest(float x,vec4 tide){
 float h=max(0.,tide.y+tide.x*(1.5*x*x-.5)-${CREST_DATUM_METERS.toFixed(1)});
 return ${(CREST_GAIN-1).toFixed(1)}*(h<${CREST_BLEND_METERS.toFixed(1)}?h*h/${(2*CREST_BLEND_METERS).toFixed(1)}:h-${(.5*CREST_BLEND_METERS).toFixed(1)})*tide.w;
}
float pelagiaCrestRadius(vec3 n,vec3 axes,vec4 tide){
 return 1./length(n/axes)+pelagiaCrest(n.x,tide);
}
float pelagiaSeaGap(vec3 p,vec3 axes,vec4 tide){
 float r=max(1.e-10,length(p));return r-pelagiaCrestRadius(p/r,axes,tide);
}
vec4 pelagiaHit(vec3 ro,vec3 rd,vec3 axes,vec4 tide){
 // The bed and physical ocean provide a solid limit. Search only in front of
 // it for the two raised crests. No noise or terrain evaluations in this loop.
 vec4 solid=pelagiaSolidHit(ro,rd,axes,tide);
 float mid=-dot(ro,rd);vec3 foot=ro+mid*rd;float wing2=1.-dot(foot,foot);
 if(wing2<=0.||pelagiaCrest(1.,tide)<=0.)return solid;
 float wing=sqrt(wing2),start=max(0.,mid-wing),end=mid+wing;
 if(solid.w>=0.)end=min(end,solid.w);
 if(end<=start)return solid;
 float lo=start,hi=end;bool found=false;
 for(int j=1;j<=36;j++){
  float t=mix(start,end,float(j)/36.);
  if(pelagiaSeaGap(foot+(t-mid)*rd,axes,tide)<=0.){hi=t;found=true;break;}lo=t;
 }
 if(!found)return solid;
 for(int j=0;j<10;j++){float t=(lo+hi)*.5;if(pelagiaSeaGap(foot+(t-mid)*rd,axes,tide)>0.)lo=t;else hi=t;}
 vec3 n=unit(foot+(hi-mid)*rd);if(pelagiaCrest(n.x,tide)<=0.)return solid;
 vec3 e=unit(cross(n,abs(n.y)<.9?vec3(0,1,0):vec3(0,0,1))),f=cross(n,e);
 float h=pelagiaCrestRadius(n,axes,tide),dx=.0007;
 vec3 normal=unit(n-(e*(pelagiaCrestRadius(unit(n+e*dx),axes,tide)-h)+f*(pelagiaCrestRadius(unit(n+f*dx),axes,tide)-h))/(dx*h));
 return vec4(normal,hi);
}
vec3 pelagiaShade(vec3 n,vec4 tide,vec3 normal,vec3 rd,vec3 light){
 vec3 p=pelagiaCrust(n,tide.z);
 float depth=pelagiaDepth(n,tide),nl=dot(normal,light),day=max(nl,0.);
 float textureGrain=fbm(p*72.+vec3(3.,8.,1.));
 // Seabed reflection is confined to shallow water. Open water is opaque,
 // with a Fresnel glint; inland highlands are rough, diffusely lit rock.
 vec3 ocean=mix(vec3(.026,.19,.33),vec3(.083,.49,.46),exp(-max(depth,0.)/1000.));
 ocean*=.90+.15*textureGrain;
 float bed=tide.y+tide.x*(1.5*n.x*n.x-.5)-depth;
 // Basaltic deeps, sediment-coloured shelves, and lighter dry uplands stay
 // attached to the crust while the ocean crosses them.
 float upland=smoothstep(-950.,1750.,bed);
 vec3 stone=mix(vec3(.24,.19,.175),vec3(.55,.39,.24),smoothstep(-4600.,-900.,bed));
 stone=mix(stone,vec3(.46,.40,.31),upland);
 stone=mix(stone,vec3(.59,.53,.42),smoothstep(1600.,3500.,bed));
 float ridge=fbm(p*24.+2.);
 stone*=.65+.42*textureGrain+.28*ridge;
 stone=mix(stone,vec3(.67,.61,.47),.5*exp(-abs(depth)/36.));
 float wet=smoothstep(-3.,3.,depth);
 vec3 material=mix(stone,ocean,wet);
 float skyLight=.023+.07*smoothstep(-.14,.6,nl);
 vec3 col=material*(skyLight+1.15*day);
 float fres=.022+.978*pow(1.-max(0.,dot(normal,-rd)),5.);
 vec3 halfVector=unit(light-rd);
 // Broad sky reflection along the moving curved waterline makes the
 // two raised crests read as water even when a distant sun misses the glint.
 col+=wet*(.12+.70*fres)*vec3(.028,.14,.23)*(.23+.77*smoothstep(-.3,.5,nl));
 col+=wet*day*fres*vec3(1.,1.03,1.08)*(3.*pow(max(0.,dot(normal,halfVector)),48.)+12.*pow(max(0.,dot(normal,halfVector)),190.));
 // Thin, broken clouds leave the shorelines visible. This is an optical
 // material, not a temperature, precipitation or atmospheric circulation model.
 float clouds=fbm(vec3(p.x*6.+p.y,p.y*12.,p.z*6.)+vec3(7.,1.,4.));
 float veil=smoothstep(.63,.78,clouds)*(.18+.20*textureGrain);
 col=mix(col,vec3(.79,.84,.87)*(.05+.99*day),veil);
 col+=vec3(.12,.27,.49)*pow(1.-max(0.,dot(normal,-rd)),4.)*smoothstep(-.18,.38,nl)*.52;
 return surfaceSpectrum(col,day,.22,.04);
}
`;

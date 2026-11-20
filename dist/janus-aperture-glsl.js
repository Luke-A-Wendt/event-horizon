import {JANUS_LENS} from './janus-lens.js';

// Native shared sky, surface atlas, ellipsoid and annulus optics. Only Janus
// shader variants pay for these uniforms. The near and transmitting rays
// sample their own charts; a narrow caustic adds light at the critical curve.
export function installJanusAperture(source,{planetary,rings,slots}){
 const main=source.lastIndexOf('\nvoid main(){');
 const uniforms=`
uniform vec2 uJanusTrimAxis,uJanusMouth;
uniform vec4 uJanusPodEye;
uniform mat3 uJanusPodBasis;
bool janusBackdrop=false;
vec2 janusViewOffset=vec2(0);
uniform vec4 uJanusLocal,uJanusLens,uJanusTarget,uJanusShape,uJanusParams,uJanusTint;
uniform vec3 uJanusLight,uJanusSunTint,uJanusCompanionTint;
uniform vec4 uJanusSun,uJanusCompanion,uJanusRings[2],uJanusRingTints[2];
bool janusForeground=false;
bool janusPeerSky=false;
`;
 // Offset only rays belonging to the resident image. The destination and
 // foreground use the original pixel coordinate, including tiled stills.
 const rayPixel='(gl_FragCoord.xy-uRayViewport.xy+uPhotoOffset+uPhotoJitter-.5*uResolution)/uResolution.y';
 const nativeMain=source.slice(main).replaceAll(rayPixel,'('+rayPixel+'+janusViewOffset)')
  .replaceAll('smoothstep(.35,1.3,length(uv))','smoothstep(.35,1.3,length(uv-janusViewOffset))');
 source=source.slice(0,main)+`
vec2 janusLocalOffset(vec2 uv){
 if(uJanusLocal.z<=0.0||uFlags.z<.5)return vec2(0);
 vec2 v=uv-uJanusLocal.xy;float d=length(v),e=(d-uJanusLocal.z)/uJanusLocal.z;
 return v/max(d,.00001)*uJanusLocal.z*.039*exp(-abs(e)*19.)*uJanusLocal.w;
}
vec3 janusProjectedSky(vec3 ray){
 janusPeerSky=true;vec3 c=sky(ray);janusPeerSky=false;return c;
}
vec3 janusOtherOrbit(vec3 rd){
 vec3 color=janusProjectedSky(rd),light=uJanusLight;
 if(uJanusParams.x<-.5&&uJanusParams.x>-1.5)return color;
 float closest=1e20;
 // Remote body coordinates use the destination radius as one length unit.
 vec4 profile=vec4(uJanusParams.x,uJanusShape.w,uJanusParams.y,0);
 vec3 origin=planetFrame(-uJanusTarget.xyz,profile),direction=planetFrame(rd,profile);
 vec3 shape=max(uJanusShape.xyz,vec3(.1));
 vec4 hit=ellipsoidHit(origin,direction,vec3(0),shape);
 if(hit.w>=0.0){
  vec3 n=unit(planetWorld(hit.xyz,profile));
  color=uJanusParams.x<-1.5?bodySurface(n,rd,uJanusTint.rgb,2.0,vec4(uJanusParams.z,.35,0.,1.),light):planetShade(origin+direction*hit.w,shape,n,rd,uJanusTint.rgb,0.0,vec4(uJanusParams.z,0,0,0),profile,light);
  closest=hit.w;
 }
 for(int j=0;j<2;j++){
  vec4 b=j==0?uJanusSun:uJanusCompanion;if(b.w<=0.0)continue;
  float t=dot(b.xyz,rd),impact=length(cross(rd,b.xyz));if(impact>b.w||t<=0.0)continue;
  float entry=t-sqrt(max(0.,b.w*b.w-impact*impact));if(entry>=closest)continue;
  vec3 normal=unit(rd*entry-b.xyz);closest=entry;
  color=j==0?uJanusSunTint*(2.0+.6*max(0.,dot(normal,-rd))):bodySurface(normal,rd,uJanusCompanionTint,0.0,vec4(0),light);
 }
 ${rings?`for(int k=0;k<2;k++){
  vec4 ring=uJanusRings[k];if(ring.x<=0.0)continue;
  vec4 rprof=vec4(0,ring.w,0,0);
  vec3 ro=planetFrame(-uJanusTarget.xyz/ring.x,rprof),ray=planetFrame(rd,rprof);
  vec4 layer=annulusHit(ro,ray,uJanusRingTints[k].rgb,7.0,vec4(uJanusRingTints[k].w,ring.y,0,ring.z),closest/ring.x);
  if(layer.w<0.0)continue;
  float radius=length((ro+ray*layer.w).xz),density=.3+.7*noise(vec3(radius*137.0,4,1));
  vec3 p=rd*layer.w*ring.x-uJanusTarget.xyz;float shadow=dot(p,light)<0.0?smoothstep(.945,1.,length(cross(p,light))):1.;
  float alpha=clamp(1.0-exp(-ring.z*(.7+2.*density)),.12,.96);
  color=mix(color,layer.rgb*mix(.055,1.,shadow),alpha);
 }`:''}
 return color;
}
// Foreground depth is measured on the physical camera ray, before bending
// the environment. Intersect the pod only inside its angular bounding sphere.
// This avoids a duplicated shell or a lens painted over its viewport.
bool janusOccluded(vec3 ray){
 float idx=uJanusMouth.y;
 if(idx>=0.0){
  vec3 ro=uJanusPodEye.xyz,rd=ray*uJanusPodBasis;
  float along=dot(ro,rd);vec3 off=cross(ro,rd);float disc=1.0-dot(off,off);
  if(disc>=0.0&&along<1.0){
   // Move into the nearby body chart before evaluating metre-sized details.
   vec3 origin=cross(rd,off)+rd*max(along,-sqrt(disc)-.01);
   CraftSurface hull=craftHit(origin,rd,2.1,18.0,0.0,0.0);
   if(hull.t>=0.0&&hull.t<=2.1&&dot(hull.normal,hull.normal)>.5)return true;
  }
 }
 // Opaque nearby worlds can eclipse the entire projected opening for a free
 // observer. Use the front surface in ray space, including partial limb cover.
 float limit=uJanusMouth.x/max(.001,dot(ray,uForward));
 for(int j=0;j<${slots};j++){
  if(j>=uObjectCount)break;
  vec4 b=uObjects[j];
  if(j==uHideObjectIndex||uColors[j].a>2.5||b.w<=0.0||bodyOpacity(j)<.999)continue;
  vec3 rel=(b.xyz-uObserver)/b.w;
  float along=dot(rel,ray);if(along<=0.0||along-1.0>=limit/b.w)continue;
  vec3 miss=cross(rel,ray);float disc=1.0-dot(miss,miss);
  if(disc>=0.0&&along-sqrt(disc)<limit/b.w)return true;
 }
 return false;
}
`+nativeMain.replace('void main(){','void janusScene(){')+`
void main(){
 vec2 uv=(gl_FragCoord.xy-uRayViewport.xy+uPhotoOffset+uPhotoJitter-.5*uResolution)/uResolution.y;
 vec2 rel=uv-uJanusLens.xy;
 float d=length(rel),r=uJanusLens.z,px=1.0/uResolution.y;
 float q=d/max(r,.0000001),strength=uJanusPodEye.w,window=0.0;
 float fov=.83*max(1.,1.35*uResolution.y/uResolution.x);
 bool affected=abs(uJanusLens.w)>.00001&&r>.25*px&&q<${JANUS_LENS.outer};
 if(affected){
  vec3 direct=rayFromFrame(uForward,uRight,uUp,uv,fov);
  janusForeground=janusOccluded(direct);
  janusBackdrop=!janusForeground;
 }
 if(janusBackdrop){
  // A finite radial lens crosses parity near the critical curve. The
  // departure limb, ground tracks and stars all follow this SAME ray.
  float deflection=strength*${JANUS_LENS.nearBend}*2.0/(1.0+q*q*q)*(1.0-smoothstep(${JANUS_LENS.returnStart},${JANUS_LENS.outer},q));
  janusViewOffset=-rel*deflection;
  float feather=max(.85*px/max(r,px*.25),${JANUS_LENS.edgeWidth}*strength);
  if(uJanusTarget.w>.5)window=1.0-smoothstep(1.0-feather,1.0+feather,q);
 }
 // A fully transmitting pixel only needs the receiving environment.
 if(window<1.0)janusScene();else gl_FragColor=vec4(0,0,0,1);
 if(janusBackdrop){
 if(window>0.0){
  float fold=smoothstep(${JANUS_LENS.farCore},1.0,q);
  vec2 sampleUV=uv+janusLocalOffset(uv)-rel*(strength*${JANUS_LENS.farBend}*fold*fold);
  vec3 peer=janusOtherOrbit(rayFromFrame(uForward,uRight,uUp,sampleUV,fov));
  peer=pow(vec3(1)-exp(-max(peer*uExposure,vec3(0))),vec3(.92))*(1.-.22*smoothstep(.35,1.3,length(uv)));
  gl_FragColor.rgb=mix(gl_FragColor.rgb,peer,window);
 }
 float edge=d-r,width=max(.85*px,.008*r),caustic=exp(-abs(edge)/width);
 vec3 rim=mix(vec3(.33,.18,.10),vec3(.28,.59,.82),smoothstep(-.8,.8,rel.y/max(d,px)));
 gl_FragColor.rgb+=rim*.46*caustic*strength*(vec3(1)-.78*gl_FragColor.rgb);
 }
 if(uJanusLocal.z>0.0&&!janusForeground){
  vec2 fp=uv-uJanusLocal.xy;
  float rad=uJanusLocal.z,dist=length(fp),off=abs(dist-rad);
  float leading=.5+.5*dot(fp/max(.00001,dist),uJanusTrimAxis);
  float rim=exp(-off/max(.85*px,.012*rad)),veil=exp(-off/max(2.2*px,.05*rad));
  vec3 light=mix(vec3(.65,.33,.16),vec3(.22,.68,.88),smoothstep(.15,.85,leading));
  gl_FragColor.rgb+=(1.-gl_FragColor.rgb)*light*(rim*.48+veil*.19)*uJanusLocal.w;
 }
}
`;
 // Only the backdrop is traced along a displaced ray. An off-silhouette
 // sample can point back through the pod as it folds near the critical curve.
 source=source.replaceAll('if(j==uHideObjectIndex', 'if((janusBackdrop&&j==int(uJanusMouth.y))||j==uHideObjectIndex')
  .replaceAll('if(uInspectIndex>=0)', 'if(uInspectIndex>=0&&!(janusBackdrop&&uInspectIndex==int(uJanusMouth.y)))');
 // Reuse the actual opaque hull hit from the native pass, including its
 // flush window and landing gear. Never mask the surrounding sky with a sphere.
 source=source.replace(/CraftSurface surface=craftHit\(([^;]+)\);/g,(full,args)=>{
  const a=args.split(',');return full+'if('+a[3]+'>17.5&&'+a[3]+'<18.5&&surface.t>=0.0&&surface.t<='+a[2]+'&&dot(surface.normal,surface.normal)>.5)janusForeground=true;';
 });
 // Once the throat surrounds the hull, sunlight from the receiving orbit
 // reaches the cabin before the coordinate handoff. Avoid a light switch at
 // commit while retaining the normal light calculation before and afterward.
 source=source.replace('vec3 lightWorld=bodyLight(obj.xyz);','vec3 lightWorld=bodyLight(obj.xyz);if(craftTint.a>17.5&&craftTint.a<18.5&&uJanusTarget.w>.5&&uJanusParams.x>=0.)lightWorld=unit(mix(lightWorld,uJanusLight,smoothstep(1.22,1.94,uJanusLens.w))+vec3(0,.000001,0));');
 // Apply the small comoving field on both sides of the exchange. Foreground
 // cabin samples stay in their physical camera coordinates.
 source=source.replace(/(void janusScene\(\)\{[\s\S]*?vec2 uv=[^;]+;)/,'$1'+`
 if(!janusForeground)uv+=janusLocalOffset(uv-janusViewOffset);`);
 source=source.replace('uniform vec2 uResolution',uniforms+'\nuniform vec2 uResolution');
 source=source.replace('vec3 dir=unit(direction),c=vec3(.0008,.0014,.0025);',`
 float janusAngle=janusPeerSky?uJanusParams.w:uJanusTint.w;
 if(janusAngle!=0.0){
  vec3 a=vec3(.5773502692);float c=cos(janusAngle),s=sin(janusAngle);
  starRay=starRay*c+cross(a,starRay)*s+a*dot(a,starRay)*(1.-c);
  direction=direction*c+cross(a,direction)*s+a*dot(a,direction)*(1.-c);
 }
 vec3 dir=unit(direction),c=vec3(.0008,.0014,.0025);`);
 return source;
}

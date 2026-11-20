// Ordinary planetary systems do not need the compact-object ray marcher.
// Keep the same analytic surfaces and local inspection precision, but trace
// only visible intersections. The nearest transparent layer is composited over the nearest opaque hit.
// This keeps rings and cutaways without repeating the spacecraft union.
export function weakFieldMain({photo=false,stellar=false,craft=false,warpJets=false,probe=false,nebulaVolume=false,atmosphere=false,objectSlots=12,fleetWarp=false,fleetView=false}={}){return `
vec3 weakFieldBackgroundRay(vec3 origin,vec3 direction){
 if(uFlags.z<.5)return direction;
 vec3 bend=vec3(0);
 for(int j=0;j<${objectSlots};j++){
  if(j>=uObjectCount)break;
  float type=uColors[j].a;
  if(type>.5&&!(type>1.5&&type<2.5))continue;
  vec3 toward=uObjects[j].xyz-origin;
  float along=dot(toward,direction);if(along<=0.0)continue;
  vec3 impact=toward-direction*along;
  float radius=max(uObjects[j].w,1e-20),mass=uBodyMasses[j]/4300000.0;
  // Weak thin-lens deflection: 4GM/(bc²), regularized inside the body.
  // Compact sources select the full ray-tracing shader instead.
  float impact2=max(dot(impact,impact),radius*radius);
  bend+=impact*(4.0*mass/max(impact2,1e-30));
 }
 return unit(direction+bend);
}
void main(){
 vec2 uv=(gl_FragCoord.xy-uRayViewport.xy+uPhotoOffset+uPhotoJitter-.5*uResolution)/uResolution.y;
 float fov=.83*max(1.0,1.35*uResolution.y/uResolution.x);
 vec3 original=rayFromFrame(unit(uForward),unit(uRight),unit(uUp),uv,fov);
 vec3 camera=uObserver,p=camera,color=vec3(0);
 float pixelAngle=fov/uResolution.y,trans=1.0,transparentMask=0.0,travelled=0.0;
 bool solid=false;${photo&&atmosphere?'vec3 airBend=vec3(0);':''}
 ${nebulaVolume?'float nebulaDistance=0.0,nebulaSample=-1.0;vec4 nebulaCached=vec4(0);':''}${fleetWarp?`
 vec3 cameraRay=original,exitRay,emission;float transmission;bool hullHit;
 warpLocalTrace(cameraRay,exitRay,emission,transmission,hullHit);
 original=exitRay;color=emission;trans=transmission;solid=hullHit;`:''}
 if(!solid){
  float extent=max(1e-8,length(camera)+uBounds*2.1);
  {
   vec3 end=p+original*extent;float fraction=1.0;
   vec4 hit=weakFieldHit(end,p,original,fraction,transparentMask);
   end=mix(p,end,fraction);
   ${nebulaVolume?'nebulaVolumeSegment(p,end,false,nebulaDistance,nebulaSample,nebulaCached,color,trans);':''}
   if(uFlags.x>.5){vec4 grid=coordinateGridSegment(p,end,travelled,pixelAngle);color+=trans*grid.rgb;trans*=1.0-grid.a;}
   ${stellar?'color+=trans*stellarEmissionSegment(p,end);':''}
   ${atmosphere?(photo?'photoAtmosphere(p,end,color,trans,airBend);':'color+=trans*planetAtmosphereSegment(p,end);'):''}
   ${craft?'color+=trans*thrusterSegment(p,end);':''}${fleetView&&craft?`
   // The analytic pass just measured the visible surface. Clip inspection
   // exhaust to that same depth without retracing the entire fleet.
   if(uDriveIndex>=0&&uDriveIndex==uInspectIndex&&uFlightMetrics.w>.5){
    float radius=0.0,kind=4.0;
    for(int j=0;j<${objectSlots};j++){if(j==uDriveIndex){radius=uObjects[j].w;kind=uColors[j].a;}}
    if(radius>0.0)color+=trans*thrusterRay(uInspectCamera,rayFromFrame(uInspectForward,uInspectRight,uInspectUp,uv,fov),length(end-p)/radius,kind>15.5);
   }`:''}
   ${warpJets?'color+=trans*warpJetSegment(p,end,true);':''}
   ${probe?'color+=trans*probeEmissionSegment(p,end);':''}
   color+=trans*hit.rgb*hit.a;trans*=1.0-hit.a;
   travelled+=length(end-p);
   p=end+original*max(1e-12,length(end)*1e-7);
   if(hit.a>.999||trans<.015)solid=true;
  }
  if(!solid){
   ${nebulaVolume?'vec3 cloudRay=weakFieldBackgroundRay(camera,original);nebulaVolumeSegment(p,p+cloudRay*max(0.0,nebulaVolumeRange()-nebulaDistance),false,nebulaDistance,nebulaSample,nebulaCached,color,trans);':''}
   if(uFlags.x>.5){vec4 grid=coordinateGridEscape(p,original,travelled,pixelAngle);color+=trans*grid.rgb;trans*=1.0-grid.a;}
   ${fleetWarp?'color+=trans*skyForWarpTravel(original,cameraRay);':`color+=trans*sky(${photo&&atmosphere?'unit(weakFieldBackgroundRay(camera,original)+airBend)':'weakFieldBackgroundRay(camera,original)'});`}
  }
 }
 ${stellar?'color+=stellarInspectorEmission(uv,fov);':''}
 ${craft&&!fleetView?'color+=thrusterInspectorEmission(uv,fov);':''}
 ${probe?'color+=probeInspectorEmission(uv,fov);':''}
 color=pow(vec3(1)-exp(-max(color*uExposure,vec3(0))),vec3(.92));
 color*=1.0-.22*smoothstep(.35,1.3,length(uv));gl_FragColor=vec4(color,1);
}
`;}


// Preserve the exact primitive/material expressions, but collect one solid
// and the nearest translucent layer in the same scan. A second transparent
// planet/ring behind the first is deliberately not recursively re-traced in
// this weak-field preview; all opaque bodies remain eligible and selectable.
export function weakFieldHitGLSL(source,dockingPair=false,skipWarpCraft=false){
 const start=source.indexOf('vec4 objectHit(');if(start<0)throw new Error('Missing body intersection shader');
 const open=source.indexOf('{',start);let depth=1,end=open+1;
 for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
 let hit=source.slice(start,end).replace('vec4 objectHit(','vec4 weakFieldHit(');
 hit=hit.replace(/if\(j==uHideObjectIndex[^\n]*continue;/,skipWarpCraft?'if(j==uHideObjectIndex||j==uWarpObjectIndex)continue;':'if(j==uHideObjectIndex)continue;');
 hit=hit.replace('fraction=1.0;','fraction=1.0;\n float layerDistance=segmentLength,layerAlpha=0.0;vec3 layerColor=vec3(0);');
 // Gather candidates before the detailed model trace; inlining the hull union
 // inside the full catalog loop overwhelms some mobile shader compilers.
 // The hollow habitat bounds enclose an entire visiting ship. Keep the
 // station and craft in separate slots, then compare their actual surfaces.
 const record=key=>`bool ${key}Found=false,${key}Driven=false,${key}Inspected=false;float ${key}Distance=segmentLength,${key}Opacity=1.0;vec2 ${key}Iris=vec2(0);vec4 ${key}Body=vec4(0),${key}Tint=vec4(0);vec2 ${key}Heading=vec2(1,0);`;
 const gather=key=>`if(entryDistance<${key}Distance){${key}Distance=entryDistance;${key}Found=true;${key}Body=obj;${key}Tint=uColors[j];${key}Heading=uHeadings[j];${key}Iris=uBodyParams[j].xy;${key}Opacity=alpha;${key}Driven=j==uDriveIndex;${key}Inspected=j==uInspectIndex;}`;
 const stationToCraft=['Found','Driven','Inspected','Distance','Opacity','Iris','Body','Tint','Heading'].map(field=>'craft'+field+'=station'+field+';').join('');
 const craftStart=hit.indexOf('if(type>2.5){'),craftOpen=hit.indexOf('{',craftStart);let craftEnd=craftOpen+1,craftDepth=1;
 for(;craftDepth&&craftEnd<hit.length;craftEnd++){if(hit[craftEnd]==='{')craftDepth++;else if(hit[craftEnd]==='}')craftDepth--;}
 if(craftStart<0||craftDepth)throw new Error('Missing craft intersection boundary');
 hit=hit.slice(0,craftStart)+`if(type>2.5){
   float entryDistance=max(0.0,enter)*obj.w;
   ${dockingPair?'if(type>13.5&&type<14.5){'+gather('station')+'}else ':''}${gather('craft')}
   continue;
  }`+hit.slice(craftEnd);
 hit=hit.replace('float layerDistance=',record('craft')+(dockingPair?record('station'):'')+'\n float layerDistance=');
 hit=hit.replace(' if(found){', `
 ${dockingPair?'for(int dockCandidate=0;dockCandidate<2;dockCandidate++){if(dockCandidate==1){'+stationToCraft+'}':''}
 if(craftFound&&craftDistance<nearest){
  vec4 obj=craftBody;vec3 ro=(previous-obj.xyz)/obj.w,offAxis=cross(ro,rd);
  float b=dot(ro,rd),root=sqrt(max(0.0,1.0-dot(offAxis,offAxis)));
  float maximum=min(segmentLength,nearest)/obj.w,shiftedAlong=max(b,-root-.01),advance=shiftedAlong-b;
  vec3 origin=cross(rd,offAxis)+rd*shiftedAlong;
  vec3 localOrigin=craftDriven?vec3(dot(origin,uDriveRight),dot(origin,uDriveUp),dot(origin,uDriveForward)):craftFrame(origin,craftHeading);
  vec3 localDirection=craftDriven?vec3(dot(rd,uDriveRight),dot(rd,uDriveUp),dot(rd,uDriveForward)):craftFrame(rd,craftHeading);
  if(craftInspected){
   localDirection=unit(uInspectRight*dot(rd,uRight)+uInspectUp*dot(rd,uUp)+uInspectForward*dot(rd,uForward));
   vec3 localOffAxis=cross(uInspectCamera,localDirection);float localB=dot(uInspectCamera,localDirection);
   float localRoot=sqrt(max(0.0,1.0-dot(localOffAxis,localOffAxis))),localShift=max(localB,-localRoot-.01);
   advance=localShift-localB;localOrigin=cross(localDirection,localOffAxis)+localDirection*localShift;
  }
  float localMaximum=min(maximum-advance,2.1);
  CraftSurface surface=craftHit(localOrigin,localDirection,localMaximum,craftTint.a,craftIris.x,craftIris.y);
  float normalSize=dot(surface.normal,surface.normal);
  if(surface.t>=0.0&&surface.t<=localMaximum&&normalSize>.5&&normalSize<1.5){
   float t=surface.t+advance;vec3 lightWorld=bodyLight(obj.xyz);
   vec3 light=unit(craftDriven?vec3(dot(lightWorld,uDriveRight),dot(lightWorld,uDriveUp),dot(lightWorld,uDriveForward)):craftFrame(lightWorld,craftHeading));
   vec3 reflected=reflect(localDirection,surface.normal),reflection=craftDriven?uDriveRight*reflected.x+uDriveUp*reflected.y+uDriveForward*reflected.z:craftWorld(reflected,craftHeading);
   vec3 color=shadeCraft(surface,localOrigin+localDirection*surface.t,localDirection,light,sky(reflection));
   color=surfaceSpectrum(color,max(dot(surface.normal,light),0.0),surface.material>19.5?.72:.35,(surface.material>4.5&&surface.material<5.5)?.98:.5);
   if(uSpectrum==5)color=vec3(.52,.88,1.35)*(1.0-smoothstep(.13,.32,abs(dot(surface.normal,localDirection))));
   if(craftOpacity<.999){if(t*obj.w<layerDistance){layerDistance=t*obj.w;layerColor=color;layerAlpha=craftOpacity;}}else{nearest=t*obj.w;closestColor=color;closestAlpha=1.0;found=true;}
  }
 }
 ${dockingPair?'}':''}
 if(found){`);
 hit=hit.replace('nearest=t*obj.w;closestColor=color;closestAlpha=alpha;closestIndex=j;found=true;',
  'if(alpha<.999){if(t*obj.w<layerDistance){layerDistance=t*obj.w;layerColor=color;layerAlpha=alpha;}}else{nearest=t*obj.w;closestColor=color;closestAlpha=alpha;closestIndex=j;found=true;}');
 hit=hit.replace('fraction=clamp(nearest/segmentLength,0.0,1.0);return vec4(closestColor,closestAlpha);',
  'if(layerDistance<nearest)closestColor=mix(closestColor,layerColor,layerAlpha);fraction=clamp(nearest/segmentLength,0.0,1.0);return vec4(closestColor,closestAlpha);');
 hit=hit.replace(' return vec4(0);\n}', ' if(layerAlpha>0.0){fraction=clamp(layerDistance/segmentLength,0.0,1.0);return vec4(layerColor,layerAlpha);}\n return vec4(0);\n}');
 return hit;
}

// Do not leave the driver's parser/optimizer to discover unreachable Kerr,
// accretion, warp and bridge helpers. This is a conservative function call
// graph pass; uniforms/structs/macros and every reachable function stay intact.
export function pruneUnreachableGLSL(source){
 const code=source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,c=>c.replace(/[^\n]/g,' '));
 const pattern=/^(?:float|int|bool|vec[234]|mat[234]|void|CraftSurface)\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\{/gm;
 const definitions=[];const functions=new Map();let match;
 while((match=pattern.exec(code))){
  let depth=1,end=pattern.lastIndex;
  for(;depth&&end<code.length;end++){if(code[end]==='{')depth++;else if(code[end]==='}')depth--;}
  if(depth)return source;
  const fn={name:match[1],start:match.index,end,body:code.slice(pattern.lastIndex,end)};
  definitions.push(fn);const overloads=functions.get(fn.name)||[];overloads.push(fn);functions.set(fn.name,overloads);pattern.lastIndex=end;
 }
 if(!functions.has('main'))return source;
 const reachable=new Set(),pending=['main'];
 while(pending.length){
  const name=pending.pop();if(reachable.has(name))continue;reachable.add(name);
  for(const fn of functions.get(name)||[])for(const call of fn.body.matchAll(/\b([A-Za-z_]\w*)\s*\(/g))if(functions.has(call[1])&&!reachable.has(call[1]))pending.push(call[1]);
 }
 for(const fn of definitions.reverse())if(!reachable.has(fn.name))source=source.slice(0,fn.start)+source.slice(fn.end);
 return source;
}

// Bounded inverse projection through the same optical approximation as shaders.js.
// A previous solution is only a Newton seed: it never smooths a displayed anchor.
// Nonconvergent or occulted images fail closed instead of drawing a false locator.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const clock=()=>globalThis.performance?.now?.()??Date.now();
export function directProjection(point,frame,aspect=1,fov=.83){const q=sub(point,frame.observer),z=dot(q,frame.forward);return z>1e-20?{x:dot(q,frame.right)/z/fov,y:dot(q,frame.up)/z/fov,z}:null;}
function raySphere(a,axis,length,center,radius){const x=center[0]-a[0],y=center[1]-a[1],z=center[2]-a[2],rr=radius*radius,along=x*axis[0]+y*axis[1]+z*axis[2];if(along+radius<0||along-radius>length)return null;if(x*x+y*y+z*z<rr)return 0;const px=x-axis[0]*along,py=y-axis[1]*along,pz=z-axis[2]*along,miss=px*px+py*py+pz*pz;if(miss>rr)return null;const t=(along-Math.sqrt(Math.max(0,rr-miss)))/length;return t>=0&&t<=1?t:null;}
function segmentSphere(a,b,center,radius){const v=sub(b,a),length=Math.hypot(...v);return length>1e-30?raySphere(a,mul(v,1/length),length,center,radius):null;}
const activeGravity=(c,b)=>c.gravityCount===undefined||b.index>=0&&b.index<c.gravityCount;
function shapeFrame(body,renderer){
 if(body.waterCap&&body.coreRadius)return {coreRadius:body.coreRadius,waterCap:{...body.waterCap,direction:[...body.waterCap.direction]}};
 if(!['planet','moon'].includes(body.type)||!body.shapeAxes)return {};
 const maximum=Math.max(...body.shapeAxes),shapeAxes=body.shapeAxes.map(v=>Math.max(.01,v/maximum));
 if(body.tidalBasis)return {shapeAxes,shapeBasis:body.tidalBasis.map(v=>[...v]),shapeStyle:body.shapeStyle};
 const basis=renderer.configCache?.primaryBasis||[[1,0,0],[0,1,0],[0,0,1]],tilt=(body.axialTilt||0)*Math.PI/180,c=Math.cos(tilt),s=Math.sin(tilt),x=basis[0],y=add(mul(basis[1],c),mul(basis[2],s)),z=add(mul(basis[2],c),mul(basis[1],-s));
 const phase=body.index>=0?(renderer.annotationOptics?.bodyParams?.[body.index*4+1]??renderer.bodySurfaceData?.[body.index*4+2]??body.surfaceRotationPhase??0):body.surfaceRotationPhase||0,cp=Math.cos(phase),sp=Math.sin(phase);
 return {shapeAxes,shapeBasis:[add(mul(x,cp),mul(z,sp)),y,add(mul(x,-sp),mul(z,cp))],shapeStyle:body.shapeStyle};
}
function rayBody(a,axis,length,body){
 const sphere=raySphere(a,axis,length,body.center,body.radius);if(sphere===null)return null;
 if(body.waterCap&&body.coreRadius){
  const cap=body.waterCap,center=add(body.center,mul(cap.direction,body.coreRadius*cap.offsetRatio));
  const rock=raySphere(a,axis,length,body.center,body.coreRadius),water=raySphere(a,axis,length,center,body.coreRadius*cap.radiusRatio);
  return rock===null?water:water===null?rock:Math.min(rock,water);
 }
 if(!body.shapeAxes||!body.shapeBasis)return sphere;
 const local=body.shapeBasis.map(v=>dot(sub(a,body.center),v)/body.radius),delta=body.shapeBasis.map(v=>dot(axis,v)*length/body.radius);
 const ellipsoid=(center,radii)=>{const start=local.map((v,i)=>(v-center[i])/radii[i]),segment=delta.map((v,i)=>v/radii[i]),size=Math.hypot(...segment);return size>1e-30?raySphere(start,mul(segment,1/size),size,[0,0,0],1):null;};
 if(body.shapeStyle==='contact'){const shape=body.shapeAxes,a=ellipsoid([-shape[0]*.38,0,0],shape.map((v,i)=>v*[.62,.88,.88][i])),b=ellipsoid([shape[0]*.53,0,0],shape.map((v,i)=>v*[.47,.68,.68][i]));return a===null?b:b===null?a:Math.min(a,b);}
 return ellipsoid([0,0,0],body.shapeAxes);
}

// Below a quarter pixel even the maximal grazing-ray deflection is invisible.
// Ordinary Solar System bodies take this inexpensive path regardless of which
// few bodies fit in the GPU uniforms; compact objects still use the ray solver.
export function hasWeakOpticalField(c){return !c.bridge&&!c.holes.length&&!c.warp?.enabled&&c.bodies.every(b=>!b.collapsed&&(!activeGravity(c,b)||4*b.mass/Math.max(b.radius,1e-30)*c.height/c.fov<.25));}
// A conservative screen-space broadphase for a single immutable optical pose.
// It only rejects rays outside a body's enclosing sphere; the original exact
// sphere/ellipsoid/water-cap test still decides every possible occultation.
// Near-plane and observer-enclosing bodies deliberately keep unbounded boxes.
export function prepareDirectOcclusion(c){
 const bodies=c.occluders||[...c.holes,...c.bodies],bounds=new Float64Array(bodies.length*4),sx=Math.hypot(...c.right),sy=Math.hypot(...c.up),sz=Math.hypot(...c.forward);
 for(let i=0;i<bodies.length;i++){
  const body=bodies[i],q=sub(body.center,c.observer),x=dot(q,c.right),y=dot(q,c.up),z=dot(q,c.forward),rx=body.radius*sx,ry=body.radius*sy,rz=body.radius*sz,near=z-rz,far=z+rz,offset=i*4;
  if(far < -64*Number.EPSILON*(1+Math.abs(z)+Math.abs(rz))){bounds[offset]=Infinity;bounds[offset+1]=-Infinity;bounds[offset+2]=Infinity;bounds[offset+3]=-Infinity;continue;}
  if(!(near>0)||!Number.isFinite(x+y+z+rx+ry+rz)){bounds[offset]=-Infinity;bounds[offset+1]=Infinity;bounds[offset+2]=-Infinity;bounds[offset+3]=Infinity;continue;}
  const x0=(x-rx)/near/c.fov,x1=(x-rx)/far/c.fov,x2=(x+rx)/near/c.fov,x3=(x+rx)/far/c.fov,y0=(y-ry)/near/c.fov,y1=(y-ry)/far/c.fov,y2=(y+ry)/near/c.fov,y3=(y+ry)/far/c.fov;
  const minX=Math.min(x0,x1,x2,x3),maxX=Math.max(x0,x1,x2,x3),minY=Math.min(y0,y1,y2,y3),maxY=Math.max(y0,y1,y2,y3),padX=64*Number.EPSILON*(1+Math.max(Math.abs(minX),Math.abs(maxX))),padY=64*Number.EPSILON*(1+Math.max(Math.abs(minY),Math.abs(maxY)));
  bounds[offset]=minX-padX;bounds[offset+1]=maxX+padX;bounds[offset+2]=minY-padY;bounds[offset+3]=maxY+padY;
 }
 c.directOcclusion={bodies,bounds};return c;
}
function directOccluded(c,target,id,direct,index){
 const v=sub(target,c.observer),length=Math.hypot(...v);if(length<=1e-30)return false;
 const axis=mul(v,1/length),{bodies,bounds}=index;
 for(let i=0;i<bodies.length;i++){
  const j=i*4;if(direct.x<bounds[j]||direct.x>bounds[j+1]||direct.y<bounds[j+2]||direct.y>bounds[j+3])continue;
  const body=bodies[i];if(body.id===id||((body.opacity??1)<.999&&!body.cutaway)||c.hideIndex>=0&&body.index===c.hideIndex||!(body.radius>0))continue;
  const hit=body.cutaway?raySphere(c.observer,axis,length,body.center,body.radius*.22):rayBody(c.observer,axis,length,body);
  if(hit!==null)return true;
 }
 return false;
}
export function projectDirectVisible(c,worldPoint,id=null){
 const target=sub(worldPoint,c.origin),direct=directProjection(target,c,c.aspect,c.fov);if(!direct)return null;
 const index=c.directOcclusion,blocked=index&&index.bodies===c.occluders?directOccluded(c,target,id,direct,index):firstBlocker(c,c.observer,target,id);
 return blocked?null:direct;
}

export function createOpticalContext(renderer){
 const s=renderer.state,k=renderer.configCache||{},o=renderer.annotationOptics;
 const frame=renderer.cameraFrame,rect=renderer.canvas?.getBoundingClientRect?.()||{width:900,height:650},aspect=rect.width/Math.max(1,rect.height),fov=Math.max(.83*Math.max(1,1.35/aspect),renderer.focusMode==='onboard'&&renderer.getFocusFrame?.()?.type==='shuttle'?1.25:0);
 const origin=o?.origin||[0,0,0],observer=o?.observer||sub(frame.observer,origin),bodies=(renderer.renderObjects?.length?renderer.renderObjects:renderer.objectFrames||[]).filter(b=>!['ring','belt','disk','jets'].includes(b.type)).map(b=>({id:b.id,index:b.index,type:b.type,center:o&&b.index>=0?o.objects.slice(b.index*4,b.index*4+3):sub(b.position,origin),radius:o&&b.index>=0?o.objects[b.index*4+3]:b.radius,mass:(o&&b.index>=0?o.bodyMasses?.[b.index]??b.massSolar??0:b.massSolar||0)/4300000,opacity:s.spectrum==='geometry'||b.collapsed||['blackhole','whitehole'].includes(b.type)?1:clamp(o&&b.index>=0?o.bodyOpacity?.[b.index]??b.opacity??1:b.opacity??1,0,1),cutaway:b.starStyle==='tzo'&&!b.collapsed&&s.spectrum!=='geometry'&&(b.opacity??1)<.999,collapsed:!!b.collapsed,spin:b.spinParameter||0,axis:b.spinAxis||b.frame?.[1]||[0,1,0],...shapeFrame(b,renderer)}));
 const holes=[];if(s.blackHole)for(let j=0;j<(s.binary&&!renderer.mergerComplete?2:1);j++)holes.push({id:j?'secondary':'primary',center:(o?.holes||Array.from(renderer.holeData||[])).slice(j*4,j*4+3).map((v,i)=>o?v:v-origin[i]),mass:renderer.holeData[j*4+3],radius:k.horizon?.[j]||0,spin:j?s.secondarySpin:s.spin,axis:j?k.secondaryAxis:k.primaryAxis});
 return {geometry:s.spectrum==='geometry',transparent:!!(o?.transparentBodies??renderer.transparentBodyCount),origin,observer,forward:o?.forward||frame.forward,right:o?.right||frame.right,up:o?.up||frame.up,aspect,fov,width:rect.width,height:rect.height,steps:Math.min(768,Math.max(24,o?.steps||renderer.steps||144)),bounds:o?.bounds||k.bounds||100,mass:renderer.massScale||1,bodies,gravityCount:o?.gravityCount??renderer.gravityCount,holes,lensing:!!s.lensing&&!renderer.cpu,interior:!!s.interiorView&&s.spectrum==='geometry',bridge:!!s.bridge&&!renderer.cpu,bridgeRadius:k.bridgeRadius||1,crossed:s.bridgeMode==='crossed',warp:o?.warp||null,inspectIndex:o?.inspectIndex??frame.inspectIndex,hideIndex:o?.hideIndex??frame.hideIndex??-1,cpu:!!renderer.cpu,cpuLensing:!!s.lensing,budget:{rays:0,iterations:0,maxRays:256,maxIterations:12000,deadline:Infinity,limited:false},occluders:[...holes,...bodies],warpBudget:renderer.quality==='ultra'?192:96};
}
function warpForce(c,p,v,local=false){const w=c.warp;if(!w?.enabled||w.local&&!local||w.radius<=1e-20||!w.strength)return [0,0,0];const q=mul(sub(p,w.center),1/w.radius),r=Math.hypot(...q);if(r>2.5||r<1e-12)return [0,0,0];const n=mul(q,1/r),d=unit(v),axis=unit(w.axis),s=Math.max(1,w.thickness),a=Math.tanh(clamp(s*(r+1),-12,12)),b=Math.tanh(clamp(s*(r-1),-12,12)),shape=s*(b*b-a*a)/(2*Math.tanh(s)),mu=dot(n,axis);return mul(sub(n,mul(d,dot(n,d))),w.strength*shape*(.24+.12*mu)/w.radius);}
export function opticalForce(c,p,v){
 if(!c.lensing||c.interior)return [0,0,0];let total=warpForce(c,p,v);
 for(const b of c.bodies){if(!activeGravity(c,b)||!['star','planet','moon','blackhole','whitehole'].includes(b.type)||b.mass<=0)continue;const q=sub(p,b.center),rr=Math.max(dot(q,q),b.radius*b.radius),r=Math.sqrt(Math.max(rr,1e-30)),angular=cross(q,v);total=add(total,mul(q,-3*b.mass*dot(angular,angular)/Math.max(rr*rr*r,1e-30)));}
 for(const h of c.holes){const q=sub(p,h.center),rr=Math.max(dot(q,q),h.mass*h.mass*.05),r=Math.sqrt(rr),angular=cross(q,v);total=add(total,add(mul(q,-3*h.mass*dot(angular,angular)/(rr*rr*r)),mul(cross(h.axis,v),(h.spin||0)*.23*h.mass*h.mass/(rr*r))));}return total;
}
function bridgeForce(c,p,v){let gradient=[0,0,0];for(const center of c.crossed?[[0,0,0],[.72,0,0]]:[[0,0,0]]){const q=sub(p,center),r2=Math.max(dot(q,q),1e-12);gradient=add(gradient,mul(q,-2/(r2*(4*r2+1))));}gradient=add(gradient,mul(opticalForce(c,mul(p,c.bridgeRadius),v),c.bridgeRadius));return c.lensing?sub(gradient,mul(v,dot(v,gradient))):[0,0,0];}
function firstBlocker(c,a,b,ignore){let first=null,t=Infinity;const v=sub(b,a),length=Math.hypot(...v);if(length<=1e-30)return null;const axis=mul(v,1/length);for(const body of c.occluders||[...c.holes,...c.bodies]){if(body.id===ignore||((body.opacity??1)<.999&&!body.cutaway)||c.hideIndex>=0&&body.index===c.hideIndex||!(body.radius>0))continue;const hit=body.cutaway?raySphere(a,axis,length,body.center,body.radius*.22):rayBody(a,axis,length,body);if(hit!==null&&hit<t){t=hit;first=body.id;}}return first;}

// Integrate one ray to a target plane, retaining occlusion along that same ray.
export function traceProjection(c,xy,target,ignoreId=null,{capture=false,skipOcclusion=false}={}){
 if(c.budget.rays>=c.budget.maxRays||c.budget.iterations>=c.budget.maxIterations||clock()>c.budget.deadline){c.budget.limited=true;return null;}c.budget.rays++;let p=[...c.observer],v=unit(add(c.forward,add(mul(c.right,xy.x*c.fov),mul(c.up,xy.y*c.fov)))),blocked=null;
 const plane=dot(sub(target,c.observer),c.forward),straight=!c.lensing||c.interior||c.cpu||!c.bridge&&!c.holes.length&&!c.warp?.enabled&&(c.gravityCount===0||!c.bodies.some(b=>activeGravity(c,b)&&b.mass>0));
 if(straight){const den=dot(v,c.forward);if(den<=0)return null;const end=add(p,mul(v,plane/den));return {point:end,blocked:skipOcclusion?null:firstBlocker(c,p,end,ignoreId),ray:v};}
 if(c.warp?.local){
  const w=c.warp,q=mul(sub(p,w.center),1/w.radius),start=-dot(q,v),impact=dot(cross(q,v),cross(q,v)),budget=Math.floor(clamp(c.steps*.5,24,c.warpBudget));
  if(impact<=6.25){const half=Math.sqrt(6.25-impact),entry=start-half,leave=start+half;if(leave>=0){
   if(entry>0)p=add(p,mul(v,(entry+.00001)*w.radius));
   for(let j=0;j<budget;j++){
    if(c.budget.iterations++>=c.budget.maxIterations||(c.budget.iterations%32===0&&clock()>c.budget.deadline)){c.budget.limited=true;return null;}const r=Math.hypot(...sub(p,w.center))/w.radius;if(r>2.51&&dot(sub(p,w.center),v)>0)break;
    const dt=clamp(.022+Math.abs(r-1)*.12,.022,.18)*144/budget*w.radius,a=warpForce(c,p,v,true),midV=unit(add(v,mul(a,dt*.5))),midP=add(p,mul(v,dt*.5)),nextV=unit(add(v,mul(warpForce(c,midP,midV,true),dt))),next=add(p,mul(midV,dt));
    const before=dot(sub(p,c.observer),c.forward),after=dot(sub(next,c.observer),c.forward);
    if(after>=plane&&before<=plane){const end=add(p,mul(sub(next,p),clamp((plane-before)/(after-before),0,1)));return {point:end,blocked:skipOcclusion?null:firstBlocker(c,p,end,ignoreId),ray:midV};}
    p=next;v=nextV;
   }
  }}
  if(!c.holes.length){const den=dot(v,c.forward),t=(plane-dot(sub(p,c.observer),c.forward))/den;return t>0?{point:add(p,mul(v,t)),blocked:null,ray:v}:null;}
  // The world pass starts from the original observer with the exiting local
  // direction, exactly as the compact precision pass in the scene shader.
  p=[...c.observer];
 }
 const length=Math.hypot(...p),radius=c.bridge?c.bridgeRadius*18:c.bounds;
 if(length>radius){const b=dot(p,v),disc=b*b-dot(p,p)+radius*radius;if(disc<0||b>=0){const t=plane/dot(v,c.forward);return t>0?{point:add(p,mul(v,t)),blocked:skipOcclusion?null:firstBlocker(c,p,add(p,mul(v,t)),ignoreId),ray:v}:null;}const entry=-b-Math.sqrt(disc),next=add(p,mul(v,Math.max(0,entry-(c.bridge?0:c.mass*.03))));if(dot(sub(next,c.observer),c.forward)>=plane){const end=add(p,mul(v,plane/dot(v,c.forward)));return {point:end,blocked:skipOcclusion?null:firstBlocker(c,p,end,ignoreId),ray:v};}if(!skipOcclusion)blocked=firstBlocker(c,p,next,ignoreId);p=next;}
 for(let i=0;i<c.steps;i++){
  if(c.budget.iterations++>=c.budget.maxIterations||(c.budget.iterations%32===0&&clock()>c.budget.deadline)){c.budget.limited=true;return null;}let dt=Math.max(.000001,c.bounds*.06);
  if(c.bridge){const local=mul(p,1/c.bridgeRadius),r=Math.max(1e-7,Math.min(Math.hypot(...local),c.crossed?Math.hypot(...sub(local,[.72,0,0])):Infinity));if(r<.018)break;dt=Math.min(Math.min(.13*r,.035+.10*Math.abs(r-.5))*288/c.steps,.30*r)*c.bridgeRadius;}
  else for(const h of c.holes){const r=Math.hypot(...sub(p,h.center));if(r<h.radius&&!c.interior){if(capture)return {captureId:h.id,point:p,blocked};return null;}let step=Math.max(r*.065,.045*h.mass)*320/c.steps;step=Math.min(step,Math.max(.018*h.mass,Math.abs(r-h.radius)*.35));if(c.interior)step=Math.max(step,h.mass*.065);dt=Math.min(dt,step);}
  for(const b of c.bodies)if(activeGravity(c,b)&&b.mass>0){const distance=Math.hypot(...sub(p,b.center));dt=Math.min(dt,Math.max(b.radius*(c.bridge?.03:.02),distance*.08)*288/c.steps);}
  const w=c.warp;if(w?.enabled&&!w.local&&w.radius>0){const r=Math.hypot(...sub(p,w.center))/w.radius;if(r<2.8)dt=Math.min(dt,w.radius*clamp(.022+Math.abs(r-1)*.12,.022,.18)*288/c.steps);}
  if(!(dt>0&&Number.isFinite(dt)))return null;
  const force=(p,v)=>c.bridge?mul(bridgeForce(c,mul(p,1/c.bridgeRadius),v),1/c.bridgeRadius):opticalForce(c,p,v);
  const a=force(p,v),midV=c.bridge?unit(add(v,mul(a,dt*.5))):add(v,mul(a,dt*.5)),midP=add(p,mul(v,dt*.5)),nextV=c.bridge?unit(add(v,mul(force(midP,midV),dt))):add(v,mul(force(midP,midV),dt)),next=add(p,mul(midV,dt));
  const before=dot(sub(p,c.observer),c.forward),after=dot(sub(next,c.observer),c.forward);
  if(after>=plane&&before<=plane&&!capture){const t=clamp((plane-before)/(after-before),0,1),end=add(p,mul(sub(next,p),t));if(!skipOcclusion&&!blocked)blocked=firstBlocker(c,p,end,ignoreId);return {point:end,blocked,ray:midV};}
  if(!skipOcclusion&&!blocked)blocked=firstBlocker(c,p,next,ignoreId);
  if(capture){for(const b of c.bodies)if(b.collapsed&&segmentSphere(p,next,b.center,b.radius)!==null)return {captureId:b.id,point:next,blocked};if(blocked&&blocked!==ignoreId)return {captureId:null,blocked};}
  p=next;v=nextV;
  if(Math.hypot(...p)>radius+c.mass*.05&&dot(p,v)>0){if(capture)return {captureId:null,blocked};const den=dot(v,c.forward),t=(plane-dot(sub(p,c.observer),c.forward))/den;if(t>0&&den>0){const end=add(p,mul(v,t));return {point:end,blocked:blocked||(skipOcclusion?null:firstBlocker(c,p,end,ignoreId)),ray:v};}return null;}
 }
 return capture?{captureId:null,blocked}:null;
}
function newton(c,target,seed,ignoreId,tolerance){let xy={x:seed.x,y:seed.y};for(let i=0;i<8;i++){const hit=traceProjection(c,xy,target,ignoreId,{skipOcclusion:true});if(!hit)return null;const error=sub(hit.point,target),ex=dot(error,c.right),ey=dot(error,c.up);if(Math.hypot(ex,ey)<tolerance){const checked=traceProjection(c,xy,target,ignoreId);return checked&&!checked.blocked?{...xy,z:dot(sub(target,c.observer),c.forward),error:Math.hypot(ex,ey)}:null;}const eps=.0003,a=traceProjection(c,{x:xy.x+eps,y:xy.y},target,ignoreId,{skipOcclusion:true}),b=traceProjection(c,{x:xy.x,y:xy.y+eps},target,ignoreId,{skipOcclusion:true});if(!a||!b)return null;const da=mul(sub(a.point,hit.point),1/eps),db=mul(sub(b.point,hit.point),1/eps),xx=dot(da,c.right),xyJ=dot(db,c.right),yx=dot(da,c.up),yy=dot(db,c.up),det=xx*yy-xyJ*yx;if(Math.abs(det)<1e-24)return null;let dx=(yy*ex-xyJ*ey)/det,dy=(-yx*ex+xx*ey)/det;const damp=Math.min(1,.35/Math.max(Math.hypot(dx,dy),1e-30));xy.x-=dx*damp;xy.y-=dy*damp;if(Math.abs(xy.x)>c.aspect||Math.abs(xy.y)>1)return null;}return null;}
export function projectLensedPoint(c,worldPoint,{id=null,radius=0,seed=null,index=-1}={}){
 const target=sub(worldPoint,c.origin),direct=directProjection(target,c,c.aspect,c.fov);if(!direct)return null;
 // The precision inspector is itself a straight camera pass, before the field.
 const own=c.bodies.find(b=>b.index===index),geometryTrace=c.geometry&&own&&['star','planet','moon'].includes(own.type)&&c.lensing&&!c.interior&&(c.bridge||c.gravityCount>0||c.holes.length>0||c.warp?.enabled),inspected=!c.transparent&&!geometryTrace&&index>=0&&index===c.inspectIndex&&!c.warp?.local&&!(own&&['star','blackhole','whitehole'].includes(own.type)&&(own.collapsed||2*own.mass/Math.max(own.radius,1e-20)>.01));
 if(c.cpu||!c.lensing||c.interior||inspected){const hit=traceProjection({...c,lensing:false},direct,target,id);return hit&&!hit.blocked?direct:null;}
 if(c.warp?.local&&!c.holes.length&&index!==c.warp.index)return null;
 const tolerance=Math.max(radius*.012,direct.z*c.fov/Math.max(1,c.height)*.35),seeds=[];if(seed)seeds.push(seed);
 // The thin-lens solutions are seeds only; every reported point is checked by
 // the full bounded optical integrator, including the foreground occultations.
 for(const h of c.holes){const lens=directProjection(h.center,c,c.aspect,c.fov);if(!lens||lens.z>=direct.z)continue;const dx=direct.x-lens.x,dy=direct.y-lens.y,beta=Math.hypot(dx,dy),e2=4*h.mass*(direct.z-lens.z)/(lens.z*direct.z*c.fov*c.fov);if(e2<=0)continue;const axis=beta>1e-8?[dx/beta,dy/beta]:[1,0],root=Math.sqrt(beta*beta+4*e2);for(const theta of [(beta+root)*.5,(beta-root)*.5])seeds.push({x:lens.x+axis[0]*theta,y:lens.y+axis[1]*theta});}
 seeds.push(direct);for(const candidate of seeds.slice(0,4)){const result=newton(c,target,candidate,id,tolerance);if(result)return result;}return null;
}

// A hole has no visible central emitter. Its anchor is the midpoint of the
// actual capture-mask cross sections, not a projected coordinate horizon.
export function projectShadow(c,body){const target=sub(body.position,c.origin),direct=directProjection(target,c,c.aspect,c.fov);if(!direct)return null;const estimate=body.radius/Math.max(direct.z,1e-20)/c.fov*(c.cpu?1.6:2.6);if(!c.lensing&&!c.cpu)return {...direct,radius:body.radius/Math.max(direct.z,1e-20)/c.fov};if(c.cpu){const mass=c.holes.find(h=>h.id===body.id)?.mass||c.bodies.find(b=>b.id===body.id)?.mass||body.radius/2;return {...direct,radius:(c.cpuLensing?3*Math.sqrt(3)*mass:body.radius)/Math.max(direct.z,1e-20)/c.fov};}let exhausted=false;const capture=xy=>{const trace=traceProjection(c,xy,target,body.id,{capture:true});if(!trace)exhausted=true;return trace?.captureId===body.id;};let center={x:direct.x,y:direct.y};if(!capture(center)){const seed=projectLensedPoint({...c,holes:c.holes.filter(h=>h.id!==body.id),bodies:c.bodies.filter(b=>b.id!==body.id)},body.position,{id:body.id,radius:body.radius});if(!seed||!capture(seed))return null;center={x:seed.x,y:seed.y};}
 const edges=[];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){let lo=0,hi=Math.max(estimate,1/c.height);for(let j=0;j<3&&capture({x:center.x+dx*hi,y:center.y+dy*hi});j++)hi*=1.8;for(let j=0;j<7;j++){const mid=(lo+hi)*.5;if(capture({x:center.x+dx*mid,y:center.y+dy*mid}))lo=mid;else hi=mid;}edges.push((lo+hi)*.5);}
 if(exhausted)return null;return {...direct,x:center.x+(edges[0]-edges[1])*.5,y:center.y+(edges[2]-edges[3])*.5,radius:(edges[0]+edges[1]+edges[2]+edges[3])*.25,shadow:true};}

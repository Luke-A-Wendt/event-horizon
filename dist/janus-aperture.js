import {applyJanusCanvasLens,janusPixelBounds} from './janus-canvas-lens.js';
import {JANUS_LENS,janusLensStrength} from './janus-lens.js';
// All lens coordinates are differences in the local chart, never a Float32
// subtraction across Andromeda's galactic baseline. The two cameras share a
// physical cabin and look direction; only the surrounding orbital chart changes.
import {isJanusParkingWarp} from './janus-local.js';
import {cameraRelative} from './camera-framing.js';
import {REFERENCE_RG_METERS} from './objects.js';

const sub=(a,b)=>a.map((x,i)=>x-b[i]),plus=(a,b)=>a.map((x,i)=>x+b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const unit=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export const JANUS_APERTURE_UNIFORMS=['uJanusPodEye','uJanusPodBasis','uJanusMouth','uJanusLocal','uJanusTrimAxis','uJanusLens','uJanusTarget','uJanusShape','uJanusLight','uJanusParams','uJanusTint','uJanusRings[0]','uJanusRingTints[0]','uJanusCompanion','uJanusCompanionTint','uJanusSun','uJanusSunTint'];

export function janusSkyAngle(key){
 if(!key||key==='sol')return 0;
 if(key==='m31')return 2*Math.PI/3;
 let h=2166136261;for(const c of key)h=Math.imul(h^c.charCodeAt(0),16777619);
 return .38+5.55*((h>>>0)/4294967296);
}
function viewedJanus(r){
 const pilot=r.frameById?.get(r.driveId),focus=r.frameById?.get(r.focusId);
 if(pilot?.hullModel==='janusPod')return pilot;
 if(focus?.hullModel==='janusPod')return focus;
 return r.objectFrames?.find(b=>b.hullModel==='janusPod');
}
export function janusAperture(r,frame,w,h){
 const pod=viewedJanus(r);if(!pod)return null;
 const view=r.getJanusExchangeVisual?.(pod.id),peerId=view?.oppositeId;
 const route=r.janusRoutes?.[pod.id],currentKey=view?.currentSky||(route?.lastChart==='deep'?'deep:'+(route.addressLy||[0,0,0]).join(','):route?.lastChart||pod.janusChart);
 const side=janusSkyAngle(currentKey);
 const idle={side,pod,active:false};
 if(!view||!['charge','settle'].includes(view.stage)||!view.oppositeOffset)return idle;
 const b=r.frameById?.get(peerId),peer=b?.radius&&b.type!=='waypoint'?b:null;
 const rel=cameraRelative(pod.position,frame),dist=Math.hypot(...rel),z=dot(rel,frame.forward);
 const fov=.83*Math.max(1,1.35*h/w),inside=dist<1.01*pod.radius;
 if(!inside&&z<=pod.radius*.02)return idle;
 const cx=inside?0:dot(rel,frame.right)/(z*fov),cy=inside?0:dot(rel,frame.up)/(z*fov);
 const frameRadius=Math.hypot(Math.abs(cx)+w/h*.5,Math.abs(cy)+.5)+.065;
 const coverage=inside||r.focusId===pod.id?frameRadius:Math.min(frameRadius,8*pod.radius/(z*fov));
 const p=Math.min(1,Math.max(0,view.progress)),charge=view.stage==='charge';
 // Open from the optical center; at contact every ray is already on the
 // destination side. The residual caustic then retreats across native sky.
 const radius=(charge?smooth(p):1-smooth(p))*coverage;
 const center=plus(rel,view.oppositeOffset),anchor=peer?.janusLocalPosition||peer?.position||[0,0,0];
 const remotePos=b=>plus(center,sub(b.janusLocalPosition||b.position,anchor));
 const nearby=[...(r.frameById?.values()||[])];
 const rings=nearby.filter(b=>b.type==='ring'&&b.parentId===peer?.id).slice(0,2);
 const companion=nearby.find(b=>b.parentId===peer?.id&&b.type==='moon');
 const sun=nearby.find(b=>b.id===peer?.parentId&&b.type==='star')||nearby.find(b=>b.id===r.frameById?.get(peer?.parentId)?.parentId&&b.type==='star');
 const light=sun?unit(sub(sun.janusLocalPosition||sun.position,anchor)):[-.4,.8,.45];
 const angle=Math.PI/180*(peer?.axialTilt||0),period=peer?.rotationPeriodSeconds||0;
 const spin=peer?.tidallyLocked?(peer.headingAngle||0)+Math.PI:Math.abs(period)>1?-r.time*(18*REFERENCE_RG_METERS/299792458)*2*Math.PI/period:-r.time*(peer?.rotation??1)*.05;
 return {active:true,side,peerSide:janusSkyAngle(view.oppositeSky||b?.janusChart||currentKey),pod,peer,rings,companion,sun,remotePos,center,light,angle,spin:((peer?.surfaceRotationPhase||0)+spin)%(Math.PI*2),cx,cy,radius,p,charge,inside,rel,frame,fov,visiblePod:frame.hideIndex!==pod.index||pod.index<0};
}
// A small, nearly spherical comoving field. Sub-light orbital trim has
// negligible bulk sky aberration; show its thin optical edge and a slight
// local refraction. Use a hull-relative ray to retain precision at Neptune.
export function janusLocalField(r,frame,w,h,subject=null){
 if(r.state.warpField===false||r.state.spectrum==='geometry')return null;
 // The cabin field belongs to Janus throughout a bridge exchange. A short
 // stationary pause in either chart does not require thrust or a warp speed.
 const pod=subject||viewedJanus(r);
 if(!pod||pod.hullModel!=='janusPod'||!r.janusRoutes?.[pod.id])return null;
 // Powered manual warp already draws a full curved bubble around this hull.
 if(r.state.warp&&r.warpObjectId===pod.id&&r.state.warpFactor>0&&!isJanusParkingWarp(r,pod.id))return null;
 const rel=cameraRelative(pod.position,frame),z=dot(rel,frame.forward),R=1.63*pod.radius;
 if(z<=R*1.03)return null;
 const fov=.83*Math.max(1,1.35*h/w),cx=dot(rel,frame.right)/(z*fov),cy=dot(rel,frame.up)/(z*fov),radius=R/(Math.sqrt(z*z-R*R)*fov);
 if(radius*h<1||Math.abs(cx)>w/h*.5+radius||Math.abs(cy)>.5+radius)return null;
 // An orbit far behind the planet must not paint a field on its surface.
 if(r.focusId!==pod.id){
  const distance=Math.hypot(...rel),dir=unit(rel);
  for(const b of r.objectFrames){
   if(!['planet','moon','star','asteroid','planetoid'].includes(b.type))continue;
   const p=cameraRelative(b.position,frame),along=dot(p,dir);
   if(along>0&&along<distance-R&&Math.hypot(...p.map((a,i)=>a-along*dir[i]))<b.radius-R)return null;
  }
 }
 const axis=[dot(pod.frame[2],frame.right),dot(pod.frame[2],frame.up)],m=Math.max(.001,Math.hypot(...axis));
 return {cx,cy,radius,axis:axis.map(v=>v/m),gain:.65};
}
export function sendJanusAperture(r,frame,w,h,g,u){
 const s=janusAperture(r,frame,w,h);
 const local=s?janusLocalField(r,frame,w,h,s.pod):null;
 g.uniform4f(u.uJanusLocal,local?.cx||0,local?.cy||0,local?.radius||0,local?.gain||0);
 g.uniform2f(u.uJanusTrimAxis,...(local?.axis||[0,0]));
 if(!s?.active){g.uniform4f(u.uJanusLens,0,0,0,0);g.uniform4f(u.uJanusTint,0,0,0,s?.side||0);return;}
 const {peer,pod}=s,basis=pod.frame;
 const eye=basis.map(axis=>-dot(s.rel,axis)/Math.max(pod.radius,1e-30));
 g.uniform4f(u.uJanusPodEye,...eye,r.state.lensing===false?0:janusLensStrength(s.p,s.charge));
 g.uniformMatrix3fv(u.uJanusPodBasis,false,basis.flat());
 g.uniform2f(u.uJanusMouth,Math.max(0,dot(s.rel,frame.forward)),s.visiblePod?pod.index:-1);
 g.uniform4f(u.uJanusLens,s.cx,s.cy,s.radius,s.charge?1+s.p:-(1-s.p));
 g.uniform4f(u.uJanusTarget,...(peer?s.center.map(x=>x/peer.radius):[0,0,0]),s.charge?1:0);
 const shape=peer?.shapeAxes||[1,1,1],m=Math.max(...shape);
 g.uniform4f(u.uJanusShape,...shape.map(v=>v/m),s.angle);
 g.uniform4f(u.uJanusParams,peer?(peer.type==='star'?-2:peer.surfaceId||0):-1,s.spin,peer?.bodyParams?.[0]||0,s.peerSide);
 g.uniform3fv(u.uJanusLight,s.light);
 g.uniform4f(u.uJanusTint,...(peer?.tint||[1,1,1]),s.side);
 const ring=new Float32Array(8),tints=new Float32Array(8);
 for(const [i,b] of s.rings.entries()){ring.set([b.radius/peer.radius,b.innerRadiusRatio??.72,b.opacity??.8,(b.axialTilt??peer.axialTilt??0)*Math.PI/180],i*4);tints.set([...b.tint,b.bodyParams?.[0]??1],i*4);}
 g.uniform4fv(u['uJanusRings[0]'],ring);g.uniform4fv(u['uJanusRingTints[0]'],tints);
 for(const [b,name] of [[s.sun,'Sun'],[s.companion,'Companion']]){
  g.uniform4f(u['uJanus'+name],...(b?s.remotePos(b).map(x=>x/(peer?.radius||1)):[0,0,0]),b?b.radius/(peer?.radius||1):0);
  g.uniform3fv(u['uJanus'+name+'Tint'],b?.tint||[1,1,1]);
 }
}

// Canvas/command fallback uses the native destination body painters through
// a clipped aperture. Work in an observer-centered chart even at cabin scales.
function* paintJanusAperture(r,s){
 if(!s?.active||s.radius<=0)return;
 const ctx=r.context2d,w=r.canvas.width,h=r.canvas.height,cx=w/2+s.cx*h,cy=h/2-s.cy*h,radius=s.radius*h;
 const strength=r.state.lensing===false?0:janusLensStrength(s.p,s.charge),bounds=janusPixelBounds(w,h,cx,cy,radius);
 if(!bounds.w||!bounds.h)return;
 const record=Object.hasOwn(ctx,'janusOptics'),refract=radius>=1&&strength>.003&&(record||ctx.canvas?.width>0&&typeof ctx.getImageData==='function');
 const optics=(op,...args)=>{if(record)ctx.janusOptics(op,...args);else applyJanusCanvasLens(ctx,w,h,op,...args);};
 if(refract)optics('capture',cx,cy,radius,s.p,s.charge?1:0);
 ctx.save();
 if(s.charge){
  const edge=refract?Math.max(.85,radius*JANUS_LENS.edgeWidth*strength):0;
  ctx.beginPath();ctx.arc(cx,cy,radius+edge,0,2*Math.PI);ctx.clip();
  const frame=r.cameraFrame;
  const local={...frame,observer:[0,0,0],eyeOrigin:[0,0,0],eyeOffset:[0,0,0]};
  try{
   r.cameraFrame=local;r.sky(s.peerSide);
   const group=[s.sun,s.companion,s.peer,...s.rings].filter(Boolean).map(b=>({...b,position:s.remotePos(b)}));
   group.sort((a,b)=>dot(sub(b.position,a.position),frame.forward));
   for(const b of group)yield* r.bodyStages(b);
  }finally{r.cameraFrame=frame;}
 }
 ctx.restore();
 if(refract){
  if(s.charge)optics('peer');
  for(let y=0;y<bounds.h;y+=bounds.rows){optics('strip',y);yield;}
 }
 ctx.save();
 // Paired caustics -- a white-blue tangent and a small warm redshift on the
 // opposite side -- stay narrow at full aperture and leave the cabin legible.
 const fade=Math.min(1,radius/6)*strength*.36;
 for(const [inset,width,col] of [[0,Math.max(3,h*.010),'rgba(68,155,225,'+(.40*fade)+')'],[0,Math.max(1,h*.002),'rgba(215,239,250,'+(.91*fade)+')'],[Math.max(2,h*.007),Math.max(.8,h*.0016),'rgba(224,160,98,'+(.55*fade)+')']]){
  ctx.beginPath();ctx.arc(cx,cy,Math.max(.1,radius-inset),0,2*Math.PI);ctx.lineWidth=width;ctx.strokeStyle=col;ctx.stroke();
 }
 ctx.restore();
}
export {paintJanusAperture};

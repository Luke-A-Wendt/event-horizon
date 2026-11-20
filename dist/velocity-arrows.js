// A projected velocity glyph is anchored to the same submitted image as its
// body label. Its direction is the differential of the camera projection,
// including perspective; its compact logarithmic scale spans rover to warp speeds.
import { directProjection, projectLensedPoint } from './optical-projection.js';
import { LIGHT_SPEED } from './stellar-physics.js';

const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function annotationMotion(body,renderer){
 const grid=!!body.gridRelativeVelocity;
 const drive=!grid&&renderer.driveId===body.id&&renderer.objectById?.get(body.id)?.flight;
 const flight=drive&&!drive.orbitHold?renderer.getFlightState?.()?.velocityMetersPerSecond:null;
 const v=flight||body.gridRelativeVelocity||body.velocity;
 if(!v||v.length!==3||!v.every(Number.isFinite))return null;
 const n=Math.hypot(...v);
 return {grid,speed:n*(flight?1:LIGHT_SPEED/18),direction:n?v.map(x=>x/n):[0,0,0]};
}
export function projectVelocity(motion,body,frame,optics,straight){
 if(!(motion?.speed>0)||!body.anchor)return null;
 const dir=motion.direction,p=directProjection(body.position,frame,optics.aspect,optics.fov);
 if(!p)return null;
 const vz=dot(dir,frame.forward),vx=dot(dir,frame.right),vy=dot(dir,frame.up);
 let dx=vx-vz*p.x*optics.fov,dy=vy-vz*p.y*optics.fov;
 // Away from a direct chart, follow the same optical image branch as the
 // visible body. Shadows themselves are chart-vector anchors, not emitters.
 if(!straight&&!body.collapsed&&Math.hypot(dx,dy)>.02){
  const step=p.z*optics.fov*.02,point=body.position.map((x,i)=>x+step*dir[i]);
  const tip=projectLensedPoint(optics,point,{id:body.id,index:body.index,seed:{x:body.anchor.x+.02*dx,y:body.anchor.y+.02*dy}});
  if(!tip)return null;
  dx=(tip.x-body.anchor.x)/.02;dy=(tip.y-body.anchor.y)/.02;
 }
 return {x:dx,y:dy,depth:vz,speed:motion.speed,grid:motion.grid};
}
const cap=(x,min,max)=>Math.min(max,Math.max(min,x));
export function velocityGlyph(body,p,pixelRadius,{width,height,mobile}){
 const v=body.arrow;if(!v||!Number.isFinite(v.x+v.y+v.speed)||p.x<0||p.x>width||p.y<0||p.y>height)return null;
 const project=Math.hypot(v.x,v.y),bounded=cap(15+6*Math.log10(1+v.speed),18,mobile?60:82);
 const id=String(body.id).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const color='#7cf1c8',ink='#06191c',reference=v.grid?'relative to the falling grid':'in the scene frame';
 if(project<.045){
  // End-on motion has no left/right heading: the point of the arrow
  // approaches the viewer, while its tail recedes into the frame.
  const y=p.y-Math.max(7,pixelRadius+4)-6,x=p.x;
  if(y<6||x<6||x>width-6)return null;
  const mark=v.depth<0?`<circle cx="${x}" cy="${y}" r="2" fill="${color}"/>`:`<path d="M${x-2.2} ${y-2.2}l4.4 4.4m0 -4.4l-4.4 4.4" stroke="${color}" stroke-width="1.5"/>`;
  return {svg:`<g data-velocity-arrow="${id}"><title>Velocity ${reference}: ${v.depth<0?'toward':'away from'} viewer</title><circle cx="${x}" cy="${y}" r="5.3" stroke="${color}" stroke-width="1.5" fill="${ink}"/>${mark}</g>`,boxes:[{x:x-7,y:y-7,w:14,h:14}]};
 }
 const dx=v.x/project,dy=-v.y/project;
 const from=Math.max(5,pixelRadius+3),room=Math.min(dx>0?(width-p.x-3)/dx:dx<0?(3-p.x)/dx:Infinity,dy>0?(height-p.y-3)/dy:dy<0?(3-p.y)/dy:Infinity);
 const length=Math.min(room-from,cap(bounded*Math.min(1,project),11,bounded));
 if(length<9)return null;
 const x=p.x+dx*from,y=p.y+dy*from,tx=x+dx*length,ty=y+dy*length;
 const nx=-dy,ny=dx,h=Math.min(8,length*.45),hw=h*.48;
 const d=`M${x} ${y}L${tx-dx*h*.66} ${ty-dy*h*.66}`,head=`M${tx} ${ty}l${-dx*h+nx*hw} ${-dy*h+ny*hw}l${-2*nx*hw} ${-2*ny*hw}Z`;
 const boxes=[];if(body.velocityDetail)for(let n=0;n<=length;n+=7)boxes.push({x:x+dx*n-4,y:y+dy*n-4,w:8,h:8});
 return {svg:`<g data-velocity-arrow="${id}"><title>Velocity ${reference}</title><path d="${d}" stroke="${ink}" stroke-width="4.5" stroke-linecap="round"/><path d="${d}" stroke="${color}" stroke-width="2" stroke-linecap="round"/><path d="${head}" fill="${color}" stroke="${ink}" stroke-width="1" stroke-linejoin="round"/></g>`,boxes};
}

// Refract the two already-painted charts before the foreground is drawn. The
// command backend sends the optical parameters, never pixel data between threads.
import {JANUS_LENS,janusLensSample} from './janus-lens.js';

const contexts=new WeakMap();
const samplesPerStrip=2048;
export function janusPixelBounds(width,height,cx,cy,radius){
 const extent=JANUS_LENS.outer*radius+2;
 const x=Math.max(0,Math.floor(cx-extent)),y=Math.max(0,Math.floor(cy-extent));
 const w=Math.max(0,Math.min(width,Math.ceil(cx+extent))-x),h=Math.max(0,Math.min(height,Math.ceil(cy+extent))-y);
 return {x,y,w,h,rows:Math.max(1,Math.min(12,Math.floor(samplesPerStrip/Math.max(1,w))))};
}

function readChart(ctx,b){
 // Native 2D canvases and the command player's back buffer are origin-clean.
 // Limited 2D adapters can still show the clipped destination and caustic.
 try{return ctx.getImageData?.(b.x,b.y,b.w,b.h)?.data||null;}catch{return null;}
}
function begin(ctx,width,height,cx,cy,radius,progress,charge){
 if(![cx,cy,radius,progress].every(Number.isFinite)||radius<=0||progress<0||progress>1||(charge!==0&&charge!==1))throw new Error('Invalid CPU bridge optics.');
 const b=janusPixelBounds(width,height,cx,cy,radius);
 if(!b.w||!b.h){contexts.delete(ctx);return;}
 const resident=readChart(ctx,b);
 if(!resident||resident.length!==4*b.w*b.h||typeof ctx.createImageData!=='function'){contexts.delete(ctx);return;}
 const old=contexts.get(ctx),output=old?.output?.width===b.w&&old.output.height===b.h?old.output:ctx.createImageData(b.w,b.h);
 if(!output?.data){contexts.delete(ctx);return;}
 const count=Math.min(2048,Math.max(32,Math.ceil(JANUS_LENS.outer*radius*2)));
 const lut=old?.lut?.length===(count+1)*3?old.lut:new Float32Array((count+1)*3);
 for(let i=0;i<=count;i++){
  const q=Math.max(1e-8,i*JANUS_LENS.outer/count),s=janusLensSample(q,progress,!!charge,.85/radius);
  lut[3*i]=s.resident/q;lut[3*i+1]=s.remote/q;lut[3*i+2]=s.transmission;
 }
 contexts.set(ctx,{b,cx,cy,radius,charge,resident,peer:null,output,lut,count,next:0});
}

function bilinear(image,w,h,x,y,fallback,out){
 // An offscreen source ray has no Canvas sample. Preserve the corresponding
 // native chart pixel at the edge of this finite projection.
 if(x<0||y<0||x>w-1||y>h-1){out[0]=image[fallback];out[1]=image[fallback+1];out[2]=image[fallback+2];return;}
 const ix=Math.floor(x),iy=Math.floor(y),dx=x-ix,dy=y-iy;
 const a=4*(iy*w+ix),b=ix+1<w?a+4:a,c=iy+1<h?a+4*w:a,d=iy+1<h?b+4*w:b;
 for(let k=0;k<3;k++)out[k]=(image[a+k]*(1-dx)+image[b+k]*dx)*(1-dy)+(image[c+k]*(1-dx)+image[d+k]*dx)*dy;
}
function paintStrip(ctx,s,y){
 const {b,output,resident,peer,lut,count}=s;
 if(!Number.isInteger(y)||y!==s.next||y>=b.h)throw new Error('Invalid CPU bridge strip.');
 const rows=Math.min(b.rows,b.h-y),dst=output.data;
 dst.set(resident.subarray(4*y*b.w,4*(y+rows)*b.w),4*y*b.w);
 const ox=s.cx-b.x-.5,oy=s.cy-b.y-.5,unit=count/(JANUS_LENS.outer*s.radius),near=[0,0,0],far=[0,0,0];
 for(let row=0;row<rows;row++){
  const dy=y+row-oy;
  for(let x=0;x<b.w;x++){
   const dx=x-ox,at=Math.sqrt(dx*dx+dy*dy)*unit;if(at>=count)continue;
   const cell=Math.floor(at),t=at-cell,k=3*cell,weight=peer?lut[k+2]+t*(lut[k+5]-lut[k+2]):0;
   const original=4*((row+y)*b.w+x);
   if(weight<1){const ratio=lut[k]+t*(lut[k+3]-lut[k]);bilinear(resident,b.w,b.h,ox+dx*ratio,oy+dy*ratio,original,near);}
   if(weight>0){const ratio=lut[k+1]+t*(lut[k+4]-lut[k+1]);bilinear(peer,b.w,b.h,ox+dx*ratio,oy+dy*ratio,original,far);}
   for(let c=0;c<3;c++)dst[original+c]=near[c]*(1-weight)+far[c]*weight;
  }
 }
 s.next+=rows;
 // Present the completed region in one Canvas write after all bounded strips.
 if(s.next===b.h){ctx.putImageData(output,b.x,b.y);s.resident=null;s.peer=null;}
}

export function applyJanusCanvasLens(ctx,width,height,op,...args){
 if(op==='capture'&&args.length===5){begin(ctx,width,height,...args);return;}
 if(!(op==='peer'&&!args.length||op==='strip'&&args.length===1&&Number.isInteger(args[0])))throw new Error('Invalid CPU bridge command.');
 const s=contexts.get(ctx);if(!s?.resident)return;
 if(op==='peer'){
  s.peer=readChart(ctx,s.b);
  // A hardware read can fail after the clipped peer chart was already drawn.
  // Keep that view in place and resume native rendering on the next frame.
  if(!s.peer||s.peer.length!==s.resident.length){s.resident=null;s.peer=null;}
  return;
 }
 paintStrip(ctx,s,args[0]);
}

// Picture-only camera response. Spread a small fraction of bright light over
// a compact core and progressively broader wings. Operate on the *assembled*
// linear-light mean (GL bottom row first), never on individual render tiles.
// Inputs are display-linear, not inferred HDR radiance past sensor saturation.
const lensWeights=[.075,.043,.029,.017,.011,.005];
const lensLoss=lensWeights.reduce((a,b)=>a+b,0);
let lensEncode;
function emission(r,g,b){
 const peak=Math.max(r,g,b),v=.35*peak+.65*(.2126*r+.7152*g+.0722*b);
 const x=Math.max(0,Math.min(1,(v/65535-.24)/.55));
 return x*x*(3-2*x);
}
function sampleCoordinates(out,src,step){
 const lo=new Uint32Array(out),hi=new Uint32Array(out),f=new Float32Array(out);
 for(let i=0;i<out;i++){
  const u=Math.max(0,Math.min(src-1,(i+.5)/step-.5));
  lo[i]=Math.floor(u);hi[i]=Math.min(src-1,lo[i]+1);f[i]=u-lo[i];
 }
 return {lo,hi,f};
}
// check() handles cancellation, context loss, and the enclosing capture budget.
async function applyPhotoLens(mean,width,height,ctx,check=()=>{}){
 if(!lensEncode)lensEncode=Uint8Array.from({length:65536},(_,i)=>{const v=i/65535;return Math.round(255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055));});
 let last=Date.now();
 async function checkpoint(){check();if(Date.now()-last>=12){await new Promise(r=>setTimeout(r,0));check();last=Date.now();}}
 // Bounded scratch irrespective of the output size. Deep levels have a
 // quarter as many samples as their parent, and are released on the way up.
 const stride=Math.max(2,Math.ceil(Math.sqrt(width*height/420000)),Math.ceil(Math.max(width,height)/1400));
 let w=Math.ceil(width/stride),h=Math.ceil(height/stride);
 const base=new Float32Array(w*h*3),levels=[{w,h,data:base}];
 for(let y=0;y<h;y++){
  const y0=y*stride,y1=Math.min(height,y0+stride);
  for(let x=0;x<w;x++){
   let r=0,g=0,b=0;
   const x0=x*stride,x1=Math.min(width,x0+stride);
   for(let sy=y0;sy<y1;sy++)for(let q=(sy*width+x0)*3,end=q+3*(x1-x0);q<end;q+=3){
    const a=mean[q],v=mean[q+1],c=mean[q+2],f=emission(a,v,c);r+=a*f;g+=v*f;b+=c*f;
   }
   const n=(x1-x0)*(y1-y0),i=3*(y*w+x);base[i]=r/n;base[i+1]=g/n;base[i+2]=b/n;
  }
  if(!(y%8))await checkpoint();
 }
 for(let i=1;i<lensWeights.length;i++){
  const prev=levels[i-1],nw=Math.ceil(w/2),nh=Math.ceil(h/2),data=new Float32Array(nw*nh*3);
  for(let y=0;y<nh;y++){
   const y0=y*2*w,y1=Math.min(y*2+1,h-1)*w;
   for(let x=0;x<nw;x++){
    const x0=x*2,x1=Math.min(x*2+1,w-1),a=(y0+x0)*3,b=(y0+x1)*3,c=(y1+x0)*3,d=(y1+x1)*3,j=(y*nw+x)*3;
    for(let k=0;k<3;k++)data[j+k]=.25*(prev.data[a+k]+prev.data[b+k]+prev.data[c+k]+prev.data[d+k]);
   }
   if(!(y%32))await checkpoint();
  }
  levels.push({w:nw,h:nh,data});w=nw;h=nh;
 }
 let broad=null;
 for(let i=levels.length-1;i>=0;i--){
  const {w,h,data}=levels[i],out=new Float32Array(data.length),sx=sampleCoordinates(w,Math.ceil(w/2),2),sy=sampleCoordinates(h,Math.ceil(h/2),2),sw=Math.ceil(w/2);
  for(let y=0;y<h;y++){
   const ym=Math.max(0,y-1)*w,yp=Math.min(h-1,y+1)*w,row=y*w,sy0=sy.lo[y]*sw,sy1=sy.hi[y]*sw,fy=sy.f[y];
   for(let x=0;x<w;x++){
    const j=(row+x)*3,xm=Math.max(0,x-1),xp=Math.min(w-1,x+1),xm4=Math.max(0,x-4),xp4=Math.min(w-1,x+4);
    const a=(sy0+sx.lo[x])*3,b=(sy0+sx.hi[x])*3,c=(sy1+sx.lo[x])*3,d=(sy1+sx.hi[x])*3,fx=sx.f[x];
    for(let k=0;k<3;k++){
     // Raised central lobe plus a weak, elongated aperture-scatter component.
     const core=(4*data[j+k]+2*(data[(row+xm)*3+k]+data[(row+xp)*3+k]+data[(ym+x)*3+k]+data[(yp+x)*3+k])+data[(ym+xm)*3+k]+data[(ym+xp)*3+k]+data[(yp+xm)*3+k]+data[(yp+xp)*3+k])/16;
     const wing=(data[(row+xm4)*3+k]+data[(row+xp4)*3+k])*.5;
     out[j+k]=lensWeights[i]*(.96*core+.04*wing)+(broad?((1-fx)*broad[a+k]+fx*broad[b+k])*(1-fy)+((1-fx)*broad[c+k]+fx*broad[d+k])*fy:0);
    }
   }
   if(!(y%16))await checkpoint();
  }
  broad=out;levels[i].data=null;
 }
 w=levels[0].w;h=levels[0].h;
 const sx=sampleCoordinates(width,w,stride),sy=sampleCoordinates(height,h,stride);
 for(let y0=0;y0<height;y0+=16){
  const rows=Math.min(16,height-y0),image=ctx.createImageData(width,rows);
  for(let yy=0;yy<rows;yy++){
   const y=height-1-y0-yy,lo=sy.lo[y]*w,hi=sy.hi[y]*w,fy=sy.f[y];
   for(let x=0;x<width;x++){
    const j=(y*width+x)*3,p=(yy*width+x)*4,a=(lo+sx.lo[x])*3,b=(lo+sx.hi[x])*3,c=(hi+sx.lo[x])*3,d=(hi+sx.hi[x])*3,fx=sx.f[x];
    const direct=1-lensLoss*emission(mean[j],mean[j+1],mean[j+2]);
    for(let k=0;k<3;k++){
     const halo=((1-fx)*broad[a+k]+fx*broad[b+k])*(1-fy)+((1-fx)*broad[c+k]+fx*broad[d+k])*fy;
     image.data[p+k]=lensEncode[Math.max(0,Math.min(65535,Math.round(mean[j+k]*direct+halo)))];
    }
    image.data[p+3]=255;
   }
  }
  ctx.putImageData(image,0,y0);await checkpoint();
 }
}

export {applyPhotoLens};

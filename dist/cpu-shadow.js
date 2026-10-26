// Screen-space intersection with an analytical capture cone. This cheap CPU
// preview mask stays valid even when a near-horizon observer looks more than
// 90° from the hole's coordinate center. It is not GPU ray integration.
export function captureSpans(direction,cosine,width,height,pixelY){
 const pixels=height/(.83*Math.max(1,1.35/(width/height))),y=(height*.5-pixelY)/pixels,limit=width*.5/pixels;
 const [nx,ny,nz]=direction,b=ny*y+nz,c2=cosine*cosine,a=nx*nx-c2,linear=2*nx*b,constant=b*b-c2*(1+y*y),cuts=[-limit,limit];
 const push=x=>{if(Number.isFinite(x)&&x>-limit&&x<limit)cuts.push(x);};
 if(Math.abs(a)<1e-12){if(Math.abs(linear)>1e-12)push(-constant/linear);}
 else {const discriminant=linear*linear-4*a*constant;if(discriminant>=0){const root=Math.sqrt(discriminant);push((-linear-root)/(2*a));push((-linear+root)/(2*a));}}
 cuts.sort((a,b)=>a-b);const result=[];
 for(let i=0;i<cuts.length-1;i++){
  const x=(cuts[i]+cuts[i+1])*.5;
  if(nx*x+b>=cosine*Math.sqrt(1+x*x+y*y))result.push([width*.5+cuts[i]*pixels,width*.5+cuts[i+1]*pixels]);
 }
 return result;
}

// A periodic atlas of watersheds. Distances are in units of the garden's
// half-width. A feeder tapers upstream and branches above its own lake;
// neighbouring watersheds need not join into a continuous equatorial canal.
const fract=x=>x-Math.floor(x),clamp=x=>Math.min(1,Math.max(0,x));
const rand=(key,salt)=>((key*137+salt*73+key*key*(11+salt*2)+salt*salt*17)%251)/251;
function lake(x,y,rx,ry,h){
 const a=x/rx,b=y/ry,r=Math.hypot(a,b),theta=Math.atan2(b,a);
 return (r-1-.15*Math.sin(3*theta+5*h)-.10*Math.sin(5*theta-7*h)-.05*Math.cos(8*theta+3*h))*Math.min(rx,ry);
}
function river(t,lo,hi,length,width,h,across){
 const u=clamp(t),meander=4*u*(1-u)*(.135*Math.sin(8*u+6*h)+.055*Math.sin(17*u-4*h));
 const y=lo+(hi-lo)*u+meander;
 return Math.hypot((t-u)*length,across-y)-width*(.22+.78*u);
}
export function gardenWaterDistance(longitude,across){
 const cell=fract(longitude)*24,home=Math.floor(cell),u=fract(cell);let shore=2;
 for(let j=-1;j<=1;j++){
  const k=(home+j+24)%24,x=(u-j)*3.5,s=rand(k,1),h=rand(k,3),g=rand(k,7),v=rand(k,9);
  const cy=(h-.5)*1.05,cx=1.5+g*1.37,dx=x-cx,dy=across-cy;
  const size=.09+.54*s*s,rx=size*(1.1+.85*v),ry=size*(.54+.38*g);
  const tilt=(v-.5)*1.8,c=Math.cos(tilt),a=Math.sin(tilt);
  shore=Math.min(shore,lake(c*dx+a*dy,-a*dx+c*dy,rx,ry,h));
  // Secondary lobe forms an inlet or a small outlying tarn.
  shore=Math.min(shore,lake(dx+rx*.71,dy-ry*.58,rx*.61,ry*.67,g));
  const length=.97+.9*v,t=1+dx/length,source=(v>.52?-1:1)*(.48+.38*s);
  const tributaryY=source+(cy-source)*.56+4*.56*.44*(.135*Math.sin(8*.56+6*h)+.055*Math.sin(17*.56-4*h));
  shore=Math.min(shore,river(t,source,cy,length,.026+.036*s,h,across),river((t-.13)/.43,-source*.9,tributaryY,.43*length,.023,g,across));
  // Ponds have no fixed spacing, size or assumed connection to a channel.
  const px=x-(.32+1.42*v),py=across-(.58-.98*rand(k,5)),pr=.043+.105*g*g;
  shore=Math.min(shore,lake(px,py,pr*1.35,pr*.85,s));
 }
 return shore;
}
export const GARDEN_WATER_GLSL=`
float gwRand(float k,float s){return mod(k*137.0+s*73.0+k*k*(11.0+s*2.0)+s*s*17.0,251.0)/251.0;}
float gwLake(vec2 delta,vec2 radii,float h){
 vec2 p=delta/radii;float t=atan(p.y,p.x+.000001);
 return (length(p)-1.0-.15*sin(3.0*t+5.0*h)-.10*sin(5.0*t-7.0*h)-.05*cos(8.0*t+3.0*h))*min(radii.x,radii.y);
}
float gwRiver(float t,float lo,float hi,float span,float width,float h,float across){
 float u=clamp(t,0.0,1.0),bend=4.0*u*(1.0-u)*(.135*sin(8.0*u+6.0*h)+.055*sin(17.0*u-4.0*h));
 return length(vec2((t-u)*span,across-mix(lo,hi,u)-bend))-width*(.22+.78*u);
}
float gardenWaterDistance(float longitude,float across){
 float cell=fract(longitude)*24.0,home=floor(cell),u=fract(cell),shore=2.0;
 for(int i=0;i<3;i++){
  float j=float(i)-1.0,k=mod(home+j+24.0,24.0),x=(u-j)*3.5,s=gwRand(k,1.0),h=gwRand(k,3.0),g=gwRand(k,7.0),v=gwRand(k,9.0);
  float cy=(h-.5)*1.05,cx=1.5+g*1.37,dx=x-cx,dy=across-cy;
  float size=.09+.54*s*s,rx=size*(1.1+.85*v),ry=size*(.54+.38*g),tilt=(v-.5)*1.8,c=cos(tilt),a=sin(tilt);
  shore=min(shore,gwLake(vec2(c*dx+a*dy,-a*dx+c*dy),vec2(rx,ry),h));
  shore=min(shore,gwLake(vec2(dx+rx*.71,dy-ry*.58),vec2(rx*.61,ry*.67),g));
  float span=.97+.9*v,t=1.0+dx/span,source=(v>.52?-1.0:1.0)*(.48+.38*s);
  float joinY=mix(source,cy,.56)+4.0*.56*.44*(.135*sin(8.0*.56+6.0*h)+.055*sin(17.0*.56-4.0*h));
  shore=min(shore,min(gwRiver(t,source,cy,span,.026+.036*s,h,across),gwRiver((t-.13)/.43,-source*.9,joinY,.43*span,.023,g,across)));
  float px=x-(.32+1.42*v),py=across-(.58-.98*gwRand(k,5.0)),pr=.043+.105*g*g;
  shore=min(shore,gwLake(vec2(px,py),vec2(pr*1.35,pr*.85),s));
 }
 return shore;
}
`;

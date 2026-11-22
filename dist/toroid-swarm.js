// Each circular lane lies in a plane through the stellar center. The distance
// between two orbital radii bounds the separation of their centers from below.
import {formationPose} from './dyson-swarm.js';

export const TOROID_ID='toroid-collectors';
export const TOROID_SCALE=149597870700;
export const TOROID_COLLECTOR_RADIUS=20000;
export const TOROID_MARKER_RADIUS=.0125;
const tau=2*Math.PI,deg=Math.PI/180,tilt=46*deg;
const tiltBelt=([x,y,z])=>[x,Math.cos(tilt)*y+Math.sin(tilt)*z,-Math.sin(tilt)*y+Math.cos(tilt)*z];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// Fill the cross section of an annulus. At either radial lip the planes
// nearly coincide; intermediate lanes reach above and below the equator.
// Each collector still follows one circular orbit centered on the star.
export const TOROID_LANES=Array.from({length:16},(_,i)=>{
 const x=2*(i+.5)/16-1;
 const radius=.57+.027*i,count=88+2*i;
 const halfHeight=.34*Math.sqrt(1-x*x);
 const inc=Math.asin(halfHeight/radius),node=i*19.5*deg;
 const u=tiltBelt([Math.cos(node),0,Math.sin(node)]);
 const v=tiltBelt([-Math.sin(node)*Math.cos(inc),Math.sin(inc),Math.cos(node)*Math.cos(inc)]);
 return {radius,count,u,v,n:cross(u,v),rate:radius**-1.5,offset:(i*.381966)%1};
});
export const TOROID_SUN_DISPLAY_RADIUS=.407*TOROID_SCALE;
export const TOROID_COUNT=TOROID_LANES.reduce((sum,l)=>sum+l.count,0);
export const TOROID_SCENE={
 id:'toroid-swarm',title:'Toroid swarm',heading:'Toroid swarm',subtitle:'A torus of solar collectors',category:'Megastructures',className:'mini-planet',
 tags:['Kepler orbits','Solar collectors','Orbital stability'],simulationTimeScale:450,
 description:'Gold hexagons trace a thick belt of 1,648 independent solar collectors. Inner lanes overtake outer lanes as each collector follows a circular orbit in its own inclined plane.',
 explore:'Play to see the lanes drift past one another. The orbits span 0.57–0.975 AU. For visibility the overview enlarges the Sun and the 40 km collectors. Track Helios to see its true disk. The model assumes a spherical star and negligible collector mass. It omits radiation pressure, drag and other bodies.',
 patch:{blackHole:false,binary:false,disk:false,jets:false,planet:false,tidalStar:false,stars:true,starDensity:.68,nebula:false,warp:false,grid:false,exposure:1.06},
 objects:[
  {type:'star',key:'toroid-sun',catalogId:'toroid-sun',name:'Helios',parentId:'space',massSolar:1,radiusMeters:696340000,starStyle:'main',angularVelocity:2.9e-6,color:'#ffa730',spots:.28,corona:.35},
  {type:'belt',key:'toroid-field',catalogId:TOROID_ID,name:'Hexagonal collector belt',bodyClass:'Toroid swarm',parentKey:'toroid-sun',radiusMeters:TOROID_SCALE,innerRadiusRatio:.55,thicknessRatio:.34,material:'metallic',massSolar:0,opacity:1,color:'#efbc59',dataNote:'Separate test-mass collectors on sixteen nested circular orbits. A 40 km collector is shown as an enlarged marker. Radial separation protects neighboring lanes wherever their projections cross.'}
 ],
 camera:{focusIndex:1,mode:'track',focusDistance:2.55,yaw:.87,pitch:.14}
};

const hex=Array.from({length:6},(_,i)=>[Math.cos(i*tau/6),Math.sin(i*tau/6)]);
export function toroidLayers(body,eye,height=422){
 const layers=[],s=body.radius*TOROID_MARKER_RADIUS;
 for(const lane of TOROID_LANES)for(let j=0;j<lane.count;j++){
  const {radial,along,n}=formationPose(lane,j,body.bodyParams[1]),pos=radial.map((x,k)=>body.position[k]+x*lane.radius*body.radius);
  const inward=radial.reduce((d,x,k)=>d+x*(eye[k]-pos[k]),0)<0;
  const points=hex.map(([x,y])=>pos.map((p,k)=>p+s*(x*along[k]+y*n[k])));
  const rim=inward?'#ffebac':'#be9446',face=inward?'#ffdc8d':'#93632f';
  // Skip the inset on overview tiles when its rim is narrower than a pixel.
  const close=s*height>6*Math.hypot(...eye.map((v,k)=>v-pos[k]));
  const parts=[{points,fill:close?rim:face}];
  if(close)parts.push({points:points.map(p=>p.map((v,k)=>pos[k]+.80*(v-pos[k]))),fill:face});
  layers.push({type:'swarm-array',position:pos,opacity:body.opacity??1,parts});
 }
 return layers;
}

const num=x=>x.toFixed(8),vec=v=>'vec3('+v.map(num).join(',')+')';
export const TOROID_GLSL=`
void toroidLane(inout vec4 hit,vec3 ro,vec3 rd,float limit,float epoch,float b,float impact2,float r,float count,float rate,float phase,vec3 u,vec3 v,vec3 n){
 const float radius=${num(TOROID_MARKER_RADIUS)};
 float disc=r*r+radius*radius-impact2;if(disc<0.0)return;
 float sweep=sqrt(disc),stepA=6.28318530718/count;
 for(int side=0;side<2;side++){
  float t=-b+(side==0?-sweep:sweep);if(t< -2.*radius||t>limit+2.*radius)continue;
  vec3 ref=ro+rd*t;if(abs(dot(ref,n))>2.*radius)continue;
  float k=floor((atan(dot(ref,v),dot(ref,u))-epoch*rate)/stepA-phase+.5);
  // The visible mesh lies between two concentric spheres. Near grazing rays
  // may enter its sphere one berth away from the intersected tile.
  for(int neighbor=-1;neighbor<=1;neighbor++){
   float a=epoch*rate+(k+float(neighbor)+phase)*stepA;
   vec3 normal=u*cos(a)+v*sin(a),along=-u*sin(a)+v*cos(a);float denom=dot(rd,normal);
   if(abs(denom)<1.e-6)continue;
   float depth=(r-dot(ro,normal))/denom;
   if(depth<=0.||depth>=limit||(hit.w>=0.&&depth>=hit.w))continue;
   vec3 rel=(ro+rd*depth-r*normal)/radius;vec2 local=vec2(dot(rel,along),dot(rel,n));
   vec2 p=abs(local);float edge=max(p.y*1.15470054,p.x+.57735027*p.y);if(edge>1.)continue;
   float tile=fract((mod(k+float(neighbor),count)+phase)*.61803399);
   vec3 gold=mix(vec3(.68,.32,.065),vec3(1.32,.85,.29),tile);
   gold=denom>0.?mix(vec3(1.35,.86,.35),vec3(2.4,1.9,.98),tile):gold*.60;float rim=smoothstep(.74,.95,edge);
   vec2 grid=abs(fract(local*vec2(3.,4.)+.5)-.5);
   gold=mix(gold,vec3(1.65,1.03,.34),rim*.85);
   gold*=.87+.13*smoothstep(.0,.055,min(grid.x,grid.y));hit=vec4(gold,depth);
  }
 }
}
vec4 toroidHit(vec3 ro,vec3 rd,float epoch,float limit){
 vec4 hit=vec4(0,0,0,-1);float b=dot(ro,rd);vec3 miss=cross(ro,rd);float impact2=dot(miss,miss);if(impact2>1.0)return hit;
 ${TOROID_LANES.map(l=>'toroidLane(hit,ro,rd,limit,epoch,b,impact2,'+[l.radius,l.count,l.rate,l.offset].map(num).join(',')+','+[l.u,l.v,l.n].map(vec).join(',')+');').join('\n')}
 return hit;
}`;

// A point tracer in the equatorial rain chart. Its center and trajectory are
// physical model inputs; the small location bead is a drawing convention only.
import {geometryRainPose,RAIN_TWIST_GAIN} from './geometry-rain.js';

export function applyGeometryTracer(r,object,entry){
 const orbit=r.sceneId==='geometry-orbit',hole=r.sceneId==='geometry-freefall-kerr';
 if(!entry||object.catalogId!=='geometry-rain-tracer'||(!orbit&&!hole&&r.sceneId!=='geometry-freefall'))return;
 const parent=r.frameById.get(object.parentId),primary=object.parentId==='primary'&&r.state.blackHole;
 if(!parent&&!primary)return;
 const g=r.orbitGeometryById.get(object.id),center=primary?Array.from(r.holeData.slice(0,3)):parent.position;
 const mass=primary?r.holeData[3]:parent.massSolar/4300000,spin=primary?r.state.spin:0;
 const startRadius=g.semiMajor,endRadius=primary?r.configCache.horizon[0]:parent.radius,elapsed=Math.max(0,r.time-(object.epoch||0)),azimuth=object.phase;
 if(!(mass>0&&startRadius>endRadius&&endRadius>0))return;
 entry.rainChart={center,startRadius,endRadius,mass,spin,elapsed,azimuth,geodesic:false};
 if(orbit){
  const offset=entry.position.map((v,i)=>v-center[i]),radius=Math.hypot(...offset);
  const inward=-18*Math.sqrt(2*mass/radius);
  const relative=entry.velocity.map((v,i)=>v-(parent?.velocity?.[i]||0));
  entry.gridRelativeVelocity=relative.map((v,i)=>v-inward*offset[i]/radius);
  // In nonrotating PG coordinates, the geodesic circular frequency in T
  // is sqrt(M/r³). A constant height offset or an edited timing law need
  // not represent free fall, even if the rendered path is still circular.
  const speed2=relative.reduce((n,v)=>n+v*v,0),kepler2=18**2*mass/radius;
  entry.rainChart.geodesic=radius>3*mass&&spin===0&&g.e===0&&
   Math.hypot(...g.height)<radius*1e-12&&Math.abs(speed2-kepler2)<kepler2*1e-10&&
   object.placement==='orbit'&&r.effectiveBodyMotion(object)==='orbit';
  return;
 }
 const p=geometryRainPose(elapsed,startRadius,endRadius,mass,spin);
 const phi=azimuth+RAIN_TWIST_GAIN*p.angle,c=Math.cos(phi),s=Math.sin(phi),basis=r.configCache.primaryBasis;
 const radial=basis[0].map((x,i)=>x*c+basis[2][i]*s);
 const tangent=basis[0].map((x,i)=>-x*s+basis[2][i]*c);
 entry.position=radial.map((x,i)=>center[i]+p.radius*x);
 entry.velocity=radial.map((x,i)=>(parent?.velocity?.[i]||0)+p.radialSpeed*x+RAIN_TWIST_GAIN*p.angularSpeed*p.radius*tangent[i]);
 entry.rainChart.unmagnifiedSpeed=Math.hypot(p.radialSpeed,p.radius*p.angularSpeed);
 entry.angle=phi;entry.headingAngle=phi;entry.rainChart.angularSpeed=p.angularSpeed;
 entry.gridRelativeVelocity=[0,0,0];
 // The geodesic's E=1, Lz=Q=0 initial data justify zero proper
 // acceleration independent of the changing radial speed and azimuth.
 entry.rainChart.geodesic=true;
}
// Keep an otherwise sub-pixel tracer legible without enlarging its physical
// radius in the HUD, its gravity, its collision radius, or its follow camera.
export function geometryBeadRadius(body,worldUnitsPerCssPixel){
 return body.rainChart?Math.max(body.radius,6*worldUnitsPerCssPixel):body.radius;
}

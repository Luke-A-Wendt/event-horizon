import {TOROID_ID,TOROID_LANES,TOROID_COUNT,TOROID_COLLECTOR_RADIUS} from './toroid-swarm.js';
import {K2_GRID,K2_ROLES} from './kardashev-solar.js';
import {GEO_RADIUS,EARTH_RADIUS} from './kardashev-earth.js';
import {brainTier} from './matrioshka.js';
import {CYLINDER_BOUND,CYLINDER_HALF,CYLINDER_DECK,CYLINDER_BAYS,CYLINDER_OMEGA} from './oneill-cylinder.js';
import {stellarLuminositySolar} from './dyson.js';
import {SHKADOV_COVERAGE,SHKADOV_HALF_ANGLE} from './shkadov.js';
import {SWARM_LANES} from './dyson-swarm.js';
import {pelagiaSurface,CREST_GAIN} from './pelagia-tide.js';
import {REFERENCE_RG_METERS} from './objects.js';
import {SOLAR_MASS_KG,SOLAR_PLANETS} from './solar-catalog.js';
import {LIGHT_SPEED} from './stellar-physics.js';
import {metricDistance,metricNumber,metricSpeed} from './metric-units.js';
import {formatClockDuration} from './object-clocks.js';
import {bridgeProperRadius} from './bridge-math.js';
import {surfaceBasis} from './planet-surface-basis.js';

const RG=REFERENCE_RG_METERS,C=LIGHT_SPEED;
const TAU=2*Math.PI,finite=Number.isFinite,identity=[[1,0,0],[0,1,0],[0,0,1]];
const natural=['planet','moon','planetoid','asteroid','star'];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const nameOf=(r,id,frame)=>r.objectById?.get(id)?.name||r.objects?.find(o=>o.id===id)?.name||frame?.label||frame?.name||({planet:'Environment planet',tidalStar:'Disrupting star'})[id]||id;
const rate=w=>metricNumber(w)+' rad/s';
const objectType=(frame)=>frame.collapsed&&['hole','star','blackhole','whitehole'].includes(frame.type)?(frame.whiteHole||frame.type==='whitehole'?'whitehole':'blackhole'):frame.type;

// The radial intercept of the same ellipsoid (or displaced ocean cap) as the
// renderer. Contact binaries/rubble are illustrative: their result is a reference ellipsoid.
function radialSurface(r,frame,dir){
 if(!dir)return frame.radius;
 if(frame.oceanTide)return pelagiaSurface(frame.oceanTide,frame.tidalBasis.map(a=>dot(a,dir))).surfaceMeters/RG;
 if(frame.waterCap){
  const core=frame.coreRadius,cap=frame.waterCap,m=dot(dir,cap.direction)*cap.offsetRatio;
  const disc=m*m+cap.radiusRatio**2-cap.offsetRatio**2;
  return core*(disc>=0?Math.max(1,m+Math.sqrt(disc)):1);
 }
 const axes=frame.shapeAxes;
 if(!axes?.length||axes.every(v=>v===axes[0]))return frame.radius;
 const max=Math.max(...axes),basis=surfaceBasis(frame,r.configCache?.primaryBasis||identity,r.time);
 return frame.radius/Math.hypot(...basis.map((axis,i)=>dot(axis,dir)*max/axes[i]));
}

// The renderer stores velocities in chart units per animation second. This
// conversion uses the model clock, independent of the user's playback speed.
function orbitalMotion(r,id,frame,raw,add){
 const binary=(id==='secondary'||id==='primary')&&r.state?.binary;
 const parentId=binary?(id==='primary'?'secondary':'primary'):(raw?.parentId||(id==='planet'?'primary':null));
 if(!parentId||parentId==='space'||r.state?.bridge||raw?.placement==='local'||raw?.motion&&raw.motion!=='orbit')return;
 const parent=r.getFocusFrame(parentId);
 if(!parent?.position||!frame.velocity||!parent.velocity)return;
 const separation=sub(frame.physicalPosition||frame.position,parent.physicalPosition||parent.position),distance=Math.hypot(...separation);
 if(!(distance>0))return;
 const n=separation.map(x=>x/distance),relative=sub(frame.velocity,parent.velocity).map(x=>x*C/18);
 const radial=dot(n,relative),transverse=Math.hypot(...relative.map((x,i)=>x-radial*n[i]));
 const ref=nameOf(r,parentId,parent);
 const reference='Instantaneous relative to '+ref+' in the simulation chart.';
 add('orbitParent','Orbit reference',ref);
 add('orbitSpeed','Relative speed',metricSpeed(Math.hypot(...relative)),reference);
 add('orbitRate','Orbital Ω',rate(transverse/(distance*RG)),reference+' Angular speed of the center-to-center separation vector.');
}

// An unfocused orbit camera revolves around the chart origin. Identify a
// subject only when a single physical body's center actually coincides with it;
// multiple concentric bodies, a binary barycenter and a free camera are overviews.
function defaultObservedId(r){
 const s=r.state||{};
 if(s.viewMode==='free'||s.binary||s.bridge)return null;
 const centered=id=>{
  const p=r.getFocusFrame(id)?.position;
  return p?.length===3&&p.every(x=>x===0);
 };
 let subject=s.blackHole&&centered('primary')?'primary':null;
 for(const obj of r.objects||[]){
  if(!(natural.includes(obj.type)||['blackhole','whitehole'].includes(obj.type))||!centered(obj.id))continue;
  if(subject)return null;
  subject=obj.id;
 }
 return subject;
}

export function observedBodyMeasurements(r){
 if(!r?.getFocusFrame)return null;
 const s=r.state||{},id=r.focusId||(r.sceneId==='kardashev-2'&&r.objectFrames?.find(f=>f.catalogId===K2_GRID&&f.isNetworkAtlas)?.id)||defaultObservedId(r);
 if(!id)return null;
 const frame=r.getFocusFrame(id);
 if(!frame||['shuttle','iss','habitat','astronaut','enterprise'].includes(frame.type))return null;
 const raw=r.objectById?.get(id)||r.objects?.find(o=>o.id===id),type=objectType(frame);
 const rows=[],add=(key,label,value,title)=>rows.push({key,label,value,...(title?{title}:{})});
 const kinds={cylinder:'Rotating habitat',blackhole:'Black hole',whitehole:'White hole',star:'Star',planet:'Planet',moon:'Moon',planetoid:'Planetoid',asteroid:'Asteroid',bridge:'Wormhole',disk:'Accretion disc',jets:'Polar jets',belt:'Asteroid belt',ring:'Ring system',dyson:'Dyson shell',heighliner:'Spacecraft',classicEnterprise:'Spacecraft',heritageShuttle:'Spacecraft',anomaly:'Optical anomaly',probe:'Probe',waypoint:'Waypoint'};
 const kind=raw?.bodyClass||kinds[type]||'Object';
 const result={id,name:nameOf(r,id,frame),type,kind:kind[0].toUpperCase()+kind.slice(1),rows};
 if(raw?.catalogId===K2_GRID){
  result.type='network';result.kind='Stellar power network';
  add('diagram','View','Schematic atlas','Orbits are compressed and ports enlarged; this overview has no single physical distance scale.');
  add('ports','Planetary ports',String((r.objects||[]).filter(o=>o.type==='planet'&&SOLAR_PLANETS.some(p=>p.catalogId===o.catalogId)).length));
  add('power','Power links','Solar collectors → ports','Gold corridors carry beamed power from solar collectors.');
  add('traffic','Freight links','Port to port','Cyan corridors show guided traffic between moving relays.');
  return result;
 }
 if(r.sceneId==='kardashev-2'&&raw?.type==='planet'){
  const i=SOLAR_PLANETS.findIndex(p=>p.catalogId===raw.catalogId);
  if(i>=0)add('port','Port industry',K2_ROLES[i]);
 }
 if(raw?.catalogId==='type-i-earth'||raw?.catalogId==='earth-elevator-network'){
  add('scaleBenchmark','Type I benchmark','10 PW','Order of magnitude on the Sagan scale: 10¹⁶ watts. This is a classification benchmark, not a measured output of these facilities.');
 }
 const camera=r.cameraFrame,offset=camera?.eyeOffset&&r.focusId===id?camera.eyeOffset:camera?.observer&&frame.position?sub(camera.observer,frame.position):null;
 const distance=r.focusId===id&&finite(camera?.subjectRange)?camera.subjectRange:offset?Math.hypot(...offset):null;
 const center=finite(distance)?distance*RG:null;
 if(finite(center))add('center',s.bridge?'Chart center range':'Center range',metricDistance(center),'Distance from the camera to the center in scene coordinates.');
 if(type==='probe'&&frame.rainChart&&frame.gridRelativeVelocity){
  const {center:origin,endRadius}=frame.rainChart;
  const radial=Math.hypot(...sub(frame.position,origin));
  const hole=raw?.parentId==='primary',parent=r.getFocusFrame(raw?.parentId);
  add('gridSpeed','Speed vs. grid',metricSpeed(Math.hypot(...frame.gridRelativeVelocity)*C/18),'Velocity relative to the moving coordinate marks at the tracer.');
  add('centerSpeed',hole?'Chart speed vs. hole':'Speed vs. star',metricSpeed((frame.rainChart.unmagnifiedSpeed??Math.hypot(...sub(frame.velocity,parent?.velocity||[0,0,0])))*C/18),hole?'Rate in the unamplified radius and azimuth per Doran time; it is not a speed measured by a local observer.':'Coordinate speed relative to the star, using the same clock as the grid.');
  add('properAcceleration','Felt acceleration',frame.rainChart.geodesic?'0.0g':'Not modeled',frame.rainChart.geodesic?
   'An ideal accelerometer in free fall reads zero even as the tracer gains speed or turns relative to the center.':
   'This prescribed chart path has no modeled accelerometer reading. Matching a moving grid point does not establish free fall.');
  add('tracerGap',hole?'Tracer–horizon gap':'Tracer–surface gap',metricDistance(Math.max(0,radial-endRadius)*RG),'Radial chart clearance from the tracer center, independent of the camera.');
  add('radius','Tracer radius',metricDistance(frame.radius*RG),'Physical radius. The locator is enlarged on screen.');
  return result;
 }
 if(!s.bridge&&frame.velocity?.every(finite)&&(natural.includes(type)||type==='blackhole'||type==='whitehole'))add('distantSpeed','Distant-frame speed',metricSpeed(Math.hypot(...frame.velocity)*C/18),'Speed in scene coordinates per distant reference second.');
 if(type==='cylinder'){
  const r=(frame.physicalRadius??frame.radius)*RG,scale=r/CYLINDER_BOUND;
  add('length','Enclosed length',metricDistance(r*2*CYLINDER_HALF));add('floorRadius','Deck radius',metricDistance(r*CYLINDER_DECK));add('bays','Pressure districts',String(CYLINDER_BAYS));add('period','Rotation period',(2*Math.PI*Math.sqrt(scale)/CYLINDER_OMEGA/60).toFixed(1)+' min');add('gravity','Floor gravity','1.0g');return result;
 }
 if(type==='bridge'){
  const throat=frame.physicalRadius;
  if(distance>0&&throat>0)add('gap','Throat distance',metricDistance(Math.abs(bridgeProperRadius(distance,throat))*RG),'Radial proper distance to the throat on this spatial slice.');
  if(throat>0)add('radius','Throat radius',metricDistance(throat*RG),'Areal radius of the minimum sphere.');
  return result;
 }
 if(type==='waypoint')return result;
 const hole=type==='blackhole'||type==='whitehole',star=type==='star',solid=natural.includes(type),known=raw?.physicalRadiusKnown!==false;
 const radius=frame.physicalRadius??frame.radius;
 if(hole){
  // The angular velocity is referred to asymptotic time, not a surface
  // rotating through local space. A Kerr r+ difference is a coordinate gap.
  const rh=frame.stellar?.horizonMeters??(frame.horizonRadius*RG);
  const spin=frame.spinParameter;
  if(rh>0){
   if(finite(center)){
    const coordinateHorizon=s.bridge?frame.radius*RG:rh,delta=center-coordinateHorizon;
    add('gap',delta<0?'Inside horizon':'Horizon gap',metricDistance(Math.abs(delta)),'Difference in radial chart coordinates; not proper distance or the apparent shadow edge.');
   }
   add('radius','Horizon radius',metricDistance(rh),'Outer Kerr horizon in the model radial coordinate.');
  }
  if(frame.massSolar>0)add('mass','Mass',metricNumber(frame.massSolar)+' M☉');
  if(finite(spin)&&Math.abs(spin)<=1){
   add('spin','Spin χ',metricNumber(spin),'Signed dimensionless Kerr spin, cJ/(GM²).');
   if(rh>0)add('spinRate','Horizon Ω',rate(spin*C/(2*rh)),'Signed Kerr horizon angular velocity with respect to a distant clock.');
  }
  orbitalMotion(r,id,frame,raw,add);
  return result;
 }
 if(solid){
  const shaped=!!frame.waterCap||frame.shapeAxes?.some(x=>x!==frame.shapeAxes[0]);
  const irregular=['contact','rubble'].includes(frame.shapeStyle);
  if(known&&radius>0){
   if(finite(center)){
    const norm=offset&&Math.hypot(...offset),dir=norm?offset.map(v=>v/norm):null;
    const edge=radialSurface(r,frame,dir)*RG,delta=center-edge;
    add('gap',delta<0?'Below surface':irregular?'Ref. surface gap':s.bridge?'Chart surface gap':'Surface gap',metricDistance(Math.abs(delta)),frame.oceanTide?'Radial clearance to the actual sea or dry land directly below the camera.':shaped?'Radial clearance to the model surface along the camera–center line; small terrain features are excluded.':'Camera radius minus the model surface radius.');
   }
   const axes=raw?.shapeAxes;
   const ref=frame.coreRadius??(axes?.length?radius/Math.max(...axes):radius);
   add('radius',raw?.radiusEstimated?'Est. radius':shaped?'Reference radius':'Radius',metricDistance(ref*RG),shaped?'Base radius before shape or tidal deformation.':undefined);
  }else if(!known)add('radius','Radius','Unknown','The visualization marker is not a measured physical radius.');
  const m=raw?.massSolar??frame.massSolar;
  if(m>0)add('mass',raw?.massEstimated?'Est. mass':'Mass',star?metricNumber(m)+' M☉':metricNumber(m*SOLAR_MASS_KG)+' kg');
  if(star&&frame.stellar?.classLabel)add('class','Stellar class',frame.stellar.classLabel);
  const period=raw?.rotationPeriodSeconds,omega=raw?.angularVelocity??(period?TAU/period:frame.stellar?.angularVelocity);
  if(finite(omega))add('spinRate',raw?.sourceKey&&raw?.type==='moon'&&!raw.tidallyLocked?'Model spin ω':'Spin ω',rate(omega),'Axial angular velocity about the model spin axis, including its tilt.');
  else add('spinRate','Spin ω','Unspecified','No physical rotation rate is defined for this body.');
  if(frame.oceanTide){
   const t=frame.oceanTide;
   add('tidalOrbit','Hole–planet range',metricDistance(t.separationMeters),'Center-to-center orbital radius, independent of the camera.');
   if(t.issue)add('tideLimit','Equilibrium tide',t.issue,'The surface shows the reference ocean; this approximation cannot predict the outcome here.');
   else{
    if(t.crestMeters>0)add('crestScale','Crest display',CREST_GAIN+'×','Only high-water relief above 7 km is magnified; rock, shoreline and all measured depths are physical.');
    add('seaTide','Ocean tide range',metricDistance(1.5*t.relativeMeters),'Spatial high to low in sea level relative to moving ground, not wave height or total water depth.');
    add('rockTide','Rock tide range',metricDistance(1.5*t.rockMeters),'Spatial high to low in radial displacement of the solid ground, excluding the permanent rotational figure.');
    const d=offset&&Math.hypot(...offset);
    if(d){const n=frame.tidalBasis.map(a=>dot(a,offset)/d),depth=pelagiaSurface(t,n).depth;
     add('belowCamera',depth>=0?'Local water depth':'Local land elevation',metricDistance(Math.abs(depth)),'At the surface point directly below the camera, relative to the instantaneous sea surface.');
    }
   }
  }
  orbitalMotion(r,id,frame,raw,add);
  return result;
 }
 if(raw?.catalogId==='earth-elevator-network'){
  add('ports','Elevator ports','6','Equatorial anchors turn with Earth. Each tether passes through a synchronous port to an outer counterweight.');
  add('geo','Synchronous altitude',metricDistance(GEO_RADIUS-EARTH_RADIUS),'Height above the reference equator for an Earth sidereal day.');
  add('cycle','Ground rotation','23 h 56 min','Earth’s reference sidereal day, not the 24-hour solar day.');
  add('ring','Orbital guideways','2 rings','An equatorial guideway and a tilted outer guideway use hypothetical active support. Their decks co-rotate with the ground terminals.');
  add('transfers','Free-flying stations','3','Transit factories occupy distinct inclined circular orbits. Their orbital periods decrease closer to Earth.');
  return result;
 }
 if(raw?.catalogId==='shkadov-mirror'){
  add('radius','Mirror radius',metricDistance(radius*RG),'Star center to the reflecting surface.');
  add('aperture','Cap half-angle',Math.round(SHKADOV_HALF_ANGLE*180/Math.PI)+'°');
  add('coverage','Sky covered',(SHKADOV_COVERAGE*100).toFixed(1)+'%','Fraction of the stellar sky inside the mirror rim; neglects engineering gaps.');
  const host=r.objectById?.get(raw.parentId),luminosity=stellarLuminositySolar(host)*3.828e26;
  const acceleration=host?.massSolar>0?SHKADOV_COVERAGE*luminosity/(C*host.massSolar*SOLAR_MASS_KG):0;
  add('recoil','System recoil',acceleration>0?'Toward the mirror':'No stellar thrust','Escaping light carries net momentum out of the open side. The camera follows the star and mirror.');
  add('engineAcceleration','Ideal acceleration',metricNumber(acceleration,2)+' m/s²','Perfect spherical reflector in thermal equilibrium. The covered fraction of the sky times the stellar luminosity gives the thrust after division by the speed of light.');
  add('support','Mirror support','Controlled hover','Light pressure pushes out and stellar gravity pulls in. Small corrections keep the mirror aligned and moving with the star.');
  return result;
 }
 if(type==='dyson'){
  add('radius','Equatorial floor radius',metricDistance(radius*RG),'Distance from the spin axis to the garden floor at the equator.');
  const spin=frame.dysonSpin;
  if(spin){
   add('spinPeriod','Rotation period',formatClockDuration(spin.periodSeconds),'Physical time for one turn of the habitat.');
   add('floorGravity','Equatorial floor gravity',(spin.floorGravity/9.80665).toFixed(1)+'g','What a person standing at the equator feels. Stellar gravity supplies part of the inward turn; the floor supplies the rest.');
  }else add('spinLimit','Equatorial floor gravity','Not modeled','These shell dimensions and central mass are outside the sublight spin model.');
  return result;
 }
 const tier=brainTier(raw?.catalogId);
 if(tier){
  add('function','Subsystem',tier.role);add('radius','Tier radius',metricDistance(radius*RG));
  add('temperature','Effective temperature',Math.round(5772*Math.sqrt(695700000/(radius*RG)))+' K','A full shell reradiating one solar luminosity from its outer face; not the local chip temperature.');
  add('order','Layer from star',String(tier.index+1)+' / 4');return result;
 }
 if(raw?.catalogId==='swarm-aster'){
  add('district','Living district','Shielded atrium');add('generation','Power','Photovoltaic wings');add('cooling','Heat rejection','Radiator fins');return result;
 }
 if(raw?.catalogId===TOROID_ID){
  const inner=TOROID_LANES[0].radius*radius*RG,outer=TOROID_LANES.at(-1).radius*radius*RG;
  const period=r0=>2*Math.PI*Math.sqrt(r0**3/(1.32712440018e20*r.parentMassSolar(raw)));
  add('scale','Overview scale','Sun and collectors enlarged','Track Helios for its true disk. Orbital radii are physical.');
  add('lanes','Orbital lanes',String(TOROID_LANES.length));add('formations','Collectors',String(TOROID_COUNT));
  add('tile','Collector span',metricDistance(2*TOROID_COLLECTOR_RADIUS),'Shown enlarged in the scene.');
  add('innerRadius','Innermost orbit',metricDistance(inner));add('outerRadius','Outermost orbit',metricDistance(outer));
  add('periods','Orbital periods',formatClockDuration(period(inner))+' – '+formatClockDuration(period(outer)));
  return result;
 }
 if(raw?.catalogId==='dyson-collectors'){
  add('lanes','Orbital lanes',String(SWARM_LANES.length));
  add('formations','Formations',String(SWARM_LANES.reduce((sum,l)=>sum+l.count,0)));
  add('innerRadius','Innermost orbit',metricDistance(SWARM_LANES[0].radius*radius*RG));
  add('radius','Outermost orbit',metricDistance(SWARM_LANES[SWARM_LANES.length-1].radius*radius*RG));
  return result;
 }
 if(['disk','belt','ring'].includes(type)){
  const k=id.startsWith('secondary-')?1:0;
  const inner=finite(raw?.innerRadiusRatio)?radius*raw.innerRadiusRatio:
   !raw&&type==='disk'&&r.configCache?.isco?r.configCache.isco[k]*r.holeData[k*4+3]:null;
  if(inner>0)add('innerRadius','Inner radius',metricDistance(inner*RG));
  if(radius>0)add('radius','Outer radius',metricDistance(radius*RG));
  if(raw?.material)add('material','Material',raw.material);
 }else if(type==='heighliner'){
  if(radius>0)add('length','Hull length',metricDistance(radius*RG*1.8));
 }else if(type!=='jets'&&radius>0){
  add('radius',type==='anomaly'?'Field radius':'Radius',metricDistance(radius*RG));
 }
 if(type==='probe'||type==='heighliner')orbitalMotion(r,id,frame,raw,add);
 if(type==='disk'||type==='jets'){
  const primary=raw?.parentId||(id.startsWith('secondary-')?'secondary':'primary');
  if(primary&&primary!=='space')add('owner','Source',nameOf(r,primary,r.getFocusFrame(primary)));
 }
 return result;
}

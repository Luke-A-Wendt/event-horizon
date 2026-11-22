import {TOROID_LANES,TOROID_ID} from './toroid-swarm.js';
import {K2_GRID} from './kardashev-solar.js';
import {LIGHT_SPEED} from './stellar-physics.js';
import {EARTH_RADIUS,GEO_RADIUS,NETWORK_RADIUS,ELEVATOR_PORTS,networkPort,transferOrbit,CIVIL_RINGS,civilRingPoint} from './kardashev-earth.js';
// An explicitly rescaled educational chart. It never changes scene geometry.
import {SWARM_LANES} from './dyson-swarm.js';
import {brainTier} from './matrioshka.js';
import {SHKADOV_AXIS,SHKADOV_HALF_ANGLE} from './shkadov.js';
import { REFERENCE_RG_METERS } from './objects.js';
import { objectCategory,mapCategoryVisible } from './object-taxonomy.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const componentColors={disk:'diskColor',jets:'jetColor','secondary-disk':'secondaryDiskColor','secondary-jets':'secondaryJetColor'};
export function mapRadius(radius,maximum,reference,logarithmic=true){
 if(!(maximum>0))return 0;
 return logarithmic?Math.log1p(Math.max(0,radius)/reference)/Math.log1p(maximum/reference):Math.max(0,radius)/maximum;
}
export function mapPotential(massSolar,radiusMeters){return radiusMeters>0?1476.62504*Math.max(0,massSolar)/radiusMeters:0;}
export function mapProjectedVelocity(x,y,vx,vy,maximum,reference,extent,logarithmic=true){
 const r=Math.hypot(x,y);if(!(r>0&&maximum>0))return[0,0];const radial=(x*vx+y*vy)/r,angular=(x*vy-y*vx)/(r*r),R=extent*mapRadius(r,maximum,reference,logarithmic),derivative=logarithmic?extent/((reference+r)*Math.log1p(maximum/reference)):extent/maximum;
 return[x/r*derivative*radial-y/r*R*angular,-(y/r*derivative*radial+x/r*R*angular)];
}
export function orbitSliderRadius(value,minimum,maximum,reference=1,logarithmic=true){
 if(!logarithmic)return minimum+clamp(Number(value)||0,0,1)*(maximum-minimum);
 const lo=Math.log1p(Math.max(0,minimum)/reference),hi=Math.log1p(Math.max(minimum,maximum)/reference);
 return reference*Math.expm1(lo+clamp(Number(value)||0,0,1)*(hi-lo));
}
export function orbitSliderValue(radius,minimum,maximum,reference=1,logarithmic=true){
 if(!logarithmic)return maximum>minimum?clamp((radius-minimum)/(maximum-minimum),0,1):0;
 const lo=Math.log1p(Math.max(0,minimum)/reference),hi=Math.log1p(Math.max(minimum,maximum)/reference);
 return hi>lo?clamp((Math.log1p(Math.max(0,radius)/reference)-lo)/(hi-lo),0,1):0;
}
export function mapModel(renderer,centerId,{filters=null}={}){
 const nodes=renderer?.getObjectTree?.()||[],frames=renderer?.objectFrames||[],nodeMap=new Map(nodes.map(n=>[n.id,n])),frameMap=new Map(frames.map(f=>[f.id,f]));
 let id=centerId;
 if(!id)id='space';
 if(!nodeMap.has(id))id='space';
 const space={id:'space',position:[0,0,0],radius:1/REFERENCE_RG_METERS,type:'space',frame:[[1,0,0],[0,1,0],[0,0,1]]};
 const getFrame=key=>key==='space'?space:frameMap.get(key)||renderer?.getFocusFrame?.(key);
 const center=getFrame(id)||space;
 const allObjects=renderer?.objects||[],objectMap=new Map(allObjects.map(o=>[o.id,o]));
 const xAxis=center.frame?.[0]||[1,0,0],yAxis=center.frame?.[2]||[0,0,1];
 const body=frame=>{
  const original=objectMap.get(frame.id)||frame,node=nodeMap.get(frame.id);
  const relative=(frame.physicalPosition||frame.position).map((x,i)=>x-(center.physicalPosition||center.position)[i]),velocity=frame.velocity?.map((x,i)=>x-(center.velocity?.[i]||0));
  // Built-in discs and jets share their owner's tracking frame, not its mass or horizon.
  const velocityUnits=frame.physicalPosition?LIGHT_SPEED/18:REFERENCE_RG_METERS;
  const attachment=['disk','jets','ring','belt','dyson'].includes(frame.type);
  const compact=frame.collapsed&&!attachment&&(frame.horizonRadius||frame.radius)>0;
  let massSolar=attachment?(objectMap.get(frame.id)?.massSolar||0):frame.massSolar??original.massSolar;
  if(massSolar==null)massSolar=frame.id==='planet'?(renderer.state.planetMass||1)*3.00349e-6:['space','waypoint','bridge'].includes(frame.type)?0:renderer.objectMassSolar?.(original)??(frame.type==='star'?1:0);
  return {id:frame.id,catalogId:original.catalogId,...(original.catalogId==='earth-elevator-network'?{networkPhase:frame.bodyParams?.[1]||0}:{}),parentId:node?.parentId,name:node?.label||original.name||frame.type,type:node?.type||frame.type,
   horizonMeters:compact?(frame.horizonRadius||frame.radius)*REFERENCE_RG_METERS:null,category:objectCategory(original),
   radiusMeters:original.radiusMeters?original.radiusMeters*(original.scale||1):(frame.physicalRadius||frame.radius)*REFERENCE_RG_METERS,
   distanceMeters:Math.hypot(...relative)*REFERENCE_RG_METERS,x:dot(relative,xAxis)*REFERENCE_RG_METERS,y:dot(relative,yAxis)*REFERENCE_RG_METERS,
   vx:velocity?dot(velocity,xAxis)*velocityUnits:null,vy:velocity?dot(velocity,yAxis)*velocityUnits:null,
   featureAxis:frame.type==='jets'?(frame.frame?.[1]||[0,1,0]):null,
   color:original.color||renderer.state?.[componentColors[frame.id]]||(['star','blackhole','hole'].includes(frame.type)?'#ffe1a0':'#8ebfe6'),massSolar,dataNote:original.dataNote||'',eccentricity:original.eccentricity||0,innerRadiusRatio:original.innerRadiusRatio||.55};
 };
 const allEntries=nodes.filter(n=>n.parentId===id).map(n=>getFrame(n.id)).filter(Boolean).map(body),entries=allEntries.filter(b=>mapCategoryVisible(b,filters)),children=entries.filter(b=>b.catalogId==='swarm-aster'||!['disk','jets','belt','ring','dyson','warp','bridge'].includes(b.type)),attachments=entries.filter(b=>b.catalogId!=='swarm-aster'&&['ring','belt','disk','jets','dyson'].includes(b.type)),host=body(center);
 return{centerId:id,xAxis,yAxis,parentId:nodeMap.get(id)?.parentId||null,host,children,attachments,entries,allEntries,filters,hiddenCount:allEntries.length-entries.length,maximum:Math.max(host.radiusMeters*5,...children.map(b=>Math.max(b.distanceMeters*1.1,b.radiusMeters*3)),...attachments.map(b=>b.radiusMeters*1.1)),nodes};
}
export function renderOrbitMap(model,{logDistance=true,logSize=true,amplification=6,grid=true,annotations=true,metrics=annotations,selectedId=null,viewportWidth=900}={}){
 const {host,children,maximum}=model,width=clamp(viewportWidth,300,1000),height=width<600?Math.max(360,width):600,cx=width/2,cy=height/2,extent=Math.min(width*.32,height*.4),reference=Math.max(host.radiusMeters,maximum*1e-6,1),project=r=>extent*mapRadius(r,maximum,reference,logDistance);
 const majorPlanets=new Set(['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune']);
 const prominent=new Set(children.filter(b=>!/^S\s*\//i.test(b.name)).sort((a,b)=>b.radiusMeters-a.radiusMeters).slice(0,children.length>60?8:14).map(b=>b.id));
 const priority=b=>b.id===selectedId?1000:b.type==='waypoint'?110:majorPlanets.has(b.name)?100:prominent.has(b.id)?10:0;
 const f=n=>Number(n).toFixed(2),parts=[`<svg class="orbit-map-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Rescaled top-down orbit map around ${escape(host.name)}"><defs><radialGradient id="map-host-glow"><stop stop-color="${escape(host.color)}" stop-opacity=".36"/><stop offset="1" stop-color="${escape(host.color)}" stop-opacity="0"/></radialGradient><marker id="map-velocity-tip" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L9 5L0 10" fill="none" stroke="#edcc88" stroke-width="1.8"/></marker></defs>`];
 if(grid){
  for(let i=1;i<=5;i++){const radius=extent*i/5;parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#284257" stroke-width=".8"/>`);}
  for(let a=0;a<Math.PI*2;a+=Math.PI/6)parts.push(`<path d="M${cx} ${cy}l${f(Math.cos(a)*extent)} ${f(Math.sin(a)*extent)}" stroke="#243c51" stroke-width=".8"/>`);
 }
 const attachmentLabels=[];
 for(const ring of model.attachments){
  const outer=project(ring.radiusMeters),inner=project(ring.radiusMeters*ring.innerRadiusRatio),selected=ring.id===selectedId;
  const projected=v=>{
   const x=dot(v,model.xAxis),y=dot(v,model.yAxis),len=Math.hypot(x,y),d=len>0?project(ring.radiusMeters*len)/len:0;
   return [cx+x*d,cy-y*d];
  };
  const stroke=points=>points.map(([x,y],i)=>(i?'L':'M')+f(x)+' '+f(y)).join('');
  if(ring.catalogId===K2_GRID){
   // Use the same physical heliocentric distances and optional log projection
   // as the planet markers. The network has links, not an annulus of debris.
   const ports=children.filter(b=>b.type==='planet').map(b=>{
    const a=Math.atan2(b.y,b.x),r=project(b.distanceMeters);return [cx+Math.cos(a)*r,cy-Math.sin(a)*r];
   }),power=ports.map(end=>stroke([[cx,cy],end])).join(''),freight=ports.slice(2).map((end,i)=>stroke([ports[i],end])).join('');
   parts.push(`<g class="map-body map-solar-network" data-map-object="${escape(ring.id)}" role="button" tabindex="0" aria-label="Select ${escape(ring.name)}"><title>Solar relay network · beamed power and freight routes</title><path d="${power}" fill="none" stroke="#bd904d" stroke-opacity=".75"/><path d="${freight}" fill="none" stroke="#559ca9" stroke-opacity=".85"/></g>`);
  }else if(ring.catalogId==='earth-elevator-network'){
   const phase=ring.networkPhase,loc=(n,r)=>projected(n.map(v=>v*r/NETWORK_RADIUS));
   const viaduct=CIVIL_RINGS.map((_,index)=>stroke(Array.from({length:81},(_,j)=>{
    const [x,y,z]=civilRingPoint(index,j*Math.PI/40),c=Math.cos(phase),s=Math.sin(phase);
    return loc([x*c-z*s,y,z*c+x*s],EARTH_RADIUS);
   }))+'Z').join(' ');
   const paths=ELEVATOR_PORTS.map((_,i)=>{const {n}=networkPort(i,phase),a=loc(n,EARTH_RADIUS),g=loc(n,GEO_RADIUS),b=loc(n,8.70*EARTH_RADIUS);
    return `<path d="${stroke([a,b])}" fill="none" stroke="#b89a66" stroke-width="1.7"/><circle cx="${f(g[0])}" cy="${f(g[1])}" r="3.5" fill="#dce7dc"/><circle cx="${f(b[0])}" cy="${f(b[1])}" r="2.4" fill="#b39d86"/>`;
   }).join('');
   const relays=[0,1,2].map(i=>{const t=transferOrbit(i,phase),[x,y]=loc(t.n,t.r*EARTH_RADIUS);return `<rect x="${f(x-2.5)}" y="${f(y-2.5)}" width="5" height="5" fill="#6cb4c3"/>`;}).join('');
   parts.push(`<g class="map-body map-elevators" data-map-object="${escape(ring.id)}" role="button" tabindex="0" aria-label="Select ${escape(ring.name)}"><title>Inclined and equatorial rail rings, six geostationary elevator ports and three free-flying stations</title><path d="${viaduct}" fill="none" stroke="#7eaaa7" stroke-width="1.6"/>${paths}${relays}</g>`);
  }else if(ring.catalogId==='dyson-collectors'||ring.catalogId===TOROID_ID){
   const lanes=ring.catalogId===TOROID_ID?TOROID_LANES:SWARM_LANES;
   const paths=lanes.map(l=>stroke(Array.from({length:57},(_,i)=>{
    const angle=i*Math.PI/28;return projected(l.u.map((val,j)=>l.radius*(val*Math.cos(angle)+l.v[j]*Math.sin(angle))));
   }))+'Z').join('');
   parts.push(`<g class="map-body map-fleet" data-map-object="${escape(ring.id)}" role="button" tabindex="0" aria-label="Select ${escape(ring.name)}"><title>${escape(ring.name)} · ${ring.catalogId===TOROID_ID?lanes.length:'six'} independent orbital lanes</title><path d="${paths}" fill="none" stroke="#000" stroke-opacity="0" stroke-width="8"/><path d="${paths}" fill="none" stroke="${escape(ring.color)}" stroke-width="${selected?'1.6':'1'}" stroke-opacity="${selected?'1':'.63'}"/></g>`);
  }else if(ring.catalogId==='shkadov-mirror'){
   // Draw sections of the actual spherical cap. The radial map scale can
   // be logarithmic, so project each sample instead of rescaling an ellipse.
   const a=SHKADOV_AXIS,p=[-a[2],0,a[0]].map(v=>v/Math.hypot(a[0],a[2])),q=[a[1]*p[2],a[2]*p[0]-a[0]*p[2],-a[1]*p[0]];
   const point=(theta,phi)=>{
    const v=a.map((n,i)=>n*Math.cos(theta)+Math.sin(theta)*(p[i]*Math.cos(phi)+q[i]*Math.sin(phi)));
    return projected(v);
   };
   const hoop=(t)=>stroke(Array.from({length:49},(_,i)=>point(t,Math.PI*i/24)))+'Z',rim=hoop(SHKADOV_HALF_ANGLE);
   let ribs=hoop(SHKADOV_HALF_ANGLE*.5);
   for(let j=0;j<8;j++)ribs+=stroke(Array.from({length:17},(_,i)=>point(SHKADOV_HALF_ANGLE*i/16,Math.PI*j/4)));
   const [labelX,labelY]=point(0,0);
   parts.push(`<g class="map-body map-mirror" data-map-object="${escape(ring.id)}" role="button" tabindex="0" aria-label="Select ${escape(ring.name)}"><title>${escape(ring.name)} · mirror radius ${(ring.radiusMeters/149597870700).toPrecision(3)} AU</title><path d="${rim}" fill="${escape(ring.color)}" fill-opacity=".12" stroke="${escape(ring.color)}" stroke-width="${selected?'2':'1.3'}"/><path d="${ribs}" stroke="${escape(ring.color)}" fill="none" stroke-width=".8"/>${annotations?`<text x="${f(labelX)}" y="${f(labelY-8)}" text-anchor="middle" fill="#e2d4ba" font-family="system-ui,sans-serif" font-size="11">${escape(ring.name)}</text>`:''}</g>`);
   if(annotations)attachmentLabels.push({x:labelX-50,y:labelY-20,w:100,h:16});
  }else if(ring.type==='jets'){
   const dx=outer*dot(ring.featureAxis,model.xAxis),dy=-outer*dot(ring.featureAxis,model.yAxis);
   const jetPath=`M${f(cx-dx)} ${f(cy-dy)}L${f(cx+dx)} ${f(cy+dy)}`;
   const jetColor=escape(ring.color);
   const glyph=Math.hypot(dx,dy)>10?`<path d="${jetPath}" fill="none" stroke="${jetColor}" stroke-width="4"/><path d="${jetPath}" fill="none" stroke="transparent" stroke-width="16"/>`:`<circle cx="${cx}" cy="${cy}" r="18" stroke="${jetColor}" fill="none" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="18" stroke="transparent" fill="none" stroke-width="12"/>`;
   parts.push(`<g class="map-body" data-map-object="${escape(ring.id)}" role="button" tabindex="0" aria-label="Select ${escape(ring.name)}"><title>${escape(ring.name)}</title>${glyph}</g>`);
  }else if(ring.type==='dyson'||brainTier(ring.catalogId)){
   const tier=brainTier(ring.catalogId),show=annotations&&(!tier||selected),label=ring.name.length>26?ring.name.slice(0,25)+'…':ring.name,labelY=Math.max(43,cy-outer-9),labelWidth=Math.min(180,label.length*6.2+8);
   parts.push(`<g class="map-body map-shell" data-map-object="${escape(ring.id)}" role="button" tabindex="0" aria-label="Select ${escape(ring.name)}"><title>${escape(ring.name)} · ${tier?'tier radius':ring.catalogId==='ringworld'?'equatorial deck radius':'shell radius'} ${(ring.radiusMeters/149597870700).toPrecision(3)} AU</title><circle cx="${cx}" cy="${cy}" r="${f(outer)}" fill="none" stroke="#000" stroke-opacity="0" stroke-width="14" pointer-events="stroke"/><circle cx="${cx}" cy="${cy}" r="${f(outer)}" fill="none" stroke="${selected?'#d9f0ff':escape(ring.color)}" stroke-opacity="${selected?'1':'.7'}" stroke-width="${selected?'2.2':'1.4'}"/>${show?`<text x="${cx}" y="${f(labelY)}" text-anchor="middle" fill="#bfd4df" font-family="system-ui,sans-serif" font-size="11">${escape(label)}</text>`:''}</g>`);
   if(show)attachmentLabels.push({x:cx-labelWidth/2,y:labelY-12,w:labelWidth,h:17});
  }else parts.push(`<g class="map-body" data-map-object="${escape(ring.id)}" role="button" tabindex="0" aria-label="Select ${escape(ring.name)}"><title>${escape(ring.name)}</title><circle cx="${cx}" cy="${cy}" r="${f((outer+inner)/2)}" fill="none" stroke="${escape(ring.color)}" stroke-opacity="${selected?'.45':'.18'}" stroke-width="${f(Math.max(7,outer-inner))}"/></g>`);
 }
 const size=b=>6;
 const centerSize=size(host);if(host.type!=='space')parts.push(`<g class="map-body" data-map-object="${escape(host.id)}" role="button" tabindex="0" aria-label="Select ${escape(host.name)}"><circle cx="${cx}" cy="${cy}" r="${f(12)}" fill="url(#map-host-glow)"/><circle cx="${cx}" cy="${cy}" r="${f(centerSize)}" fill="${host.type==='blackhole'?'#03070d':escape(host.color)}" stroke="${escape(host.color)}" stroke-width="1.6"/></g>`);
 const occupied=[{x:cx-45,y:cy+centerSize+5,w:90,h:30},...attachmentLabels],bodyBoxes=[];
 if(annotations&&host.type!=='space')parts.push(`<text x="${cx}" y="${f(cy+centerSize+23)}" text-anchor="middle" class="map-host-label" fill="#e5f2fb" font-family="system-ui,sans-serif" font-size="14" font-weight="600">${escape(host.name)}</text>`);
 const candidates=[];
 for(const b of [...children].sort((a,b)=>b.distanceMeters-a.distanceMeters)){
  const tracked=b.catalogId==='swarm-aster',r=project(tracked?Math.hypot(b.x,b.y):b.distanceMeters),a=Math.atan2(b.y,b.x),x=cx+Math.cos(a)*r,y=cy-Math.sin(a)*r,s=size(b)*(children.length>60?.65:1),selected=b.id===selectedId;
  if(!tracked&&b.type!=='waypoint')parts.push(`<circle cx="${cx}" cy="${cy}" r="${f(r)}" fill="none" stroke="${selected?'#9fd1f5':'#64819c'}" stroke-opacity="${selected?'.7':priority(b)>=10?'.24':'.045'}" stroke-width="${selected?'1.4':'.8'}" ${b.eccentricity>.03?'stroke-dasharray="3 5"':''}/>`);
  if(metrics&&b.type!=='waypoint'&&(priority(b)>=10||selected)){const v=mapProjectedVelocity(b.x,b.y,b.vx??-b.y,b.vy??b.x,maximum,reference,extent,logDistance),length=Math.hypot(...v),scale=(width<500?16:26)/Math.max(length,1e-25);if(length>1e-25)parts.push(`<path d="M${f(x)} ${f(y)}l${f(v[0]*scale)} ${f(v[1]*scale)}" fill="none" stroke="#edcc88" stroke-opacity=".78" stroke-width="1.2" marker-end="url(#map-velocity-tip)"/>`);}
  parts.push(`<g class="map-body" data-map-object="${escape(b.id)}" role="button" tabindex="0" aria-label="Select ${escape(b.name)}"><title>${escape(b.name)} · ${(b.distanceMeters/149597870700).toPrecision(4)} AU from ${escape(host.name)}</title><circle cx="${f(x)}" cy="${f(y)}" r="${f(Math.max(12,s+4))}" fill="#000000" fill-opacity="0"/>${b.type==='waypoint'?`<path d="M${f(x)} ${f(y-s)}l${f(s)} ${f(s)} -${f(s)} ${f(s)} -${f(s)} -${f(s)}z" fill="#101d2c" stroke="#a9dfff" stroke-width="${selected?'2.4':'1.5'}"/>`:`<circle cx="${f(x)}" cy="${f(y)}" r="${f(s)}" fill="${escape(b.color)}" stroke="${selected?'#eef7ff':'#d5e8f6'}" stroke-width="${selected?'2.4':'.7'}"/>`}</g>`);
  candidates.push({b,x,y,s,selected});bodyBoxes.push({id:b.id,x:x-s-3,y:y-s-3,w:2*s+6,h:2*s+6});
 }
 if(annotations)for(const c of candidates.filter(c=>priority(c.b)>0||children.length<15).sort((a,b)=>priority(b.b)-priority(a.b)||b.b.radiusMeters-a.b.radiusMeters).slice(0,children.length>60?10:18)){
  const text=c.b.name.length>22?c.b.name.slice(0,21)+'…':c.b.name,labelWidth=clamp(text.length*6.1+6,35,145),sign=c.x>cx?1:-1,alternatives=[];
  for(const distance of [12,30,50,75,105])for(const dy of [-10,14,-28,33]){const x=sign>0?c.x+c.s+distance:c.x-c.s-distance-labelWidth;alternatives.push({x:clamp(x,12,width-labelWidth-12),y:clamp(c.y+dy,45,height-45),w:labelWidth,h:16});}
  const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  let box=alternatives.find(b=>!occupied.some(p=>overlaps(b,p))&&!bodyBoxes.some(p=>p.id!==c.b.id&&overlaps(b,p)));
  if(!box&&priority(c.b)>=100){const lane=c.x>cx?width-labelWidth-12:12;for(let y=50;y<height-35;y+=20){const candidate={x:lane,y,w:labelWidth,h:16};if(!occupied.some(p=>overlaps(candidate,p))){box=candidate;break;}}}
  if(!box)continue;occupied.push(box);const anchor=box.x>c.x?box.x:box.x+box.w,lx=box.x,ly=box.y+12;
  parts.push(`<path d="M${f(c.x)} ${f(c.y)}Q${f(anchor)} ${f(c.y)} ${f(anchor)} ${f(box.y+7)}" fill="none" stroke="#6c91ac" stroke-opacity=".65" stroke-width=".8"/><text x="${f(lx)}" y="${f(ly)}" text-anchor="start" class="map-body-label" fill="#b5d3e8" font-family="system-ui,sans-serif" font-size="11">${escape(text)}</text>`);
 }
 parts.push(`<text x="16" y="23" class="map-axis-note" fill="#7695ad" font-family="system-ui,sans-serif" font-size="10">TOP-DOWN · ${logDistance?'LOG DISTANCE':'LINEAR DISTANCE'}</text><text x="16" y="${height-16}" class="map-axis-note" fill="#7695ad" font-family="system-ui,sans-serif" font-size="10">Current-radius circles · not an ephemeris</text></svg>`);
 const compactness=mapPotential(host.massSolar,Math.max(host.radiusMeters,1)),gain=10**clamp(amplification,0,12),profile=[];
 for(let i=0;i<=100;i++){const radius=reference*Math.expm1(Math.log1p(maximum/reference)*i/100),potential=mapPotential(host.massSolar,Math.max(host.radiusMeters,radius,1)),depth=clamp(potential*gain,0,.92);profile.push(`${i?'L':'M'}${f(26+i*5.3)} ${f(40+depth*90)}`);}
 const profileSvg=`<svg class="map-potential-svg" viewBox="0 0 580 145" role="img" aria-label="Exaggerated weak-field gravitational potential profile"><path d="M26 40H556" stroke="#3b5369" stroke-dasharray="4 5"/><path d="${profile.join(' ')}" fill="none" stroke="#83c6ef" stroke-width="2.3"/><text x="26" y="20" class="map-axis-note" fill="#7695ad" font-family="system-ui,sans-serif" font-size="10">−GM / (r c²) · ×10<tspan baseline-shift="super">${amplification}</tspan></text><text x="556" y="138" text-anchor="end" class="map-axis-note" fill="#7695ad" font-family="system-ui,sans-serif" font-size="10">LOG DISTANCE →</text></svg>`;
 return{svg:parts.join(''),profileSvg,compactness,gain,selected:(model.entries||children).find(b=>b.id===selectedId)||host};
}

// An explicitly rescaled educational chart. It never changes scene geometry.
import { REFERENCE_RG_METERS } from './objects.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
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
export function mapModel(renderer,centerId){
 const nodes=renderer?.getObjectTree?.()||[],frames=renderer?.objectFrames||[],nodeMap=new Map(nodes.map(n=>[n.id,n])),frameMap=new Map(frames.map(f=>[f.id,f]));
 let id=centerId;
 if(!id)id=frames.find(f=>f.type==='star'&&nodeMap.get(f.id)?.parentId==='space')?.id||frames.find(f=>nodeMap.get(f.id)?.parentId==='space')?.id||(renderer?.state?.blackHole?'primary':'space');
 if(!nodeMap.has(id))id='space';
 const space={id:'space',position:[0,0,0],radius:1/REFERENCE_RG_METERS,type:'space',frame:[[1,0,0],[0,1,0],[0,0,1]]};
 const getFrame=key=>key==='space'?space:frameMap.get(key)||renderer?.getFocusFrame?.(key);
 const center=getFrame(id)||space;
 const allObjects=renderer?.objects||[],objectMap=new Map(allObjects.map(o=>[o.id,o]));
 const xAxis=center.frame?.[0]||[1,0,0],yAxis=center.frame?.[2]||[0,0,1];
 const body=frame=>{const original=objectMap.get(frame.id)||frame,node=nodeMap.get(frame.id),relative=frame.position.map((x,i)=>x-center.position[i]),velocity=frame.velocity?.map((x,i)=>x-(center.velocity?.[i]||0)),radius=Math.hypot(...relative)*REFERENCE_RG_METERS;let massSolar=frame.id==='planet'?(renderer.state.planetMass||1)*3.00349e-6:original.massSolar??(frame.type==='space'?0:renderer.objectMassSolar?.(original))??(frame.type==='star'?1:0);if(['primary','secondary'].includes(frame.id))massSolar=frame.massSolar??renderer.state.mass*1e6*(frame.id==='secondary'?renderer.state.binaryRatio:1);return{id:frame.id,parentId:node?.parentId,name:node?.label||original.name||frame.type,type:node?.type||frame.type,radiusMeters:original.radiusMeters?original.radiusMeters*(original.scale||1):(frame.physicalRadius||frame.radius)*REFERENCE_RG_METERS,distanceMeters:radius,x:dot(relative,xAxis)*REFERENCE_RG_METERS,y:dot(relative,yAxis)*REFERENCE_RG_METERS,vx:velocity?dot(velocity,xAxis)*REFERENCE_RG_METERS:null,vy:velocity?dot(velocity,yAxis)*REFERENCE_RG_METERS:null,color:original.color||(['star','blackhole','hole'].includes(frame.type)?'#ffe1a0':'#8ebfe6'),massSolar,dataNote:original.dataNote||'',eccentricity:original.eccentricity||0,innerRadiusRatio:original.innerRadiusRatio||.55};};
 const entries=nodes.filter(n=>n.parentId===id).map(n=>getFrame(n.id)).filter(Boolean).map(body),children=entries.filter(b=>!['disk','jets','belt','ring','dyson','warp','bridge'].includes(b.type)),attachments=entries.filter(b=>['ring','belt','disk','dyson'].includes(b.type)),host=body(center);
 return{centerId:id,parentId:nodeMap.get(id)?.parentId||null,host,children,attachments,entries,maximum:Math.max(host.radiusMeters*5,...children.map(b=>Math.max(b.distanceMeters*1.1,b.radiusMeters*3)),...attachments.map(b=>b.radiusMeters*1.1)),nodes};
}
export function renderOrbitMap(model,{logDistance=true,logSize=true,amplification=6,grid=true,annotations=true,metrics=annotations,selectedId=null,viewportWidth=900}={}){
 const {host,children,maximum}=model,width=clamp(viewportWidth,300,1000),height=width<600?Math.max(360,width):600,cx=width/2,cy=height/2,extent=Math.min(width*.32,height*.4),reference=Math.max(host.radiusMeters,maximum*1e-6,1),project=r=>extent*mapRadius(r,maximum,reference,logDistance);
 const majorPlanets=new Set(['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune']);
 const prominent=new Set(children.filter(b=>!/^S\s*\//i.test(b.name)).sort((a,b)=>b.radiusMeters-a.radiusMeters).slice(0,children.length>60?8:14).map(b=>b.id));
 const priority=b=>b.id===selectedId?1000:majorPlanets.has(b.name)?100:prominent.has(b.id)?10:0;
 const f=n=>Number(n).toFixed(2),parts=[`<svg class="orbit-map-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Rescaled top-down orbit map around ${escape(host.name)}"><defs><radialGradient id="map-host-glow"><stop stop-color="${escape(host.color)}" stop-opacity=".36"/><stop offset="1" stop-color="${escape(host.color)}" stop-opacity="0"/></radialGradient><marker id="map-velocity-tip" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L9 5L0 10" fill="none" stroke="#edcc88" stroke-width="1.8"/></marker></defs>`];
 if(grid){
  for(let i=1;i<=5;i++){const radius=extent*i/5;parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#284257" stroke-width=".8"/>`);}
  for(let a=0;a<Math.PI*2;a+=Math.PI/6)parts.push(`<path d="M${cx} ${cy}l${f(Math.cos(a)*extent)} ${f(Math.sin(a)*extent)}" stroke="#243c51" stroke-width=".8"/>`);
 }
 const attachmentLabels=[];
 for(const ring of model.attachments){
  const outer=project(ring.radiusMeters),inner=project(ring.radiusMeters*ring.innerRadiusRatio),selected=ring.id===selectedId;
  if(ring.type==='dyson'){
   const label=ring.name.length>26?ring.name.slice(0,25)+'…':ring.name,labelY=Math.max(43,cy-outer-9),labelWidth=Math.min(180,label.length*6.2+8);
   parts.push(`<g class="map-body map-shell" data-map-object="${escape(ring.id)}" role="button" tabindex="0" aria-label="Select ${escape(ring.name)}"><title>${escape(ring.name)} · shell radius ${(ring.radiusMeters/149597870700).toPrecision(3)} AU</title><circle cx="${cx}" cy="${cy}" r="${f(outer)}" fill="none" stroke="#000" stroke-opacity="0" stroke-width="14" pointer-events="stroke"/><circle cx="${cx}" cy="${cy}" r="${f(outer)}" fill="none" stroke="${selected?'#d9f0ff':escape(ring.color)}" stroke-opacity="${selected?'1':'.7'}" stroke-width="${selected?'2.2':'1.4'}"/>${annotations?`<text x="${cx}" y="${f(labelY)}" text-anchor="middle" fill="#bfd4df" font-family="system-ui,sans-serif" font-size="11">${escape(label)}</text>`:''}</g>`);
   if(annotations)attachmentLabels.push({x:cx-labelWidth/2,y:labelY-12,w:labelWidth,h:17});
  }else parts.push(`<g class="map-body" data-map-object="${escape(ring.id)}" role="button" tabindex="0" aria-label="Select ${escape(ring.name)}"><title>${escape(ring.name)}</title><circle cx="${cx}" cy="${cy}" r="${f((outer+inner)/2)}" fill="none" stroke="${escape(ring.color)}" stroke-opacity="${selected?'.45':'.18'}" stroke-width="${f(Math.max(7,outer-inner))}"/></g>`);
 }
 const size=b=>6;
 const centerSize=size(host);if(host.type!=='space')parts.push(`<g class="map-body" data-map-object="${escape(host.id)}" role="button" tabindex="0" aria-label="Select ${escape(host.name)}"><circle cx="${cx}" cy="${cy}" r="${f(12)}" fill="url(#map-host-glow)"/><circle cx="${cx}" cy="${cy}" r="${f(centerSize)}" fill="${host.type==='blackhole'?'#03070d':escape(host.color)}" stroke="${escape(host.color)}" stroke-width="1.6"/></g>`);
 const occupied=[{x:cx-45,y:cy+centerSize+5,w:90,h:30},...attachmentLabels],bodyBoxes=[];
 if(annotations&&host.type!=='space')parts.push(`<text x="${cx}" y="${f(cy+centerSize+23)}" text-anchor="middle" class="map-host-label" fill="#e5f2fb" font-family="system-ui,sans-serif" font-size="14" font-weight="600">${escape(host.name)}</text>`);
 const candidates=[];
 for(const b of [...children].sort((a,b)=>b.distanceMeters-a.distanceMeters)){
  const r=project(b.distanceMeters),a=Math.atan2(b.y,b.x),x=cx+Math.cos(a)*r,y=cy-Math.sin(a)*r,s=size(b)*(children.length>60?.65:1),selected=b.id===selectedId;
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${f(r)}" fill="none" stroke="${selected?'#9fd1f5':'#64819c'}" stroke-opacity="${selected?'.7':priority(b)>=10?'.24':'.045'}" stroke-width="${selected?'1.4':'.8'}" ${b.eccentricity>.03?'stroke-dasharray="3 5"':''}/>`);
  if(metrics&&(priority(b)>=10||selected)){const v=mapProjectedVelocity(b.x,b.y,b.vx??-b.y,b.vy??b.x,maximum,reference,extent,logDistance),length=Math.hypot(...v),scale=(width<500?16:26)/Math.max(length,1e-25);if(length>1e-25)parts.push(`<path d="M${f(x)} ${f(y)}l${f(v[0]*scale)} ${f(v[1]*scale)}" fill="none" stroke="#edcc88" stroke-opacity=".78" stroke-width="1.2" marker-end="url(#map-velocity-tip)"/>`);}
  parts.push(`<g class="map-body" data-map-object="${escape(b.id)}" role="button" tabindex="0" aria-label="Select ${escape(b.name)}"><title>${escape(b.name)} · ${(b.distanceMeters/149597870700).toPrecision(4)} AU from ${escape(host.name)}</title><circle cx="${f(x)}" cy="${f(y)}" r="${f(Math.max(12,s+4))}" fill="#000000" fill-opacity="0"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(s)}" fill="${escape(b.color)}" stroke="${selected?'#eef7ff':'#d5e8f6'}" stroke-width="${selected?'2.4':'.7'}"/></g>`);
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

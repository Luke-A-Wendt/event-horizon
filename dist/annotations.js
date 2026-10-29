// Locators and picking use only the optical chart belonging to the displayed
// frame. Previous projections seed the solver; they never smooth its anchors.
import { SCENE_PRESETS, holeDisplayName } from './config.js';
import { createOpticalContext, projectLensedPoint, projectShadow, directProjection, hasWeakOpticalField, projectDirectVisible, prepareDirectOcclusion } from './optical-projection.js';
import { installScenePicking } from './scene-picking.js';
const sceneNames=new Map(SCENE_PRESETS.map(s=>[s.id,s]));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const overlaps=(a,b,pad=0)=>a.x<b.x+b.w+pad&&a.x+a.w+pad>b.x&&a.y<b.y+b.h+pad&&a.y+a.h+pad>b.y;
const vector=v=>Array.from(v||[0,0,0]);
const bodyLabel=b=>b.name||b.label||({planet:'Planet',moon:'Moon',star:'Star',astronaut:'Astronaut',shuttle:'NASA Shuttle',enterprise:'Enterprise',iss:'ISS',probe:'Luminous probe'}[b.type]||b.type);
const priority=(body,focusId)=>body.id===focusId?1e6:body.collapsed?9e5:body.type==='star'?500:body.type==='planet'?400:body.type==='moon'?200:300;
const stableSort=(a,b)=>b.priority-a.priority||b.sizeClass-a.sizeClass||String(a.id).localeCompare(String(b.id));

export function captureAnnotationFrame(renderer){
 if(!renderer?.cameraFrame||renderer.xr?.active)return null;
 const s=renderer.state,frame=renderer.cameraFrame,optics=createOpticalContext(renderer),{aspect,fov,width,height}=optics;
 // GPU packing intentionally drops subpixel bodies. Logical positions remain
 // available for tiny locators and picks without cloning the full scene graph.
 const source=renderer.objectFrames||[],weak=hasWeakOpticalField(optics),straight=weak||!optics.lensing||optics.cpu||optics.interior,defer=!s.annotations&&!straight;
 if(weak){const packed=new Map(optics.bodies.map(b=>[b.id,b]));optics.occluders=source.filter(b=>!['ring','belt','disk','jets','anomaly'].includes(b.type)).map(b=>({...packed.get(b.id),id:b.id,index:b.index,center:b.position.map((v,i)=>v-optics.origin[i]),radius:b.radius}));}
 const candidates=[];
 for(const body of source){
  if(['ring','belt','disk','jets','anomaly'].includes(body.type)||body.id===renderer.focusId&&renderer.focusMode==='onboard')continue;
  const p=directProjection(body.position,frame,aspect,fov);if(!p)continue;
  const radius=body.radius/Math.max(p.z,1e-30)/fov,margin=straight?.035:.35;
  if(Math.abs(p.x)>aspect*(.5+margin)+radius||Math.abs(p.y)>.5+margin+radius)continue;
  candidates.push({id:body.id,body,priority:priority(body,renderer.focusId),sizeClass:Math.floor(Math.log2(Math.max(.25,radius*height)))});
 }
 candidates.sort(stableSort);
 const bodies=(straight||defer?candidates:candidates.slice(0,6)).map(({body,priority,sizeClass})=>({id:body.id,index:body.index,type:body.type,name:bodyLabel(body),position:vector(body.position),radius:body.radius,collapsed:!!body.collapsed,horizonRadius:body.horizonRadius||0,innerHorizonRadius:body.innerHorizonRadius||0,singularityRadius:body.singularityRadius||0,priority,sizeClass}));
 const holes=[];if(s.blackHole)for(let j=0;j<(s.binary?2:1);j++){const mass=renderer.holeData[j*4+3],spin=j?s.secondarySpin:s.spin;if(!(mass>0))continue;holes.push({id:j?'secondary':'primary',name:holeDisplayName(s,j,sceneNames.get(renderer.sceneId)),type:'hole',position:Array.from(renderer.holeData.slice(j*4,j*4+3)),radius:renderer.configCache.horizon[j],horizonRadius:renderer.configCache.horizon[j],innerHorizonRadius:mass*(1-Math.sqrt(Math.max(0,1-spin*spin))),singularityRadius:Math.abs(spin)*mass,collapsed:true,priority:9e5,sizeClass:100});}
 const entities=[...holes,...bodies].sort((a,b)=>b.priority-a.priority||String(a.id).localeCompare(String(b.id)));
 const poseKey=JSON.stringify([optics.observer,optics.forward,optics.right,optics.up,optics.origin,optics.holes,optics.bodies,optics.gravityCount,optics.steps,optics.warp,optics.anomalies,optics.anomalies?.length?optics.anomalyTime:0,optics.bridge,optics.interior,optics.lensing,optics.cpuLensing,optics.inspectIndex,optics.hideIndex,aspect,fov,width,height,entities.map(b=>[b.id,b.position,b.radius])]);
 const saved=renderer.annotationSolvedPose,cache=renderer.annotationProjectionSeeds||(renderer.annotationProjectionSeeds=new Map());
 const same=saved?.key===poseKey?new Map(saved.values.map(b=>[b.id,b])):null;
 if(!same&&!defer&&straight&&optics.occluders.length>32&&entities.length*optics.occluders.length>=4096)prepareDirectOcclusion(optics);
 for(const body of entities){
  if(defer){body.anchor=null;body.directAnchor=directProjection(body.position,frame,aspect,fov);continue;}
  const old=same?.get(body.id);if(old){body.anchor=old.anchor?{...old.anchor}:null;body.screenRadius=old.screenRadius;continue;}
  body.anchor=body.collapsed&&!optics.interior?projectShadow(optics,body):straight?projectDirectVisible(optics,body.position,body.id):projectLensedPoint(optics,body.position,{id:body.id,index:body.index,radius:body.radius,seed:cache.get(body.id)});
  if(body.anchor){cache.set(body.id,{x:body.anchor.x,y:body.anchor.y});body.screenRadius=body.anchor.radius||body.radius/body.anchor.z/fov;}
 }
 // The exact-pose cache is safe even for omitted markers; deterministic work
 // limits avoid intermittent markers caused by browser scheduling deadlines.
 if(!defer)renderer.annotationSolvedPose={key:poseKey,values:entities.map(b=>({id:b.id,anchor:b.anchor?{...b.anchor}:null,screenRadius:b.screenRadius}))};
 if(cache.size>128){const ids=new Set(entities.map(b=>b.id));for(const id of cache.keys())if(!ids.has(id))cache.delete(id);}
 // With labels off, expensive inverse projections run only when the user taps.
 // The retained chart is from this submitted image, never the live controller.
 const pickOptics=defer?{...optics,origin:vector(optics.origin),observer:vector(optics.observer),forward:vector(optics.forward),right:vector(optics.right),up:vector(optics.up),bodies:optics.bodies.map(b=>({...b,center:vector(b.center),axis:vector(b.axis),...(b.waterCap?{waterCap:{...b.waterCap,direction:vector(b.waterCap.direction)}}:{}),...(b.shapeAxes?{shapeAxes:vector(b.shapeAxes),shapeBasis:b.shapeBasis.map(vector)}:{})})),holes:optics.holes.map(b=>({...b,center:vector(b.center),axis:vector(b.axis)})),warp:optics.warp?{...optics.warp,center:vector(optics.warp.center),axis:vector(optics.warp.axis)}:null,occluders:undefined,budget:{...optics.budget}}:null;
 return {kind:'annotation-frame',annotations:!!s.annotations,cpu:!!renderer.cpu,sceneRevision:renderer.sceneRevision,time:renderer.time,focusId:renderer.focusId,cameraFrame:{observer:vector(frame.observer),forward:vector(frame.forward),right:vector(frame.right),up:vector(frame.up)},objectFrames:bodies,holes,pickOptics,projection:{aspect,fov,width,height,rays:optics.budget.rays,steps:optics.budget.iterations,limited:optics.budget.limited,weak},interiorView:optics.interior,geometry:s.spectrum==='geometry'};
}

export function installAnnotations(scene,getRenderer,options={}){
 const layer=document.createElementNS('http://www.w3.org/2000/svg','svg');
 layer.setAttribute('aria-label','Object locators');layer.setAttribute('role','img');layer.setAttribute('class','scene-annotations');layer.setAttribute('preserveAspectRatio','none');
 layer.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:hidden';layer.style.display='none';scene.append(layer);
 let previousKey='',hits=[],labelHits=[],placements=new Map(),visibleIds=new Set(),lastRevision=null,pendingProjection=null;
 const bounds=()=>{const sr=scene.getBoundingClientRect(),canvas=options.getSurface?.()||scene.querySelector?.('#universe')||scene.querySelector?.('canvas'),r=canvas?.getBoundingClientRect?.()||sr;return {left:r.left||0,top:r.top||0,width:Math.max(1,r.width),height:Math.max(1,r.height),offsetX:(r.left||0)-(sr.left||0),offsetY:(r.top||0)-(sr.top||0)};};
 function hide(clear=false){layer.style.display='none';previousKey='';labelHits=[];if(clear){hits=[];pendingProjection=null;gestures.cancel();}}
 function setStatus(stats){if(stats?.renderFailed||stats?.vrActive){hide(true);return;}if(stats?.annotations===false)hide();}
 function pick(clientX,clientY){const rect=bounds(),x=clientX-rect.left,y=clientY-rect.top;if(x<0||y<0||x>rect.width||y>rect.height)return null;const label=labelHits.find(h=>x>=h.box.x&&x<=h.box.x+h.box.w&&y>=h.box.y&&y<=h.box.y+h.box.h);if(label)return {...label.body,hit:'label'};
  if(pendingProjection){const {entities,optics,solved}=pendingProjection;const c={...optics,occluders:[...optics.holes,...optics.bodies],budget:{...optics.budget,rays:0,iterations:0,limited:false,deadline:Infinity}},score=b=>{const a=b.directAnchor;if(!a)return Infinity;return Math.max(0,Math.hypot(rect.width*.5+a.x/c.aspect*rect.width-x,rect.height*.5-a.y*rect.height-y)-b.radius/a.z/c.fov*rect.height);},chosen=[...entities.filter(b=>b.type==='hole'),...entities.filter(b=>b.type!=='hole').sort((a,b)=>score(a)-score(b)||String(a.id).localeCompare(String(b.id))).slice(0,6)].sort((a,b)=>score(a)-score(b));
   for(const body of chosen){if(solved.has(body.id)||c.budget.limited)continue;const anchor=body.collapsed&&!c.interior?projectShadow(c,body):projectLensedPoint(c,body.position,{id:body.id,index:body.index,radius:body.radius});solved.add(body.id);if(!anchor)continue;hits.push({body:{...body,anchor},x:rect.width*.5+anchor.x/c.aspect*rect.width,y:rect.height*.5-anchor.y*rect.height,z:anchor.z,radius:(anchor.radius||body.radius/anchor.z/c.fov)*rect.height});}
  }
  return hits.map(h=>({...h,distance:Math.hypot(x-h.x,y-h.y)})).filter(h=>h.distance<=Math.max(9,h.radius)).sort((a,b)=>(a.distance<=a.radius?0:1)-(b.distance<=b.radius?0:1)||a.z-b.z||a.distance-b.distance).map(h=>({...h.body,hit:'body'}))[0]||null;
 }
 const gestures=installScenePicking(scene,pick,{getFocusId:()=>getRenderer()?.focusId,...options});
 function update(value){
  if(!value||value.renderFailed){hide(true);return;}
  // Live delivery never asks the controller for its newer camera or positions.
  const r=value.kind==='annotation-frame'?value:captureAnnotationFrame(getRenderer());if(!r?.cameraFrame){hide(true);return;}
  const rect=bounds(),{width,height}=rect,aspect=r.projection?.aspect||width/height,fov=r.projection?.fov||.83,mobile=width<600;
  if(lastRevision!==r.sceneRevision){placements.clear();visibleIds.clear();gestures.cancel();lastRevision=r.sceneRevision;}
  const key=JSON.stringify([rect,r]);if(key===previousKey)return;previousKey=key;
  Object.assign(layer.style,{left:rect.offsetX+'px',top:rect.offsetY+'px',width:width+'px',height:height+'px'});layer.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const entities=[...(r.objectFrames||[]),...(r.holes||[])],screen=a=>a?{x:width*.5+a.x/aspect*width,y:height*.5-a.y*height,z:a.z}:null;pendingProjection=r.pickOptics?{entities,optics:r.pickOptics,solved:new Set()}:null;
  hits=[];labelHits=[];const labels=[],out=[],boxes=[];
  for(const body of entities){
   const p=screen(body.anchor);if(!p)continue;const pixelRadius=(body.screenRadius||body.radius/p.z/fov)*height;if(!Number.isFinite(p.x+p.y+pixelRadius))continue;
   hits.push({body,x:p.x,y:p.y,z:p.z,radius:pixelRadius});
   if(!r.annotations||p.x<3||p.x>width-3||p.y<3||p.y>height-3)continue;
   const id=body.id,base={body,id,p,text:body.name||bodyLabel(body),detail:body.collapsed?(r.cpu?'Shadow · CPU schematic':'Lensed shadow'):'',radius:pixelRadius,priority:body.priority??priority(body,r.focusId),sizeClass:body.sizeClass??Math.floor(Math.log2(Math.max(.25,pixelRadius))),color:'#9bcbe4',shadow:body.collapsed};
   if(!body.collapsed||!r.interiorView){labels.push(base);continue;}
   for(const [value,color,inner] of [[body.horizonRadius,'#a6dcf3',false],[body.innerHorizonRadius,'#edca8b',true]]){if(!(value>body.horizonRadius*.001))continue;const radius=value/Math.max(p.z,1e-20)/fov*height;labels.push({...base,id:id+(inner?':inner':':outer'),p:{...p,x:clamp(p.x+(inner?-1:1)*radius*.7,12,width-12),y:clamp(p.y+(inner?1:-1)*radius*.7,12,height-12)},text:inner?'Inner horizon · r−':'Event horizon · r+',detail:'Coordinate geometry cutaway',radius:0,color,boundary:true,inner});}
   labels.push({...base,id:id+':singularity',text:body.singularityRadius>body.horizonRadius*.001?'Ring singularity':'Point singularity',detail:'Coordinate geometry cutaway',radius:0,color:'#f3b3c4',singularity:true});
  }
  if(!r.annotations){hide();return;}layer.style.display='block';
  // Hysteresis affects which label and which corner wins, never the anchor.
  labels.sort((a,b)=>b.priority-a.priority||(b.sizeClass+(visibleIds.has(b.id)?1:0))-(a.sizeClass+(visibleIds.has(a.id)?1:0))||String(a.id).localeCompare(String(b.id)));
  const nextVisible=new Set();let count=0;
  for(const item of labels){
   const {p}=item;out.push(`<circle data-object-marker="${esc(item.body.id)}" cx="${p.x}" cy="${p.y}" r="${item.radius<2?2.6:2.2}" fill="${item.color}" opacity=".8"/>`);
   if(count>=(mobile?8:14))continue;
   const font=mobile?11:12,text=item.text.length>27?item.text.slice(0,26)+'…':item.text,detail=item.detail||'',w=clamp(Math.max(text.length*font*.57,detail.length*9.6*.56)+22,75,mobile?190:240),h=detail?42:27,offset=clamp(item.radius+16,26,Math.min(height*.25,160));
   const alternatives=[];for(const distance of [offset,offset+34,offset+68])alternatives.push({x:p.x+distance*.65,y:p.y-distance-h*.5},{x:p.x-distance*.65-w,y:p.y-distance-h*.5},{x:p.x+distance*.65,y:p.y+distance-h*.5},{x:p.x-distance*.65-w,y:p.y+distance-h*.5});
   const previous=placements.get(item.id),indices=alternatives.map((_,i)=>i);if(previous!==undefined){indices.splice(indices.indexOf(previous),1);indices.unshift(previous);}
   let box,chosen;for(const i of indices){const c=alternatives[i],candidate={x:clamp(c.x,10,Math.max(10,width-w-10)),y:clamp(c.y,Math.min(76,height*.18),Math.max(76,height-42-h)),w,h};if(!boxes.some(other=>overlaps(candidate,other,i===previous?0:5))){box=candidate;chosen=i;break;}}if(!box)continue;
   boxes.push(box);placements.set(item.id,chosen);nextVisible.add(item.id);count++;labelHits.push({box,body:item.body});
   const edgeX=box.x>p.x?box.x:box.x+w,edgeY=box.y+h*.5,dx=edgeX-p.x;
   out.push(`<g class="annotation-label" data-object-id="${esc(item.body.id)}" ${item.boundary?`data-boundary-label="${item.inner?'inner':'outer'}"`:item.singularity?'data-singularity-label="true"':item.shadow?'data-shadow-label="true"':''}><path d="M${p.x} ${p.y}C${p.x+dx*.35} ${p.y} ${edgeX-dx*.25} ${edgeY} ${edgeX} ${edgeY}" fill="none" stroke="${item.color}" stroke-opacity=".8" stroke-width="1.2"/><rect x="${box.x}" y="${box.y}" width="${w}" height="${h}" rx="6" fill="#071320" fill-opacity=".9" stroke="${item.color}" stroke-opacity=".55"/><text x="${box.x+11}" y="${box.y+18}" fill="#e9f5fb" font-family="system-ui,sans-serif" font-size="${font}" font-weight="650">${esc(text)}</text>${detail?`<text x="${box.x+11}" y="${box.y+33}" fill="${item.color}" font-family="system-ui,sans-serif" font-size="9.6">${esc(detail)}</text>`:''}</g>`);
  }
  visibleIds=nextVisible;for(const id of placements.keys())if(!labels.some(b=>b.id===id))placements.delete(id);
  layer.innerHTML=out.join('');
 }
 return {update,setStatus,pick,dispose(){gestures.dispose();layer.remove();hits=[];labelHits=[];placements.clear();}};
}

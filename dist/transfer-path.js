// Frame-aligned route geometry, with bounded optical projection and no extra
// render pass. Smooth guides share the scene lensing and bounded point budget.
import {REFERENCE_RG_METERS} from './objects.js';
const RG=REFERENCE_RG_METERS;
import {projectLensedPoint,projectDirectVisible,directProjection,hasWeakOpticalField,prepareDirectOcclusion} from './optical-projection.js';
import {captureParkedOrbit} from './orbit-path.js';
const finitePoint=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s);
const transform=(basis,p)=>[0,1,2].map(i=>basis[0][i]*p[0]+basis[1][i]*p[1]+basis[2][i]*p[2]);
function hull(points){const p=points.filter(Boolean).sort((a,b)=>a.x-b.x||a.y-b.y),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);if(p.length<3)return [];const a=[],b=[];for(const v of p){while(a.length>1&&cross(a.at(-2),a.at(-1),v)<=0)a.pop();a.push(v);}for(let i=p.length-1;i>=0;i--){const v=p[i];while(b.length>1&&cross(b.at(-2),b.at(-1),v)<=0)b.pop();b.push(v);}return a.slice(0,-1).concat(b.slice(0,-1));}
const ellipsoid=(center,radii)=>{const p=[];for(const y of [-1,-.7,0,.7,1])for(let i=0;i<12;i++){const a=i*Math.PI/6,s=Math.sqrt(1-y*y);p.push([center[0]+radii[0]*Math.cos(a)*s,center[1]+radii[1]*y,center[2]+radii[2]*Math.sin(a)*s]);}return p;};
const SHUTTLE=[ellipsoid([0,-.005,.12],[.14,.13,.74]),...[-1,1].flatMap(sign=>[
 [[.11,-.065,.42],[.205,-.065,-.18],[.55,-.065,-.55],[.10,-.065,-.67]].map(p=>[p[0]*sign,p[1],p[2]]),ellipsoid([sign*.142,.086,-.535],[.065,.074,.195])]),
 [[-.014,.055,-.69],[.014,.055,-.69],[.014,.495,-.65],[.014,.515,-.49],[.014,.10,-.22],[-.014,.10,-.22],[-.014,.515,-.49],[-.014,.495,-.65]],
 ...[[0,.08],[.078,-.05],[-.078,-.05]].map(([x,y])=>ellipsoid([x,y,-.77],[.059,.059,.09]))];
const ENTERPRISE=[ellipsoid([0,.057,.505],[.415,.065,.415]),ellipsoid([0,.142,.505],[.086,.025,.084]),ellipsoid([0,-.17,-.075],[.093,.093,.35]),
 ...[-1,1].flatMap(sign=>[ellipsoid([sign*.292,.132,-.425],[.06,.06,.495]),[[.02,-.135,-.314],[.032,-.19,-.314],[.3,.092,-.314],[.278,.151,-.314],[.02,-.135,-.236],[.032,-.19,-.236],[.3,.092,-.236],[.278,.151,-.236]].map(p=>[p[0]*sign,p[1],p[2]])]),
 ...[-1,1].map(sign=>[[.022*sign,-.135,.005],[.022*sign,-.105,.175],[.022*sign,.060,.455],[.022*sign,.060,.195]])];
function craftSilhouette(renderer,c,craft,straight){
 if(!craft||!craft.frame||renderer.focusMode==='onboard'&&renderer.focusId===craft.id)return [];
 const frame=renderer.cameraFrame,local=frame.eyeOrigin&&frame.eyeOffset;
 const view=local?{observer:frame.eyeOffset,forward:frame.forward,right:frame.right,up:frame.up}:frame;
 const craftCenter=local?sub(craft.position,frame.eyeOrigin):craft.position;
 const direct=directProjection(craftCenter,view,c.aspect,c.fov);if(!direct)return [];
 const center=straight?direct:renderer.annotationSolvedPose?.values?.find(o=>o.id===craft.id)?.anchor||projectLensedPoint(c,craft.position,{id:craft.id,radius:craft.radius});if(!center)return [];
 // A local image-plane translation follows the lensed center. Project actual
 // hull components separately: the route stays visible through pylon gaps and
 // beside wings rather than disappearing inside a bounding-circle cutout.
 const pieces=craft.type==='enterprise'?ENTERPRISE:SHUTTLE;
 return pieces.map(piece=>hull(piece.map(p=>{const a=directProjection(add(craftCenter,transform(craft.frame,mul(p,craft.radius))),view,c.aspect,c.fov);return a?{x:a.x+center.x-direct.x,y:a.y+center.y-direct.y}:null;}))).filter(p=>p.length>=3);
}
// In a small neighborhood of the camera, even a distant strong lens has
// negligible angular effect. Bound the bending over that neighborhood before
// spending the optical solver's fixed budget on wider parts of the path.
function directGuideRadius(c){
 if(c.bridge||c.warp?.enabled||c.anomalies?.length)return 0;
 let maxDistance=Infinity,bending=0;
 const lenses=(c.bodies||[]).filter(b=>['star','planet','moon','planetoid','asteroid','blackhole','whitehole'].includes(b.type)&&(c.gravityCount===undefined||b.index>=0&&b.index<c.gravityCount));
 for(const b of [...(c.holes||[]),...lenses]){
  if(!(b.mass>0))continue;
  const d=Math.hypot(...sub(b.center,c.observer));
  if(!(d>0))return 0;
  maxDistance=Math.min(maxDistance,d*.5);bending+=24*b.mass/(d*d);
 }
 return Math.min(maxDistance,.12*c.fov/(Math.max(1,c.height)*bending));
}
export function captureTransferPath(renderer,optics){
 if(renderer.state?.annotations===false)return null;
 const active=!!renderer.transfer?.active,selected=[renderer.selectedId,renderer.focusId,renderer.driveId].find(id=>renderer.objects?.some(o=>o.id===id&&['shuttle','enterprise'].includes(o.type))),route=active?renderer.getTravelState?.():renderer.travelPreview||captureParkedOrbit(renderer,selected),points=route?.pathPoints;
 if(!Array.isArray(points)||points.length<2||points.some(p=>!finitePoint(p)))return null;
 const straight=hasWeakOpticalField(optics)||!optics.lensing||optics.cpu||optics.interior,c={...optics,budget:{rays:0,iterations:0,maxRays:96,maxIterations:4096,deadline:Infinity,limited:false}},directRadius=straight?Infinity:directGuideRadius(c);
 if(directRadius>0&&!c.directOcclusion)prepareDirectOcclusion(c);
 const craft=renderer.getFocusFrame?.(route.craftId),craftCenter=craft?sub(craft.position,c.origin):null,offsets=craftCenter&&route.pathOffsets?.length===points.length?route.pathOffsets:null;
 // Convert a craft-relative displacement directly into the optical chart.
 // Adding it to a galactic coordinate even once would erase the near-hull
 // points. All occluders and the optical observer are already in this chart.
 const anchor=route.pathAnchor?sub(route.pathAnchor,c.origin):craftCenter;
 const chart={...c,origin:[0,0,0]},targets=points.map((p,i)=>offsets?add(anchor,mul(offsets[i],1/RG)):sub(mul(p,1/RG),c.origin));
 const range=craftCenter?Math.max(Math.hypot(...sub(craftCenter,c.observer)),craft.radius*2):1,fadeDistance=range*16,distances=straight&&points.length<=192?null:targets.map(p=>Math.hypot(...sub(p,c.observer)));
 const count=Math.min(points.length,directRadius>0?192:32),segments=[];let segment=[];
 let indices=Array.from({length:count},(_,i)=>Math.round(i*(points.length-1)/(count-1)));
 if(points.length>count){const context=straight?32:8,near=distances.map((d,i)=>({i,d})).sort((a,b)=>a.d-b.d).slice(0,count-context).map(p=>p.i);indices=[...new Set([...near,...Array.from({length:context},(_,i)=>Math.round(i*(points.length-1)/(context-1)))])].sort((a,b)=>a-b);}
 const projected=[],order=straight?indices:[...indices].sort((a,b)=>distances[a]-distances[b]);
 for(const i of order){
  const p=targets[i],direct=straight||distances[i]<=directRadius;
  if(!direct&&c.budget.limited)continue;
  const a=direct?projectDirectVisible(chart,p,route.craftId):projectLensedPoint(chart,p,{id:route.craftId,radius:0});
  if(a&&Number.isFinite(a.x+a.y))projected[i]={x:a.x,y:a.y,opacity:craftCenter ? .34+.66/(1+(Math.hypot(...sub(p,craftCenter))/fadeDistance)**1.4):1};
 }
 for(const i of indices){const a=projected[i];if(a)segment.push(a);else{if(segment.length>1)segments.push(segment);segment=[];}}
 if(segment.length>1)segments.push(segment);
 return segments.length?{segments,craftSilhouette:craftSilhouette(renderer,c,craft,straight||!!craftCenter&&Math.hypot(...sub(craftCenter,c.observer))<=directRadius),kind:route.kind||'transfer',active,progress:route.progress||0}:null;
}

// Clamped Catmull–Rom tangents give a continuous curve through the sampled
// positions without allowing a long distant chord to overshoot a nearby bend.
function smoothGuide(segment,screen){
 const points=segment.map(screen),parts=['M'+points[0].join(' ')];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],before=points[Math.max(0,i-2)],after=points[Math.min(points.length-1,i+1)],limit=Math.hypot(b[0]-a[0],b[1]-a[1])/3;
  const tangent=(p,q)=>{const v=[(q[0]-p[0])/6,(q[1]-p[1])/6],length=Math.hypot(...v),scale=length>limit?limit/length:1;return v.map(x=>x*scale);};
  const u=tangent(before,b),v=tangent(a,after);
  parts.push('C'+[a[0]+u[0],a[1]+u[1],b[0]-v[0],b[1]-v[1],...b].map(x=>x.toFixed(2)).join(' '));
 }
 return parts.join('');
}
export function renderTransferPath(path,width,height,aspect=width/height){
 if(!path?.segments?.length||!(width>0&&height>0))return '';
 const screen=p=>[width*.5+p.x/aspect*width,height*.5-p.y*height],strokes=[];
 for(const segment of path.segments){let run=[];
  const flush=()=>{if(run.length>1)strokes.push({d:smoothGuide(run,screen),opacity:Math.max(.34,run.reduce((n,p)=>n+(p.opacity??1),0)/run.length)});run=[];};
  for(let i=1;i<segment.length;i++){
   const a=segment[i-1],b=segment[i],dx=b.x-a.x,dy=b.y-a.y;if(!Number.isFinite(a.x+a.y+b.x+b.y)){flush();continue;}let lo=0,hi=1,valid=true;
   for(const [p,q]of [[-dx,a.x+aspect*.5],[dx,aspect*.5-a.x],[-dy,a.y+.5],[dy,.5-a.y]]){if(p===0){if(q<0)valid=false;continue;}const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);}
   if(!valid||lo>hi){flush();continue;}
   const point=t=>({x:a.x+dx*t,y:a.y+dy*t,opacity:(a.opacity??1)*(1-t)+(b.opacity??1)*t});
   const start=point(lo),end=point(hi),last=run.at(-1);if(last&&Math.hypot(last.x-start.x,last.y-start.y)>1e-6)flush();if(!run.length)run.push(start);run.push(end);if(hi<1)flush();
  }flush();
 }
 const silhouette=path.craftSilhouette||[],mask=silhouette.length?'<defs><mask id="transfer-craft-silhouette" maskUnits="userSpaceOnUse" x="0" y="0" width="'+width+'" height="'+height+'"><rect width="'+width+'" height="'+height+'" fill="white"/>'+silhouette.map(p=>'<polygon points="'+p.map(v=>screen(v).map(x=>x.toFixed(2)).join(',')).join(' ')+'" fill="black" stroke="black" stroke-width="1"/>').join('')+'</mask></defs>':'';
 return mask+'<g class="transfer-route" aria-label="'+(path.kind==='orbit'?'Parking orbit':'Planned orbital transfer')+'" fill="none" stroke-linecap="round" stroke-linejoin="round"'+(silhouette.length?' mask="url(#transfer-craft-silhouette)"':'')+'>'+strokes.map(({d,opacity})=>'<path d="'+d+'" stroke="#061521" stroke-width="5" stroke-opacity="'+(.6*opacity).toFixed(3)+'"/><path d="'+d+'" stroke="#b4e7ff" stroke-width="2.5" stroke-opacity="'+(.9*opacity).toFixed(3)+'"/>').join('')+'</g>';
}

// Frame-aligned route geometry, with bounded optical projection and no extra
// render pass. Smooth guides share the scene lensing and bounded point budget.
import {hullType,REFERENCE_RG_METERS} from './objects.js';
const RG=REFERENCE_RG_METERS;
import {projectLensedPoint,projectDirectVisible,directProjection,hasWeakOpticalField,prepareDirectOcclusion} from './optical-projection.js';
import {captureParkedOrbit} from './orbit-path.js';
const finitePoint=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s);
const transform=(basis,p)=>[0,1,2].map(i=>basis[0][i]*p[0]+basis[1][i]*p[1]+basis[2][i]*p[2]);
function hull(points){const p=points.filter(Boolean).sort((a,b)=>a.x-b.x||a.y-b.y),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);if(p.length<3)return [];const a=[],b=[];for(const v of p){while(a.length>1&&cross(a.at(-2),a.at(-1),v)<=0)a.pop();a.push(v);}for(let i=p.length-1;i>=0;i--){const v=p[i];while(b.length>1&&cross(b.at(-2),b.at(-1),v)<=0)b.pop();b.push(v);}return a.slice(0,-1).concat(b.slice(0,-1));}
const ellipsoid=(center,radii)=>{const p=[];for(const y of [-1,-.7,0,.7,1])for(let i=0;i<12;i++){const a=i*Math.PI/6,s=Math.sqrt(1-y*y);p.push([center[0]+radii[0]*Math.cos(a)*s,center[1]+radii[1]*y,center[2]+radii[2]*Math.sin(a)*s]);}return p;};
// Meridian is a stack of circular sections around its thrust axis (+Z).
// Keep the sky between the deck, tank pods and engines clear of the route mask.
const section=(x,y,r,z)=>Array.from({length:24},(_,i)=>{const t=i*Math.PI/12;return [x+r*Math.cos(t),y+r*Math.sin(t),z];});
const revolved=(profile,x=0,y=0)=>profile.flatMap(([z,r])=>section(x,y,r,z));
const MERIDIAN=[revolved([[.175,.160],[.31,.400],[.35,.460],[.45,.49],[.56,.49],[.665,.446],[.68,.405]]),
 revolved(Array.from({length:8},(_,i)=>{const t=i*Math.PI/14;return [.68+.18*Math.sin(t),.405*Math.cos(t)];})),
 revolved([[-.60,.13],[.18,.16]]),
 ...[0,1,2,3].map(i=>ellipsoid([.18*Math.cos(i*Math.PI/2),.18*Math.sin(i*Math.PI/2),-.23],[.055,.055,.24])),
 ...[-.13,.13].flatMap(x=>[-.13,.13].map(y=>revolved([[-.86,.09],[-.67,.055]],x,y)))];
// Mask the hull and individual pieces of each annulus, not a solid disc:
// a planned orbit remains visible through the open spaces between the spokes.
const ringPoint=(angle,r,z)=>[Math.cos(angle)*r,Math.sin(angle)*r,z];
const WARP_EXPLORER=[ellipsoid([0,0,0],[.176,.15,.68]),ellipsoid([0,0,.56],[.235,.105,.36]),ellipsoid([0,0,-.70],[.166,.15,.22]),
 ...[-.43,.43].flatMap(z=>[
  ...Array.from({length:16},(_,i)=>[0,1].flatMap(k=>[.415,.53].flatMap(r=>[-.086,.086].map(dz=>ringPoint((i+k)*Math.PI/8,r,z+dz))))),
  ...Array.from({length:4},(_,i)=>[-.047,.047].flatMap(da=>[.13,.416].flatMap(r=>[-.026,.026].map(dz=>ringPoint((i+.5)*Math.PI/2+da,r,z+dz)))))
 ])];
// The route overlay needs the same negative space as the visible hull.
const CLASSIC_ENTERPRISE=[
 ellipsoid([0,.06,.505],[.415,.08,.415]),ellipsoid([0,-.17,-.075],[.093,.093,.33]),
 [[-.025,-.16,-.03],[.025,-.16,-.03],[-.025,.02,.45],[.025,.02,.45]],
 ...[-1,1].flatMap(s=>[ellipsoid([s*.292,.132,-.425],[.06,.06,.495]),[[s*.02,-.17,-.31],[s*.02,-.17,-.24],[s*.292,.132,-.24],[s*.292,.132,-.31]]])];
const HERITAGE_SHUTTLE=[
 ellipsoid([0,0,0],[.15,.14,.86]),[[0,.055,-.69],[0,.495,-.65],[0,.515,-.49],[0,.10,-.22]],
 ...[-1,1].map(s=>[[s*.11,-.065,.42],[s*.205,-.065,-.18],[s*.55,-.065,-.55],[s*.10,-.065,-.67]])];
const ROUTE_MASKS={enterprise:WARP_EXPLORER,shuttle:MERIDIAN,classicEnterprise:CLASSIC_ENTERPRISE,heritageShuttle:HERITAGE_SHUTTLE};
function craftSilhouette(renderer,c,craft,straight){
 if(!craft||!craft.frame||renderer.focusMode==='onboard'&&renderer.focusId===craft.id)return [];
 const frame=renderer.cameraFrame,local=frame.eyeOrigin&&frame.eyeOffset;
 const view=local?{observer:frame.eyeOffset,forward:frame.forward,right:frame.right,up:frame.up}:frame;
 const craftCenter=local?sub(craft.position,frame.eyeOrigin):craft.position;
 const direct=directProjection(craftCenter,view,c.aspect,c.fov);if(!direct)return [];
 const center=straight?direct:renderer.annotationSolvedPose?.values?.find(o=>o.id===craft.id)?.anchor||projectLensedPoint(c,craft.position,{id:craft.id,radius:craft.radius});if(!center)return [];
 // A local image-plane translation follows the lensed center. Project actual
 // hull components separately: the route stays visible through pylon gaps and
 // beside the engine spine rather than disappearing inside a bounding-circle cutout.
 const pieces=ROUTE_MASKS[hullType(craft)]||[];
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
 const angles=route.pathAngles?.length===points.length?route.pathAngles:null;
 if(angles&&points.length>count){
  // Reserve enough of the fixed budget for the orbital outline, independent
  // of the many magnified points around the vehicle. Never span unseen turns.
  const arcCount=Math.min(count-4,Math.max(2,Math.ceil((angles.at(-1)-angles[0])/.27)+1)),arc=[];
  for(let j=0,i=0;j<arcCount;j++){
   const a=angles[0]+(angles.at(-1)-angles[0])*j/(arcCount-1);
   while(i+1<angles.length&&Math.abs(angles[i+1]-a)<=Math.abs(angles[i]-a))i++;
   arc.push(i);
  }
  const nearest=distances.map((d,i)=>({d,i})).sort((a,b)=>a.d-b.d);
  const keep=new Set(arc);for(const {i} of nearest){if(keep.size>=count)break;keep.add(i);}
  indices=[...keep].sort((a,b)=>a-b);
 }
 const projected=[],order=straight?indices:[...indices].sort((a,b)=>distances[a]-distances[b]);
 for(const i of order){
  const p=targets[i],direct=straight||distances[i]<=directRadius;
  if(!direct&&c.budget.limited)continue;
  const a=direct?projectDirectVisible(chart,p,route.craftId):projectLensedPoint(chart,p,{id:route.craftId,radius:0});
  if(a&&Number.isFinite(a.x+a.y))projected[i]={x:a.x,y:a.y,opacity:craftCenter ? .34+.66/(1+(Math.hypot(...sub(p,craftCenter))/fadeDistance)**1.4):1};
 }
 let last=-1;for(const i of indices){
  const a=projected[i];
  if(!a||angles&&last>=0&&angles[i]-angles[last]>.36){if(segment.length>1)segments.push(segment);segment=[];}
  if(a)segment.push(a);last=i;
 }
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

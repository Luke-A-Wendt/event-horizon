// Ellis ultrastatic wormhole in one isotropic chart. This is a traversable
// comparison model, not the nontraversable Einstein–Rosen bridge of vacuum GR.
// World lengths use the renderer's fixed reference gravitational radius.
export function bridgeIsotropicRadius(properRadius, throatRadius) {
 const b=Math.max(Number.MIN_VALUE,Math.abs(throatRadius)),l=Number(properRadius)||0;
 const root=Math.hypot(l,b);
 return l>=0?(l+root)/2:b*b/(2*(root-l));
}
export function bridgeProperRadius(radius, throatRadius) {
 const r=Math.max(Number.MIN_VALUE,Math.abs(radius)),b=Math.abs(throatRadius);
 return r-b*b/(4*r);
}
export function bridgeConformal(radius, throatRadius) {
 const r=Math.max(Number.MIN_VALUE,Math.abs(radius)),b=Math.abs(throatRadius);
 return 1+b*b/(4*r*r);
}
// Proper length along a straight isotropic-chart ray integrates
// (1 + b²/(4r²)) ds. Invert monotonically without stepping through the
// far-side coordinate pole, even when the stopping distance is very large.
export function bridgeRayStep(start,direction,b,properLength){
 if(!(properLength>0))return 0;
 const a=start.reduce((v,x,i)=>v+x*direction[i],0),impact=Math.hypot(...start.map((x,i)=>x-a*direction[i])),k=b*b*.25;
 const path=s=>impact>Math.max(1e-18,Math.abs(a)*1e-12)
  ?s+k/impact*Math.atan2(impact*s,impact*impact+a*(a+s))
  :a<0&&s>=-a?Infinity:s+k*s/(a*(a+s));
 let lo=0,hi=Math.min(properLength,a<0&&impact<=Math.abs(a)*1e-12?-a:Infinity);
 for(let i=0;i<72;i++){const mid=(lo+hi)*.5;if(path(mid)<properLength)lo=mid;else hi=mid;}
 return (lo+hi)*.5;
}
export function bridgeGradient(position, throatRadius) {
 const radius2=Math.max(1e-30,position.reduce((n,x)=>n+x*x,0)),b2=throatRadius*throatRadius;
 const scale=-2*b2/(radius2*(4*radius2+b2));
 return position.map(x=>x*scale);
}
export function bridgePath(time, throatRadius, travel=true) {
 const phase=travel?Math.max(0,time)*.12:0,l=6*throatRadius*Math.cos(phase);
 return {l,r:bridgeIsotropicRadius(l,throatRadius),inward:Math.sin(phase)>=0,properSpeed:travel?-6*throatRadius*.12*Math.sin(phase):0,properAcceleration:travel?-(.12**2)*l:0};
}

// Cinematic gate construction, not a time-dependent Einstein-equation solution.
// The throat is fully open throughout the crossing, and closes only after the
// traveler has crossed to the other mouth. The closing gate restores a flat
// local chart; the cinematic transfer deliberately uses little translation. Existing round trips retain
// their original path. No additional mutable timer is needed for scene saves.
// Hull model: radius .305R, half-length .9R. The gate diameter is twice
// the hull width; ±1.3R clears the full hull and the standard orbit eye.
export const HEIGHLINER_PASSAGE=Object.freeze({hullRadius:.305,halfLength:.9,throatRadius:.61,endpoint:1.3});
export function bridgeJourney(time,throatRadius,lifecycle='steady'){
 const t=Math.max(0,Number(time)||0),smooth=x=>{const q=Math.max(0,Math.min(1,x));return q*q*(3-2*q);};
 if(lifecycle!=='open-transit-close')return {...bridgePath(t,throatRadius),open:1,phase:'Open bridge',far:false};
 const departure=7,arrival=departure+Math.PI/.12,closed=arrival+5,legDuration=closed+5;
 // The existing outward passage is repeated in reverse. Turn only after the
 // gate is fully closed; use a smooth in-place half-turn, with no position jump.
 const leg=Math.floor(t/legDuration),local=t-leg*legDuration,returning=leg%2===1,direction=returning?-1:1;
 const phaseTime=Math.max(0,Math.min(Math.PI/.12,local-departure)),l=direction*(HEIGHLINER_PASSAGE.endpoint/HEIGHLINER_PASSAGE.throatRadius)*throatRadius*Math.cos(phaseTime*.12),path={l,r:bridgeIsotropicRadius(l,throatRadius)};
 const destination=returning?'Caladan':'Arakas',turn=smooth((local-closed)/3),headingAngle=(returning?Math.PI:0)+Math.PI*turn;
 const moving=local>=departure&&local<arrival;
 return {...path,properSpeed:moving?-direction*(HEIGHLINER_PASSAGE.endpoint/HEIGHLINER_PASSAGE.throatRadius)*throatRadius*.12*Math.sin(.12*phaseTime):0,properAcceleration:moving?-(.12**2)*l:0,inward:!returning,headingAngle,open:local<departure?smooth((local-2)/5):local<arrival?1:1-smooth((local-arrival)/5),far:l<0,phase:local<2?'Preparing passage':local<departure?'Opening bridge':local<arrival?'Crossing to '+destination:local<closed?'Closing bridge':turn<1?'Turning for the return':'Arrived at '+destination};
}

// Standard eye for other ship bridge presets.
// It occupies the standard chase-6 position, but looks at the vehicle center
// and retains normal drag-to-orbit controls.
export const BRIDGE_VEHICLE_CAMERA=Object.freeze({mode:'track',lookYaw:0,lookPitch:0,yaw:Math.PI,pitch:Math.atan2(1.44,4.32),focusDistance:Math.hypot(1.44,4.32)});

// The radial crossing keeps the Einstein–Rosen mouth on the ship's axis on
// either side. At rest the hull supplies a continuous frame for the turn,
// when a tangent inferred from velocity would be undefined.
export const BRIDGE_HULL_CAMERAS=Object.freeze({
 'bridge':Object.freeze({...BRIDGE_VEHICLE_CAMERA,pitch:0,focusDistance:5.4}),
 'bridge-nebulae':Object.freeze({...BRIDGE_VEHICLE_CAMERA,yaw:-Math.PI/2,pitch:0,focusDistance:5})
});

// Geometric throat radius during gate construction. On the departure chart
// it grows from zero. After transit, its reciprocal gives the same shrinking
// throat in the inverted arrival chart without moving the nearby traveler.
export function bridgeMetricScale(open,far=false){const radius=Math.max(1e-4,Math.min(1,Number(open)||0));return far?1/radius:radius;}

// A proximity-operated research gate. It is entirely open before the craft
// reaches the throat and closes only after it clears the opening on either
// side. Its phase is derived from the live pose, so pause/save/manual flight
// and render-worker snapshots cannot desynchronize an extra gate timer.
export function bridgeResearchGateStage(position,throatRadius){
 const b=Math.max(1e-30,throatRadius),r=Math.max(1e-30,Math.hypot(...(position||[0,0,6*b]))),l=bridgeProperRadius(r,b),distance=Math.abs(l)/b;
 const t=Math.max(0,Math.min(1,(distance-1.25)/2.25)),open=1-t*t*(3-2*t);
 return {r,l,open,far:l<0,phase:open<=0?'Gate on standby':open>=1?'Gate open':'Gate activating'};
}

// A robust Gaussian line integral used by the jet sampler. This independent
// numerical counterpart makes subpixel, oblique jet crossings testable.
export function gaussianSegmentIntegral(start, end, width) {
 const d=start.map((x,i)=>end[i]-x),d2=d.reduce((s,x)=>s+x*x,0),w=Math.max(1e-12,width);
 if(d2<1e-8*w*w)return Math.exp(-start.reduce((s,x,i)=>s+(x+d[i]*.5)**2,0)/(w*w));
 const center=-start.reduce((s,x,i)=>s+x*d[i],0)/d2;
 const closest=start.map((x,i)=>x+d[i]*center),exponent=-closest.reduce((s,x)=>s+x*x,0)/(w*w),scale=Math.sqrt(d2)/w;
 const erf=x=>{const sign=Math.sign(x),a=Math.abs(x),t=1/(1+.3275911*a);return sign*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-a*a));};
 return Math.exp(exponent)*Math.sqrt(Math.PI)/(2*scale)*(erf(scale*(1-center))-erf(-scale*center));
}

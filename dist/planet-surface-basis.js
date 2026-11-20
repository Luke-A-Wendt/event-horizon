import {REFERENCE_RG_METERS} from './objects.js';
const plus=(a,b)=>a.map((v,i)=>v+b[i]),scale=(a,s)=>a.map(v=>v*s),TAU=2*Math.PI;
// Body-fixed surface axes shared by the renderer and observer instruments.
export function surfaceBasis(body,primaryBasis,time=0){
 if(body.tidalBasis)return body.tidalBasis;
 const tilt=(body.axialTilt||0)*Math.PI/180,c=Math.cos(tilt),s=Math.sin(tilt),x=primaryBasis[0],y=plus(scale(primaryBasis[1],c),scale(primaryBasis[2],s)),z=plus(scale(primaryBasis[2],c),scale(primaryBasis[1],-s));
 const period=body.rotationPeriodSeconds,spin=body.tidallyLocked?(body.headingAngle||0)+Math.PI:Math.abs(period)>1?-time*(18*REFERENCE_RG_METERS/299792458)*TAU/period:-time*(body.rotation??1)*.05,phase=(body.surfaceRotationPhase||0)+spin,cp=Math.cos(phase),sp=Math.sin(phase);
 return [plus(scale(x,cp),scale(z,sp)),y,plus(scale(x,-sp),scale(z,cp))];
}

import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from '../tests/render-fixture.mjs';
import {sampleCircularRadius} from '../dist/travel-math.js';
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true}),c=299792458,g0=9.80665;
const sum=(f,n=3)=>Array.from({length:n},(_,i)=>f(i)).reduce((a,b)=>a+b,0);
function geometry(x,a){
 const D=x*x-2*x+a*a;
 const m=[[-1+2/x,0,-2*a/x],[0,x*x/D,0],[-2*a/x,0,x*x+a*a*(1+2/x)]];
 const dm=[[-2/x**2,0,2*a/x**2],[0,2*x/D-x*x*(2*x-2)/D**2,0],[2*a/x**2,0,2*x-2*a*a/x**2]];
 const det=m[0][0]*m[2][2]-m[0][2]**2,inv=[[m[2][2]/det,0,-m[2][0]/det],[0,1/m[1][1],0],[-m[2][0]/det,0,m[0][0]/det]];
 const cm=(i,j,k)=>sum(l=>.5*inv[i][l]*((j===1?dm[l][k]:0)+(k===1?dm[l][j]:0)-(l===1?dm[j][k]:0)));
 const dot=(u,v)=>sum(i=>sum(j=>m[i][j]*u[i]*v[j]));
 return {dot,cm,alpha:1/Math.sqrt(-inv[0][0]),omega:-m[0][2]/m[2][2],radscale:Math.sqrt(m[1][1]),phiscale:Math.sqrt(m[2][2])};
}
function audit(p) {
 const rg=p.kerr.rg,a=p.kerr.spin;
 const data=u=>{const s=sampleCircularRadius(p,u);return [s.coordinateSeconds*c/rg,s.radius/rg,s.angle,s.properSeconds*c/rg]};
 const maxima={};let peak=0;
 // Reconstruct the worldline from chart positions and clock readings only.
 // Fourth-order finite differences use geometric units (G=M=c=1).
 for(let i=0;i<65;i++){const u=.0043+i/65,h=.0002;
  const [b2,b1,b0,f1,f2]=[-2,-1,0,1,2].map(k=>data(u+k*h)),s=sampleCircularRadius(p,u);
  const der=b0.map((v,j)=>(b2[j]-8*b1[j]+8*f1[j]-f2[j])/(12*h));
  const der2=b0.map((v,j)=>(-(b2[j]-v)+16*(b1[j]-v)+16*(f1[j]-v)-(f2[j]-v))/(12*h*h));
  const {dot,cm,alpha,omega,radscale,phiscale}=geometry(b0[1],a),l=Math.sqrt(-dot(der,der));
  // Normalize the tangent and remove its projection from the covariant derivative.
  const U=der.slice(0,3).map(v=>v/l),Z=U.map((_,i)=>der2[i]/(l*l)+sum(j=>sum(k=>cm(i,j,k)*U[j]*U[k])));
  const A=Z.map((z,i)=>z+U[i]*dot(Z,U)),g=Math.sqrt(Math.max(0,dot(A,A)))*c*c/rg/g0;
  const tetrad=v=>[alpha*v[0],radscale*v[1],phiscale*(v[2]-omega*v[0])],uh=tetrad(U),ah=tetrad(A);
  const rest=ah.slice(1).map((v,i)=>(v-ah[0]*uh[i+1]/(1+uh[0]))*c*c/rg/g0);
  const zamoSpeed=c*Math.hypot(uh[1],uh[2])/uh[0];
  for(const [key,err] of Object.entries({clockRatio:l/der[3]-1,speedRatio:zamoSpeed/s.speedMetersPerSecond-1,properAccG:g-s.requiredSupportG,radialThrustG:rest[0]-s.radialThrust/g0,tangentialThrustG:rest[1]-s.tangentialThrust/g0}))maxima[key]=Math.max(maxima[key]||0,Math.abs(err));
  peak=Math.max(peak,g);
 }
 assert(peak>0&&peak<=1,'Computed proper thrust must fit the engine budget');
 for(const k of ['clockRatio','speedRatio'])assert(maxima[k]<1e-8,k+': '+maxima[k]);
 for(const k of ['properAccG','radialThrustG','tangentialThrustG'])assert(maxima[k]<1e-5,k+': '+maxima[k]);
}
r.loadScene('nasa-shuttle');r.sceneLoad=null;r.state.paused=false;const seen=new Set();
for(let i=0;i<2200;i++){r.advanceChartStages(.05);if(r.transfer?.radiusTransfer){const p=r.transfer.plan,k=p.ra+':'+p.rb;if(!seen.has(k)){assert(p.kerr&&p.rb<p.ra);seen.add(k);audit(p)}if(seen.size===3)break;}}
r.dispose();assert.equal(seen.size,3,'Sample all three distinct descending legs');
console.log('PASS: Equatorial Kerr metric independently reproduces all three legs’ local speeds, proper clocks and engine forces, within 1g.');

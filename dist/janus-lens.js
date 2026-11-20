// Image-plane impact parameter q is measured in apparent mouth radii. A
// finite, softened critical curve folds the resident and transmitting rays
// without integrating a second astronomical scene. Both charts become the
// ordinary camera map at contact, so the coordinate transfer is continuous.
export const JANUS_LENS=Object.freeze({nearBend:1.12,farBend:1.28,farCore:.12,returnStart:1.5,outer:2.8,edgeWidth:.10});
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function janusLensStrength(p,charge){
 return charge?smooth(0,.14,p)*(1-smooth(.70,1,p)):.52*Math.sin(Math.PI*p)*(1-smooth(.65,1,p));
}
export function janusLensSample(q,p,charge,aa=.000001){
 const {nearBend,farBend,farCore,returnStart,outer,edgeWidth}=JANUS_LENS;
 const strength=janusLensStrength(p,charge),edge=Math.max(aa,edgeWidth*strength);
 const resident=q-strength*nearBend*2*q/(1+q*q*q)*(1-smooth(returnStart,outer,q));
 const remote=q*(1-strength*farBend*smooth(farCore,1,q)**2);
 return {resident,remote,transmission:charge?1-smooth(1-edge,1+edge,q):0};
}

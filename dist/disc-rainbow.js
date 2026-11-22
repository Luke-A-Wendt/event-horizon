// Seven equal radial bands with smooth transitions at their boundaries.
const colors=[[1,.012,.006],[1,.22,.004],[1,.9,.008],[.012,.80,.035],[.008,.19,1],[.105,.022,.80],[.54,.016,1]];
function stopAt(radius,inner,outer){
 const t=(outer-radius)/(outer-inner);
 return Math.min(colors.length-1,Math.max(0,t*colors.length-.5));
}
export function rainbowDiscColor(radius,inner,outer){
 const t=stopAt(radius,inner,outer),i=Math.min(colors.length-2,Math.floor(t)),x=Math.max(0,Math.min(1,(t-i-.32)/.36)),f=x*x*(3-2*x);
 return '#'+colors[i].map((v,k)=>Math.round(255*(v+(colors[i+1][k]-v)*f)).toString(16).padStart(2,'0')).join('');
}
const rgb=c=>'vec3('+c.map(x=>x.toFixed(3)).join(',')+')';
export const DISC_RAINBOW_GLSL=`
vec3 radialRainbow(float r,float inner,float outer){
 float t=clamp((outer-r)/(outer-inner)*7.0-.5,0.0,6.0);
 ${colors.slice(0,-1).map((c,i)=>`${i<colors.length-2?'if(t<'+(i+1)+'.0)':''}return mix(${rgb(c)},${rgb(colors[i+1])},smoothstep(.32,.68,t-${i}.0));`).join('\n ')}
}
`;

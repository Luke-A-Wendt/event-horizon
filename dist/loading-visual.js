// Tiny, local loading presentation. OffscreenCanvas owns its own timer and
// drawing thread; older browsers use prepainted compositor transform layers.
// Shared symbolic optical chart: the near orbit stays low; the rear image
// splits into two paths around the shadow. Endpoints and velocities join.
export function loadingOrbitSample(phase){
 const theta=phase*Math.PI*2,x=64+40*Math.cos(theta),s=Math.sin(theta);
 if(s>=0)return [[x,35+8*s,1],[x,35+8*s,0]];
 const f=-s,bend=8*f+14*f**6;return [[x,35-bend,1],[x,35+bend,f*f]];
}
const loadingSymbolMarkup='<span class="loading-symbol"><svg class="loading-symbol-paths" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 72" aria-hidden="true"><path d="M24.000 35.000L24.031 34.686L24.123 34.372L24.277 34.060L24.492 33.748L24.769 33.439L25.105 33.130L25.502 32.823L25.958 32.516L26.472 32.207L27.045 31.895L27.674 31.575L28.360 31.245L29.100 30.901L29.894 30.535L30.741 30.144L31.639 29.720L32.587 29.259L33.584 28.754L34.627 28.200L35.716 27.593L36.848 26.930L38.022 26.210L39.236 25.434L40.489 24.603L41.777 23.722L43.100 22.800L44.455 21.844L45.840 20.867L47.254 19.882L48.693 18.903L50.155 17.947L51.639 17.031L53.142 16.173L54.662 15.387L56.196 14.692L57.743 14.101L59.299 13.628L60.862 13.282L62.430 13.071L64.000 13.000L65.570 13.071L67.138 13.282L68.701 13.628L70.257 14.101L71.804 14.692L73.338 15.387L74.858 16.173L76.361 17.031L77.845 17.947L79.307 18.903L80.746 19.882L82.160 20.867L83.545 21.844L84.900 22.800L86.223 23.722L87.511 24.603L88.764 25.434L89.978 26.210L91.152 26.930L92.284 27.593L93.373 28.200L94.416 28.754L95.413 29.259L96.361 29.720L97.259 30.144L98.106 30.535L98.900 30.901L99.640 31.245L100.326 31.575L100.955 31.895L101.528 32.207L102.042 32.516L102.498 32.823L102.895 33.130L103.231 33.439L103.508 33.748L103.723 34.060L103.877 34.372L103.969 34.686L104.000 35.000" fill="none" stroke="#688fa9" stroke-width=".8"/><path d="M24.000 35.000L24.031 35.314L24.123 35.628L24.277 35.940L24.492 36.252L24.769 36.561L25.105 36.870L25.502 37.177L25.958 37.484L26.472 37.793L27.045 38.105L27.674 38.425L28.360 38.755L29.100 39.099L29.894 39.465L30.741 39.856L31.639 40.280L32.587 40.741L33.584 41.246L34.627 41.800L35.716 42.407L36.848 43.070L38.022 43.790L39.236 44.566L40.489 45.397L41.777 46.278L43.100 47.200L44.455 48.156L45.840 49.133L47.254 50.118L48.693 51.097L50.155 52.053L51.639 52.969L53.142 53.827L54.662 54.613L56.196 55.308L57.743 55.899L59.299 56.372L60.862 56.718L62.430 56.929L64.000 57.000L65.570 56.929L67.138 56.718L68.701 56.372L70.257 55.899L71.804 55.308L73.338 54.613L74.858 53.827L76.361 52.969L77.845 52.053L79.307 51.097L80.746 50.118L82.160 49.133L83.545 48.156L84.900 47.200L86.223 46.278L87.511 45.397L88.764 44.566L89.978 43.790L91.152 43.070L92.284 42.407L93.373 41.800L94.416 41.246L95.413 40.741L96.361 40.280L97.259 39.856L98.106 39.465L98.900 39.099L99.640 38.755L100.326 38.425L100.955 38.105L101.528 37.793L102.042 37.484L102.498 37.177L102.895 36.870L103.231 36.561L103.508 36.252L103.723 35.940L103.877 35.628L103.969 35.314L104.000 35.000" fill="none" stroke="#385c76" stroke-width=".8"/><circle cx="64" cy="35" r="13" fill="#020409" stroke="#779caf" stroke-width=".8"/><path d="M104.000 35.000L103.969 35.314L103.877 35.628L103.723 35.940L103.508 36.251L103.231 36.561L102.895 36.868L102.498 37.172L102.042 37.472L101.528 37.769L100.955 38.061L100.326 38.349L99.640 38.632L98.900 38.909L98.106 39.180L97.259 39.445L96.361 39.702L95.413 39.953L94.416 40.196L93.373 40.430L92.284 40.657L91.152 40.875L89.978 41.083L88.764 41.283L87.511 41.472L86.223 41.652L84.900 41.821L83.545 41.980L82.160 42.128L80.746 42.265L79.307 42.391L77.845 42.506L76.361 42.608L74.858 42.700L73.338 42.779L71.804 42.846L70.257 42.902L68.701 42.945L67.138 42.975L65.570 42.994L64.000 43.000L62.430 42.994L60.862 42.975L59.299 42.945L57.743 42.902L56.196 42.846L54.662 42.779L53.142 42.700L51.639 42.608L50.155 42.506L48.693 42.391L47.254 42.265L45.840 42.128L44.455 41.980L43.100 41.821L41.777 41.652L40.489 41.472L39.236 41.283L38.022 41.083L36.848 40.875L35.716 40.657L34.627 40.430L33.584 40.196L32.587 39.953L31.639 39.702L30.741 39.445L29.894 39.180L29.100 38.909L28.360 38.632L27.674 38.349L27.045 38.061L26.472 37.769L25.958 37.472L25.502 37.172L25.105 36.868L24.769 36.561L24.492 36.251L24.277 35.940L24.123 35.628L24.031 35.314L24.000 35.000" fill="none" stroke="#6c96b0" stroke-width=".8"/></svg><span class="loading-orbit-image loading-symbol-turn"></span><span class="loading-orbit-image loading-symbol-secondary"></span></span>';
const orbitFrames=branch=>Array.from({length:81},(_,i)=>{const [x,y,opacity]=loadingOrbitSample(i/80)[branch];return {offset:i/80,transform:'translate3d('+(x-2)+'px,'+(y-2)+'px,0)',opacity};});
export const LOADING_VISUAL_WORKER_SOURCE=`
const orbitSample=${loadingOrbitSample.toString()};
let canvas,ctx,timer=null,base=0,stamp=0,running=false,suspended=false,revision=-1,reduced=false;
const elapsed=()=>Math.min(60000,base+(running&&!suspended?Math.max(0,performance.now()-stamp):0));
function drawPath(start,end,branch,color){
 ctx.strokeStyle=color;ctx.lineWidth=.8;ctx.beginPath();
 for(let i=0;i<=80;i++){const [x,y]=orbitSample(start+(end-start)*i/80)[branch];if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.stroke();
}
function draw(){
 if(!ctx)return;const ms=elapsed(),phase=reduced?.18:(ms/4000)%1;
 ctx.clearRect(0,0,128,112);ctx.fillStyle='#03070d';ctx.fillRect(0,0,128,112);
 drawPath(.5,1,0,'#688fa9');drawPath(.5,1,1,'#385c76');
 ctx.fillStyle='#020409';ctx.beginPath();ctx.arc(64,35,13,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#779caf';ctx.lineWidth=.8;ctx.stroke();
 drawPath(0,.5,0,'#6c96b0');
 ctx.fillStyle='#ddf4ff';ctx.shadowBlur=6;ctx.shadowColor='#84caff';
 for(const [x,y,alpha] of orbitSample(phase)){if(alpha<.001)continue;ctx.globalAlpha=alpha;ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;ctx.shadowBlur=0;
 ctx.fillStyle='#cde6ff';ctx.font='500 17px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(Math.floor(ms/600)+'%',64,87);
}
function tick(){timer=null;if(!running)return;draw();timer=setTimeout(tick,reduced||suspended?250:50);}
self.onmessage=event=>{const m=event.data;if(m.type==='init'){canvas=m.canvas;ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('Loading canvas unavailable');draw();return;}
 if(m.type==='dispose'){clearTimeout(timer);self.close();return;}if(m.type!=='state')return;
 const changed=m.revision!==revision,old=elapsed(),incoming=Math.max(0,m.elapsedMs||0)+(!m.suspended&&m.running?Math.max(0,Date.now()-m.sentAt):0);
 base=changed?incoming:Math.max(old,incoming);stamp=performance.now();revision=m.revision;running=!!m.running;suspended=!!m.suspended;reduced=!!m.reduced;clearTimeout(timer);draw();if(running)timer=setTimeout(tick,reduced||suspended?250:50);
};`;
export function createLoadingVisual(element,clock=globalThis){
 const document=element.ownerDocument||clock.document;
 if(!document?.createElement||!element.querySelector?.('.loading-card'))return null;
 const card=element.querySelector('.loading-card'),visual=document.createElement('span');visual.className='loading-visual';visual.setAttribute('aria-hidden','true');
 visual.innerHTML='<span class="loading-visual-fallback">'+loadingSymbolMarkup+'<span class="loading-percent-window"><span class="loading-percent-strip">'+Array.from({length:101},(_,i)=>'<span>'+i+'%</span>').join('')+'</span></span></span>';
 card.querySelector('.loading-bootstrap')?.remove();element.classList.remove('loading-bootstrap-active');card.prepend(visual);element.classList.add('has-independent-loader');
 const strip=visual.querySelector('.loading-percent-strip'),turn=visual.querySelector('.loading-symbol-turn'),secondary=visual.querySelector('.loading-symbol-secondary');
 const reduced=!!clock.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const progress=strip.animate?.([{transform:'translate3d(0,0,0)'},{transform:'translate3d(0,-2200px,0)'}],{duration:60000,easing:'steps(100,end)',fill:'forwards'});progress?.pause();
 const orbits=[turn,secondary].map((node,branch)=>node.animate?.(orbitFrames(branch),{duration:4000,iterations:Infinity}));for(const orbit of orbits){orbit?.pause();if(reduced&&orbit)orbit.currentTime=720;}
 let worker=null,url=null,canvas=null,disposed=false,lastRevision=null;
 try{canvas=document.createElement('canvas');if(typeof canvas.transferControlToOffscreen==='function'&&typeof clock.Worker==='function'&&typeof clock.URL?.createObjectURL==='function'){
   canvas.width=128;canvas.height=112;canvas.className='loading-worker-canvas';visual.append(canvas);
   const offscreen=canvas.transferControlToOffscreen();url=clock.URL.createObjectURL(new Blob([LOADING_VISUAL_WORKER_SOURCE],{type:'text/javascript'}));worker=new clock.Worker(url,{name:'event-horizon-loading'});
   worker.onerror=()=>{worker?.terminate();worker=null;canvas.remove();if(url){clock.URL.revokeObjectURL(url);url=null;}};
   worker.postMessage({type:'init',canvas:offscreen},[offscreen]);
  }}catch{worker?.terminate();worker=null;canvas?.remove();if(url){clock.URL.revokeObjectURL(url);url=null;}}
 return {update({running,elapsedMs,suspended,revision}){
  if(disposed)return;const time=Math.max(0,Math.min(60000,elapsedMs||0));
  if(progress){progress.currentTime=time;if(running&&!suspended&&time<60000)progress.play();else progress.pause();}else if(strip.style)strip.style.transform='translate3d(0,'+(-22*Math.floor(time/600))+'px,0)';
  for(const orbit of orbits)if(orbit){if(lastRevision!==revision)orbit.currentTime=reduced?720:0;if(running&&!suspended&&!reduced)orbit.play();else orbit.pause();}
  lastRevision=revision;worker?.postMessage({type:'state',running,elapsedMs:time,suspended,revision,reduced,sentAt:Date.now()});
 },dispose(){if(disposed)return;disposed=true;progress?.cancel();for(const orbit of orbits)orbit?.cancel();worker?.terminate();if(url)clock.URL.revokeObjectURL(url);visual.remove();element.classList.remove('has-independent-loader');}};
}

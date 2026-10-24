import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLoadingIndicator } from '../dist/loading-indicator.js';

// A deterministic clock exercises quick edits, stale timer cancellation, and
// completed-frame disappearance without relying on fast test-machine timing.
let time=0,serial=0;const timers=new Map();
const clock={performance:{now:()=>time},setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,at:time+delay});return id;},clearTimeout(id){timers.delete(id);}};
function advance(ms){const until=time+ms;while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>until)break;time=next[1].at;timers.delete(next[0]);next[1].fn();}time=until;}
const classes=new Set(),element={hidden:true,classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)}},reason={textContent:''};
const indicator=createLoadingIndicator(element,reason,clock);
indicator.update(true,'Opening scene');advance(80);assert(element.hidden,'Fast loads do not flash');
indicator.update(false);advance(500);assert(element.hidden,'Cancelled pending appearance stays hidden');
indicator.update(true,'Preparing graphics');advance(160);assert(!element.hidden);assert.equal(reason.textContent,'Preparing graphics');
indicator.update(false);advance(100);assert(!element.hidden,'A shown loader has a short stable dwell');
indicator.update(true,'New scene');advance(500);assert(!element.hidden,'An old completion cannot hide a newer load');assert.equal(reason.textContent,'New scene');
indicator.update(false);advance(500);assert(element.hidden,'Completed render fades and hides');
indicator.update(true,'Startup',true);assert(!element.hidden,'Startup can show immediately');indicator.dispose();advance(1000);assert(element.hidden);assert.equal(timers.size,0);

const [html,app,ui,css]=await Promise.all(['index.html','app.js','viewport-ui.js','style.css'].map(p=>readFile(new URL('../dist/'+p,import.meta.url),'utf8')));
assert(html.includes('id="fpsCorner"')&&app.includes("$('fpsCorner').textContent=fps"),'FPS remains in the viewport quality corner');
assert(!html.includes('id="objectMarkers"')&&!ui.includes('viewportSelection'),'Objects do not create floating viewport labels');
assert(app.includes('viewportUI?.openElements();toast('),'Adding opens the Elements list, not an overlapping object badge');
assert(ui.includes("${icon('video')}<span>Camera</span>"),'Camera uses the video-camera symbol');
assert(!app.includes('Ⅱ')&&!ui.includes('Ⅱ')&&!html.includes('Ⅱ'),'Pause uses two SVG bars, not a serif character');
assert(html.includes('id="localPlacement"')&&html.includes('id="orbitalPlacement"'));
assert(app.includes("$('addOrbitPlacement').hidden=context.kind!=='orbit'"));
assert(app.includes('renderer.setObjectWarp?.(item.id,event.target.checked)'));
assert(app.includes('renderer.exploreWarp?.()'));
assert(app.includes('setBridgeTraveler?.(event.target.value)'));
assert(app.includes('stats.renderBusy||stats.shaderCompiling||!(stats.renderReady??renderer?.ready)'),'Loader waits for frame readiness, not shader completion alone');
assert(ui.includes('renderer().renderPicture?.bind(renderer())'),'Picture work uses the renderer host when available');
assert(css.includes('.scene-loading{')&&css.includes('pointer-events:none'),'Loading presentation never intercepts the controls');
console.log('PASS: loader lifecycle and race cancellation, persistent FPS, contextual object/warp/bridge controls, worker picture routing, SVG camera/pause, and no floating selection overlays.');

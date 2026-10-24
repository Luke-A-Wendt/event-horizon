// Structural integration checks for the browser UI. This is not a browser,
// layout, touchscreen, or accessibility-tree emulation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const [html,app,viewport,css]=await Promise.all(['dist/index.html','dist/app.js','dist/viewport-ui.js','dist/style.css'].map(path=>readFile(new URL('../'+path,import.meta.url),'utf8')));
const ids=source=>[...source.matchAll(/\bid\s*=\s*["']([A-Za-z][\w-]*)["']/g)].map(m=>m[1]);
const staticIds=ids(html);assert.equal(staticIds.length,new Set(staticIds).size,'Static HTML IDs must be unique');
const available=new Set([...staticIds,...ids(app),...ids(viewport)]);
for(const match of app.matchAll(/\b(?:range|toggle|select|color)\('([\w-]+)'/g)){available.add(match[1]);available.add('out-'+match[1]);}
for(const source of [app,viewport])for(const match of source.matchAll(/\$\('([\w-]+)'\)/g))assert(available.has(match[1]),`Control references a missing element: ${match[1]}`);
for(const match of html.matchAll(/<use\b[^>]*href="#([\w-]+)"/g))assert(available.has(match[1]),`Missing SVG symbol ${match[1]}`);
for(const id of ['elementsPanel','cameraPanel','displayPanel','pictureDialog','cpuFallbackPrompt','cpuQualityNotice','viewportTarget','inspectorTrack','inspectorRide','viewportReset','enterVR','pictureProgress','downloadPicture'])assert(available.has(id),`Missing primary interaction ${id}`);
assert(!staticIds.includes('approach'));assert(!app.includes("$('approach')"),'Removed approach button must not leave a live null reference');
assert(viewport.includes("scene.append(controls)"),'Property inspector must remain in fullscreen subtree');
assert(viewport.includes("['mathDialog','atlasDialog','warpDialog','helpDialog']")&&viewport.includes('scene.append($(id))'),'All guides/Scenes must remain available fullscreen');
assert(viewport.includes("$('displayControlSlot').append($('performanceControls'))"),'Quality is reachable inside the viewport');
assert(viewport.includes("renderer()?.setViewMode('free')"));
assert(app.includes("renderer?.setViewMode('look');renderer?.look(direction)"),'Look presets must be applied after leaving free mode');
assert(viewport.includes("picture.addEventListener('close',()=>requestAnimationFrame(()=>$('capture').click()),{once:true})"),'Quick capture must wait for modal presentation to resume');
assert(app.includes('await renderer.startup')&&app.includes('if(!cpu&&!startup.available)'),'CPU is offered only after the graphics host reports GPU unavailable');
assert(app.includes("$('continueCPU').addEventListener('click',()=>initRenderer(true))"),'CPU needs an explicit choice');
assert(viewport.includes("$('pictureToggle').disabled=false"),'CPU users can still reach ordinary frame capture');
assert(viewport.includes("sceneChanged:()=>{selection='primary'"),'Loading a scene clears stale object selection');
assert(app.includes("$('editPhase').disabled=guided||bridgeShip"),'Prescribed bridge route must not expose ineffective phase control');
assert(css.includes('.scene.no-focus-banner .focus-banner{display:none!important}'),'No persistent previous-view banner');
assert(css.includes('scrollbar-gutter:stable'),'Property scrolling must remain discoverable');
const warp=html.match(/<symbol id="i-warp"[\s\S]*?<path d="([^"]+)"/)[1];
const points=[...warp.matchAll(/(?:M|L)([\d.]+),([\d.]+)/g)].map(m=>[Number(m[1]),Number(m[2])]);
assert.equal(points.length,65);assert(points[32][1]===16);assert(Math.min(...points.map(p=>p[1]))<7);assert(Math.max(...points.map(p=>p[1]))>25);
assert(html.includes('fill-rule="evenodd"'),'Black-hole halo must have a clear central silhouette');
console.log('PASS: viewport controls, fullscreen ownership, element properties, free-look transitions, CPU opt-in, modal capture ordering, bridge controls, and icon structure. Browser layout/hardware not emulated.');

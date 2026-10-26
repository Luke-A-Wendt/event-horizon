import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { SCENE_PRESETS } from '../dist/config.js';
import { RENDER_WORKER_SOURCE } from '../dist/render-worker-bundle.js';
import { SCENE_FILE_WORKER_SOURCE } from '../dist/scene-file-worker-bundle.js';
import { PLANET_TEXTURE_DATA } from '../dist/planet-texture-data.js';

// Inspect the shipped artifact, not merely the inputs to the bundler. This is
// static validation; it does not substitute for a real browser/WebGL test.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
assert.equal(scriptTags.length, 1, 'Standalone page must have one inline script');
assert(!/\bsrc\s*=|\btype\s*=\s*['"]module['"]/i.test(scriptTags[0][1]), 'Script must run without module fetching');
const javascript = scriptTags[0][2];
new vm.Script(javascript, { filename: 'standalone-index.html' });
assert(!/\bimport\s*(?:\(|\{|\*|['"])/.test(javascript), 'Executable imports are not allowed in the offline bundle');
assert(!/^\s*export\s/m.test(javascript), 'All exports must be bundled');

const forbiddenRuntime = [
  ['fetch', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['sendBeacon', /\bsendBeacon\s*\(/],
  ['shared worker', /\bnew\s+SharedWorker\s*\(/],
  ['worker script import', /\bimportScripts\s*\(/],
  ['service worker', /\bserviceWorker\b/],
  ['CSS import', /@import\b/i],
];
for (const [label, pattern] of forbiddenRuntime) assert(!pattern.test(html), `Unexpected ${label} dependency`);
// A dedicated worker is allowed only as a self-contained, locally generated
// Blob. Validate its complete executable contents as well as the page closure.
new vm.Script(RENDER_WORKER_SOURCE, {filename:'embedded-render-worker.js'});
assert(RENDER_WORKER_SOURCE.includes('__modules["render-worker.js"].installRenderWorker(globalThis)'), 'Worker entrypoint is bundled');
assert(!/\bimport\s*(?:\(|\{|\*|['"])|^\s*export\s/m.test(RENDER_WORKER_SOURCE), 'Worker must contain no executable imports or exports');
for(const [label,pattern] of forbiddenRuntime)assert(!pattern.test(RENDER_WORKER_SOURCE),`Unexpected worker ${label} dependency`);
new vm.Script(SCENE_FILE_WORKER_SOURCE,{filename:'embedded-scene-file-worker.js'});
assert(SCENE_FILE_WORKER_SOURCE.includes('__modules["scene-file-worker.js"].installSceneFileWorker(globalThis)'));
assert(javascript.includes(JSON.stringify(SCENE_FILE_WORKER_SOURCE)),'Scene-file worker is included in the offline page');
assert(!/\bimport\s*(?:\(|\{|\*|['"])|^\s*export\s/m.test(SCENE_FILE_WORKER_SOURCE),'Scene-file worker has no executable imports');
for(const [label,pattern] of forbiddenRuntime)assert(!pattern.test(SCENE_FILE_WORKER_SOURCE),`Unexpected scene-file worker ${label} dependency`);
assert(!SCENE_FILE_WORKER_SOURCE.includes('data:image/jpeg;base64,'),'Scene files do not duplicate the mission image catalog');
assert(javascript.includes(JSON.stringify(RENDER_WORKER_SOURCE)), 'Standalone HTML embeds the exact complete worker source');
// Reference maps appear once in the page. GPU workers receive their data via
// the init message; embedding a second full catalog in the worker string would
// waste startup memory on older devices, including CPU-only sessions.
const planetImages=[PLANET_TEXTURE_DATA.atlas,...Object.values(PLANET_TEXTURE_DATA.maps)];
assert.equal(Object.keys(PLANET_TEXTURE_DATA.maps).length,13,'Complete reviewed mission-map set is included');
for(const uri of planetImages){
 assert(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(uri),'Planet map must be an embedded JPEG');
 const bytes=Buffer.from(uri.split(',')[1],'base64');assert(bytes.length>1000&&bytes[0]===255&&bytes[1]===216,'Valid nonempty JPEG map');
 const first=javascript.indexOf(uri);assert(first>=0,'Planet map is embedded in the standalone page');
 assert.equal(javascript.indexOf(uri,first+uri.length),-1,'Map payload must not be duplicated');
 assert(!RENDER_WORKER_SOURCE.includes(uri),'Worker starts with an empty asset container');
}
assert.match(RENDER_WORKER_SOURCE,/PLANET_TEXTURE_DATA=\{atlas:"",maps:\{\},meta:\{\}\}/,'Worker texture data is injected locally before initialization');
assert.match(javascript,/URL\.createObjectURL\(new Blob\(\[RENDER_WORKER_SOURCE\],\{type:'text\/javascript'\}\)\)/,'Worker URL must come from its embedded source Blob');
assert.equal([...javascript.matchAll(/new Worker\s*\(/g)].length,2,'Only the reviewed rendering and scene-file workers are created');
assert.match(javascript,/new Worker\(url,\{name:'event-horizon-renderer'\}\)/,'Worker must use the local Blob URL');
assert.match(javascript,/URL\.createObjectURL\(new Blob\(\[SCENE_FILE_WORKER_SOURCE\],\{type:'text\/javascript'\}\)\)/,'File worker must use embedded source');
assert.match(javascript,/new Worker\(url,\{name:'event-horizon-scene-file'\}\)/,'Scene-file worker must use the local Blob URL');
assert.match(javascript,/URL\.revokeObjectURL\(url\)/,'Worker Blob URL is released');

const embeddedMatch = javascript.match(/const __atlasImages = (\{[^\n]+\});/);
assert(embeddedMatch, 'Embedded atlas map is missing');
const atlas = JSON.parse(embeddedMatch[1]);
assert.deepEqual(Object.keys(atlas).sort(), SCENE_PRESETS.map(p => p.id).sort(), 'Every scene must have one embedded thumbnail');
assert.equal(Object.keys(atlas).length, SCENE_PRESETS.length, 'The complete scene atlas must be included');
let imageBytes = 0;
for (const scene of SCENE_PRESETS) {
  const uri = atlas[scene.id];
  assert(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(uri), `Invalid embedded image for ${scene.id}`);
  const bytes = Buffer.from(uri.split(',')[1], 'base64');
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `Invalid WebP container for ${scene.id}`);
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', `Invalid WebP signature for ${scene.id}`);
  assert(bytes.equals(await readFile(path.join(root, 'dist', 'assets', `atlas-${scene.id}.webp`))), `Thumbnail differs from source for ${scene.id}`);
  imageBytes += bytes.length;
}
assert(javascript.includes('src="${__atlasImages[p.id]}"'), 'Atlas rendering must use the embedded map');
assert(!javascript.includes('src="assets/atlas-'), 'Atlas must not request a relative file');

const favicon = html.match(/<link\b[^>]*\brel="icon"[^>]*\bhref="(data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+)"[^>]*>/);
assert(favicon, 'Favicon must be embedded');
assert(Buffer.from(favicon[1].split(',')[1], 'base64').equals(await readFile(path.join(root, 'dist', 'favicon.svg'))), 'Embedded favicon differs from source');
assert(/class="brand"\s+href="#scene"/.test(html), 'Home link must stay within the standalone document');

// Inspect static tags and template tags embedded in the script. Dynamic atlas
// src values are allowed only because their complete data map was checked above.
const resourceTags = [...html.matchAll(/<(?:script|link|img|source|video|audio|iframe|object|embed)\b[^>]*>/gi)];
let embeddedResourceCount = 0;
for (const match of resourceTags) {
  const tag = match[0];
  assert(!/^<(?:iframe|object|embed)\b/i.test(tag), 'Embedded external documents are not allowed');
  for (const attribute of tag.matchAll(/\b(?:src|srcset|href|poster|data)\s*=\s*(["'])(.*?)\1/gi)) {
    const value = attribute[2];
    assert(value.startsWith('data:') || value === '${__atlasImages[p.id]}', 'Resource tag contains a non-embedded dependency');
    embeddedResourceCount++;
  }
}
// Include style tags inside template literals (the math guide) as well as the
// document stylesheet and inline style attributes. Avoid interpreting the JS
// createObjectURL/revokeObjectURL methods as CSS resource declarations.
const cssBlocks = [
  ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map(match => match[1]),
  ...[...html.matchAll(/\bstyle\s*=\s*(["'])(.*?)\1/gi)].map(match => match[2]),
];
for (const css of cssBlocks) {
  for (const match of css.matchAll(/\burl\s*\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    assert(match[2].startsWith('data:') || match[2].startsWith('#'), 'CSS contains an external resource');
  }
}

// Scholarly references and the two requested author links are user-activated
// anchors, not app dependencies. Credit URLs are permitted only in the href of
// a paired anchor, at that exact URL offset, never in scripts or resource tags.
const creditDestinations = new Map([
  ['https://github.com/Luke-A-Wendt', 'Dr. Luke A. Wendt'],
  ['https://openai.com/index/gpt-6-astra/', 'Astra Ultra'],
]);
function creditHrefOffsets(document) {
  const offsets = new Set();
  const staticMarkup = document.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, script => ' '.repeat(script.length));
  for (const anchor of staticMarkup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const hrefs = [...anchor[1].matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gi)];
    if (hrefs.length !== 1) continue;
    const href = hrefs[0], label = creditDestinations.get(href[2]);
    if (!label || anchor[2].replace(/<[^>]*>/g, '').trim() !== label) continue;
    const attributesAt = anchor[0].indexOf(anchor[1]);
    offsets.add(anchor.index + attributesAt + href.index + href[0].indexOf(href[2]));
  }
  return offsets;
}
// Exercise the narrow exception so adding credits cannot silently relax the
// resource closure check for arbitrary URLs or non-anchor use of a credit URL.
const creditFixture = '<a href="https://github.com/Luke-A-Wendt">Dr. Luke A. Wendt</a>';
assert(creditHrefOffsets(creditFixture).has(creditFixture.indexOf('https:')));
for (const invalid of [
  '<img src="https://github.com/Luke-A-Wendt">',
  '<a href="https://github.com/Luke-A-Wendt/other">Dr. Luke A. Wendt</a>',
  '<a href="https://example.org">Dr. Luke A. Wendt</a>',
  '<a href="https://github.com/Luke-A-Wendt">Someone else</a>',
  '<a href="https://github.com/Luke-A-Wendt">Dr. Luke A. Wendt',
  'const url="https://github.com/Luke-A-Wendt";',
  '<script>const template=\'<a href="https://github.com/Luke-A-Wendt">Dr. Luke A. Wendt</a>\';</script>',
]) assert.equal(creditHrefOffsets(invalid).size, 0, 'Credit exception must be limited to the exact paired author anchor');
const creditOffsets = creditHrefOffsets(html);
// Any other HTTP literal requires explicit review rather than silent allowance.
const remoteLiterals = [...html.matchAll(/https?:\/\/[^\s"'`<>)]*/g)];
for (const match of remoteLiterals) {
  const before = html.slice(Math.max(0, match.index - 30), match.index);
  assert(/(?:\bxmlns\s*=\s*["']|\blink\(\s*["'])$/.test(before) || (match[0]==='http://www.w3.org/2000/svg'&&/createElementNS\(\s*['"]$/.test(before)) || creditOffsets.has(match.index), 'Remote URL appears outside a reference link, approved author anchor, or XML namespace');
}

const credentialPatterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['OpenAI-style key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['credential URL', /https?:\/\/[^/\s]+:[^/\s]+@/],
  ['literal secret assignment', /\b(?:api_?key|password|passwd|secret|access_?token|auth_?token|authorization)\b\s*[:=]\s*["'][^"']{4,}["']/i],
];
// Report only the category on a failure; never print a matching secret.
for (const [label, pattern] of credentialPatterns) assert(!pattern.test(html), `Credential scan found a ${label} pattern`);
assert(!/appgprj_|appgdep_|git\.chatgpt-team\.site/.test(html), 'Hosting identity must not enter the portable app');

console.log(`PASS: standalone JS syntax; ${Object.keys(atlas).length} exact embedded atlas images (${imageBytes} bytes), favicon, ${embeddedResourceCount} embedded resource references; ${remoteLiterals.length} optional reference/namespace URLs; no runtime network APIs, executable imports, or credential-pattern hits.`);

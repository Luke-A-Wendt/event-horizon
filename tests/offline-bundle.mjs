import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { SCENE_PRESETS } from '../dist/config.js';
import { RENDER_WORKER_SOURCE } from '../dist/render-worker-bundle.js';

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
assert(javascript.includes(JSON.stringify(RENDER_WORKER_SOURCE)), 'Standalone HTML embeds the exact complete worker source');
assert.match(javascript,/URL\.createObjectURL\(new Blob\(\[RENDER_WORKER_SOURCE\],\{type:'text\/javascript'\}\)\)/,'Worker URL must come from its embedded source Blob');
assert.equal([...javascript.matchAll(/new Worker\s*\(/g)].length,1,'Exactly one reviewed dedicated-worker constructor');
assert.match(javascript,/new Worker\(url,\{name:'event-horizon-renderer'\}\)/,'Worker must use the local Blob URL');
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
  assert(/(?:\bxmlns\s*=\s*["']|\blink\(\s*["'])$/.test(before) || creditOffsets.has(match.index), 'Remote URL appears outside a reference link, approved author anchor, or XML namespace');
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

import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENE_PRESETS } from '../dist/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(path.join(root, name), 'utf8');
const [readme, license, sourceHtml, rootEntry, standalone, manifest] = await Promise.all([
  read('README.md'), read('LICENSE'), read('dist/index.html'), read('index.html'), read('offline.html'), read('package.json'),
]);

// The archive's entry point is usable as uploaded to the repository root. The
// companion offline-bundle test checks its executable and resource closure.
assert((await stat(path.join(root, '.nojekyll'))).isFile(), 'GitHub Pages marker must exist at the root');
assert.match(rootEntry, /<!doctype html>/i, 'Root entry point is a complete HTML document');
assert.match(standalone, /<!doctype html>/i, 'Portable single-file document is included');
assert(!readme.includes('## Run completely offline'), 'Preserve author removal of setup instructions');
assert(!readme.includes('## Publish on GitHub Pages'), 'Preserve author removal of hosting walkthrough');
assert.match(readme, /No `npm install` is needed/, 'Offline build requires no package download');
const pkg = JSON.parse(manifest);
assert.equal(pkg.license, 'MIT');
for (const key of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
  assert.equal(Object.keys(pkg[key] || {}).length, 0, `${key} must remain empty`);
}

const credits = [
  ['Dr. Luke A. Wendt', 'https://github.com/Luke-A-Wendt'],
  ['Astra Ultra', 'https://openai.com/index/gpt-6-astra/'],
];
for (const [label, url] of credits) {
  assert(readme.includes(`[${label}](${url})`), `README includes the requested ${label} attribution`);
  for (const [name, html] of [['source', sourceHtml], ['root', rootEntry], ['standalone', standalone]]) {
    const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer\s*>/i)?.[1];
    assert(footer, `${name} page has a footer`);
    const links = [...footer.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)];
    assert(links.some(link => link[1].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2] === url && link[2].replace(/<[^>]*>/g, '').trim() === label), `${name} footer has the exact ${label} author link`);
    assert.match(footer.replace(/<[^>]*>/g, ' '), /Author\s*:?\s*Dr\. Luke A\. Wendt[\s\S]*Co-author\s*:?\s*Astra Ultra/i, `${name} footer identifies both credit roles`);
  }
}

// Preserve every word of the MIT grant, attribution condition, and disclaimer.
const mitTerms = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
assert.equal(license.trim(), `MIT License\n\nCopyright (c) 2026 Dr. Luke A. Wendt and contributors\n\n${mitTerms}`);

const advertisedCount=readme.match(/Scenes gallery has (\d+) presets/)?.[1];
if(advertisedCount!==undefined)assert.equal(Number(advertisedCount),SCENE_PRESETS.length,'Any advertised scene count matches the shipped gallery');
for (const id of ['radio-observatory', 'gamma-engine']) {
  const scene = SCENE_PRESETS.find(preset => preset.id === id);
  assert(scene, `Publication includes ${id}`);
  assert(readme.includes(`**${scene.title}**`), 'README names the spectral starting points accurately');
}
for (const band of ['Visible', 'Infrared', 'X-ray', 'Radio', 'Gamma']) assert(readme.includes(`| ${band} |`), `README explains ${band}`);
assert.match(readme, /millimeter.wave/i);
assert.match(readme, /not calibrated instrument simulations/);
assert.match(readme, /Runtime architecture/);
assert.doesNotMatch(readme, /passwords|API keys|archive excludes/i, 'README describes the project rather than delivery assurances');
console.log('PASS: publication entry point and author README choices; exact linked author credits; complete MIT text; dependency-free manifest; spectral documentation and current scene inventory.');

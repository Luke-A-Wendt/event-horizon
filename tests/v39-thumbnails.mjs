import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SCENE_PRESETS} from '../dist/config.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const manifest=JSON.parse(read('dist/assets/thumbnail-manifest.json'));
assert.equal(manifest.preset,'quick');assert.equal(manifest.format,2);
for(const scene of SCENE_PRESETS){
 const record=manifest.scenes[scene.id];assert(record,`Missing baked scene ${scene.id}`);assert.equal(record.scene,scene.id);assert.equal(record.preset,'quick');assert.equal(record.completePasses,1);assert.equal(record.minimumPixelSamples,1);assert.equal(record.detail,2);assert.equal(record.baseSteps,192);assert.equal(record.width,640);assert.equal(record.height,422);assert(Math.abs(record.width/record.height-960/632)<.01);assert.match(record.sourceHash,/^[a-f0-9]{64}$/);assert.match(record.renderHash,/^[a-f0-9]{64}$/);
 const bytes=read(`dist/assets/atlas-${scene.id}.webp`);assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.equal(createHash('sha256').update(bytes).digest('hex'),record.imageHash,`${scene.id} cached image provenance mismatch`);
}
const css=read('dist/style.css').toString(),app=read('dist/app.js').toString();assert(css.includes('aspect-ratio:960/632')&&css.includes('object-fit:contain'));assert(app.includes('assets/atlas-${p.id}.webp'),'Desktop and mobile share the baked asset');
console.log(`PASS: ${SCENE_PRESETS.length} quick live High screenshots, complete initialized images, exact content hashes, and preserved shared mobile/desktop framing.`);

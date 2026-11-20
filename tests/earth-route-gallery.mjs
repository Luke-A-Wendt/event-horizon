import assert from 'node:assert/strict';
import {sceneGalleryOrder} from '../dist/scene-gallery.js';
import {SCENE_PRESETS} from '../dist/config.js';
const expected=['shuttle-earth-moon-loop','shuttle-earth-mars-loop','earth-vulcan','shuttle-proxima-direct','warp-proxima-direct','shuttle-sgra-direct','warp-sgra-direct','earth-andromeda-bridge'];
for(const draw of [0,.3,.85,.999]){
 const cards=sceneGalleryOrder(SCENE_PRESETS,()=>draw);
 assert.deepEqual(cards.slice(-expected.length),expected);
 assert.equal(new Set(cards).size,cards.length);
}

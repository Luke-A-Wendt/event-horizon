import assert from 'node:assert/strict';
import test from 'node:test';
import {JANUS_LENS, janusLensSample} from '../dist/janus-lens.js';

test('the centered opening bends rays on both sides of its apparent rim', () => {
  const sample = radius => janusLensSample(radius, .4, true);
  const axis = sample(0);
  assert.equal(Math.abs(axis.resident), 0);
  assert.equal(Math.abs(axis.remote), 0);
  assert.equal(axis.transmission, 1);

  const rim = sample(1);
  assert(rim.remote < 0, 'the receiving image folds across the optical axis');
  assert(Math.abs(rim.resident - 1) > .25, 'the local scene bends visibly');
  assert(rim.transmission > 0 && rim.transmission < 1);
  const outside = sample(1.2);
  assert.equal(outside.transmission, 0);
  assert(outside.resident < 1, 'the bend extends into the surrounding sky');
  assert.equal(sample(JANUS_LENS.outer).resident, JANUS_LENS.outer);
});

test('the two orbital charts agree optically at contact', () => {
  for (const radius of [0, .4, .9, 1, 1.5, JANUS_LENS.outer]) {
    const before = janusLensSample(radius, 1, true);
    const after = janusLensSample(radius, 0, false);
    assert.equal(before.remote, radius);
    assert.equal(after.resident, radius);
    assert.equal(after.transmission, 0);
    assert.equal(janusLensSample(radius, 1, false).resident, radius);
  }
  const settling = janusLensSample(1, .5, false);
  assert(settling.resident < 1, 'the arriving sky bends as the opening closes');
  assert.equal(settling.transmission, 0);
});

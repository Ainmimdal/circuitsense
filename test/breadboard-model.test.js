import test from 'node:test';
import assert from 'node:assert/strict';
import { BREADBOARD, breadboardHoles } from '../src/breadboard-model.js';

test('models all 400 holes on the shared 2.54 mm physical scale', () => {
    assert.equal(breadboardHoles.length, 400);
    const d1 = breadboardHoles.find(hole => hole.name === 'D1');
    const d2 = breadboardHoles.find(hole => hole.name === 'D2');
    assert.equal(d2.x - d1.x, 10);
    assert.equal(breadboardHoles.find(hole => hole.name === 'TP1').y - breadboardHoles.find(hole => hole.name === 'TN1').y, BREADBOARD.pitch);
    assert.equal(breadboardHoles.find(hole => hole.name === 'BN1').y - breadboardHoles.find(hole => hole.name === 'BP1').y, BREADBOARD.pitch);
    assert.equal(BREADBOARD.pitch / BREADBOARD.pxPerMm, 2.54);
    assert.ok(BREADBOARD.physicalWidthMm >= 82 && BREADBOARD.physicalWidthMm <= 85);
});

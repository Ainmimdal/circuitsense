import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSelectionRect, rectsIntersect, routeIntersectsRect } from '../src/editor/selection.js';

test('marquee rectangles normalize reverse drags and intersect component bounds', () => {
    const rect = normalizeSelectionRect({ x: 20, y: 15 }, { x: 5, y: 3 });
    assert.deepEqual(rect, { x: 5, y: 3, width: 15, height: 12, left: 5, right: 20, top: 3, bottom: 15 });
    assert.equal(rectsIntersect(rect, { x: 18, y: 10, width: 8, height: 8 }), true);
    assert.equal(rectsIntersect(rect, { x: 21, y: 10, width: 8, height: 8 }), false);
});

test('marquee selection catches a wire segment crossing the box without a waypoint inside it', () => {
    const box = normalizeSelectionRect({ x: 4, y: 4 }, { x: 8, y: 8 });
    assert.equal(routeIntersectsRect([{ x: 0, y: 6 }, { x: 12, y: 6 }], box), true);
    assert.equal(routeIntersectsRect([{ x: 0, y: 2 }, { x: 12, y: 2 }], box), false);
    assert.equal(routeIntersectsRect([{ x: 6, y: 0 }, { x: 6, y: 12 }], box), true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { editableWirePoints, insertWireWaypoint, moveWireSegment, moveWireWaypoint, removeWireWaypoint } from '../src/physical/wire-edit.js';

const autoWire = { route: { mode: 'auto', waypoints: [] } };
const route = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];

test('an automatic route exposes its bends for manual editing', () => {
    assert.deepEqual(editableWirePoints(autoWire, route), route);
});

test('dragging an orthogonal segment moves it perpendicularly without multiplying handles', () => {
    const waypoints = moveWireSegment(autoWire, route, 0, { x: 7.1, y: 5.2 }, {
        snap: true, gridSize: 2.54,
    });
    const full = [route[0], ...waypoints, route.at(-1)];
    assert.ok(full.slice(0, -1).every((point, index) => point.x === full[index + 1].x || point.y === full[index + 1].y));
    assert.deepEqual(waypoints, [{ x: 0, y: 5.08 }, { x: 10, y: 5.08 }]);
    const manual = { route: { mode: 'manual', waypoints } };
    const movedAgain = moveWireSegment(manual, full, 1, { x: 4, y: 7.8 }, { snap: true, gridSize: 2.54 });
    assert.equal(movedAgain.length, waypoints.length, 'moving the same segment again keeps a stable handle count');
});

test('freestyle dragging can create a diagonal waypoint', () => {
    const waypoints = moveWireWaypoint(autoWire, route, 0, { x: 7, y: 4 }, { mode: 'freestyle', snap: false });
    assert.deepEqual(waypoints, [{ x: 7, y: 4 }]);
});

test('a point can be added to the closest segment and removed again', () => {
    const waypoints = insertWireWaypoint(autoWire, route, { x: 4, y: 1 }, { snap: false });
    assert.deepEqual(waypoints, [{ x: 4, y: 0 }, { x: 10, y: 0 }]);
    const manualWire = { route: { mode: 'manual', waypoints } };
    assert.deepEqual(removeWireWaypoint(manualWire, route, 0), [{ x: 10, y: 0 }]);
});

test('the canvas puts unmodified wire colors above component artwork', async () => {
    const source = await readFile(new URL('../src/components/circuit-canvas.js', import.meta.url), 'utf8');
    assert.match(source, /_setLayerDepth\(this\.componentLayer, 3\)/);
    assert.match(source, /_setLayerDepth\(this\.wireLayer, 5\)/);
    assert.doesNotMatch(source, /darkWire|contrast outline/);
    assert.match(source, /stroke: color/);
    assert.match(source, /Drag blue segments or yellow corners/);
});

test('the canvas renders a non-clickable selected-wire overlay after every base wire', async () => {
    const source = await readFile(new URL('../src/components/circuit-canvas.js', import.meta.url), 'utf8');
    const render = source.match(/_renderWires\(\) \{([\s\S]*?)\n    \}\n\n    _selectWire/)?.[1] || '';
    const overlay = source.match(/_refreshWireSelectionVisuals\(\) \{([\s\S]*?)\n    \}\n\n    _syncComponentVisualSelection/)?.[1] || '';
    assert.match(render, /for \(const wire of this\.store\.project\.wires\)/);
    assert.ok(render.indexOf('for (const wire') < render.indexOf('this._refreshWireSelectionVisuals()'));
    assert.doesNotMatch(render, /\.sort\(/);
    assert.match(overlay, /name: 'wire-selection-overlay'/);
    assert.match(overlay, /listening: false/);
});

test('wire selection adds a glow without changing wire thickness or dimming peers', async () => {
    const source = await readFile(new URL('../src/components/circuit-canvas.js', import.meta.url), 'utf8');
    const render = source.match(/_renderWires\(\) \{([\s\S]*?)\n    \}\n\n    _selectWire/)?.[1] || '';
    const overlay = source.match(/_refreshWireSelectionVisuals\(\) \{([\s\S]*?)\n    \}\n\n    _syncComponentVisualSelection/)?.[1] || '';
    assert.match(render, /strokeWidth: \.72/);
    assert.match(render, /hitStrokeWidth: 'auto'/);
    assert.doesNotMatch(render, /hitStrokeWidth: 3/);
    assert.match(overlay, /strokeWidth: \.72/);
    assert.match(overlay, /shadowColor: this\._themeColor\('--primary-hover'\)/);
    assert.doesNotMatch(`${render}\n${overlay}`, /opacity: selected|opacity: this\._selectedWireId/);
});

test('wire switching is immediate and route-only updates avoid full scene rebuilds', async () => {
    const source = await readFile(new URL('../src/components/circuit-canvas.js', import.meta.url), 'utf8');
    const select = source.match(/_selectWire\(wireId\) \{([\s\S]*?)\n    \}\n\n    _clearWireSelectionVisuals/)?.[1] || '';
    assert.match(select, /this\._refreshWireSelectionVisuals\(\)/);
    assert.doesNotMatch(select, /setTimeout|_renderWires|_renderComponentVisuals/);
    assert.doesNotMatch(source, /_wireSelectionTimer/);
    assert.match(source, /if \(event\.detail\?\.routesOnly\) \{\s*this\._renderWires\(\);\s*this\._renderInteractionLayer\(\);/);
});

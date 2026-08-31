import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    HALF_BREADBOARD_DEFINITION,
    createHalfBreadboardSurface,
    holeWorldPosition,
    holesInElectricalGroup,
    surfaceLocalToWorld,
    worldToSurfaceLocal,
} from '../src/physical/breadboard.js';
import { applyTransform, BREADBOARD_PITCH_MM, invertTransform } from '../src/physical/geometry.js';
import { calibrateFreeComponentFootprint, createDipFootprint, defaultFootprintForComponent } from '../src/physical/footprints.js';
import { BreadboardSnapSolver, buildOccupancyMap } from '../src/physical/placement.js';
import {
    componentPinRef,
    createComponentInstance,
    createPhysicalProject,
    mountedComponentTransform,
    resolveConnectionWorldPoint,
    surfaceHoleRef,
} from '../src/physical/model.js';
import { ConnectivityResolver } from '../src/physical/connectivity.js';
import { routeAllWires, routeWire, scoreRoute } from '../src/physical/routing.js';

function projectWithBoard() {
    return createPhysicalProject({ surfaces: [createHalfBreadboardSurface({ x: 30, y: 20 })] });
}

function freePart(id, definitionId, x = 0, y = 0) {
    const footprint = defaultFootprintForComponent(definitionId);
    return createComponentInstance({ id, definitionId, footprintId: footprint.id, x, y });
}

function assertClose(actual, expected, epsilon = 1e-9) {
    assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be within ${epsilon} of ${expected}`);
}

test('half breadboard generates 400 stable 2.54 mm holes with explicit strip and rail topology', () => {
    const board = HALF_BREADBOARD_DEFINITION;
    assert.equal(board.holes.length, 400);
    assert.equal(board.getHole('A1').id, 'A1');
    assert.equal(board.getHole('J30').id, 'J30');
    assert.equal(board.getHole('TP25').id, 'TP25');
    assertClose(board.getHole('A2').x - board.getHole('A1').x, BREADBOARD_PITCH_MM);
    assertClose(board.getHole('B1').y - board.getHole('A1').y, BREADBOARD_PITCH_MM);
    assertClose(board.getHole('F1').y - board.getHole('E1').y, 7.62);
    assert.equal(board.getHole('A17').electricalGroup, board.getHole('E17').electricalGroup);
    assert.notEqual(board.getHole('E17').electricalGroup, board.getHole('F17').electricalGroup);
    assert.equal(board.getHole('F17').electricalGroup, board.getHole('J17').electricalGroup);
    assert.equal(board.getHole('TP1').electricalGroup, board.getHole('TP25').electricalGroup);
    assert.notEqual(board.getHole('TP1').electricalGroup, board.getHole('BP1').electricalGroup);
});

test('surface and world transforms round-trip through movement and rotation', () => {
    const surface = createHalfBreadboardSurface({ x: 41, y: 13, rotation: 90 });
    const local = { x: 12.7, y: 7.62 };
    const world = surfaceLocalToWorld(surface, local);
    const firstRoundTrip = worldToSurfaceLocal(surface, world);
    const secondRoundTrip = invertTransform(applyTransform(local, surface.transform), surface.transform);
    assertClose(firstRoundTrip.x, local.x);
    assertClose(firstRoundTrip.y, local.y);
    assertClose(secondRoundTrip.x, local.x);
    assertClose(secondRoundTrip.y, local.y);
});

test('generic DIP generator produces canonical centered 300-mil DIP8 geometry and counter-clockwise numbering', () => {
    const footprint = createDipFootprint({ pinCount: 8, pitch: 2.54, rowSpacing: 7.62 });
    const byPin = Object.fromEntries(footprint.pins.map(pin => [pin.pinId, pin]));
    assert.deepEqual({ x: byPin['1'].x, y: byPin['1'].y }, { x: -3.81, y: -3.81 });
    assert.deepEqual({ x: byPin['4'].x, y: byPin['4'].y }, { x: -3.81, y: 3.81 });
    assert.deepEqual({ x: byPin['5'].x, y: byPin['5'].y }, { x: 3.81, y: 3.81 });
    assert.deepEqual({ x: byPin['8'].x, y: byPin['8'].y }, { x: 3.81, y: -3.81 });
    assertClose(Math.hypot(byPin['2'].x - byPin['1'].x, byPin['2'].y - byPin['1'].y), 2.54);
    assertClose(Math.hypot(byPin['8'].x - byPin['1'].x, byPin['8'].y - byPin['1'].y), 7.62);
    assert.deepEqual([
        [byPin['1'].pinId, byPin['8'].pinId],
        [byPin['2'].pinId, byPin['7'].pinId],
        [byPin['3'].pinId, byPin['6'].pinId],
        [byPin['4'].pinId, byPin['5'].pinId],
    ], [['1', '8'], ['2', '7'], ['3', '6'], ['4', '5']]);
});

test('DIP8 snaps all pins to E12-E15 and F12-F15 across the center trench', () => {
    const project = projectWithBoard();
    const component = freePart('chip', 'test-ic');
    project.components.push(component);
    const board = project.surfaces[0];
    const pointerWorld = holeWorldPosition(board, 'E12');
    const candidate = new BreadboardSnapSolver().solve({ project, component, pointerWorld, surfaceId: board.id });
    assert.ok(candidate);
    assert.deepEqual(candidate.bindings, {
        '1': 'E12', '2': 'E13', '3': 'E14', '4': 'E15',
        '5': 'F15', '6': 'F14', '7': 'F13', '8': 'F12',
    });
});

test('DIP8 rejects impossible edges and occupied holes', () => {
    const project = projectWithBoard();
    const first = freePart('chip-1', 'test-ic');
    const second = freePart('chip-2', 'test-ic');
    project.components.push(first, second);
    const board = project.surfaces[0];
    const solver = new BreadboardSnapSolver({ acquisitionRadius: 1 });
    assert.equal(solver.solve({ project, component: first, pointerWorld: holeWorldPosition(board, 'E29'), surfaceId: board.id }), null);

    first.placement = {
        type: 'surface', surfaceId: board.id, rotation: 0,
        bindings: { '1': 'E12', '2': 'E13', '3': 'E14', '4': 'E15', '8': 'F12', '7': 'F13', '6': 'F14', '5': 'F15' },
    };
    assert.equal(buildOccupancyMap(project).size, 8);
    assert.equal(solver.solve({ project, component: second, pointerWorld: holeWorldPosition(board, 'E12'), surfaceId: board.id }), null);
});

test('DIP8 180-degree rotation preserves package numbering and real-hole bindings', () => {
    const project = projectWithBoard();
    const component = freePart('chip', 'test-ic');
    project.components.push(component);
    const board = project.surfaces[0];
    const candidate = new BreadboardSnapSolver().solve({
        project, component, pointerWorld: holeWorldPosition(board, 'F15'), surfaceId: board.id, preferredRotation: 180,
    });
    assert.ok(candidate);
    assert.equal(candidate.rotation, 180);
    assert.deepEqual(candidate.bindings, {
        '1': 'F15', '2': 'F14', '3': 'F13', '4': 'F12',
        '5': 'E12', '6': 'E13', '7': 'E14', '8': 'E15',
    });
    assert.equal(new BreadboardSnapSolver().validateCandidate(project, component, candidate), true);
});

test('DIP8 uses the generic package and snap solver with no DIP-specific drag-placement branch', () => {
    const interactionSource = readFileSync(new URL('../src/editor/interaction-controller.js', import.meta.url), 'utf8');
    const canvasSource = readFileSync(new URL('../src/components/circuit-canvas.js', import.meta.url), 'utf8');
    assert.doesNotMatch(interactionSource, /dip8|test-ic/i);
    assert.doesNotMatch(canvasSource, /definitionId\s*===\s*['"](?:dip8|test-ic)['"]/i);
    assert.equal(defaultFootprintForComponent('test-ic').id, 'dip8-300mil');
});

test('generic component hit boundaries are invisible and do not duplicate real artwork', () => {
    const canvasSource = readFileSync(new URL('../src/components/circuit-canvas.js', import.meta.url), 'utf8');
    const start = canvasSource.indexOf('\n    _drawGenericComponent(');
    const method = canvasSource.slice(start, canvasSource.indexOf('\n    _drawComponentPins(', start));
    assert.match(method, /strokeEnabled:\s*false/);
    assert.match(method, /_artworkPlacement\(component, footprint, sourceWidth, sourceHeight\)/);
    assert.match(method, /width:\s*right\s*-\s*left,\s*height:\s*bottom\s*-\s*top/);
    assert.doesNotMatch(method, /footprint\.routingBounds\s*\|\|/);
    assert.doesNotMatch(method, /ARDUINO UNO|new Konva\.Text|#087ea4|#27272a/);
});

test('free-space dragging does not render a red invalid-placement marker', () => {
    const canvasSource = readFileSync(new URL('../src/components/circuit-canvas.js', import.meta.url), 'utf8');
    assert.doesNotMatch(canvasSource, /#fb7185|state\.pointerWorld\.x|>invalid</);
});

test('LED uses the generic solver, claims two holes, and does not short itself on one strip', () => {
    const project = projectWithBoard();
    const led = freePart('led-1', 'led');
    project.components.push(led);
    const board = project.surfaces[0];
    const candidate = new BreadboardSnapSolver().solve({ project, component: led, pointerWorld: holeWorldPosition(board, 'C20'), surfaceId: board.id });
    assert.ok(candidate);
    assert.equal(candidate.bindings.C, 'C20');
    assert.equal(candidate.bindings.A, 'C21');
    assert.notEqual(board && HALF_BREADBOARD_DEFINITION.getHole(candidate.bindings.C).electricalGroup,
        HALF_BREADBOARD_DEFINITION.getHole(candidate.bindings.A).electricalGroup);
});

test('mounted component position derives from bindings and follows a moved breadboard', () => {
    const project = projectWithBoard();
    const chip = freePart('chip', 'test-ic');
    chip.placement = {
        type: 'surface', surfaceId: 'breadboard-1', rotation: 0,
        bindings: { '1': 'E12', '2': 'E13', '3': 'E14', '4': 'E15', '8': 'F12', '7': 'F13', '6': 'F14', '5': 'F15' },
    };
    project.components.push(chip);
    const beforeBindings = structuredClone(chip.placement.bindings);
    const before = mountedComponentTransform(project, chip);
    project.surfaces[0].transform.x += 18;
    project.surfaces[0].transform.y -= 7;
    const after = mountedComponentTransform(project, chip);
    assertClose(after.x - before.x, 18);
    assertClose(after.y - before.y, -7);
    assert.deepEqual(chip.placement.bindings, beforeBindings);
});

test('topology resolves mounted pins and wires into one semantic electrical net', () => {
    const project = projectWithBoard();
    const led = freePart('led-1', 'led');
    led.placement = {
        type: 'surface', surfaceId: 'breadboard-1', rotation: 0,
        bindings: { C: 'A17', A: 'A18' },
    };
    project.components.push(led);
    project.wires.push({
        id: 'wire-1',
        from: componentPinRef('led-1', 'C'),
        to: surfaceHoleRef('breadboard-1', 'J24'),
        route: { mode: 'auto', waypoints: [] },
    });
    const resolver = new ConnectivityResolver(project);
    assert.deepEqual(resolver.resolveElectricalGroup('led-1', 'C'), {
        surfaceId: 'breadboard-1', holeId: 'A17', electricalGroup: 'upper-strip-17',
    });
    assert.equal(resolver.areConnected(componentPinRef('led-1', 'C'), surfaceHoleRef('breadboard-1', 'E17')), true);
    assert.equal(resolver.areConnected(componentPinRef('led-1', 'C'), surfaceHoleRef('breadboard-1', 'J24')), true);
    assert.equal(resolver.areConnected(componentPinRef('led-1', 'A'), surfaceHoleRef('breadboard-1', 'J24')), false);
});

test('group highlighting comes from topology rather than renderer hit objects', () => {
    const project = projectWithBoard();
    assert.deepEqual(holesInElectricalGroup(project.surfaces[0], 'C17'), ['A17', 'B17', 'C17', 'D17', 'E17']);
});

test('routing connects resolved semantic endpoints and recomputes after surface movement', () => {
    const project = projectWithBoard();
    const led = freePart('led-1', 'led');
    led.placement = { type: 'surface', surfaceId: 'breadboard-1', rotation: 0, bindings: { C: 'A10', A: 'A11' } };
    project.components.push(led);
    const wire = {
        id: 'wire-1',
        from: componentPinRef('led-1', 'A'),
        to: surfaceHoleRef('breadboard-1', 'TP1'),
        route: { mode: 'auto', waypoints: [] },
    };
    project.wires.push(wire);
    const first = routeWire(project, wire);
    assert.deepEqual(first[0], resolveConnectionWorldPoint(project, wire.from));
    assert.deepEqual(first.at(-1), resolveConnectionWorldPoint(project, wire.to));
    project.surfaces[0].transform.x += 25;
    const second = routeAllWires(project).get(wire.id);
    assertClose(second[0].x - first[0].x, 25);
    assertClose(second.at(-1).x - first.at(-1).x, 25);
    assert.deepEqual(wire.from, componentPinRef('led-1', 'A'));
    assert.deepEqual(wire.to, surfaceHoleRef('breadboard-1', 'TP1'));
});

test('route scoring penalizes bends and obstacles independently of connectivity', () => {
    const straight = scoreRoute([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    const bent = scoreRoute([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 5 }]);
    const blocked = scoreRoute([{ x: 0, y: 0 }, { x: 10, y: 0 }], {
        obstacles: [{ left: 4, right: 6, top: -1, bottom: 1 }],
    });
    assert.ok(bent.score > straight.score);
    assert.ok(blocked.score > bent.score);
});

test('library components receive explicit free-space footprints and semantic terminals', () => {
    const footprint = defaultFootprintForComponent('arduino-uno');
    assert.ok(footprint);
    assert.equal(footprint.placementMode, 'free');
    assert.ok(footprint.pins.some(pin => pin.pinId === '13'));
    assert.ok(footprint.pins.some(pin => pin.pinId === '5V'));
    const arduino = createComponentInstance({
        id: 'uno-1', definitionId: 'arduino-uno', footprintId: footprint.id, x: 120, y: 30,
    });
    const project = createPhysicalProject({ components: [arduino] });
    assert.ok(resolveConnectionWorldPoint(project, componentPinRef('uno-1', '13')));
});

test('render-calibrated free-space pins replace guessed perimeter terminals', () => {
    const footprint = defaultFootprintForComponent('arduino-uno');
    assert.equal(calibrateFreeComponentFootprint('arduino-uno', [
        { pinId: '13', x: 44.2, y: 2.1 },
        { pinId: 'GND.1', x: 12.4, y: 37.8 },
    ]), true);
    const calibrated = defaultFootprintForComponent('arduino-uno');
    assert.deepEqual(calibrated.pins.map(pin => ({ pinId: pin.pinId, x: pin.x, y: pin.y })), [
        { pinId: '13', x: 44.2, y: 2.1 },
        { pinId: 'GND.1', x: 12.4, y: 37.8 },
    ]);
    assert.equal(footprint.id, calibrated.id);
});

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
import { calibrateFreeComponentFootprint, createDipFootprint, defaultFootprintForComponent, footprintsForComponent, getFootprintDefinition } from '../src/physical/footprints.js';
import { BreadboardSnapSolver, buildBreadboardHoleStates, buildOccupancyMap, HOLE_OCCUPANCY } from '../src/physical/placement.js';
import {
    componentPinRef,
    createComponentInstance,
    createPhysicalProject,
    mountedComponentTransform,
    resolveConnectionWorldPoint,
    surfaceHoleRef,
} from '../src/physical/model.js';
import { ConnectivityResolver } from '../src/physical/connectivity.js';
import { routeAllWires, routeSegments, routeWire, scoreRoute, surfaceRoutingObstacles } from '../src/physical/routing.js';
import { realizeAutoWireConnections } from '../src/physical/breadboard-auto-wire.js';
import { validatePhysicalProject } from '../src/physical/validation.js';

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

test('every socket exposes stable topology and exclusive dynamic occupancy', () => {
    const project = projectWithBoard();
    const led = freePart('led-state', 'led');
    led.placement = { type: 'surface', surfaceId: 'breadboard-1', rotation: 0, bindings: { C: 'A10', A: 'A11' } };
    project.components.push(led);
    project.wires.push({ id: 'wire-state', from: surfaceHoleRef('breadboard-1', 'B12'),
        to: componentPinRef('led-state', 'A'), route: { mode: 'auto', waypoints: [] } });
    const states = buildBreadboardHoleStates(project);
    assert.equal(states.size, 400);
    assert.deepEqual(states.get('breadboard-1:A10').position,
        { x: HALF_BREADBOARD_DEFINITION.getHole('A10').x, y: HALF_BREADBOARD_DEFINITION.getHole('A10').y });
    assert.equal(states.get('breadboard-1:A10').electricalGroup, 'upper-strip-10');
    assert.equal(states.get('breadboard-1:A10').state, HOLE_OCCUPANCY.COMPONENT_PIN);
    assert.equal(states.get('breadboard-1:B12').state, HOLE_OCCUPANCY.WIRE_ENDPOINT);
    assert.equal(states.get('breadboard-1:C20').state, HOLE_OCCUPANCY.FREE);
});

test('wire endpoints reserve sockets against later component snapping', () => {
    const project = projectWithBoard();
    const led = freePart('led-reserved', 'led');
    project.components.push(led);
    project.wires.push({ id: 'reserved', from: surfaceHoleRef('breadboard-1', 'C20'),
        to: surfaceHoleRef('breadboard-1', 'C22'), route: { mode: 'auto', waypoints: [] } });
    const candidate = new BreadboardSnapSolver().solve({ project, component: led,
        pointerWorld: holeWorldPosition(project.surfaces[0], 'C20'), surfaceId: 'breadboard-1' });
    assert.ok(candidate);
    assert.ok(!Object.values(candidate.bindings).includes('C20'));
    assert.ok(!Object.values(candidate.bindings).includes('C22'));
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
    assert.match(method, /const calibratedBounds = footprint\.placementMode === 'free' && footprint\.artworkPlacement/);
    assert.match(method, /\? footprint\.routingBounds/);
    assert.doesNotMatch(method, /footprint\.routingBounds\s*\|\|/);
    assert.doesNotMatch(method, /ARDUINO UNO|new Konva\.Text|#087ea4|#27272a/);
    assert.doesNotMatch(canvasSource, /_drawLed\s*\(|definitionId\s*===\s*['"]led['"]\)\s*this\._drawLed/);
});

test('component terminals remain visible while the DOM marker is correctly centered', () => {
    const canvasSource = readFileSync(new URL('../src/components/circuit-canvas.js', import.meta.url), 'utf8');
    const styleStart = canvasSource.indexOf('\n        .visual-terminal {');
    const terminalStyle = canvasSource.slice(styleStart, canvasSource.indexOf('\n        }', styleStart));
    const artworkStyleStart = canvasSource.indexOf('\n        .component-artwork {');
    const artworkStyle = canvasSource.slice(artworkStyleStart, canvasSource.indexOf('\n        }', artworkStyleStart));
    const methodStart = canvasSource.indexOf('\n    _drawComponentPins(');
    const pinMethod = canvasSource.slice(methodStart, canvasSource.indexOf('\n    _setVisualTerminalHover(', methodStart));
    assert.match(terminalStyle, /box-sizing:\s*border-box/);
    assert.match(artworkStyle, /display:\s*flex/);
    assert.doesNotMatch(artworkStyle, /display:\s*block/);
    assert.match(pinMethod, /fill:\s*this\._themeColor\(['"]--text['"]\)/);
    assert.match(pinMethod, /stroke:\s*this\._themeColor\(['"]--primary-hover['"]\)/);
    assert.match(pinMethod, /opacity:\s*\.94/);
});

test('selected built-in components can open the pin-alignment editor', () => {
    const canvasSource = readFileSync(new URL('../src/components/circuit-canvas.js', import.meta.url), 'utf8');
    const builderSource = readFileSync(new URL('../src/components/component-builder-modal.js', import.meta.url), 'utf8');
    const appSource = readFileSync(new URL('../src/circuit-app.js', import.meta.url), 'utf8');
    assert.match(canvasSource, /Edit pins/);
    assert.match(canvasSource, /edit-component-definition/);
    assert.match(builderSource, /registerComponentVisualOverride/);
    assert.match(builderSource, /Reset alignment/);
    assert.match(builderSource, /electrical pin names, roles, breadboard spacing, and validation rules stay unchanged/);
    assert.match(appSource, /\.componentId=\$\{this\._builderComponentId\}/);
});

test('custom artwork calibration excludes transparent padding but keeps external pins in its bounds', () => {
    const canvasSource = readFileSync(new URL('../src/components/circuit-canvas.js', import.meta.url), 'utf8');
    const builderSource = readFileSync(new URL('../src/components/component-builder-modal.js', import.meta.url), 'utf8');
    const previewSource = readFileSync(new URL('../src/components/part-preview.js', import.meta.url), 'utf8');
    assert.match(canvasSource, /measureImageContent\(definition\.imageUrl\)/);
    assert.match(canvasSource, /occupiedSourceBounds/);
    assert.match(builderSource, /metrics\.contentBounds/);
    assert.match(builderSource, /_previewBounds\(\)/);
    assert.match(builderSource, /component\?\.customPins/);
    assert.match(builderSource, /current\?\.type === ['"]custom['"]/);
    assert.match(builderSource, /registerCustomComponent\(\{/);
    assert.match(previewSource, /normalizeContentBounds\(component\.contentBounds/);
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

test('resistor package variants keep a compact body while supporting variable spans and upright mounting', () => {
    const variants = footprintsForComponent('resistor');
    assert.ok(variants.some(item => item.id === 'axial-3'));
    assert.ok(variants.some(item => item.id === 'axial-8'));
    assert.ok(variants.some(item => item.id === 'resistor-upright' && item.visualVariant === 'upright'));
    const original = defaultFootprintForComponent('resistor');
    const compact = variants.find(item => item.id === 'axial-4');
    assert.equal(original.id, 'resistor-wokwi-original');
    assert.equal(original.placementMode, 'free');
    assert.equal(original.leadSpan - compact.leadSpan, 2,
        'five-hole compact placement removes one pitch interval from each side of the seven-hole original');
    assert.equal(compact.visualVariant, 'compact');
    const widths = variants.filter(item => item.visualVariant === 'compact').map(item => item.routingBounds.width);
    assert.equal(new Set(widths.map(value => value.toFixed(3))).size, 1, 'lead span must not scale the resistor body');
});

test('breadboard resistor visuals are SVG variants while free placement keeps Wokwi unchanged', () => {
    const canvasSource = readFileSync(new URL('../src/components/circuit-canvas.js', import.meta.url), 'utf8');
    const resistorVisualSource = readFileSync(new URL('../src/components/resistor-variant-elements.js', import.meta.url), 'utf8');
    const compactAsset = readFileSync(new URL('../src/assets/resistor-compact.svg', import.meta.url), 'utf8');
    assert.match(canvasSource, /getResistorPackageVisual\(footprint\)/);
    assert.doesNotMatch(canvasSource, /_drawResistorPackage\s*\(/);
    assert.match(resistorVisualSource, /COMPACT_DEFAULT_SPAN_MM = 4 \* BREADBOARD_PITCH_MM/);
    assert.match(resistorVisualSource, /bodyOffset = \(leadSpanMm - COMPACT_DEFAULT_SPAN_MM\) \/ 2/);
    assert.match(canvasSource, /artwork\.leadSpanMm = packageVisual\.sourceSize\.width/);
    assert.match(canvasSource, /sourceWidth = Math\.max\(1, Number\(packageVisual\?\.sourceSize\.width/,
        'the invisible interaction box must use the compact or upright artwork size');
    assert.match(resistorVisualSource, /resistor-compact\.svg/,
        'the compact resistor must use an editable SVG asset rather than code-authored body geometry');
    assert.match(compactAsset, /width="10\.16mm"/);
    assert.match(compactAsset, /M0 1\.5H2\.54/);
    assert.match(compactAsset, /M7\.62 1\.5h2\.54/,
        'the standalone asset needs equal one-pitch leads on both sides');
    assert.match(resistorVisualSource, /elera-compact-resistor/);
    assert.match(resistorVisualSource, /elera-upright-resistor/);
});

test('breadboard realization suppresses same-strip jumpers and allocates a free hole for mixed wiring', () => {
    const project = projectWithBoard();
    const first = freePart('first-led', 'led');
    const second = freePart('second-led', 'led');
    const external = freePart('external-sensor', 'dht22', 140, 20);
    first.placement = { type: 'surface', surfaceId: 'breadboard-1', rotation: 0, bindings: { C: 'A10', A: 'A11' } };
    second.placement = { type: 'surface', surfaceId: 'breadboard-1', rotation: 0, bindings: { C: 'B10', A: 'B12' } };
    project.components.push(first, second, external);
    const sameStrip = realizeAutoWireConnections(project, [{ id: 'intent-same',
        from: { componentId: first.id, pinId: 'C' }, to: { componentId: second.id, pinId: 'C' }, generated: true }], () => '#fff');
    assert.equal(sameStrip.status, 'success');
    assert.equal(sameStrip.wires.length, 0);

    const mixed = realizeAutoWireConnections(project, [{ id: 'intent-mixed',
        from: { componentId: first.id, pinId: 'C' }, to: { componentId: external.id, pinId: 'SDA' }, generated: true }], () => '#fff');
    assert.equal(mixed.status, 'success');
    assert.equal(mixed.wires.length, 1);
    const holeRef = [mixed.wires[0].from, mixed.wires[0].to].find(ref => ref.type === 'surface-hole');
    assert.ok(holeRef);
    assert.equal(HALF_BREADBOARD_DEFINITION.getHole(holeRef.holeId).electricalGroup, 'upper-strip-10');
    assert.notEqual(holeRef.holeId, 'A10');
    assert.notEqual(holeRef.holeId, 'B10');
});

test('physical validation reports socket conflicts, incomplete intent, net collisions and redundant jumpers', () => {
    const project = projectWithBoard();
    const first = freePart('validation-led', 'led');
    const external = freePart('validation-sensor', 'dht22', 140, 20);
    first.placement = { type: 'surface', surfaceId: 'breadboard-1', rotation: 0, bindings: { C: 'A10', A: 'A11' } };
    project.components.push(first, external);
    project.wires.push(
        { id: 'occupied-wire', from: surfaceHoleRef('breadboard-1', 'A10'), to: componentPinRef(external.id, 'SDA'), properties: {}, route: { mode: 'auto', waypoints: [] } },
        { id: 'redundant', from: surfaceHoleRef('breadboard-1', 'A12'), to: surfaceHoleRef('breadboard-1', 'B12'), properties: { generated: true }, route: { mode: 'auto', waypoints: [] } },
    );
    project.properties.netlistIntent = [
        { from: componentPinRef(first.id, 'C'), to: componentPinRef(external.id, 'SDA') },
        { from: componentPinRef(first.id, 'A'), to: componentPinRef(external.id, 'GND') },
    ];
    // Force two different intended nets onto one fixed strip.
    first.placement.bindings.A = 'B10';
    const ids = validatePhysicalProject(project).all.map(item => item.id);
    assert.ok(ids.includes('occupied:breadboard-1:A10'));
    assert.ok(ids.some(id => id.startsWith('incomplete-net:')));
    assert.ok(ids.includes('breadboard-net-conflict:breadboard-1:upper-strip-10'));
    assert.ok(ids.includes('redundant-wire:redundant'));
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

test('automatic direct wiring treats an unrelated breadboard body as a routing keepout', () => {
    const surface = createHalfBreadboardSurface({ x: 60, y: 20 });
    const left = freePart('left-off-board', 'dht22', 0, 38);
    const right = freePart('right-off-board', 'dht22', 170, 38);
    const wire = {
        id: 'direct-around-board',
        from: componentPinRef(left.id, 'SDA'),
        to: componentPinRef(right.id, 'SDA'),
        route: { mode: 'auto', waypoints: [] },
    };
    const project = createPhysicalProject({ surfaces: [surface], components: [left, right], wires: [wire] });
    const board = surfaceRoutingObstacles(project, { margin: 0 })[0];
    const route = routeWire(project, wire);
    const crossesBoard = routeSegments(route).some(segment => {
        if (Math.abs(segment.a.x - segment.b.x) < 1e-6) {
            return segment.a.x > board.left && segment.a.x < board.right &&
                Math.max(segment.a.y, segment.b.y) > board.top && Math.min(segment.a.y, segment.b.y) < board.bottom;
        }
        return segment.a.y > board.top && segment.a.y < board.bottom &&
            Math.max(segment.a.x, segment.b.x) > board.left && Math.min(segment.a.x, segment.b.x) < board.right;
    });
    assert.equal(crossesBoard, false);
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

test('legacy free footprint IDs resolve to current calibrated packages without breaking saved wire endpoints', () => {
    assert.equal(getFootprintDefinition('free:dht22')?.id, 'dht22-linear-4');
    assert.equal(getFootprintDefinition('free:ir-receiver')?.id, 'ir-linear-3');

    const sensor = createComponentInstance({
        id: 'sensor-1', definitionId: 'dht22', footprintId: 'free:dht22', x: 20, y: 30,
    });
    const project = createPhysicalProject({ components: [sensor] });
    assert.ok(resolveConnectionWorldPoint(project, componentPinRef(sensor.id, 'VCC')));
    assert.ok(resolveConnectionWorldPoint(project, componentPinRef(sensor.id, 'SDA')));
    assert.ok(resolveConnectionWorldPoint(project, componentPinRef(sensor.id, 'GND')));
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

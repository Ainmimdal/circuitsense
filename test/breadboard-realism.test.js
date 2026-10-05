import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createFullBreadboardSurface,
    createHalfBreadboardSurface,
    FULL_BREADBOARD_DEFINITION,
    HALF_BREADBOARD_DEFINITION,
} from '../src/physical/breadboard.js';
import { breadboardArtwork } from '../src/core/breadboard-artwork.js';
import { boardRegistry } from '../src/core/board-registry.js';
import { BREADBOARD_PITCH_MM } from '../src/physical/geometry.js';
import { ConnectivityResolver } from '../src/physical/connectivity.js';
import { PhysicalCircuitStore } from '../src/physical/circuit-store.js';
import { addWireCommand, mountComponentCommand, moveSelectionCommand } from '../src/physical/commands.js';
import {
    componentPinRef, createComponentInstance, createPhysicalProject, surfaceHoleRef,
} from '../src/physical/model.js';
import { defaultFootprintForComponent } from '../src/physical/footprints.js';
import { validatePhysicalProject } from '../src/physical/validation.js';

const BOARDS = [HALF_BREADBOARD_DEFINITION, FULL_BREADBOARD_DEFINITION];

function close(a, b, epsilon = 1e-6) {
    return Math.abs(a - b) <= epsilon;
}

function railRun(definition, prefix) {
    return definition.holes.filter(hole => hole.rail === prefix).sort((a, b) => a.x - b.x);
}

function part(id, definitionId, x = 0, y = 0) {
    return createComponentInstance({ id, definitionId, footprintId: defaultFootprintForComponent(definitionId).id, x, y });
}

function boardProject({ surface = createHalfBreadboardSurface(), components = [] } = {}) {
    const store = new PhysicalCircuitStore({ load: false, routingWorker: null });
    store.importProject(createPhysicalProject({ surfaces: [surface], components }));
    return { store, surface };
}

test('breadboards keep their tie-point counts and stable hole names', () => {
    assert.equal(HALF_BREADBOARD_DEFINITION.holes.length, 400);
    assert.equal(FULL_BREADBOARD_DEFINITION.holes.length, 830);
    for (const definition of BOARDS) {
        const ids = definition.holes.map(hole => hole.id);
        assert.equal(new Set(ids).size, ids.length, definition.id);
        const railsPerRow = definition === HALF_BREADBOARD_DEFINITION ? 25 : 50;
        for (const prefix of ['TN', 'TP', 'BP', 'BN']) {
            assert.equal(railRun(definition, prefix).length, railsPerRow);
            assert.ok(definition.getHole(`${prefix}${railsPerRow}`));
        }
    }
});

test('power rail holes come in clusters of five separated by one-pitch gaps', () => {
    for (const definition of BOARDS) {
        for (const prefix of ['TN', 'TP', 'BP', 'BN']) {
            const run = railRun(definition, prefix);
            for (let index = 1; index < run.length; index++) {
                const gap = (run[index].x - run[index - 1].x) / BREADBOARD_PITCH_MM;
                const clusterBoundary = index % 5 === 0;
                const splitBoundary = definition.splitRails && index === run.length / 2;
                const expected = splitBoundary ? 4 : clusterBoundary ? 2 : 1;
                assert.ok(close(gap, expected), `${definition.id} ${run[index - 1].id}->${run[index].id} gap ${gap}`);
            }
            // Rails are centred on the terminal field like a real board.
            const first = definition.getHole('A1').x;
            const last = definition.getHole(`A${definition.columns}`).x;
            assert.ok(close(run[0].x - first, last - run.at(-1).x), `${definition.id} ${prefix} is centred`);
        }
    }
});

test('terminal strips and rails resolve to the electrical groups of a real breadboard', () => {
    for (const definition of BOARDS) {
        const surface = { id: 'bb', type: 'breadboard', definitionId: definition.id, transform: { x: 0, y: 0, rotation: 0 } };
        const graph = new ConnectivityResolver(createPhysicalProject({ surfaces: [surface] }));
        const hole = id => surfaceHoleRef('bb', id);
        const last = definition.columns;
        assert.equal(graph.areConnected(hole('A1'), hole('E1')), true, 'A-E share a strip');
        assert.equal(graph.areConnected(hole('F1'), hole('J1')), true, 'F-J share a strip');
        assert.equal(graph.areConnected(hole('E1'), hole('F1')), false, 'the centre channel isolates the halves');
        assert.equal(graph.areConnected(hole('A1'), hole('A2')), false, 'neighbouring strips are isolated');
        assert.equal(graph.areConnected(hole(`A${last}`), hole(`J${last}`)), false);
        assert.equal(graph.areConnected(hole('TP1'), hole('TN1')), false, '+ and - rails are isolated');
        assert.equal(graph.areConnected(hole('TP1'), hole('BP1')), false, 'top and bottom rails are isolated');
        assert.equal(graph.areConnected(hole('A1'), hole('TP1')), false, 'rails are isolated from strips');
    }

    const half = new ConnectivityResolver(createPhysicalProject({ surfaces: [createHalfBreadboardSurface({ id: 'bb' })] }));
    assert.equal(half.areConnected(surfaceHoleRef('bb', 'TP1'), surfaceHoleRef('bb', 'TP25')), true);

    const full = new ConnectivityResolver(createPhysicalProject({ surfaces: [createFullBreadboardSurface({ id: 'bb' })] }));
    assert.equal(full.areConnected(surfaceHoleRef('bb', 'TP1'), surfaceHoleRef('bb', 'TP25')), true);
    assert.equal(full.areConnected(surfaceHoleRef('bb', 'TP26'), surfaceHoleRef('bb', 'TP50')), true);
    assert.equal(full.areConnected(surfaceHoleRef('bb', 'TP25'), surfaceHoleRef('bb', 'TP26')), false,
        'full-size rails are split in the middle');
});

test('printed rail stripes sit beside the holes and break where the rail is split', () => {
    for (const definition of BOARDS) {
        const art = breadboardArtwork(definition);
        const expectedSegments = definition.splitRails ? 2 : 1;
        for (const prefix of ['TN', 'TP', 'BP', 'BN']) {
            assert.equal(art.railStripes.filter(stripe => stripe.rail === prefix).length, expectedSegments);
        }
        for (const stripe of art.railStripes) {
            for (const hole of definition.holes) {
                const overlapsX = hole.x >= stripe.x1 && hole.x <= stripe.x2;
                assert.ok(!overlapsX || Math.abs(hole.y - stripe.y) > art.holeSize, `${stripe.rail} stripe crosses ${hole.id}`);
            }
            assert.ok(stripe.y > 0 && stripe.y < definition.height);
            const run = railRun(definition, stripe.rail).filter(hole => hole.electricalGroup === stripe.electricalGroup);
            assert.ok(stripe.x1 < run[0].x && stripe.x2 > run.at(-1).x, 'stripe spans its whole segment');
        }
        const polarityColors = new Set(art.railStripes.map(stripe => `${stripe.polarity}:${stripe.color}`));
        assert.equal(polarityColors.size, 2, 'one colour per polarity');
    }
});

test('row and column labels cover the whole board on both sides', () => {
    for (const definition of BOARDS) {
        const art = breadboardArtwork(definition);
        for (const row of definition.rows) {
            assert.equal(art.labels.filter(label => label.text === row).length, 2, `${definition.id} row ${row}`);
        }
        const columns = art.labels.filter(label => /^\d+$/.test(label.text)).map(label => Number(label.text));
        assert.ok(columns.includes(1));
        assert.ok(columns.includes(definition.columns), `${definition.id} labels its last column`);
        for (const label of art.labels) {
            assert.ok(label.x > 0 && label.x < definition.width && label.y > 0 && label.y < definition.height,
                `${definition.id} label ${label.text} is on the board`);
        }
    }
});

test('dropping a wired part onto the board moves its wire into a free hole of the same strip', () => {
    const uno = part('uno', 'arduino-uno', 140, 10);
    const led = part('led', 'led', 100, 80);
    const { store, surface } = boardProject({ components: [uno, led] });
    store.execute(addWireCommand({
        id: 'signal', from: componentPinRef('uno', '13'), to: componentPinRef('led', 'A'),
        route: { mode: 'auto', waypoints: [] },
    }));

    store.execute(mountComponentCommand('led', { surfaceId: surface.id, rotation: 0, bindings: { C: 'C10', A: 'C11' } }));

    const wire = store.project.wires.find(item => item.id === 'signal');
    assert.equal(wire.from.componentId, 'uno');
    assert.equal(wire.to.type, 'surface-hole');
    assert.notEqual(wire.to.holeId, 'C11', 'the lead keeps its own socket');
    assert.equal(surface.id, wire.to.surfaceId);
    assert.equal(HALF_BREADBOARD_DEFINITION.getHole(wire.to.holeId).electricalGroup,
        HALF_BREADBOARD_DEFINITION.getHole('C11').electricalGroup);
    assert.ok(new ConnectivityResolver(store.project).areConnected(componentPinRef('uno', '13'), componentPinRef('led', 'A')));
    assert.deepEqual(validatePhysicalProject(store.project).errors, []);

    assert.equal(store.undo(), true);
    assert.deepEqual(store.project.wires[0].to, componentPinRef('led', 'A'));
});

test('moving a selection of plugged-in parts keeps them plugged in and carries selected jumpers', () => {
    const led = part('led', 'led');
    led.placement = { type: 'surface', surfaceId: 'breadboard-1', rotation: 0, bindings: { C: 'C10', A: 'C11' } };
    const { store, surface } = boardProject({ components: [led] });
    store.execute(addWireCommand({
        id: 'jumper', from: surfaceHoleRef(surface.id, 'A11'), to: surfaceHoleRef(surface.id, 'TP3'),
        route: { mode: 'auto', waypoints: [] },
    }));
    const routes = Object.fromEntries([...store.routes].map(([id, points]) => [id, structuredClone(points)]));

    // Slightly off-grid drag of three columns to the right.
    store.execute(moveSelectionCommand({
        componentIds: ['led'], wireIds: ['jumper'], delta: { x: 3 * BREADBOARD_PITCH_MM + .4, y: -.3 }, routes,
    }));

    const moved = store.project.components.find(item => item.id === 'led');
    assert.equal(moved.placement.type, 'surface');
    assert.deepEqual(moved.placement.bindings, { C: 'C13', A: 'C14' });
    const jumper = store.project.wires.find(item => item.id === 'jumper');
    assert.equal(jumper.from.holeId, 'A14');
    const graph = new ConnectivityResolver(store.project);
    assert.ok(graph.areConnected(componentPinRef('led', 'A'), surfaceHoleRef(surface.id, 'TP1')),
        'the LED anode still reaches the rail through the moved jumper');
    assert.deepEqual(validatePhysicalProject(store.project).errors, []);

    assert.equal(store.undo(), true);
    assert.deepEqual(store.project.components[0].placement.bindings, { C: 'C10', A: 'C11' });
});

test('a selection dragged off the board detaches instead of landing on illegal holes', () => {
    const led = part('led', 'led');
    led.placement = { type: 'surface', surfaceId: 'breadboard-1', rotation: 0, bindings: { C: 'C10', A: 'C11' } };
    const { store } = boardProject({ components: [led] });
    store.execute(moveSelectionCommand({ componentIds: ['led'], delta: { x: 0, y: 120 }, routes: {} }));
    assert.equal(store.project.components[0].placement.type, 'free');
});

test('legacy pixel registry keeps its original contiguous rail columns', () => {
    const half = boardRegistry['breadboard-half-400'];
    assert.equal(half.getHole('TP1').x, half.getHole('A3').x);
    assert.equal(half.getHole('TP25').x, half.getHole('A27').x);
    const full = boardRegistry['breadboard-full-830'];
    assert.equal(full.getHole('TP26').x, full.getHole('A39').x);
});

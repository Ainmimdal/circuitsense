import test from 'node:test';
import assert from 'node:assert/strict';

import { PhysicalCircuitStore } from '../src/physical/circuit-store.js';
import { InteractionController } from '../src/editor/interaction-controller.js';
import { BreadboardSnapSolver } from '../src/physical/placement.js';
import { holeWorldPosition } from '../src/physical/breadboard.js';
import { addComponentCommand, deleteComponentCommand, deleteSurfaceCommand, moveSurfaceCommand } from '../src/physical/commands.js';
import { createComponentInstance, resolveConnectionWorldPoint } from '../src/physical/model.js';
import { defaultFootprintForComponent } from '../src/physical/footprints.js';

test('command history moves a surface atomically and undo restores mounted geometry', () => {
    const store = new PhysicalCircuitStore({ load: false });
    const board = store.project.surfaces[0];
    const chip = store.project.components.find(item => item.id === 'part-1');
    const pinRef = { type: 'component-pin', componentId: chip.id, pinId: '1' };
    const before = resolveConnectionWorldPoint(store.project, pinRef);
    const bindings = structuredClone(chip.placement.bindings);

    store.execute(moveSurfaceCommand(board.id, { x: board.transform.x + 20, y: board.transform.y - 6 }));
    const after = resolveConnectionWorldPoint(store.project, pinRef);
    assert.ok(Math.abs(after.x - before.x - 20) < 1e-9);
    assert.ok(Math.abs(after.y - before.y + 6) < 1e-9);
    assert.deepEqual(store.project.components.find(item => item.id === chip.id).placement.bindings, bindings);

    assert.equal(store.undo(), true);
    assert.deepEqual(resolveConnectionWorldPoint(store.project, pinRef), before);
    assert.equal(store.redo(), true);
    assert.deepEqual(resolveConnectionWorldPoint(store.project, pinRef), after);
});

test('central interaction controller previews and commits a deterministic rigid placement', () => {
    const store = new PhysicalCircuitStore({ load: false });
    const controller = new InteractionController(store, { solver: new BreadboardSnapSolver({ acquisitionRadius: 1 }) });
    const board = store.project.surfaces[0];
    const chip = store.project.components.find(item => item.id === 'part-1');
    const original = structuredClone(chip.placement);

    assert.equal(controller.beginComponentDrag(chip.id), true);
    const candidate = controller.updateComponentDrag(holeWorldPosition(board, 'E20'));
    assert.ok(candidate);
    assert.equal(candidate.bindings['1'], 'E20');
    assert.equal(candidate.bindings['8'], 'F20');
    assert.deepEqual(store.project.components.find(item => item.id === chip.id).placement, original, 'preview must not mutate project state');
    assert.equal(controller.commitComponentDrag(holeWorldPosition(board, 'E20')), true);
    assert.equal(store.project.components.find(item => item.id === chip.id).placement.bindings['1'], 'E20');
});

test('dragging a mounted part away detaches it into free space', () => {
    const store = new PhysicalCircuitStore({ load: false });
    const controller = new InteractionController(store);
    const chip = store.project.components.find(item => item.id === 'part-1');
    controller.beginComponentDrag(chip.id);
    assert.equal(controller.updateComponentDrag({ x: -100, y: -100 }), null);
    assert.equal(controller.commitComponentDrag({ x: -100, y: -100 }), true);
    assert.deepEqual(store.project.components.find(item => item.id === chip.id).placement, {
        type: 'free', position: { x: -100, y: -100 }, rotation: 0,
    });
});

test('wire route recomputation never changes semantic endpoints', () => {
    const store = new PhysicalCircuitStore({ load: false });
    const wireBefore = structuredClone(store.project.wires[0]);
    const routeBefore = structuredClone(store.routes.get(wireBefore.id));
    store.project.surfaces[0].transform.x += 11;
    store.recomputeRoutes();
    const routeAfter = store.routes.get(wireBefore.id);
    assert.deepEqual(store.project.wires[0].from, wireBefore.from);
    assert.deepEqual(store.project.wires[0].to, wireBefore.to);
    assert.ok(Math.abs(routeAfter[0].x - routeBefore[0].x - 11) < 1e-9);
    assert.ok(Math.abs(routeAfter.at(-1).x - routeBefore.at(-1).x - 11) < 1e-9);
});

test('free-space Arduino components can be added, moved, deleted and undone', () => {
    const store = new PhysicalCircuitStore({ load: false });
    const footprint = defaultFootprintForComponent('arduino-uno');
    const component = createComponentInstance({
        id: 'part-99', definitionId: 'arduino-uno', footprintId: footprint.id, x: 120, y: 20,
    });
    store.execute(addComponentCommand(component));
    const controller = new InteractionController(store);
    assert.equal(controller.beginComponentDrag(component.id), true);
    assert.equal(controller.updateComponentDrag({ x: 170, y: 45 }), null);
    assert.equal(controller.commitComponentDrag({ x: 170, y: 45 }), true);
    assert.deepEqual(store.project.components.find(item => item.id === component.id).placement.position, { x: 170, y: 45 });

    store.project.wires.push({
        id: 'wire-99', from: { type: 'component-pin', componentId: component.id, pinId: '13' },
        to: { type: 'surface-hole', surfaceId: store.project.surfaces[0].id, holeId: 'A1' },
    });
    store.execute(deleteComponentCommand(component.id));
    assert.equal(store.project.components.some(item => item.id === component.id), false);
    assert.equal(store.project.wires.some(item => item.id === 'wire-99'), false);
    assert.equal(store.undo(), true);
    assert.equal(store.project.components.some(item => item.id === component.id), true);
});

test('Clear creates an actually empty workspace instead of restoring seeded demo parts', () => {
    const store = new PhysicalCircuitStore({ load: false });
    assert.ok(store.project.components.length > 0);
    store.clear();
    assert.equal(store.project.components.length, 0);
    assert.equal(store.project.wires.length, 0);
    assert.equal(store.project.surfaces.length, 1);
});

test('deleting a breadboard detaches mounted parts and removes only board-hole wires', () => {
    const store = new PhysicalCircuitStore({ load: false });
    const surfaceId = store.project.surfaces[0].id;
    const chip = store.project.components.find(component => component.placement?.surfaceId === surfaceId);
    const before = resolveConnectionWorldPoint(store.project, {
        type: 'component-pin', componentId: chip.id, pinId: '1',
    });
    store.project.wires.push({
        id: 'surface-wire',
        from: { type: 'surface-hole', surfaceId, holeId: 'A1' },
        to: { type: 'component-pin', componentId: chip.id, pinId: '1' },
    });
    store.execute(deleteSurfaceCommand(surfaceId));
    assert.equal(store.project.surfaces.length, 0);
    const detached = store.project.components.find(component => component.id === chip.id);
    assert.equal(detached.placement.type, 'free');
    const after = resolveConnectionWorldPoint(store.project, {
        type: 'component-pin', componentId: chip.id, pinId: '1',
    });
    assert.ok(Math.abs(after.x - before.x) < 1e-9);
    assert.ok(Math.abs(after.y - before.y) < 1e-9);
    assert.equal(store.project.wires.some(wire => wire.id === 'surface-wire'), false);
    assert.equal(store.project.wires.some(wire => wire.id === 'wire-1'), true);
});

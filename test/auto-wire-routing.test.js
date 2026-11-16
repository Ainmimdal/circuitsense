import test from 'node:test';
import assert from 'node:assert/strict';

import { autoWirePhysicalStore } from '../src/physical/automation.js';
import { PhysicalCircuitStore } from '../src/physical/circuit-store.js';
import { addComponentCommand } from '../src/physical/commands.js';
import { defaultFootprintForComponent } from '../src/physical/footprints.js';
import { createComponentInstance } from '../src/physical/model.js';

// In its own file because test/physical-automation.test.js recalibrates the Uno's pins for its routing fixtures.

function addArduino(store) {
    store.execute(addComponentCommand(createComponentInstance({
        id: 'arduino-visible', definitionId: 'arduino-uno', footprintId: defaultFootprintForComponent('arduino-uno').id, x: 150, y: 30,
    })));
}

test('Auto Wire leaves its wires in automatic routing, which the router fills in at once (GAP-03)', async () => {
    const { computeRoutingJob } = await import('../src/physical/routing-worker-core.js');
    const store = new PhysicalCircuitStore({ load: false, routingWorker: null });
    addArduino(store);
    const wired = autoWirePhysicalStore(store);
    assert.equal(wired.status, 'success', JSON.stringify(wired.diagnostics));
    assert.ok(store.project.wires.length > 0);
    // The explicit "needs a route" state: automatic mode with no stored waypoints.
    for (const wire of store.project.wires) assert.deepEqual(wire.route, { mode: 'auto', waypoints: [] }, wire.id);
    // The store hands every automatic wire to the router on each change; no Clean is needed.
    const routes = new Map(computeRoutingJob({ project: store.project }));
    for (const wire of store.project.wires) assert.ok(routes.get(wire.id)?.length >= 2, wire.id);
});

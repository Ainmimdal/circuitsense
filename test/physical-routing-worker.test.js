import test from 'node:test';
import assert from 'node:assert/strict';

import { PhysicalCircuitStore } from '../src/physical/circuit-store.js';
import { computeRoutingJob } from '../src/physical/routing-worker-core.js';
import { componentPinRef, createComponentInstance, createPhysicalProject } from '../src/physical/model.js';

test('the worker routing core accepts runtime-only custom footprints', () => {
    const leftFootprint = {
        id: 'free:worker-left', componentDefinitionId: 'worker-left', placementMode: 'free',
        anchorPinId: 'OUT', validRotations: [0],
        pins: [{ pinId: 'OUT', x: 10, y: 5, mount: 'terminal' }],
        routingBounds: { x: 0, y: 0, width: 10, height: 10 },
    };
    const rightFootprint = {
        id: 'free:worker-right', componentDefinitionId: 'worker-right', placementMode: 'free',
        anchorPinId: 'IN', validRotations: [0],
        pins: [{ pinId: 'IN', x: 0, y: 5, mount: 'terminal' }],
        routingBounds: { x: 0, y: 0, width: 10, height: 10 },
    };
    const left = createComponentInstance({
        id: 'left', definitionId: 'worker-left', footprintId: leftFootprint.id, x: 0, y: 0,
    });
    const right = createComponentInstance({
        id: 'right', definitionId: 'worker-right', footprintId: rightFootprint.id, x: 40, y: 0,
    });
    const project = createPhysicalProject({
        components: [left, right],
        wires: [{
            id: 'custom-wire', from: componentPinRef(left.id, 'OUT'), to: componentPinRef(right.id, 'IN'),
            route: { mode: 'auto', waypoints: [] }, color: '#22d3ee',
        }],
    });

    const routes = new Map(computeRoutingJob({ project, footprints: [leftFootprint, rightFootprint] }));
    assert.ok(routes.get('custom-wire')?.length >= 2);
    assert.deepEqual(routes.get('custom-wire')[0], { x: 10, y: 5 });
    assert.deepEqual(routes.get('custom-wire').at(-1), { x: 40, y: 5 });
});

test('the physical store applies worker routes asynchronously and exposes completion', async () => {
    let finishRouting;
    const routingWorker = {
        route() {
            return new Promise(resolve => { finishRouting = resolve; });
        },
    };
    const store = new PhysicalCircuitStore({ load: false, routingWorker });
    const expected = new Map([['worker-route', [{ x: 1, y: 2 }, { x: 3, y: 4 }]]]);
    let routeOnlyChanges = 0;
    store.addEventListener('change', event => {
        if (event.detail?.routesOnly) routeOnlyChanges++;
    });

    store.transaction('worker-route-test', project => {
        project.properties.workerTest = true;
    });
    assert.equal(store.routingInProgress, true);
    assert.equal(store.project.properties.workerTest, true, 'project mutations remain immediate');

    finishRouting(expected);
    const settled = await store.whenRoutesSettled();
    assert.equal(settled, expected);
    assert.equal(store.routes, expected);
    assert.equal(store.routingInProgress, false);
    assert.equal(routeOnlyChanges, 1);
});

test('a stale worker result cannot overwrite a newer routing request', async () => {
    const jobs = [];
    const routingWorker = {
        route() {
            return new Promise(resolve => jobs.push(resolve));
        },
    };
    const store = new PhysicalCircuitStore({ load: false, routingWorker });
    store.transaction('first-worker-job', project => { project.properties.version = 1; });
    store.transaction('second-worker-job', project => { project.properties.version = 2; });

    const latest = new Map([['latest', [{ x: 2, y: 2 }, { x: 4, y: 4 }]]]);
    jobs[1](latest);
    await store.whenRoutesSettled();
    jobs[0](new Map([['stale', [{ x: 0, y: 0 }, { x: 1, y: 1 }]]]));
    await Promise.resolve();

    assert.equal(store.routes, latest);
    assert.equal(store.project.properties.version, 2);
});

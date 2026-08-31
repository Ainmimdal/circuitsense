import test from 'node:test';
import assert from 'node:assert/strict';
import {
    editorProjectToV2,
    UNRESOLVED_COMPONENT_TYPE,
    v2ToEditorProject,
} from '../src/core/editor-project-adapter.js';

const knownComponentIds = new Set(['arduino-uno', 'led', 'resistor']);

test('serializes current editor state through schema v2 without transient realization', () => {
    const source = {
        _nextId: 9,
        instances: [
            { id: 'uno', componentId: 'arduino-uno', x: 10, y: 20 },
            { id: 'bb', componentId: 'breadboard-half', x: 20, y: 220 },
            { id: 'led', componentId: 'led', x: 50, y: 250, physicalScale: { x: 2, y: 3 } },
        ],
        wires: [{
            id: 'realized',
            from: { instanceId: 'uno', pinName: '2' },
            to: { instanceId: 'bb', pinName: 'A3' },
            waypoints: [{ x: 1, y: 2 }],
            physical: {
                kind: 'jumper',
                autoBreadboard: {
                    originalFrom: { instanceId: 'uno', pinName: '2' },
                    originalTo: { instanceId: 'led', pinName: 'A' },
                },
            },
        }],
    };

    const project = editorProjectToV2(source, { knownComponentIds });

    assert.deepEqual(project.logical.nets[0].endpoints, [
        { componentId: 'led', pinId: 'A' },
        { componentId: 'uno', pinId: '2' },
    ]);
    assert.equal(JSON.stringify(project).includes('physicalScale'), false);
    assert.equal(JSON.stringify(project).includes('autoBreadboard'), false);
    assert.equal(JSON.stringify(project).includes('waypoints'), false);
});

test('hydrates components, breadboard resources, locks, and logical source wires', () => {
    const hydrated = v2ToEditorProject({
        schemaVersion: 2,
        logical: {
            components: [
                { id: 'uno', type: 'arduino-uno', provenance: { kind: 'user' } },
                { id: 'led', type: 'led', properties: { color: 'red' }, provenance: { kind: 'user' } },
            ],
            nets: [{ id: 'signal', endpoints: [{ componentId: 'uno', pinId: '2' }, { componentId: 'led', pinId: 'A' }] }],
            unresolvedComponents: [],
        },
        physicalIntent: {
            resources: [
                { id: 'placement:uno', kind: 'component-placement', componentId: 'uno', position: { x: 20, y: 30 }, rotation: 0 },
                { id: 'placement:led', kind: 'component-placement', componentId: 'led', position: { x: 80, y: 240 }, rotation: 90 },
                { id: 'bb', kind: 'breadboard', boardType: 'breadboard-half', position: { x: 10, y: 200 }, rotation: 0 },
            ],
            locks: [{ kind: 'breadboard-mount', componentId: 'led', boardId: 'bb', holes: { A: 'B4', C: 'B5' }, rotation: 90 }],
        },
        metadata: { nextId: 12 },
    }, { knownComponentIds });

    const led = hydrated.instances.find(instance => instance.id === 'led');
    const breadboard = hydrated.instances.find(instance => instance.id === 'bb');
    assert.deepEqual({ x: led.x, y: led.y, rotation: led.rotation, color: led.color }, { x: 80, y: 240, rotation: 90, color: 'red' });
    assert.equal(breadboard.componentId, 'breadboard-half');
    assert.equal(led.mountedOn, 'bb');
    assert.deepEqual(led.breadboardPlacement, { breadboardId: 'bb', holes: { A: 'B4', C: 'B5' }, locked: true });
    assert.deepEqual(hydrated.wires, [{
        id: 'wire_v2_1_1',
        from: { instanceId: 'led', pinName: 'A' },
        to: { instanceId: 'uno', pinName: '2' },
        waypoints: [],
        mode: 'orthogonal',
        logicalNetId: 'signal',
    }]);
    assert.equal(JSON.stringify(hydrated).includes('physicalScale'), false);
    assert.equal(JSON.stringify(hydrated).includes('autoBreadboard'), false);
});

test('hydrates large nets with bounded N-1 pair wires and one placeholder per unknown component', () => {
    const endpoints = Array.from({ length: 20 }, (_, index) => ({ componentId: index === 0 ? 'missing' : `known_${index}`, pinId: 'P' }));
    const components = endpoints.slice(1).map(endpoint => ({ id: endpoint.componentId, type: 'led' }));
    const hydrated = v2ToEditorProject({
        schemaVersion: 2,
        logical: { components, nets: [{ id: 'shared', endpoints }], unresolvedComponents: [] },
        physicalIntent: { resources: [], locks: [] },
        metadata: {},
    });

    assert.equal(hydrated.wires.length, endpoints.length - 1);
    assert.equal(hydrated.instances.filter(instance => instance.id === 'missing').length, 1);
    const missing = hydrated.instances.find(instance => instance.id === 'missing');
    assert.equal(missing.componentId, UNRESOLVED_COMPONENT_TYPE);
    assert.equal(missing.planningDisabled, true);
    assert.equal(hydrated.wires.every(wire => wire.physical === undefined && wire.waypoints.length === 0), true);
});

test('adapter calls are pure and preserve logical equivalence across a round trip', () => {
    const source = {
        instances: [
            { id: 'uno', componentId: 'arduino-uno', x: 0, y: 0 },
            { id: 'led', componentId: 'led', x: 100, y: 100 },
        ],
        wires: [{ id: 'w1', from: { instanceId: 'uno', pinName: '3' }, to: { instanceId: 'led', pinName: 'A' } }],
        _nextId: 7,
    };
    const original = structuredClone(source);
    const v2 = editorProjectToV2(source, { knownComponentIds });
    const hydrated = v2ToEditorProject(v2, { knownComponentIds });
    const roundTrip = editorProjectToV2(hydrated, { knownComponentIds });

    assert.deepEqual(source, original);
    assert.deepEqual(roundTrip.logical.nets, v2.logical.nets);
    assert.deepEqual(roundTrip.logical.components.map(component => component.id), v2.logical.components.map(component => component.id));
});

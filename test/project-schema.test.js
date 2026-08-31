import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateProjectToV2, normalizeProjectV2, PROJECT_SCHEMA_VERSION } from '../src/core/project-schema.js';

const knownComponentIds = new Set(['arduino-uno', 'led', 'resistor']);

test('migrates transformed breadboard realization back into logical nets', () => {
    const legacy = {
        version: '1.0',
        _nextId: 20,
        instances: [
            { id: 'uno', componentId: 'arduino-uno', x: 10, y: 20 },
            { id: 'bb', componentId: 'breadboard-half', x: 30, y: 200 },
            { id: 'led', componentId: 'led', x: 100, y: 230, physicalScale: { x: 2, y: 3 }, mountedOn: 'bb', breadboardPlacement: { breadboardId: 'bb', holes: { A: 'B4', C: 'B5' }, locked: true } },
            { id: 'res', componentId: 'resistor', x: 80, y: 230 },
        ],
        wires: [
            {
                id: 'signal',
                from: { instanceId: 'uno', pinName: '2' },
                to: { instanceId: 'bb', pinName: 'A4' },
                physical: { autoBreadboard: { originalFrom: { instanceId: 'uno', pinName: '2' }, originalTo: { instanceId: 'res', pinName: '1' } } },
            },
            {
                id: 'series',
                from: { instanceId: 'bb', pinName: 'B4' },
                to: { instanceId: 'bb', pinName: 'E4' },
                physical: { kind: 'internal-strip', autoBreadboard: { originalFrom: { instanceId: 'res', pinName: '2' }, originalTo: { instanceId: 'led', pinName: 'A' } } },
            },
            {
                id: 'generated-lead',
                from: { instanceId: 'led', pinName: 'A' },
                to: { instanceId: 'bb', pinName: 'B4' },
                physical: { kind: 'component-lead', autoBreadboard: { instanceId: 'led' } },
            },
        ],
    };

    const migrated = migrateProjectToV2(legacy, { knownComponentIds });

    assert.equal(migrated.schemaVersion, PROJECT_SCHEMA_VERSION);
    assert.deepEqual(migrated.logical.components.map(component => component.id), ['led', 'res', 'uno']);
    assert.deepEqual(migrated.logical.nets.map(net => net.endpoints), [
        [{ componentId: 'led', pinId: 'A' }, { componentId: 'res', pinId: '2' }],
        [{ componentId: 'res', pinId: '1' }, { componentId: 'uno', pinId: '2' }],
    ]);
    assert.equal(JSON.stringify(migrated).includes('physicalScale'), false);
    assert.equal(JSON.stringify(migrated).includes('generated-lead'), false);
    assert.deepEqual(migrated.physicalIntent.locks.find(lock => lock.kind === 'breadboard-mount'), {
        kind: 'breadboard-mount', componentId: 'led', boardId: 'bb', holes: { A: 'B4', C: 'B5' }, rotation: 0,
    });
});

test('recovers logical connectivity from a manually realized terminal strip', () => {
    const migrated = migrateProjectToV2({
        instances: [
            { id: 'uno', componentId: 'arduino-uno', x: 0, y: 0 },
            { id: 'bb', componentId: 'breadboard-half', x: 0, y: 200 },
            { id: 'led', componentId: 'led', x: 0, y: 0 },
        ],
        wires: [
            { id: 'manual-jumper', from: { instanceId: 'uno', pinName: '2' }, to: { instanceId: 'bb', pinName: 'A4' }, physical: { kind: 'jumper' } },
            { id: 'manual-lead', from: { instanceId: 'led', pinName: 'A' }, to: { instanceId: 'bb', pinName: 'E4' }, physical: { kind: 'component-lead', manualBreadboard: true } },
        ],
    }, { knownComponentIds });

    assert.deepEqual(migrated.logical.nets, [{
        id: 'net_1',
        endpoints: [{ componentId: 'led', pinId: 'A' }, { componentId: 'uno', pinId: '2' }],
    }]);
});

test('preserves unsupported and dangling components as unresolved logical data', () => {
    const migrated = migrateProjectToV2({
        instances: [{ id: 'mystery', componentId: 'missing-custom-part', x: 12, y: 34, label: 'Keep me' }],
        wires: [{ id: 'dangling', from: { instanceId: 'mystery', pinName: 'OUT' }, to: { instanceId: 'deleted-part', pinName: 'IN' } }],
    }, { knownComponentIds });

    assert.deepEqual(migrated.logical.unresolvedComponents.map(item => item.id), ['deleted-part', 'mystery']);
    assert.equal(migrated.logical.components.find(item => item.id === 'mystery').properties.label, 'Keep me');
    assert.deepEqual(migrated.logical.nets[0].endpoints, [
        { componentId: 'deleted-part', pinId: 'IN' },
        { componentId: 'mystery', pinId: 'OUT' },
    ]);
});

test('migration is pure and normalization is idempotent', () => {
    const legacy = {
        _nextId: 4,
        instances: [
            { id: 'uno', componentId: 'arduino-uno', x: 0, y: 0 },
            { id: 'led', componentId: 'led', x: 100, y: 100, physicalScale: { x: 1.2, y: 0.8 } },
        ],
        wires: [{ id: 'wire_1', from: { instanceId: 'uno', pinName: '2' }, to: { instanceId: 'led', pinName: 'A' }, logicalNetId: 'signal' }],
    };
    const original = structuredClone(legacy);
    const once = migrateProjectToV2(legacy, { knownComponentIds });
    const twice = normalizeProjectV2(once, { knownComponentIds });

    assert.deepEqual(legacy, original);
    assert.deepEqual(twice, once);
    assert.equal(once.logical.nets[0].id, 'signal');
});


import test from 'node:test';
import assert from 'node:assert/strict';

import {
    arduinoCommonPinGroup,
    buildLogicalNets,
    classifyNet,
    cloneCircuitDocument,
    endpointFromKey,
    endpointKey,
    plannerFailure,
    plannerNeedsResourceAction,
    plannerSuccess,
    revisionMatches,
    withNextRevision,
} from '../src/core/circuit-model.js';

test('endpoint keys are stable, reversible, and delimiter-safe', () => {
    const endpoint = { componentId: 'device:one', pinId: 'pin|A:1' };
    const key = endpointKey(endpoint);
    assert.equal(endpointKey(endpoint), key);
    assert.deepEqual(endpointFromKey(key), endpoint);
});

test('logical pair connections form deterministic transitive nets', () => {
    const connections = [
        { id: 'c2', from: { componentId: 'b', pinId: '1' }, to: { componentId: 'c', pinId: '1' } },
        { id: 'c1', from: { componentId: 'a', pinId: '1' }, to: { componentId: 'b', pinId: '1' } },
        { id: 'c3', from: { componentId: 'x', pinId: '1' }, to: { componentId: 'y', pinId: '1' } },
    ];

    const nets = buildLogicalNets(connections);
    assert.equal(nets.length, 2);
    const joined = nets.find(net => net.endpoints.some(endpoint => endpoint.componentId === 'a'));
    assert.deepEqual(joined.endpoints.map(endpoint => endpoint.componentId), ['a', 'b', 'c']);
    assert.deepEqual(joined.connectionIds, ['c1', 'c2']);
    assert.equal(joined.kind, 'signal');
});

test('Arduino common pins join equal supply domains but keep voltages separate', () => {
    assert.equal(arduinoCommonPinGroup('GND.2'), 'ground');
    assert.equal(arduinoCommonPinGroup('5V.1'), 'power-5v');
    assert.equal(arduinoCommonPinGroup('3V3'), 'power-3v3');
    assert.equal(arduinoCommonPinGroup('VIN'), null);

    const nets = buildLogicalNets([
        { id: 'g1', from: { componentId: 'uno', pinId: 'GND.1' }, to: { componentId: 'led', pinId: 'C' } },
        { id: 'g2', from: { componentId: 'uno', pinId: 'GND.2' }, to: { componentId: 'sensor', pinId: 'GND' } },
        { id: 'p1', from: { componentId: 'uno', pinId: '5V' }, to: { componentId: 'sensor', pinId: 'VCC' } },
        { id: 'p2', from: { componentId: 'uno', pinId: '5V.1' }, to: { componentId: 'display', pinId: 'VCC' } },
        { id: 'p3', from: { componentId: 'uno', pinId: '3.3V' }, to: { componentId: 'radio', pinId: 'VCC' } },
    ], { arduinoComponents: ['uno'] });

    assert.equal(nets.length, 3);
    assert.equal(nets.filter(net => net.kind === 'ground').length, 1);
    assert.equal(nets.filter(net => net.kind === 'power').length, 2);
    assert.equal(nets.find(net => net.endpoints.some(endpoint => endpoint.componentId === 'led')).endpoints.length, 4);
    assert.equal(nets.find(net => net.endpoints.some(endpoint => endpoint.componentId === 'display')).endpoints.length, 4);
    assert.equal(nets.find(net => net.endpoints.some(endpoint => endpoint.componentId === 'radio')).endpoints.length, 2);
});

test('net classification detects power, ground, signal, and direct shorts', () => {
    assert.equal(classifyNet([{ componentId: 'a', pinId: 'D2' }]), 'signal');
    assert.equal(classifyNet([{ componentId: 'a', pinId: 'VDD' }]), 'power');
    assert.equal(classifyNet([{ componentId: 'a', pinId: 'VSS' }]), 'ground');
    assert.equal(classifyNet([
        { componentId: 'a', pinId: '5V' },
        { componentId: 'a', pinId: 'GND.1' },
    ]), 'conflict');
});

test('document cloning and revision updates never mutate the source', () => {
    const source = { schemaVersion: 2, revision: 4, logical: { components: [{ id: 'led' }] } };
    const clone = cloneCircuitDocument(source);
    clone.logical.components[0].id = 'changed';
    assert.equal(source.logical.components[0].id, 'led');

    const next = withNextRevision(source, draft => {
        draft.logical.components.push({ id: 'resistor' });
    });
    assert.equal(next.revision, 5);
    assert.equal(next.logical.components.length, 2);
    assert.equal(source.logical.components.length, 1);
    assert.equal(revisionMatches(next, 5), true);
    assert.equal(revisionMatches(source, 5), false);
});

test('planner result constructors return isolated immutable discriminated results', () => {
    const plan = { placements: [] };
    const success = plannerSuccess({ sourceRevision: 7, physicalPlan: plan });
    plan.placements.push({ componentId: 'late-mutation' });
    assert.equal(success.status, 'success');
    assert.deepEqual(success.physicalPlan.placements, []);
    assert.equal(Object.isFrozen(success.physicalPlan), true);

    const needsResource = plannerNeedsResourceAction({
        sourceRevision: 7,
        problem: { code: 'INSUFFICIENT_BOARD_CAPACITY' },
        alternatives: [{ action: 'add-board', boardType: 'breadboard-half-400' }],
    });
    assert.equal(needsResource.status, 'needs-resource-action');
    assert.equal(needsResource.alternatives.length, 1);

    const failure = plannerFailure({ sourceRevision: 7, diagnostics: [{ code: 'UNKNOWN_COMPONENT' }] });
    assert.equal(failure.status, 'failure');
    assert.equal(Object.isFrozen(failure.diagnostics), true);
});

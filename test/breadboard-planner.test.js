import test from 'node:test';
import assert from 'node:assert/strict';
import { planBreadboardCircuit } from '../src/core/breadboard-planner.js';
import { getBoardDefinition } from '../src/core/board-registry.js';

const pinTypes = {
    'uno:2': 'DIGITAL', 'uno:5V': 'VCC', 'uno:GND.1': 'GND',
    'led:A': 'DIGITAL', 'led:C': 'GND',
    'res:1': 'SIGNAL', 'res:2': 'SIGNAL',
    'button:1.l': 'DIGITAL', 'button:2.l': 'GND',
};
const pinTypeFor = endpoint => pinTypes[`${endpoint.componentId}:${endpoint.pinId}`];

test('finds one complete rigid LED, resistor and pushbutton placement', () => {
    const result = planBreadboardCircuit({
        revision: 4,
        components: [
            { id: 'uno', componentId: 'arduino-uno', x: 100, y: 100 },
            { id: 'led', componentId: 'led' },
            { id: 'res', componentId: 'resistor' },
            { id: 'button', componentId: 'pushbutton' },
        ],
        connections: [
            { id: 'w1', from: { instanceId: 'uno', pinName: '2' }, to: { instanceId: 'res', pinName: '1' } },
            { id: 'w2', from: { instanceId: 'res', pinName: '2' }, to: { instanceId: 'led', pinName: 'A' } },
            { id: 'w3', from: { instanceId: 'uno', pinName: 'GND.1' }, to: { instanceId: 'led', pinName: 'C' } },
            { id: 'w4', from: { instanceId: 'uno', pinName: '2' }, to: { instanceId: 'button', pinName: '1.l' } },
            { id: 'w5', from: { instanceId: 'uno', pinName: 'GND.1' }, to: { instanceId: 'button', pinName: '2.l' } },
        ],
        resources: [{ id: 'bb', typeId: 'breadboard-half-400', x: 70, y: 380 }],
        pinTypeFor,
    });
    assert.equal(result.status, 'success');
    assert.equal(result.physicalPlan.placements.length, 3);
    assert.equal(result.physicalPlan.contacts.length, 8);
    assert.equal(result.physicalPlan.placements.every(placement => !('scaleX' in placement.transform)), true);
    const board = getBoardDefinition('breadboard-half-400');
    const button = result.physicalPlan.placements.find(placement => placement.componentId === 'button');
    const buttonNode1 = new Set(['1.l', '1.r'].map(pin => board.getHole(button.holes[pin]).groupId));
    const buttonNode2 = new Set(['2.l', '2.r'].map(pin => board.getHole(button.holes[pin]).groupId));
    assert.equal([...buttonNode1].some(group => buttonNode2.has(group)), false,
        'pushbutton terminals must never be shorted by a breadboard strip');
    assert.deepEqual(new Set(Object.values(button.holes).map(hole => board.getHole(hole).bank)),
        new Set(['upper', 'lower']), 'pushbutton must bridge the centre trench');
    assert.equal([90, 270].includes(button.rotation), true);
    for (const endpoint of result.physicalPlan.conductors.flatMap(conductor => [conductor.from, conductor.to])) {
        if (endpoint.kind !== 'board-hole') continue;
        const hole = board.getHole(endpoint.holeId);
        assert.equal(result.physicalPlan.placements.some(placement =>
            hole.x > placement.rect.left - 70 && hole.x < placement.rect.right - 70 &&
            hole.y > placement.rect.top - 380 && hole.y < placement.rect.bottom - 380), false,
        `jumper endpoint ${endpoint.holeId} must not sit beneath a component body`);
    }
});

test('returns only verified add or replace board alternatives when current space cannot fit', () => {
    const components = Array.from({ length: 8 }, (_, index) => ({ id: `dht${index}`, componentId: 'dht22' }));
    const result = planBreadboardCircuit({
        revision: 2,
        components,
        resources: [{ id: 'bb', typeId: 'breadboard-half-400', x: 0, y: 0 }],
    });
    assert.equal(result.status, 'needs-resource-action');
    assert.equal(result.problem.code, 'INSUFFICIENT_BOARD_CAPACITY');
    assert.ok(result.alternatives.length > 0);
    assert.equal(result.alternatives.every(alternative => alternative.physicalPlan.status === 'complete'), true);
});

test('rejects an impossible locked footprint without mutating input', () => {
    const input = {
        revision: 1,
        components: [{ id: 'led', componentId: 'led' }],
        resources: [{ id: 'bb', typeId: 'breadboard-half-400', x: 0, y: 0 }],
        constraints: [{ componentId: 'led', boardId: 'bb', anchorHole: 'A30', rotation: 0, locked: true }],
    };
    const before = JSON.stringify(input);
    const result = planBreadboardCircuit(input);
    assert.notEqual(result.status, 'success');
    assert.equal(JSON.stringify(input), before);
});

test('synthesizes implicit contacts and clean unique ground rail distribution', () => {
    const input = {
        revision: 9,
        components: [
            { id: 'uno', componentId: 'arduino-uno', connectorType: 'female' },
            { id: 'led1', componentId: 'led', connectorType: 'male' },
            { id: 'led2', componentId: 'led', connectorType: 'male' },
        ],
        connections: [
            { id: 'g1', from: { componentId: 'uno', pinId: 'GND.1', role: 'GND' }, to: { componentId: 'led1', pinId: 'C', role: 'GND' } },
            { id: 'g2', from: { componentId: 'uno', pinId: 'GND.1', role: 'GND' }, to: { componentId: 'led2', pinId: 'C', role: 'GND' } },
            { id: 's1', from: { componentId: 'uno', pinId: '2' }, to: { componentId: 'led1', pinId: 'A' } },
            { id: 's2', from: { componentId: 'uno', pinId: '3' }, to: { componentId: 'led2', pinId: 'A' } },
        ],
        resources: [{ id: 'bb', typeId: 'breadboard-half-400', x: 0, y: 0 }],
        constraints: [
            { componentId: 'led1', boardId: 'bb', anchorHole: 'B3', rotation: 0, locked: true },
            { componentId: 'led2', boardId: 'bb', anchorHole: 'B18', rotation: 0, locked: true },
        ],
    };
    const before = JSON.stringify(input);
    const result = planBreadboardCircuit(input);
    assert.equal(result.status, 'success');
    assert.equal(JSON.stringify(input), before);

    assert.equal(result.physicalPlan.contacts.length, 4);
    assert.equal(result.physicalPlan.contacts.every(contact => contact.kind === 'mounted-contact'), true);
    assert.equal(result.physicalPlan.conductors.some(conductor => conductor.kind === 'component-lead'), false);

    const groundNet = result.physicalPlan.nets.find(net => net.kind === 'ground');
    const groundConductors = result.physicalPlan.conductors.filter(conductor => conductor.netId === groundNet.id);
    assert.equal(groundConductors.filter(conductor => conductor.kind === 'rail-feeder').length, 1);
    assert.equal(groundConductors.filter(conductor => conductor.kind === 'rail-branch').length, 2);

    const usedRailHoles = groundConductors.flatMap(conductor => [conductor.from, conductor.to])
        .filter(endpoint => endpoint.kind === 'board-hole' && endpoint.groupId.startsWith('rail-'))
        .map(endpoint => endpoint.holeId);
    assert.equal(new Set(usedRailHoles).size, usedRailHoles.length);
    assert.equal(groundConductors.every(conductor => conductor.jumperType === 'male-male'), true);
    const contactHoles = new Set(result.physicalPlan.contacts.map(contact => `${contact.boardId}:${contact.holeId}`));
    const jumperHoles = result.physicalPlan.conductors.flatMap(conductor => [conductor.from, conductor.to])
        .filter(endpoint => endpoint.kind === 'board-hole')
        .map(endpoint => `${endpoint.boardId}:${endpoint.holeId}`);
    assert.equal(jumperHoles.some(hole => contactHoles.has(hole)), false,
        'jumper endpoints must never reuse component lead holes');
});

test('uses the nearest split ground rail and makes local branches straight', () => {
    const result = planBreadboardCircuit({
        components: [
            { id: 'uno', componentId: 'arduino-uno', x: 300, y: -220 },
            { id: 'led1', componentId: 'led' },
            { id: 'led2', componentId: 'led' },
        ],
        connections: [
            { id: 'g1', from: { componentId: 'uno', pinId: 'GND.1' }, to: { componentId: 'led1', pinId: 'C' } },
            { id: 'g2', from: { componentId: 'uno', pinId: 'GND.1' }, to: { componentId: 'led2', pinId: 'C' } },
            { id: 's1', from: { componentId: 'uno', pinId: '2' }, to: { componentId: 'led1', pinId: 'A' } },
            { id: 's2', from: { componentId: 'uno', pinId: '3' }, to: { componentId: 'led2', pinId: 'A' } },
        ],
        resources: [{ id: 'bb', typeId: 'breadboard-full-830', x: 0, y: 0 }],
        constraints: [
            { componentId: 'led1', boardId: 'bb', anchorHole: 'B45', rotation: 0, locked: true },
            { componentId: 'led2', boardId: 'bb', anchorHole: 'B52', rotation: 0, locked: true },
        ],
    });
    assert.equal(result.status, 'success');
    const board = getBoardDefinition('breadboard-full-830');
    const groundNet = result.physicalPlan.nets.find(net => net.kind === 'ground');
    const branches = result.physicalPlan.conductors.filter(conductor =>
        conductor.netId === groundNet.id && conductor.kind === 'rail-branch');
    assert.equal(branches.length, 2);
    for (const branch of branches) {
        const endpoints = [branch.from, branch.to].map(endpoint => board.getHole(endpoint.holeId));
        assert.equal(endpoints.some(hole => hole.groupId === 'rail-TN-right'), true);
        assert.equal(endpoints[0].x, endpoints[1].x);
    }
});

test('uses one half-board ground bus instead of linking top and bottom rails', () => {
    const result = planBreadboardCircuit({
        components: [
            { id: 'uno', componentId: 'arduino-uno', x: 100, y: 400 },
            { id: 'upper', componentId: 'led' },
            { id: 'lower', componentId: 'led' },
        ],
        connections: [
            { id: 'g1', from: { componentId: 'uno', pinId: 'GND.1' }, to: { componentId: 'upper', pinId: 'C' } },
            { id: 'g2', from: { componentId: 'uno', pinId: 'GND.1' }, to: { componentId: 'lower', pinId: 'C' } },
            { id: 's1', from: { componentId: 'uno', pinId: '2' }, to: { componentId: 'upper', pinId: 'A' } },
            { id: 's2', from: { componentId: 'uno', pinId: '3' }, to: { componentId: 'lower', pinId: 'A' } },
        ],
        resources: [{ id: 'bb', typeId: 'breadboard-half-400', x: 0, y: 100 }],
        constraints: [
            { componentId: 'upper', boardId: 'bb', anchorHole: 'B2', rotation: 0, locked: true },
            { componentId: 'lower', boardId: 'bb', anchorHole: 'H20', rotation: 0, locked: true },
        ],
    });
    assert.equal(result.status, 'success');
    const groundNet = result.physicalPlan.nets.find(net => net.kind === 'ground');
    const ground = result.physicalPlan.conductors.filter(conductor => conductor.netId === groundNet.id);
    assert.equal(ground.filter(conductor => conductor.kind === 'rail-feeder').length, 1);
    assert.equal(ground.filter(conductor => conductor.kind === 'rail-branch').length, 2);
    assert.equal(ground.some(conductor => conductor.kind === 'rail-link'), false);
    assert.equal(new Set(ground.flatMap(conductor => [conductor.from, conductor.to])
        .filter(endpoint => endpoint.groupId?.startsWith('rail-'))
        .map(endpoint => endpoint.groupId)).size, 1);
});

test('suppresses wires when mounted endpoints already share one terminal strip', () => {
    const result = planBreadboardCircuit({
        components: [{ id: 'button', componentId: 'pushbutton' }],
        connections: [{
            id: 'same-strip',
            from: { componentId: 'button', pinId: '1.l' },
            to: { componentId: 'button', pinId: '1.r' },
        }],
        resources: [{ id: 'bb', typeId: 'breadboard-half-400', x: 0, y: 0 }],
        constraints: [{ componentId: 'button', boardId: 'bb', anchorHole: 'E5', rotation: 90, locked: true }],
    });
    assert.equal(result.status, 'success');
    const logicalNetId = result.physicalPlan.nets[0].id;
    assert.equal(result.physicalPlan.contacts.filter(contact => contact.netId === logicalNetId).length, 2);
    assert.equal(result.physicalPlan.conductors.length, 0);
});

test('keeps non-mounted endpoints as a direct physical conductor', () => {
    const result = planBreadboardCircuit({
        components: [
            { id: 'uno', componentId: 'arduino-uno', connectorType: 'female' },
            { id: 'module', componentId: 'external-module', connectorType: 'male' },
        ],
        connections: [{
            id: 'signal',
            from: { componentId: 'uno', pinId: '4' },
            to: { componentId: 'module', pinId: 'SIG' },
        }],
    });
    assert.equal(result.status, 'success');
    assert.equal(result.physicalPlan.contacts.length, 0);
    assert.equal(result.physicalPlan.conductors.length, 1);
    assert.equal(result.physicalPlan.conductors[0].kind, 'direct');
    assert.equal(result.physicalPlan.conductors[0].jumperType, 'male-female');
    assert.deepEqual(result.physicalPlan.conductors[0].from, {
        kind: 'component-pin', componentId: 'uno', pinId: '4', connectorType: 'female',
    });
});

test('planner proves a legal half-board placement for every rigid through-hole package', () => {
    const components = [
        'arduino-nano', 'nano-rp2040-connect', 'led', 'resistor', 'pushbutton', 'buzzer',
        'potentiometer', 'dht22', 'slide-switch', 'seven-segment', 'dip-switch-8',
        'ir-receiver', 'relay-dpdt', 'led-bar-graph', 'rgb-led',
    ];
    for (const componentId of components) {
        const result = planBreadboardCircuit({
            components: [{ id: 'part', componentId }],
            connections: [],
            resources: [{ id: 'bb', typeId: 'breadboard-half-400', x: 0, y: 0 }],
        });
        assert.equal(result.status, 'success', componentId);
        assert.equal(result.physicalPlan.placements[0]?.componentId, 'part', componentId);
    }
});

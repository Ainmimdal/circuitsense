import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BREADBOARD,
    areBreadboardHolesConnected,
    breadboardHoles,
    buildElectricalNets,
    decideBreadboard,
    findBreadboardCapacity,
    inferJumperType,
    occupiedBreadboardHoles,
} from '../src/breadboard-model.js';

test('models all 400 holes and real terminal/rail connectivity', () => {
    assert.equal(breadboardHoles.length, 400);
    assert.equal(areBreadboardHolesConnected('A12', 'E12'), true);
    assert.equal(areBreadboardHolesConnected('E12', 'F12'), false);
    assert.equal(areBreadboardHolesConnected('TP1', 'TP25'), true);
    assert.equal(areBreadboardHolesConnected('TP1', 'BP1'), false);
});

test('uses the shared 2.54 mm physical scale', () => {
    const d1 = breadboardHoles.find(hole => hole.name === 'D1');
    const d2 = breadboardHoles.find(hole => hole.name === 'D2');
    assert.equal(d2.x - d1.x, 10);
    assert.equal(breadboardHoles.find(hole => hole.name === 'TP1').y - breadboardHoles.find(hole => hole.name === 'TN1').y, BREADBOARD.pitch);
    assert.equal(breadboardHoles.find(hole => hole.name === 'BN1').y - breadboardHoles.find(hole => hole.name === 'BP1').y, BREADBOARD.pitch);
    assert.equal(BREADBOARD.pitch / BREADBOARD.pxPerMm, 2.54);
    assert.ok(BREADBOARD.physicalWidthMm >= 82 && BREADBOARD.physicalWidthMm <= 85);
});

test('keeps physical breadboard realization in logical electrical nets', () => {
    const instances = [{ id: 'bb', componentId: 'breadboard-half' }, { id: 'uno', componentId: 'arduino-uno' }, { id: 'led', componentId: 'led' }];
    const wires = [
        { from: { instanceId: 'uno', pinName: '5' }, to: { instanceId: 'bb', pinName: 'A8' } },
        { from: { instanceId: 'led', pinName: 'A' }, to: { instanceId: 'bb', pinName: 'E8' } },
    ];
    const net = buildElectricalNets(instances, wires).find(items => items.includes('uno:5'));
    assert.ok(net.includes('led:A'));
});

test('infers jumper genders from endpoint connectors', () => {
    assert.equal(inferJumperType('female', 'female'), 'male-male');
    assert.equal(inferJumperType('female', 'male'), 'male-female');
    assert.equal(inferJumperType('male', 'male'), 'female-female');
});

test('detects occupied holes and capacity limits', () => {
    const wires = [{ id: 'w1', from: { instanceId: 'uno', pinName: '5V' }, to: { instanceId: 'bb', pinName: 'TP1' } }];
    const occupied = occupiedBreadboardHoles(wires, 'bb', [{ instanceId: 'led', holes: { A: 'D4' } }]);
    assert.deepEqual([...occupied.keys()], ['TP1', 'D4']);
    assert.equal(findBreadboardCapacity(occupied, 300, 99).fits, false);
    assert.equal(findBreadboardCapacity(occupied, 299, 99).fits, true);
});

test('decides when breadboards are required, useful, or unnecessary', () => {
    const led = { pinMeta: { A: 'SIGNAL', C: 'GND' }, autoWire: { A: 'DIGITAL', C: 'GND' }, breadboard: { mountable: true, required: true } };
    const sensor = { autoWire: { VCC: 'VCC', GND: 'GND' } };
    assert.equal(decideBreadboard([led]).status, 'required');
    assert.equal(decideBreadboard([sensor, sensor, sensor]).status, 'useful');
    assert.equal(decideBreadboard([sensor]).status, 'unnecessary');
    assert.equal(decideBreadboard([led], true).shouldAdd, false);
});

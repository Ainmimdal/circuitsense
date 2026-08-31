import test from 'node:test';
import assert from 'node:assert/strict';
import { boardRegistry } from '../src/core/board-registry.js';
import { fullBreadboardPinInfo } from '../src/components/elera-full-breadboard.js';

test('full breadboard visual exposes all registry holes as placed-component pinInfo', () => {
    const board = boardRegistry['breadboard-full-830'];
    assert.equal(fullBreadboardPinInfo.length, 830);

    for (const source of board.holes) {
        const pin = fullBreadboardPinInfo.find(candidate => candidate.name === source.id);
        assert.ok(pin, `missing visual pin ${source.id}`);
        assert.deepEqual(
            {
                x: pin.x,
                y: pin.y,
                group: pin.group,
                kind: pin.kind,
                connectorType: pin.connectorType,
            },
            {
                x: source.x,
                y: source.y,
                group: source.groupId,
                kind: source.zone,
                connectorType: source.connectorType,
            }
        );
    }
});

test('full breadboard pinInfo preserves terminal and split-rail connectivity metadata', () => {
    const byName = new Map(fullBreadboardPinInfo.map(pin => [pin.name, pin]));
    assert.equal(byName.get('A1').group, byName.get('E1').group);
    assert.notEqual(byName.get('E1').group, byName.get('F1').group);
    assert.equal(byName.get('TP1').group, byName.get('TP25').group);
    assert.notEqual(byName.get('TP1').group, byName.get('TP50').group);
    assert.equal(byName.get('TP1').signals[0].signal, 'VCC');
    assert.equal(byName.get('TN1').signals[0].signal, 'GND');
    assert.equal(byName.get('A1').signals[0].signal, 'SIGNAL');
});

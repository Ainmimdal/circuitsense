import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_BREADBOARD_PITCH,
    componentGeometry,
    createRigidPlacementTransform,
    deriveFootprintHoles,
    footprintCreatesShort,
    footprintIsBreadboardLegal,
    getUniformRenderScale,
    normalizeRotation,
    rotateGridOffset,
    transformNativePoint,
} from '../src/core/component-geometry.js';

test('registers calibrated rigid footprints for the initial through-hole set', () => {
    assert.deepEqual(Object.keys(componentGeometry).sort(), [
        'arduino-nano', 'buzzer', 'dht22', 'dip-switch-8', 'dip8', 'ir-receiver', 'led', 'led-bar-graph',
        'nano-rp2040-connect', 'potentiometer', 'pushbutton-6mm', 'relay-dpdt', 'resistor', 'rgb-led',
        'seven-segment', 'slide-switch',
    ]);
    for (const geometry of Object.values(componentGeometry)) {
        assert.ok(geometry.footprints.length > 0);
        assert.ok(getUniformRenderScale(
            Object.keys(componentGeometry).find(id => componentGeometry[id] === geometry)
        ) > 0);
        assert.equal(Object.hasOwn(geometry, 'scaleX'), false);
        assert.equal(Object.hasOwn(geometry, 'scaleY'), false);
    }
});

test('keeps pitch configurable while defaulting to ten pixels', () => {
    assert.equal(DEFAULT_BREADBOARD_PITCH, 10);
    assert.equal(getUniformRenderScale('led'), 1);
    assert.equal(getUniformRenderScale('led', 9.6), 0.96);
    assert.equal(getUniformRenderScale('resistor'), 60 / 58.8);
    assert.ok(Math.abs(getUniformRenderScale('arduino-nano') - 10 / 9.6) < 1e-12);
});

test('maps every Nano header pin to one rigid breadboard footprint', () => {
    const holes = deriveFootprintHoles('arduino-nano', { anchorHole: 'A2' });
    assert.equal(Object.keys(holes).length, 30);
    assert.deepEqual(
        { '12': holes['12'], '11': holes['11'], '1': holes['1'], '13': holes['13'], VIN: holes.VIN },
        { '12': 'A2', '11': 'A3', '1': 'A16', '13': 'F2', VIN: 'F16' },
    );
});

test('maps every Nano RP2040 header pin to the Nano form-factor footprint', () => {
    const holes = deriveFootprintHoles('nano-rp2040-connect', { anchorHole: 'A2' });
    assert.equal(Object.keys(holes).length, 30);
    assert.deepEqual(
        { D12: holes.D12, D11: holes.D11, RX: holes.RX, D13: holes.D13, VIN: holes.VIN },
        { D12: 'A2', D11: 'A3', RX: 'A16', D13: 'F2', VIN: 'F16' },
    );
});

test('derives rigid holes for every remaining through-hole and DIP visual', () => {
    assert.deepEqual(deriveFootprintHoles('ir-receiver', { anchorHole: 'B2' }), {
        GND: 'B2', VCC: 'B3', DAT: 'B4',
    });
    assert.deepEqual(deriveFootprintHoles('dip-switch-8', { anchorHole: 'B2' }), {
        '1b': 'B2', '2b': 'B3', '3b': 'B4', '4b': 'B5', '5b': 'B6', '6b': 'B7', '7b': 'B8', '8b': 'B9',
        '1a': 'F2', '2a': 'F3', '3a': 'F4', '4a': 'F5', '5a': 'F6', '6a': 'F7', '7a': 'F8', '8a': 'F9',
    });
    assert.deepEqual(deriveFootprintHoles('seven-segment', { anchorHole: 'A2' }), {
        G: 'A2', F: 'A3', 'COM.2': 'A4', A: 'A5', B: 'A6',
        E: 'G2', D: 'G3', 'COM.1': 'G4', C: 'G5', DP: 'G6',
    });
    assert.deepEqual(deriveFootprintHoles('relay-dpdt', { anchorHole: 'E2' }), {
        NO2: 'E2', NC2: 'E4', P2: 'E6', COIL2: 'E9',
        NO1: 'G2', NC1: 'G4', P1: 'G6', COIL1: 'G9',
    });
    assert.deepEqual(deriveFootprintHoles('led-bar-graph', { anchorHole: 'D2', rotation: 90 }), {
        A10: 'D2', A9: 'D3', A8: 'D4', A7: 'D5', A6: 'D6', A5: 'D7', A4: 'D8', A3: 'D9', A2: 'D10', A1: 'D11',
        C10: 'F2', C9: 'F3', C8: 'F4', C7: 'F5', C6: 'F6', C5: 'F7', C4: 'F8', C3: 'F9', C2: 'F10', C1: 'F11',
    });
    assert.deepEqual(deriveFootprintHoles('rgb-led', { anchorHole: 'B2' }), {
        R: 'B2', COM: 'C3', G: 'B4', B: 'B5',
    });
});

test('rotates integer footprint offsets clockwise around the anchor', () => {
    assert.deepEqual(rotateGridOffset({ col: 3, row: 2 }, 0), { col: 3, row: 2 });
    assert.deepEqual(rotateGridOffset({ col: 3, row: 2 }, 90), { col: -2, row: 3 });
    assert.deepEqual(rotateGridOffset({ col: 3, row: 2 }, 180), { col: -3, row: -2 });
    assert.deepEqual(rotateGridOffset({ col: 3, row: 2 }, 270), { col: 2, row: -3 });
    assert.equal(normalizeRotation(-90), 270);
    assert.throws(() => normalizeRotation(45), RangeError);
});

test('derives all LED holes from one anchor without independently snapping pins', () => {
    assert.deepEqual(deriveFootprintHoles('led', { anchorHole: 'B2' }), {
        C: 'B2', A: 'B3',
    });
    assert.deepEqual(deriveFootprintHoles('led', { anchorHole: 'B2', rotation: 180 }), {
        C: 'B2', A: 'B1',
    });
    assert.equal(deriveFootprintHoles('led', { anchorHole: 'B1', rotation: 180 }), null);
    assert.equal(deriveFootprintHoles('led', { anchorHole: 'B2', rotation: 90 }), null);
});

test('supports a four-leg pushbutton straddling the centre trench', () => {
    const proper = deriveFootprintHoles('pushbutton-6mm', { anchorHole: 'D5', rotation: 90 });
    assert.deepEqual(proper, {
        '1.l': 'D5', '1.r': 'F5', '2.l': 'D3', '2.r': 'F3',
    });
    const holeInfo = hole => {
        const match = /^([A-J])(\d+)$/.exec(hole || '');
        return match ? {
            groupId: `${match[1] <= 'E' ? 'upper' : 'lower'}-${match[2]}`,
            bank: match[1] <= 'E' ? 'upper' : 'lower',
        } : null;
    };
    assert.equal(footprintIsBreadboardLegal('pushbutton-6mm', proper, holeInfo), true);
    assert.equal(footprintIsBreadboardLegal('pushbutton-6mm',
        deriveFootprintHoles('pushbutton-6mm', { anchorHole: 'A5', rotation: 90 }), holeInfo), false);
    assert.equal(footprintCreatesShort('pushbutton-6mm', proper, hole => holeInfo(hole)?.groupId), false);
});

test('a rigid transform aligns its anchor and preserves one scalar scale', () => {
    const transform = createRigidPlacementTransform('led', {
        anchorWorld: { x: 120, y: 80 }, rotation: 180,
    });
    assert.equal(transform.scale, 1);
    assert.equal(Object.hasOwn(transform, 'scaleX'), false);
    assert.equal(Object.hasOwn(transform, 'scaleY'), false);

    assert.deepEqual(
        transformNativePoint(componentGeometry.led.native.pins.C, transform),
        { x: 120, y: 80 }
    );
    const anode = transformNativePoint(componentGeometry.led.native.pins.A, transform);
    assert.ok(Math.abs(anode.x - 110) < 1e-9);
    assert.ok(Math.abs(anode.y - 80) < 1e-9);
});

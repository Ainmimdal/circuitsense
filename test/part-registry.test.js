import test from 'node:test';
import assert from 'node:assert/strict';

import { componentLibrary } from '../src/component-library.js';
import { getComponentGeometry } from '../src/core/component-geometry.js';
import {
    PACKAGE_PITCH_MM,
    getCalibratedPackageDefinitions,
    getPartDefinition,
    listPartDefinitions,
} from '../src/core/part-registry.js';

test('shared part definitions preserve every catalog part and canonical pin identity', () => {
    assert.equal(listPartDefinitions().length,
        Object.values(componentLibrary).filter(component => !component.isBreadboard).length);
    for (const component of Object.values(componentLibrary).filter(item => !item.isBreadboard)) {
        const part = getPartDefinition(component.id);
        const pinIds = new Set(part.pins.map(pin => pin.id));
        for (const pinId of Object.keys(component.pinMeta || {})) assert.ok(pinIds.has(pinId), `${component.id}:${pinId}`);
        for (const pinId of Object.keys(component.autoWire || {})) assert.ok(pinIds.has(pinId), `${component.id}:${pinId}`);
    }
});

test('electrical role and Auto Wire requirement remain separate semantics', () => {
    const ledAnode = getPartDefinition('led').pins.find(pin => pin.id === 'A');
    assert.equal(ledAnode.electricalRole, 'SIGNAL');
    assert.equal(ledAnode.autoWireRequirement, 'DIGITAL');
});

test('every calibrated rigid package preserves exact 2.54 mm grid vectors and one scalar coordinate system', () => {
    for (const component of Object.values(componentLibrary)) {
        const geometry = getComponentGeometry(component.id);
        if (!geometry) continue;
        const packages = getCalibratedPackageDefinitions(component.id);
        assert.equal(packages.length, geometry.footprints.length, component.id);
        for (const packageDefinition of packages) {
            assert.equal(packageDefinition.placementMode, 'breadboard-rigid');
            assert.equal(Object.hasOwn(packageDefinition, 'scaleX'), false);
            assert.equal(Object.hasOwn(packageDefinition, 'scaleY'), false);
            for (const pin of packageDefinition.pins) {
                assert.ok(Math.abs(pin.x / PACKAGE_PITCH_MM - Math.round(pin.x / PACKAGE_PITCH_MM)) < 1e-9);
                assert.ok(Math.abs(pin.y / PACKAGE_PITCH_MM - Math.round(pin.y / PACKAGE_PITCH_MM)) < 1e-9);
            }
        }
    }
});

test('internal pin buses normalize once on the shared part definition', () => {
    assert.deepEqual(getPartDefinition('pushbutton').internalNets.map(net => net.pins), [
        ['1.l', '1.r'], ['2.l', '2.r'],
    ]);
});

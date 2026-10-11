import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    BOARD_PIN_TABLES,
    deriveAutoWirePins,
    derivePinExitOverride,
    validateBoardPinTable,
} from '../src/core/board-pins.js';
import { componentLibrary, getComponentDef } from '../src/component-library.js';

const boardsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/boards');
const boardFiles = readdirSync(boardsDir).filter(file => file.endsWith('.json'));

function validTable(overrides = {}) {
    return {
        format: 'elera-board-pins-v1',
        id: 'test-board',
        logicVoltage: 5,
        maxCurrent_mA: 500,
        pinMaxCurrent_mA: 20,
        pins: [
            { name: 'D2', capabilities: ['digital', 'pwm'] },
            { name: 'A0', capabilities: ['analog', 'i2c_sda'] },
            { name: 'A1', capabilities: ['analog', 'i2c_scl'] },
            { name: '5V', capabilities: ['power'] },
            { name: 'GND', capabilities: ['ground'] },
        ],
        ...overrides,
    };
}

test('every board file is valid and registered under its file name', () => {
    assert.ok(boardFiles.length > 0);
    for (const file of boardFiles) {
        const table = JSON.parse(readFileSync(resolve(boardsDir, file), 'utf8'));
        assert.deepEqual(validateBoardPinTable(table), [], `${file} should be valid`);
        assert.equal(`${table.id}.json`, file, `${file} id should match its file name`);
        assert.deepEqual(BOARD_PIN_TABLES[table.id], table, `${file} should be registered in board-pins.js`);
    }
});

test('every Auto Wire controller in the catalog is generated from a board file', () => {
    const controllers = Object.values(componentLibrary).filter(definition => definition.autoWirePins);
    assert.ok(controllers.length >= 6);
    for (const definition of controllers) {
        const table = BOARD_PIN_TABLES[definition.id];
        assert.ok(table, `${definition.id} needs src/boards/${definition.id}.json`);
        assert.deepEqual(definition.autoWirePins, deriveAutoWirePins(table));
    }
    for (const id of Object.keys(BOARD_PIN_TABLES)) {
        assert.ok(getComponentDef(id)?.autoWirePins, `board file ${id} has no matching catalog controller`);
    }
});

test('derived Uno inventory keeps the lists the engines rely on', () => {
    const uno = getComponentDef('arduino-uno');
    assert.deepEqual(uno.autoWirePins.digital, ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13']);
    assert.deepEqual(uno.autoWirePins.pwm, ['3', '5', '6', '9', '10', '11']);
    assert.deepEqual(uno.autoWirePins.i2c, { sda: 'A4', scl: 'A5' });
    assert.equal(uno.autoWirePins.power[0], '5V');
    assert.deepEqual(uno.autoWirePins.uart, { rx: ['0'], tx: ['1'] });
    assert.deepEqual(uno.autoWirePins.constraints['0'], [{ type: 'serial_reserved', severity: 'warning' }]);
    assert.equal(uno.pinExitOverride['13'], 'up');
    assert.equal(uno.pinExitOverride.A0, 'down');
    assert.equal(uno.pinExitOverride.RESET, 'down');
});

test('3.3 V boards list their 3.3 V rail as the Auto Wire supply', () => {
    for (const id of Object.keys(BOARD_PIN_TABLES)) {
        const pins = getComponentDef(id).autoWirePins;
        if (pins.logicVoltage === 3.3) assert.match(pins.power[0], /3/, `${id} should supply 3.3 V first`);
    }
});

test('derivePinExitOverride returns null when no pin sets an exit', () => {
    assert.equal(derivePinExitOverride(validTable()), null);
});

test('validateBoardPinTable reports authoring mistakes', () => {
    const cases = [
        [validTable({ format: 'other' }), /format/],
        [validTable({ logicVoltage: 0 }), /logicVoltage/],
        [validTable({ pins: [] }), /non-empty/],
        [validTable({ pins: [...validTable().pins, { name: 'D2', capabilities: [] }] }), /more than once/],
        [validTable({ pins: [...validTable().pins, { name: 'D3', capabilities: ['spi'] }] }), /unknown capability/],
        [validTable({ pins: [...validTable().pins, { name: 'D3', capabilities: [], exit: 'north' }] }), /unknown exit/],
        [validTable({ pins: [...validTable().pins, { name: 'D3', capabilities: ['i2c_sda'] }] }), /Only one pin may have i2c_sda/],
        [validTable({ pins: [...validTable().pins, { name: 'D3', capabilities: [], constraints: [{ type: 'x', severity: 'info' }] }] }), /severity/],
        [validTable({ pins: validTable().pins.filter(pin => pin.name !== 'GND') }), /ground/],
    ];
    for (const [table, pattern] of cases) {
        const errors = validateBoardPinTable(table);
        assert.ok(errors.some(error => pattern.test(error)), `expected ${pattern} in ${JSON.stringify(errors)}`);
    }
    assert.throws(() => deriveAutoWirePins(validTable({ format: 'other' })), /Invalid board pin table/);
});

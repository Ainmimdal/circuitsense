/**
 * Controller board pin tables.
 *
 * Each supported controller has one data file in `src/boards/<id>.json` with
 * a row per physical pin. The row is the single place that says what a pin
 * can do, which constraints apply to it and which way its wire leaves the
 * board. The engines still consume the older `autoWirePins` shape (lists per
 * role), so this module derives that shape and `pinExitOverride` from the
 * table instead of having them written by hand.
 */

import arduinoUno from '../boards/arduino-uno.json' with { type: 'json' };
import arduinoNano from '../boards/arduino-nano.json' with { type: 'json' };
import arduinoMega from '../boards/arduino-mega.json' with { type: 'json' };
import nanoRp2040Connect from '../boards/nano-rp2040-connect.json' with { type: 'json' };
import esp32DevkitV1 from '../boards/esp32-devkit-v1.json' with { type: 'json' };
import franzininho from '../boards/franzininho.json' with { type: 'json' };

export const BOARD_PIN_FORMAT = 'elera-board-pins-v1';

// Capability tokens used in board files. `digital` means a general-purpose
// pin that Auto Wire may hand out for digital signals; UART pins are left out
// of it on purpose so they are only used when nothing else is free.
export const BOARD_PIN_CAPABILITIES = Object.freeze([
    'digital', 'pwm', 'analog', 'i2c_sda', 'i2c_scl', 'uart_rx', 'uart_tx', 'power', 'ground',
]);

export const BOARD_PIN_EXITS = Object.freeze(['up', 'down', 'left', 'right']);

const CONSTRAINT_SEVERITIES = ['warning', 'error'];

/**
 * Check a board pin table and return a list of problems. An empty list means
 * the table is valid.
 */
export function validateBoardPinTable(table) {
    const errors = [];
    if (!table || typeof table !== 'object') return ['Board pin table must be an object.'];
    if (table.format !== BOARD_PIN_FORMAT) errors.push(`format must be "${BOARD_PIN_FORMAT}".`);
    if (typeof table.id !== 'string' || !table.id) errors.push('id must be a non-empty string.');
    for (const field of ['logicVoltage', 'maxCurrent_mA', 'pinMaxCurrent_mA']) {
        if (!(Number(table[field]) > 0)) errors.push(`${field} must be a positive number.`);
    }
    if (!Array.isArray(table.pins) || !table.pins.length) {
        errors.push('pins must be a non-empty array.');
        return errors;
    }

    const seen = new Set();
    const counts = Object.fromEntries(BOARD_PIN_CAPABILITIES.map(capability => [capability, 0]));
    for (const [index, pin] of table.pins.entries()) {
        const label = typeof pin?.name === 'string' && pin.name ? `pin ${pin.name}` : `pins[${index}]`;
        if (typeof pin?.name !== 'string' || !pin.name) {
            errors.push(`${label} needs a non-empty name.`);
            continue;
        }
        if (seen.has(pin.name)) errors.push(`${label} is listed more than once.`);
        seen.add(pin.name);
        if (!Array.isArray(pin.capabilities)) {
            errors.push(`${label} needs a capabilities array.`);
        } else {
            for (const capability of pin.capabilities) {
                if (!BOARD_PIN_CAPABILITIES.includes(capability)) errors.push(`${label} has unknown capability "${capability}".`);
                else counts[capability] += 1;
            }
        }
        if (pin.exit !== undefined && !BOARD_PIN_EXITS.includes(pin.exit)) {
            errors.push(`${label} has unknown exit "${pin.exit}".`);
        }
        for (const constraint of pin.constraints || []) {
            if (typeof constraint?.type !== 'string' || !constraint.type) errors.push(`${label} has a constraint without a type.`);
            if (!CONSTRAINT_SEVERITIES.includes(constraint?.severity)) {
                errors.push(`${label} constraint severity must be "warning" or "error".`);
            }
        }
    }
    for (const capability of ['i2c_sda', 'i2c_scl']) {
        if (counts[capability] > 1) errors.push(`Only one pin may have ${capability}.`);
    }
    if (counts.power === 0) errors.push('At least one pin needs the power capability.');
    if (counts.ground === 0) errors.push('At least one pin needs the ground capability.');
    return errors;
}

function pinsWith(table, capability) {
    return table.pins.filter(pin => pin.capabilities.includes(capability)).map(pin => pin.name);
}

/**
 * Derive the `autoWirePins` inventory the engines read. Lists keep the
 * table's row order; `power[0]` is the supply Auto Wire uses, so the board's
 * main logic supply should be the first power row.
 */
export function deriveAutoWirePins(table) {
    const errors = validateBoardPinTable(table);
    if (errors.length) throw new TypeError(`Invalid board pin table ${table?.id || ''}: ${errors.join(' ')}`);
    const constraints = Object.fromEntries(table.pins
        .filter(pin => pin.constraints?.length)
        .map(pin => [pin.name, pin.constraints.map(constraint => ({ ...constraint }))]));
    const sda = pinsWith(table, 'i2c_sda')[0];
    const scl = pinsWith(table, 'i2c_scl')[0];
    return {
        logicVoltage: table.logicVoltage,
        digital: pinsWith(table, 'digital'),
        pwm: pinsWith(table, 'pwm'),
        analog: pinsWith(table, 'analog'),
        i2c: sda || scl ? { sda: sda || null, scl: scl || null } : null,
        power: pinsWith(table, 'power'),
        ground: pinsWith(table, 'ground'),
        uart: { rx: pinsWith(table, 'uart_rx'), tx: pinsWith(table, 'uart_tx') },
        constraints,
        maxCurrent_mA: table.maxCurrent_mA,
        pinMaxCurrent_mA: table.pinMaxCurrent_mA,
    };
}

/** Derive the routing exit-direction map, or null when no row sets one. */
export function derivePinExitOverride(table) {
    const entries = table.pins.filter(pin => pin.exit).map(pin => [pin.name, pin.exit]);
    return entries.length ? Object.fromEntries(entries) : null;
}

export const BOARD_PIN_TABLES = Object.freeze(Object.fromEntries(
    [arduinoUno, arduinoNano, arduinoMega, nanoRp2040Connect, esp32DevkitV1, franzininho]
        .map(table => [table.id, table]),
));

export function getBoardPinTable(id) {
    return BOARD_PIN_TABLES[id] || null;
}

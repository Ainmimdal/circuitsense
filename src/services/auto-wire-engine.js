/**
 * Auto-Wire Engine — Automatically connects a component's pins to the
 * Arduino board using smart pin assignment rules.
 *
 * Usage:  autoWire(instanceId)  →  creates wires in the store
 *
 * Rules:
 *   VCC  → Arduino 5V
 *   GND  → Arduino GND.1 (or next free GND)
 *   DIGITAL / SIGNAL / TRIGGER / ECHO / DATA → next free digital pin (2–13)
 *   PWM  → next free PWM pin (3,5,6,9,10,11)
 *   ANALOG → next free analog pin (A0–A5, but not A4/A5 if I2C used)
 *   I2C_SDA → A4
 *   I2C_SCL → A5
 *
 * "Free" = not already used by an existing wire in the store.
 */

import { store } from '../store.js';
import { getComponentDef, ARDUINO_PINS, PIN } from '../component-library.js';

/**
 * Auto-wire every eligible component on the canvas.
 * @returns {{ total: number, success: number, errors: string[] }}
 */
export function autoWireAll() {
    const eligible = store.instances.filter(inst => {
        const def = getComponentDef(inst.componentId);
        return def && !def.isBoard && def.autoWire;
    });

    if (eligible.length === 0) {
        return { total: 0, success: 0, errors: ['No components to auto-wire.'] };
    }

    let success = 0;
    const allErrors = [];

    for (const inst of eligible) {
        const result = autoWire(inst.id);
        success += result.wired.length;
        allErrors.push(...result.errors.map(e => inst.id + ': ' + e));
    }

    store.commitAutoWire();

    return {
        total: eligible.length,
        success,
        errors: allErrors,
    };
}

/**
 * Auto-wire a component to the first Arduino board on the canvas.
 * @param {string} instanceId — the component instance to wire
 * @returns {{ success: boolean, wired: string[], errors: string[] }}
 */
export function autoWire(instanceId) {
    const inst = store.getInstance(instanceId);
    if (!inst) return { success: false, wired: [], errors: ['Instance not found.'] };

    const def = getComponentDef(inst.componentId);
    if (!def) return { success: false, wired: [], errors: ['Unknown component type.'] };
    if (def.isBoard) return { success: false, wired: [], errors: ['Cannot auto-wire a board.'] };
    if (!def.autoWire) return { success: false, wired: [], errors: ['No auto-wire rules for this component.'] };

    // Find Arduino board
    const board = store.instances.find(i => {
        const d = getComponentDef(i.componentId);
        return d && d.isBoard;
    });
    if (!board) return { success: false, wired: [], errors: ['No Arduino board on the canvas. Add one first.'] };

    // Strip existing wires on this component's auto-wireable pins before re-wiring
    const autoPins = new Set(Object.keys(def.autoWire));
    store.wires = store.wires.filter(w => {
        if (w.from.instanceId === instanceId && autoPins.has(w.from.pinName)) return false;
        if (w.to.instanceId === instanceId && autoPins.has(w.to.pinName)) return false;
        return true;
    });

    // Build set of used Arduino pins (now that old wires are removed)
    const usedPins = _getUsedArduinoPins(board.id);

    // Check which I2C pins are reserved
    const i2cInUse = _isI2cInUse(board.id);

    const wired = [];
    const errors = [];

    // Process each pin from the autoWire rules
    for (const [pinName, needType] of Object.entries(def.autoWire)) {
        const sourcePos = store.getPinAbsolutePosition(instanceId, pinName);
        const arduinoPin = _pickArduinoPin(needType, usedPins, i2cInUse, def.avoidPins || [], sourcePos, board.id);
        if (!arduinoPin) {
            errors.push('No free Arduino pin for ' + pinName + ' (' + needType + ')');
            continue;
        }

        // Mark as used
        usedPins.add(arduinoPin);

        // Create wire in store
        store.completeWiringDirect(
            instanceId, pinName,
            board.id, arduinoPin
        );

        wired.push(pinName + ' \u2192 ' + arduinoPin);
    }

    return {
        success: errors.length === 0,
        wired,
        errors,
    };
}

// ─── Helpers ───────────────────────────────────────────

/**
 * Get all Arduino pins that already have wires.
 */
function _getUsedArduinoPins(boardInstanceId) {
    const used = new Set();
    for (const w of store.wires) {
        if (w.from.instanceId === boardInstanceId) used.add(w.from.pinName);
        if (w.to.instanceId === boardInstanceId) used.add(w.to.pinName);
    }
    return used;
}

/**
 * Check if any I2C device is wired (so we reserve A4/A5).
 */
function _isI2cInUse(boardInstanceId) {
    const used = _getUsedArduinoPins(boardInstanceId);
    return used.has('A4') || used.has('A5');
}

/**
 * Pick the best free Arduino pin for a given requirement type.
 */
function _pickArduinoPin(needType, usedPins, i2cInUse, avoidPins, sourcePos, boardId) {
    const avoid = new Set(avoidPins);
    const isFree = (pin) => !usedPins.has(pin) && !avoid.has(pin);

    const getClosest = (candidates) => {
        const freePins = candidates.filter(isFree);
        if (freePins.length === 0) return null;
        if (!sourcePos) return freePins[0];

        let minDistance = Infinity;
        let bestPin = freePins[0];

        for (const pin of freePins) {
            const targetPos = store.getPinAbsolutePosition(boardId, pin);
            if (!targetPos) continue;
            const dist = Math.hypot(targetPos.x - sourcePos.x, targetPos.y - sourcePos.y);
            if (dist < minDistance) {
                minDistance = dist;
                bestPin = pin;
            }
        }
        return bestPin;
    };

    switch (needType) {
        case PIN.VCC:
            // Prefer 5V, fall back to 3.3V
            if (isFree('5V')) return '5V';
            if (isFree('3.3V')) return '3.3V';
            // Power pins can be shared — just return 5V
            return '5V';

        case PIN.GND:
            const freeGND = getClosest(ARDUINO_PINS.ground);
            return freeGND || ARDUINO_PINS.ground[0]; // Share if full

        case PIN.PWM:
            return getClosest(ARDUINO_PINS.pwm);

        case PIN.DIGITAL:
        case PIN.SIGNAL:
        case PIN.TRIGGER:
        case PIN.ECHO:
        case PIN.DATA:
            return getClosest(ARDUINO_PINS.digital);

        case PIN.ANALOG:
            const analogPins = ARDUINO_PINS.analog.filter(p => {
                if ((p === 'A4' || p === 'A5') && i2cInUse) return false;
                return true;
            });
            return getClosest(analogPins);

        case PIN.I2C_SDA:
            return 'A4';

        case PIN.I2C_SCL:
            return 'A5';

        default:
            // Fallback: try any digital
            return getClosest(ARDUINO_PINS.digital);
    }
}
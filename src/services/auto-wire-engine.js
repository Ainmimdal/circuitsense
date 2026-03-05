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

    // Build set of used Arduino pins
    const usedPins = _getUsedArduinoPins(board.id);

    // Check which I2C pins are reserved
    const i2cInUse = _isI2cInUse(board.id);

    const wired = [];
    const errors = [];

    // Process each pin from the autoWire rules
    for (const [pinName, needType] of Object.entries(def.autoWire)) {
        // Skip if this component pin already has a wire
        const existingWires = store.wires.filter(
            w => (w.from.instanceId === instanceId && w.from.pinName === pinName) ||
            (w.to.instanceId === instanceId && w.to.pinName === pinName)
        );
        if (existingWires.length > 0) {
            wired.push(pinName + ' (already wired)');
            continue;
        }

        const arduinoPin = _pickArduinoPin(needType, usedPins, i2cInUse, def.avoidPins || []);
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
function _pickArduinoPin(needType, usedPins, i2cInUse, avoidPins) {
    const avoid = new Set(avoidPins);

    const isFree = (pin) => !usedPins.has(pin) && !avoid.has(pin);

    switch (needType) {
        case PIN.VCC:
            // Prefer 5V, fall back to 3.3V
            if (isFree('5V')) return '5V';
            if (isFree('3.3V')) return '3.3V';
            // Power pins can be shared — just return 5V
            return '5V';

        case PIN.GND:
            // Multiple GND pins available
            for (const g of ARDUINO_PINS.ground) {
                if (isFree(g)) return g;
            }
            // GND can be shared too
            return ARDUINO_PINS.ground[0];

        case PIN.PWM:
            for (const p of ARDUINO_PINS.pwm) {
                if (isFree(p)) return p;
            }
            return null;

        case PIN.DIGITAL:
        case PIN.SIGNAL:
        case PIN.TRIGGER:
        case PIN.ECHO:
        case PIN.DATA:
            for (const p of ARDUINO_PINS.digital) {
                if (isFree(p)) return p;
            }
            return null;

        case PIN.ANALOG:
            for (const p of ARDUINO_PINS.analog) {
                if (p === 'A4' || p === 'A5') {
                    if (i2cInUse) continue; // reserved for I2C
                }
                if (isFree(p)) return p;
            }
            return null;

        case PIN.I2C_SDA:
            return 'A4';

        case PIN.I2C_SCL:
            return 'A5';

        default:
            // Fallback: try any digital
            for (const p of ARDUINO_PINS.digital) {
                if (isFree(p)) return p;
            }
            return null;
    }
}
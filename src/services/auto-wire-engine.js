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
 *
 * Feature: if a component has needsResistor: true (e.g. LED), the engine
 * automatically places and wires a 220Ω resistor in series between the
 * Arduino digital pin and the component's signal pin.
 */

import { store } from '../store.js';
import { getComponentDef, ARDUINO_PINS, PIN } from '../component-library.js';
import { clearRoutingCache } from './routing-engine.js';

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
 * Auto-Layout Engine — Smartly arranges components into Top/Bottom rows
 * based on Arduino connectivity, aligns series resistors vertically, 
 * and routes wires perfectly straight where possible.
 */
export async function autoLayoutAll() {
    clearRoutingCache();
    // 1. Ensure auto-wiring is done to establish logical connections
    autoWireAll();

    const board = store.instances.find(i => getComponentDef(i.componentId)?.isBoard);
    if (!board) return;

    const topRow = [];
    const bottomRow = [];
    const resistors = new Map(); // compId -> resistorInstance

    // Helper to check if a pin is a top header pin on Arduino Uno
    const isTopPin = (pinName) => {
        if (pinName.startsWith('GND') || pinName === 'AREF') return true;
        const num = parseInt(pinName, 10);
        return !isNaN(num) && num >= 0 && num <= 13;
    };

    // Find all primary components and map their series resistors
    for (const inst of store.instances) {
        if (inst.id === board.id) continue;
        const def = getComponentDef(inst.componentId);
        
        if (def.id === 'resistor') {
            const wires = store.wires.filter(w => w.from.instanceId === inst.id || w.to.instanceId === inst.id);
            const otherCompWire = wires.find(w => w.from.instanceId !== board.id && w.to.instanceId !== board.id);
            if (otherCompWire) {
                const primaryId = otherCompWire.from.instanceId === inst.id ? otherCompWire.to.instanceId : otherCompWire.from.instanceId;
                resistors.set(primaryId, inst);
            }
            continue; 
        }

        let topCount = 0;
        let botCount = 0;
        
        const connectedWires = store.wires.filter(w => 
            w.from.instanceId === inst.id || w.to.instanceId === inst.id
        );
        
        // Also count wires connected to its series resistor
        const myResistor = resistors.get(inst.id);
        if (myResistor) {
            connectedWires.push(...store.wires.filter(w => w.from.instanceId === myResistor.id || w.to.instanceId === myResistor.id));
        }

        for (const w of connectedWires) {
            let boardPin = null;
            if (w.from.instanceId === board.id) boardPin = w.from.pinName;
            if (w.to.instanceId === board.id) boardPin = w.to.pinName;
            
            if (boardPin) {
                if (isTopPin(boardPin)) topCount++;
                else botCount++;
            }
        }

        if (topCount >= botCount) topRow.push(inst);
        else bottomRow.push(inst);
    }

    // Helper to compute target X for sorting and placement
    const getTargetX = (inst, res) => {
        let wireToArduino = null;
        if (res) {
            wireToArduino = store.wires.find(w => 
                (w.from.instanceId === board.id && w.to.instanceId === res.id) ||
                (w.to.instanceId === board.id && w.from.instanceId === res.id)
            );
        }
        if (!wireToArduino) {
            wireToArduino = store.wires.find(w => 
                (w.from.instanceId === board.id && w.to.instanceId === inst.id) ||
                (w.to.instanceId === board.id && w.from.instanceId === inst.id)
            );
        }
        if (wireToArduino) {
            const arduinoPinName = wireToArduino.from.instanceId === board.id ? wireToArduino.from.pinName : wireToArduino.to.pinName;
            const arduinoPinAbs = store.getPinAbsolutePosition(board.id, arduinoPinName);
            if (arduinoPinAbs) return arduinoPinAbs.x;
        }
        return board.x; // default fallback
    };

    const placeRow = (rowInsts, startX, startY, isTopRow) => {
        // Pre-compute targetX and sort them so they are placed in physical order matching the Arduino pins
        const sortedInsts = rowInsts.map(inst => {
            const res = resistors.get(inst.id);
            return { inst, res, targetX: getTargetX(inst, res) };
        }).sort((a, b) => a.targetX - b.targetX);

        let currentX = startX;
        for (const item of sortedInsts) {
            const { inst, res, targetX } = item;
            const def = getComponentDef(inst.componentId);
            
            // 2. Find local offset of the component's signal pin
            let pinOffset = (def.size?.width || 80) / 2;
            
            // Prioritize the wire connected to the resistor for alignment
            let alignWire = null;
            if (res) {
                alignWire = store.wires.find(w => 
                    (w.from.instanceId === inst.id && w.to.instanceId === res.id) ||
                    (w.to.instanceId === inst.id && w.from.instanceId === res.id)
                );
            }
            if (!alignWire) {
                alignWire = store.wires.find(w => 
                    (w.from.instanceId === inst.id && w.to.instanceId === board.id) ||
                    (w.to.instanceId === inst.id && w.from.instanceId === board.id)
                );
            }

            if (alignWire) {
                const compPinName = alignWire.from.instanceId === inst.id ? alignWire.from.pinName : alignWire.to.pinName;
                const pinInfo = store.pinInfoMap.get(inst.id);
                const resolvedName = store.resolvePinName(pinInfo, compPinName);
                const pin = pinInfo?.find(p => p.name === resolvedName);
                if (pin) pinOffset = pin.x;
            }
            
            // 3. Place component so its signal pin perfectly aligns with the Arduino pin
            inst.x = targetX - pinOffset;
            inst.y = store.snapToGrid(startY);
            
            // Enforce minimum X to prevent overlapping components if they connect to adjacent pins
            if (inst.x < currentX) {
                inst.x = store.snapToGrid(currentX);
            }
            
            if (res) {
                res.rotation = 90; // Vertical
                res.y = isTopRow ? inst.y + (def.size?.height || 60) + 60 : inst.y - 120;
                
                // We want the resistor's pin to perfectly align with the component's signal pin.
                // Because SVG internal pin.y offsets can shift the horizontal position when rotated, 
                // we temporarily place res at x=0, measure the absolute pin X, and shift by the difference.
                res.x = 0;
                
                let aligned = false;
                if (alignWire) {
                    const resPinName = alignWire.from.instanceId === res.id ? alignWire.from.pinName : alignWire.to.pinName;
                    const targetAbsX = inst.x + pinOffset;
                    
                    const tempPinAbs = store.getPinAbsolutePosition(res.id, resPinName);
                    if (tempPinAbs) {
                        res.x = targetAbsX - tempPinAbs.x;
                        aligned = true;
                    }
                }
                
                // Fallback if pinInfo is not ready or wire not found
                if (!aligned) {
                    const resWidth = getComponentDef(res.componentId)?.size?.width || 110;
                    res.x = inst.x + pinOffset - (resWidth / 2);
                }
                currentX = inst.x + (def.size?.width || 80) + 60; 
            } else {
                currentX = inst.x + (def.size?.width || 80) + 40;
            }
        }
    };
    
    // Place components in rows
    // Top Row: components that need to be above the Arduino (e.g. LED)
    // Start them higher up to give plenty of room for wires and resistors
    placeRow(topRow, board.x, board.y - 250, true);
    
    // Bottom Row: components that need to be below
    placeRow(bottomRow, board.x, board.y + 250, false);

    store._pushHistory();
    store._notifyStructural();

    // Trigger wire route cleanup using the new optimal positions
    await store.cleanupWires();
}

/**
 * Auto-wire a component to the first Arduino board on the canvas.
 * @param {string} instanceId — the component instance to wire
 * @returns {{ success: boolean, wired: string[], errors: string[], added: string[] }}
 */
export function autoWire(instanceId) {
    const inst = store.getInstance(instanceId);
    if (!inst) return { success: false, wired: [], errors: ['Instance not found.'], added: [] };

    const def = getComponentDef(inst.componentId);
    if (!def) return { success: false, wired: [], errors: ['Unknown component type.'], added: [] };
    if (def.isBoard) return { success: false, wired: [], errors: ['Cannot auto-wire a board.'], added: [] };
    if (!def.autoWire) return { success: false, wired: [], errors: ['No auto-wire rules for this component.'], added: [] };

    // Find Arduino board
    const board = store.instances.find(i => {
        const d = getComponentDef(i.componentId);
        return d && d.isBoard;
    });
    if (!board) return { success: false, wired: [], errors: ['No Arduino board on the canvas. Add one first.'], added: [] };

    // ── Clean up old wiring before re-wiring ──
    // 1. Remove any auto-inserted helper resistors in series with this component.
    //    These survive a naive strip because the Arduino→Resistor wire doesn't
    //    touch the component's pins, leaving orphaned resistors holding Arduino pins.
    _removeOrphanedHelpers(instanceId, board.id, def);

    // 2. Strip old wires for all auto-wire pins (with proper alias resolution).
    const autoPinNames = Object.keys(def.autoWire);
    store.stripWiresForPins(instanceId, autoPinNames);

    // Build set of used Arduino pins (now that old wires + orphans are removed)
    const usedPins = _getUsedArduinoPins(board.id);

    // Check which I2C pins are reserved
    const i2cInUse = _isI2cInUse(board.id);

    const wired = [];
    const errors = [];
    const added = []; // names of auto-added helper components (e.g. resistors)

    // Resolve actual pin names from pinInfo (handles VDD vs VCC etc.)
    const pinInfo = store.pinInfoMap.get(instanceId) || [];

    // Process each pin from the autoWire rules
    for (const [pinName, needType] of Object.entries(def.autoWire)) {
        const resolvedPinName = store.resolvePinName(pinInfo, pinName);

        const sourcePos = store.getPinAbsolutePosition(instanceId, resolvedPinName);
        const arduinoPin = _pickArduinoPin(needType, usedPins, i2cInUse, def.avoidPins || [], sourcePos, board.id);
        if (!arduinoPin) {
            errors.push('No free Arduino pin for ' + pinName + ' (' + needType + ')');
            continue;
        }

        // Auto-insert resistor for components that need one (e.g. LED)
        // Only for the signal pin (not VCC/GND pins)
        if (def.needsResistor && (needType === PIN.DIGITAL || needType === PIN.PWM || needType === PIN.SIGNAL)) {
            const resistorResult = _insertResistorInSeries(
                board.id, arduinoPin,
                instanceId, resolvedPinName,
                inst, needType
            );
            if (resistorResult) {
                usedPins.add(arduinoPin);
                wired.push(pinName + ' → [R] → ' + arduinoPin);
                added.push('Resistor 220Ω');
                continue;
            }
            // If resistor insert failed, fall through to direct wire
        }

        // Mark pin as used
        usedPins.add(arduinoPin);

        // Create the wire with correct color from pin type
        store.completeWiringDirect(
            instanceId, resolvedPinName,
            board.id, arduinoPin,
            needType
        );

        wired.push(pinName + ' → ' + arduinoPin);
    }

    return {
        success: errors.length === 0,
        wired,
        errors,
        added,
    };
}

// ─── Helpers ───────────────────────────────────────────

/**
 * Remove auto-inserted helper resistors that are in series between the Arduino
 * and this component's signal pins. These become orphaned on re-auto-wire
 * because stripWiresForPins only removes wires touching the component's pins,
 * not the intermediate Arduino→Resistor wire.
 */
function _removeOrphanedHelpers(compInstanceId, boardId, compDef) {
    if (!compDef.needsResistor) return;

    // Find resistors connected in series: one pin → component, other pin → Arduino.
    // Remove them silently (no intermediate notifications) to avoid the canvas
    // rendering a half-done state before new wires are created.
    const idsToRemove = new Set();

    for (const w of store.wires) {
        const touchesComp =
            (w.from.instanceId === compInstanceId) ||
            (w.to.instanceId === compInstanceId);
        if (!touchesComp) continue;

        const otherId = w.from.instanceId === compInstanceId ? w.to.instanceId : w.from.instanceId;
        const otherInst = store.getInstance(otherId);
        if (!otherInst) continue;
        const otherDef = getComponentDef(otherInst.componentId);
        if (!otherDef || otherDef.id !== 'resistor') continue;

        const resistorWires = store.wires.filter(
            rw => (rw.from.instanceId === otherId || rw.to.instanceId === otherId) &&
                  (rw.from.instanceId === boardId || rw.to.instanceId === boardId)
        );
        if (resistorWires.length > 0) {
            idsToRemove.add(otherId);
        }
    }

    // Remove silently — no history push, no notification
    if (idsToRemove.size > 0) {
        store.instances = store.instances.filter(i => !idsToRemove.has(i.id));
        store.wires = store.wires.filter(
            w => !idsToRemove.has(w.from.instanceId) && !idsToRemove.has(w.to.instanceId)
        );
        for (const id of idsToRemove) store.pinInfoMap.delete(id);
        store.selectedInstanceIds = new Set(
            [...store.selectedInstanceIds].filter(id => !idsToRemove.has(id))
        );
    }
}

/**
 * Auto-insert a 220Ω resistor in series between an Arduino pin and a component pin.
 * Places the resistor near the component and wires:
 *   Arduino pin → Resistor pin 1 → Resistor pin 2 → Component pin
 *
 * @returns {boolean} true if successful
 */
function _insertResistorInSeries(boardId, arduinoPin, compInstanceId, compPinName, compInst, needType) {
    // Place a resistor near the component (left side, snapped to grid)
    const resistorX = store.snapToGrid(compInst.x - 130);
    const resistorY = store.snapToGrid(compInst.y);
    const resistorInst = store.addInstance('resistor', resistorX, resistorY);

    const isTopPin = (pinName) => {
        if (pinName.startsWith('GND') || pinName === 'AREF') return true;
        const num = parseInt(pinName, 10);
        return !isNaN(num) && num >= 0 && num <= 13;
    };
    const isTopRow = isTopPin(arduinoPin);

    // When a resistor is rotated 90deg, Pin '1' (left) goes to Top, Pin '2' (right) goes to Bottom.
    // Top Row (LED is above Arduino): Arduino connects to Pin '2' (Bottom), Pin '1' (Top) connects to LED.
    // Bottom Row (LED is below Arduino): Arduino connects to Pin '1' (Top), Pin '2' (Bottom) connects to LED.
    const arduinoToResPin = isTopRow ? '2' : '1';
    const resToCompPin = isTopRow ? '1' : '2';

    // Wire: Arduino pin → Resistor (signal color matches needType)
    store.completeWiringDirect(boardId, arduinoPin, resistorInst.id, arduinoToResPin, needType);

    // Wire: Resistor → Component signal pin (same color)
    store.completeWiringDirect(resistorInst.id, resToCompPin, compInstanceId, compPinName, needType);

    return true;
}

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
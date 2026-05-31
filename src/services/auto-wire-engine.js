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
    const board = store.instances.find(i => getComponentDef(i.componentId)?.isBoard);
    if (!board) return;

    const boardDef = getComponentDef(board.componentId);
    const boardSize = boardDef?.size || { width: 275, height: 200 };
    const topItems = [];
    const bottomItems = [];
    const resistors = new Map();
    const COMPONENT_GAP = 70;
    const ROW_GAP = 140;

    const isTopPin = (pinName) => {
        const exitDir = store.getPinExitDirection(board.id, pinName);
        if (exitDir === 'up') return true;
        if (exitDir === 'down') return false;
        if (pinName === 'GND.3' || pinName === 'AREF') return true;
        if (!/^\d+$/.test(pinName)) return false;
        const num = Number(pinName);
        return num >= 0 && num <= 13;
    };

    const isPowerOrGround = (pinName) => {
        const name = String(pinName).toUpperCase();
        return name.includes('VCC') || name.includes('VDD') || name.includes('VIN') ||
            name.includes('5V') || name.includes('3.3V') || name.includes('GND') ||
            name.includes('VSS');
    };

    const touches = (wire, id) => wire.from.instanceId === id || wire.to.instanceId === id;
    const otherEnd = (wire, id) => wire.from.instanceId === id ? wire.to : wire.from;
    const boardPinFromWire = (wire) => {
        if (wire.from.instanceId === board.id) return wire.from.pinName;
        if (wire.to.instanceId === board.id) return wire.to.pinName;
        return null;
    };

    // First identify series resistors before classifying components. The old
    // implementation discovered them while iterating, so components that came
    // before their helper resistor were grouped using incomplete information.
    for (const inst of store.instances) {
        const def = getComponentDef(inst.componentId);
        if (!def || def.id !== 'resistor') continue;

        const connected = store.wires.filter(w => touches(w, inst.id));
        const boardWire = connected.find(w => touches(w, board.id));
        const componentWire = connected.find(w => !touches(w, board.id));
        if (boardWire && componentWire) {
            const primary = otherEnd(componentWire, inst.id);
            if (primary.instanceId !== board.id) {
                resistors.set(primary.instanceId, inst);
            }
        }
    }

    const getPinOffsetX = (inst, pinName) => {
        const pinInfo = store.pinInfoMap.get(inst.id);
        const resolved = pinInfo ? store.resolvePinName(pinInfo, pinName) : pinName;
        const pin = pinInfo?.find(p => p.name === resolved);
        return pin ? pin.x : (getComponentDef(inst.componentId)?.size?.width || 80) / 2;
    };

    const getPrimaryConnection = (inst, res) => {
        const directWires = store.wires.filter(w => touches(w, inst.id) && touches(w, board.id));
        const resistorBoardWires = res
            ? store.wires.filter(w => touches(w, res.id) && touches(w, board.id))
            : [];
        const wires = [...directWires, ...resistorBoardWires];
        if (wires.length === 0) return null;

        const signalWire = wires.find(w => !isPowerOrGround(boardPinFromWire(w)));
        const wire = signalWire || wires[0];
        const boardPin = boardPinFromWire(wire);
        const boardPinAbs = store.getPinAbsolutePosition(board.id, boardPin);
        return {
            wire,
            boardPin,
            side: isTopPin(boardPin) ? 'top' : 'bottom',
            targetX: boardPinAbs ? boardPinAbs.x : board.x + boardSize.width / 2,
        };
    };

    const getComponentAnchorX = (inst, res, connection) => {
        let componentWire = null;
        if (res) {
            componentWire = store.wires.find(w => touches(w, inst.id) && touches(w, res.id));
        }
        if (!componentWire && connection) {
            componentWire = store.wires.find(w => touches(w, inst.id) && touches(w, board.id));
        }
        if (!componentWire) return (getComponentDef(inst.componentId)?.size?.width || 80) / 2;

        const compPin = componentWire.from.instanceId === inst.id
            ? componentWire.from.pinName
            : componentWire.to.pinName;
        return getPinOffsetX(inst, compPin);
    };

    for (const inst of store.instances) {
        if (inst.id === board.id) continue;
        const def = getComponentDef(inst.componentId);
        if (!def || def.id === 'resistor') continue;

        let topCount = 0;
        let botCount = 0;
        const res = resistors.get(inst.id);
        const directWires = store.wires.filter(w => touches(w, inst.id) && touches(w, board.id));
        const resistorBoardWires = res
            ? store.wires.filter(w => touches(w, res.id) && touches(w, board.id))
            : [];

        for (const w of [...directWires, ...resistorBoardWires]) {
            const boardPin = boardPinFromWire(w);
            if (!boardPin) continue;
            if (isTopPin(boardPin)) topCount++;
            else botCount++;
        }

        const connection = getPrimaryConnection(inst, res);
        const side = connection?.side || (topCount >= botCount ? 'top' : 'bottom');
        const targetX = connection?.targetX || (board.x + boardSize.width / 2);
        const anchorX = getComponentAnchorX(inst, res, connection);
        const item = { inst, res, side, targetX, anchorX };

        if (side === 'top') topItems.push(item);
        else bottomItems.push(item);
    }

    const placeResistor = (item) => {
        const { inst, res, side } = item;
        if (!res) return;

        const def = getComponentDef(inst.componentId);
        const componentWire = store.wires.find(w => touches(w, inst.id) && touches(w, res.id));
        const compPinName = componentWire
            ? (componentWire.from.instanceId === inst.id ? componentWire.from.pinName : componentWire.to.pinName)
            : null;
        const resPinName = componentWire
            ? (componentWire.from.instanceId === res.id ? componentWire.from.pinName : componentWire.to.pinName)
            : null;

        res.rotation = 90;
        res.y = side === 'top'
            ? store.snapToGrid(inst.y + (def?.size?.height || 60) + 48)
            : store.snapToGrid(inst.y - 86);

        const targetAbsX = compPinName
            ? store.getPinAbsolutePosition(inst.id, compPinName)?.x
            : inst.x + item.anchorX;

        res.x = 0;
        const tempPinAbs = resPinName ? store.getPinAbsolutePosition(res.id, resPinName) : null;
        if (tempPinAbs && targetAbsX !== undefined) {
            res.x = store.snapToGrid(targetAbsX - tempPinAbs.x);
        } else {
            res.x = store.snapToGrid(inst.x + item.anchorX - 30);
        }
    };

    const placeRow = (items, side) => {
        const sorted = items.sort((a, b) => {
            const rankA = a.res ? 0 : 1;
            const rankB = b.res ? 0 : 1;
            if (rankA !== rankB) return rankA - rankB;
            return a.targetX - b.targetX;
        });
        let rightEdge = -Infinity;
        const topBaseline = store.snapToGrid(board.y - ROW_GAP);
        const bottomBaseline = store.snapToGrid(board.y + boardSize.height + ROW_GAP);

        for (const item of sorted) {
            const def = getComponentDef(item.inst.componentId);
            const width = def?.size?.width || 80;
            const height = def?.size?.height || 60;
            const desiredX = store.snapToGrid(item.targetX - item.anchorX);
            item.inst.x = store.snapToGrid(Math.max(desiredX, rightEdge + COMPONENT_GAP));
            item.inst.y = side === 'top'
                ? store.snapToGrid(topBaseline - height)
                : bottomBaseline;

            placeResistor(item);
            rightEdge = Math.max(rightEdge, item.inst.x + width);
        }
    };

    placeRow(topItems, 'top');
    placeRow(bottomItems, 'bottom');

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
        const exitDir = store.getPinExitDirection(boardId, pinName);
        if (exitDir === 'up') return true;
        if (exitDir === 'down') return false;
        if (pinName === 'GND.3' || pinName === 'AREF') return true;
        if (!/^\d+$/.test(pinName)) return false;
        const num = Number(pinName);
        return num >= 0 && num <= 13;
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

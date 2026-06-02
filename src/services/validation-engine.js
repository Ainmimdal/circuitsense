/**
 * Validation Engine — Analyzes the circuit and returns errors & warnings.
 *
 * Runs against store.instances + store.wires + store.pinInfoMap.
 * Returns { errors: [...], warnings: [...] } where each item is:
 *   { id, severity, message, instanceId?, pinName?, relatedIds? }
 */

import { store } from '../store.js';
import { componentLibrary, getComponentDef, ARDUINO_PINS, PIN } from '../component-library.js';

// Severity constants
export const SEV = { ERROR: 'error', WARNING: 'warning', INFO: 'info' };

/**
 * Run all validation rules and return combined results.
 * @returns {{ errors: Array, warnings: Array }}
 */
export function validateCircuit() {
    const results = [];

    // Build helper data structures once
    const ctx = _buildContext();

    // Run rules
    _ruleNoBoard(ctx, results);
    _ruleLedWithoutResistor(ctx, results);
    _ruleCurrentOverload(ctx, results);
    _ruleDuplicatePinAssignment(ctx, results);
    _ruleServoOnSerial(ctx, results);
    _ruleMissingPowerOrGround(ctx, results);
    _ruleI2cWrongPins(ctx, results);
    _ruleUnconnectedComponent(ctx, results);
    _ruleFloatingPin(ctx, results);

    const errors = results.filter(r => r.severity === SEV.ERROR);
    const warnings = results.filter(r => r.severity === SEV.WARNING);
    const info = results.filter(r => r.severity === SEV.INFO);

    return { errors, warnings, info, all: results };
}

// ─── Build context ────────────────────────────────────
function _buildContext() {
    const instances = store.instances;
    const wires = store.wires;

    // Find the Arduino board instance(s)
    const boards = instances.filter(inst => {
        const def = getComponentDef(inst.componentId);
        return def && def.isBoard;
    });

    // Map instanceId+pinName → list of wires touching that pin
    const pinWireMap = new Map(); // key: "instId:pinName" → [wire]
    for (const w of wires) {
        const fk = w.from.instanceId + ':' + w.from.pinName;
        const tk = w.to.instanceId + ':' + w.to.pinName;
        if (!pinWireMap.has(fk)) pinWireMap.set(fk, []);
        if (!pinWireMap.has(tk)) pinWireMap.set(tk, []);
        pinWireMap.get(fk).push(w);
        pinWireMap.get(tk).push(w);
    }

    // Map instanceId → set of connected instanceIds
    const connectionMap = new Map();
    for (const w of wires) {
        if (!connectionMap.has(w.from.instanceId)) connectionMap.set(w.from.instanceId, new Set());
        if (!connectionMap.has(w.to.instanceId)) connectionMap.set(w.to.instanceId, new Set());
        connectionMap.get(w.from.instanceId).add(w.to.instanceId);
        connectionMap.get(w.to.instanceId).add(w.from.instanceId);
    }

    // Which Arduino pins are used (for duplicate detection)
    // key: board instanceId + ':' + pinName → [{ instanceId, pinName, wireId }]
    const arduinoPinUsage = new Map();
    for (const w of wires) {
        for (const end of[w.from, w.to]) {
            const inst = instances.find(i => i.id === end.instanceId);
            if (inst) {
                const def = getComponentDef(inst.componentId);
                if (def && def.isBoard) {
                    const key = end.instanceId + ':' + end.pinName;
                    if (!arduinoPinUsage.has(key)) arduinoPinUsage.set(key, []);
                    // Find the OTHER end of this wire
                    const other = (end === w.from) ? w.to : w.from;
                    arduinoPinUsage.get(key).push({
                        instanceId: other.instanceId,
                        pinName: other.pinName,
                        wireId: w.id,
                    });
                }
            }
        }
    }

    return { instances, wires, boards, pinWireMap, connectionMap, arduinoPinUsage };
}

// ─── Helper: check if an instance is connected to any other instance ──
function _getWiresForPin(ctx, instanceId, pinName) {
    const key = instanceId + ':' + pinName;
    return ctx.pinWireMap.get(key) || [];
}

function _getPinGroup(def, pinName) {
    const group = def.pinGroups?.find(pins => pins.includes(pinName));
    return group || [pinName];
}

function _isConnectedToBoard(ctx, instanceId) {
    // Check if instance is connected (directly or through chain) to a board
    if (ctx.boards.length === 0) return false;
    const boardIds = new Set(ctx.boards.map(b => b.id));

    // BFS
    const visited = new Set();
    const queue = [instanceId];
    while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current)) continue;
        visited.add(current);
        if (boardIds.has(current)) return true;
        const neighbors = ctx.connectionMap.get(current);
        if (neighbors) {
            for (const n of neighbors) {
                if (!visited.has(n)) queue.push(n);
            }
        }
    }
    return false;
}

// Helper: get the other end of a wire given one end
function _otherEnd(wire, instanceId, pinName) {
    if (wire.from.instanceId === instanceId && wire.from.pinName === pinName) {
        return wire.to;
    }
    return wire.from;
}

// Helper: check if an LED's anode is connected to a resistor
function _ledHasResistor(ctx, ledInstanceId) {
    // Check anode (pin A) connections — trace the chain for a resistor
    const visited = new Set();
    const queue = [{ instanceId: ledInstanceId, pinName: 'A' }];

    while (queue.length > 0) {
        const { instanceId, pinName } = queue.shift();
        const key = instanceId + ':' + pinName;
        if (visited.has(key)) continue;
        visited.add(key);

        const wires = _getWiresForPin(ctx, instanceId, pinName);
        for (const w of wires) {
            const other = _otherEnd(w, instanceId, pinName);
            const otherInst = ctx.instances.find(i => i.id === other.instanceId);
            if (!otherInst) continue;
            const otherDef = getComponentDef(otherInst.componentId);
            if (!otherDef) continue;

            // Found a resistor in the chain!
            if (otherDef.id === 'resistor') return true;

            // If it's another passive component, keep traversing
            if (otherDef.isPassive) {
                // Check the other pin of the passive component
                const otherPins = store.pinInfoMap.get(other.instanceId) || [];
                for (const p of otherPins) {
                    if (p.name !== other.pinName) {
                        queue.push({ instanceId: other.instanceId, pinName: p.name });
                    }
                }
            }
        }
    }
    return false;
}

// ─── RULES ─────────────────────────────────────────────

// 1. No board on canvas
function _ruleNoBoard(ctx, results) {
    if (ctx.boards.length === 0 && ctx.instances.length > 0) {
        results.push({
            id: 'no-board',
            severity: SEV.WARNING,
            message: 'No Arduino board on the canvas. Add an Arduino Uno to connect components.',
            icon: 'plug',
        });
    }
}

// 2. LED without current-limiting resistor
function _ruleLedWithoutResistor(ctx, results) {
    for (const inst of ctx.instances) {
        const def = getComponentDef(inst.componentId);
        if (!def || !def.needsResistor) continue;

        // Check if anode has any wires at all
        const anodeWires = _getWiresForPin(ctx, inst.id, 'A');
        if (anodeWires.length === 0) continue; // not wired yet, different rule

        if (!_ledHasResistor(ctx, inst.id)) {
            results.push({
                id: 'led-no-resistor',
                severity: SEV.ERROR,
                message: `${def.name} (${inst.id}) has no current-limiting resistor. This will burn the LED!`,
                instanceId: inst.id,
                icon: 'fire',
            });
        }
    }
}

// 3. Total current overload (> 500mA)
function _ruleCurrentOverload(ctx, results) {
    if (ctx.boards.length === 0) return;

    let totalCurrent = 0;
    for (const inst of ctx.instances) {
        const def = getComponentDef(inst.componentId);
        if (!def || def.isBoard) continue;
        if (_isConnectedToBoard(ctx, inst.id)) {
            totalCurrent += (def.currentDraw_mA || 0);
        }
    }

    if (totalCurrent > ARDUINO_PINS.maxCurrent_mA) {
        results.push({
            id: 'current-overload',
            severity: SEV.ERROR,
            message: `Total current draw is ~${totalCurrent}mA, exceeding the Arduino's ${ARDUINO_PINS.maxCurrent_mA}mA USB limit!`,
            icon: 'bolt',
        });
    } else if (totalCurrent > ARDUINO_PINS.maxCurrent_mA * 0.8) {
        results.push({
            id: 'current-high',
            severity: SEV.WARNING,
            message: `Total current draw is ~${totalCurrent}mA (${Math.round(totalCurrent / ARDUINO_PINS.maxCurrent_mA * 100)}% of USB limit). Consider external power.`,
            icon: 'bolt',
        });
    }
}

// 4. Duplicate pin assignment (two components wired to same Arduino pin for I/O)
function _ruleDuplicatePinAssignment(ctx, results) {
    for (const [key, usages] of ctx.arduinoPinUsage) {
        // Filter to signal/I-O connections (not power/GND)
        const pinName = key.split(':')[1];
        const isPower = pinName === '5V' || pinName === '3.3V';
        const isGround = pinName.startsWith('GND');

        if (isPower || isGround) continue; // multiple things can share power/GND

        if (usages.length > 1) {
            const names = usages.map(u => {
                const inst = ctx.instances.find(i => i.id === u.instanceId);
                if (!inst) return u.instanceId;
                const def = getComponentDef(inst.componentId);
                return def ? def.name : u.instanceId;
            });
            results.push({
                id: 'duplicate-pin',
                severity: SEV.ERROR,
                message: `Arduino pin ${pinName} is connected to multiple components: ${names.join(', ')}. Each I/O pin should drive one signal.`,
                icon: 'shuffle',
                relatedIds: usages.map(u => u.instanceId),
            });
        }
    }
}

// 5. Servo on serial pins (0, 1)
function _ruleServoOnSerial(ctx, results) {
    for (const [key, usages] of ctx.arduinoPinUsage) {
        const pinName = key.split(':')[1];
        if (pinName !== '0' && pinName !== '1') continue;

        for (const u of usages) {
            const inst = ctx.instances.find(i => i.id === u.instanceId);
            if (!inst) continue;
            const def = getComponentDef(inst.componentId);
            if (def && def.id === 'servo') {
                results.push({
                    id: 'servo-serial',
                    severity: SEV.WARNING,
                    message: `Servo (${inst.id}) is on pin ${pinName} which is used for Serial communication. This may cause upload/debug issues.`,
                    instanceId: inst.id,
                    icon: 'triangleExclamation',
                });
            }
        }
    }
}

// 6. Component missing power or ground connection
function _ruleMissingPowerOrGround(ctx, results) {
    if (ctx.boards.length === 0) return;

    for (const inst of ctx.instances) {
        const def = getComponentDef(inst.componentId);
        if (!def || def.isBoard || def.isPassive) continue;
        if (!def.pinMeta) continue;

        const pinEntries = Object.entries(def.pinMeta);
        const needsVCC = pinEntries.some(([, type]) => type === PIN.VCC);
        const needsGND = pinEntries.some(([, type]) => type === PIN.GND);

        if (!needsVCC && !needsGND) continue; // e.g. LED only needs signal + GND

        // Check if VCC/GND pins have wires
        if (needsVCC) {
            const vccPin = pinEntries.find(([, type]) => type === PIN.VCC);
            if (vccPin) {
                const wires = _getWiresForPin(ctx, inst.id, vccPin[0]);
                if (wires.length === 0) {
                    results.push({
                        id: 'missing-vcc',
                        severity: SEV.ERROR,
                        message: `${def.name} (${inst.id}) is missing a power (VCC) connection.`,
                        instanceId: inst.id,
                        pinName: vccPin[0],
                        icon: 'plug',
                    });
                }
            }
        }

        if (needsGND) {
            const gndPin = pinEntries.find(([, type]) => type === PIN.GND);
            if (gndPin) {
                const wires = _getWiresForPin(ctx, inst.id, gndPin[0]);
                if (wires.length === 0) {
                    results.push({
                        id: 'missing-gnd',
                        severity: SEV.WARNING,
                        message: `${def.name} (${inst.id}) is missing a ground (GND) connection.`,
                        instanceId: inst.id,
                        pinName: gndPin[0],
                        icon: 'plug',
                    });
                }
            }
        }
    }
}

// 7. I2C devices not on A4/A5
function _ruleI2cWrongPins(ctx, results) {
    for (const inst of ctx.instances) {
        const def = getComponentDef(inst.componentId);
        if (!def || !def.pinMeta) continue;

        const pinEntries = Object.entries(def.pinMeta);
        const sdaPin = pinEntries.find(([, type]) => type === PIN.I2C_SDA);
        const sclPin = pinEntries.find(([, type]) => type === PIN.I2C_SCL);

        if (!sdaPin && !sclPin) continue; // not an I2C device

        // Check SDA
        if (sdaPin) {
            const wires = _getWiresForPin(ctx, inst.id, sdaPin[0]);
            for (const w of wires) {
                const other = _otherEnd(w, inst.id, sdaPin[0]);
                const otherInst = ctx.instances.find(i => i.id === other.instanceId);
                if (otherInst) {
                    const otherDef = getComponentDef(otherInst.componentId);
                    if (otherDef && otherDef.isBoard && other.pinName !== 'A4') {
                        results.push({
                            id: 'i2c-wrong-sda',
                            severity: SEV.ERROR,
                            message: `${def.name} SDA must be connected to Arduino pin A4 (currently on ${other.pinName}).`,
                            instanceId: inst.id,
                            icon: 'locationDot',
                        });
                    }
                }
            }
        }

        // Check SCL
        if (sclPin) {
            const wires = _getWiresForPin(ctx, inst.id, sclPin[0]);
            for (const w of wires) {
                const other = _otherEnd(w, inst.id, sclPin[0]);
                const otherInst = ctx.instances.find(i => i.id === other.instanceId);
                if (otherInst) {
                    const otherDef = getComponentDef(otherInst.componentId);
                    if (otherDef && otherDef.isBoard && other.pinName !== 'A5') {
                        results.push({
                            id: 'i2c-wrong-scl',
                            severity: SEV.ERROR,
                            message: `${def.name} SCL must be connected to Arduino pin A5 (currently on ${other.pinName}).`,
                            instanceId: inst.id,
                            icon: 'locationDot',
                        });
                    }
                }
            }
        }
    }
}

// 8. Unconnected component (placed but no wires at all)
function _ruleUnconnectedComponent(ctx, results) {
    for (const inst of ctx.instances) {
        const def = getComponentDef(inst.componentId);
        if (!def || def.isBoard) continue;

        const hasAnyWire = ctx.wires.some(
            w => w.from.instanceId === inst.id || w.to.instanceId === inst.id
        );

        if (!hasAnyWire) {
            results.push({
                id: 'unconnected',
                severity: SEV.INFO,
                message: `${def.name} (${inst.id}) is not connected to anything.`,
                instanceId: inst.id,
                icon: 'link',
            });
        }
    }
}

// 9. Floating pin — component signal pin not wired
function _ruleFloatingPin(ctx, results) {
    for (const inst of ctx.instances) {
        const def = getComponentDef(inst.componentId);
        if (!def || def.isBoard || def.isPassive) continue;
        if (!def.pinMeta) continue;

        // Only check if component has at least one wire (otherwise rule 8 covers it)
        const hasAnyWire = ctx.wires.some(
            w => w.from.instanceId === inst.id || w.to.instanceId === inst.id
        );
        if (!hasAnyWire) continue;

        const checkedGroups = new Set();
        for (const [pinName, pinType] of Object.entries(def.pinMeta)) {
            // Skip NC pins
            if (pinName === 'NC') continue;
            // Skip DOUT on neopixel (optional)
            if (pinName === 'DOUT') continue;

            const pinGroup = _getPinGroup(def, pinName);
            const groupKey = pinGroup.join('|');
            if (checkedGroups.has(groupKey)) continue;
            checkedGroups.add(groupKey);

            const wires = pinGroup.flatMap(groupPin => _getWiresForPin(ctx, inst.id, groupPin));
            if (wires.length === 0) {
                // Determine severity based on pin type
                const isEssential = [PIN.VCC, PIN.GND, PIN.I2C_SDA, PIN.I2C_SCL].includes(pinType);
                const label = pinGroup.length > 1 ? pinGroup.join('/') : pinName;
                results.push({
                    id: 'floating-pin',
                    severity: isEssential ? SEV.ERROR : SEV.WARNING,
                    message: `${def.name} pin "${label}" is not connected.`,
                    instanceId: inst.id,
                    pinName,
                    icon: 'thumbtack',
                });
            }
        }
    }
}

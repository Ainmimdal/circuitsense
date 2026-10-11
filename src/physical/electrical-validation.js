/**
 * Electrical (logical) checks for the schema-4 physical project.
 *
 * These rules were ported from the legacy schema-v2 `validation-engine.js`.
 * They read the resolved connectivity graph instead of drawn wires, so a
 * connection through breadboard copper, a rail or an internal component net
 * counts the same as a direct jumper. Controller pin capabilities, constraints
 * and current limits come from the board pin tables (`src/boards/*.json`) via
 * the derived `autoWirePins` inventory and `src/core/pin-capabilities.js`.
 *
 * Partially wired circuits are a normal editing state, so incomplete wiring
 * is reported as a warning or info. Errors are reserved for wiring that is
 * unsafe or cannot work (VAL-03).
 */

import { getComponentDef, PIN } from '../component-library.js';
import {
    pinCompatibility, PIN_CAPABILITY, requiredControllerCapabilities, supplyPinVoltage,
} from '../core/pin-capabilities.js';
import { canonicalLedColor, LED_COLOR_PROFILES } from '../core/led-resistor.js';
import { componentPinRef, connectionRefKey } from './model.js';
import { getFootprintDefinition } from './footprints.js';

const SEV = Object.freeze({ ERROR: 'error', WARNING: 'warning', INFO: 'info' });

// Shared-bus roles may legally have several devices on one controller pin (VAL-06).
const BUS_ROLES = new Set([PIN.I2C_SDA, PIN.I2C_SCL]);
const SUPPLY_ROLES = new Set([PIN.VCC, PIN.GND]);
// Pins that are optional by design and never reported as floating.
const OPTIONAL_PINS = new Set(['NC', 'DOUT']);
const CURRENT_HIGH_RATIO = 0.8;
// LED current thresholds (mA): above the warning level the LED is overdriven;
// below the dim level it barely lights.
const LED_CURRENT_WARNING_mA = 25;
const LED_CURRENT_DIM_mA = 1;
// A supply is treated as above a 3.3 V board's logic level beyond this margin.
const LOGIC_VOLTAGE_MARGIN = 0.5;

const DRIVER_MESSAGES = Object.freeze({
    relay: (part, pin, board, boardPin) =>
        `${part} coil ${pin} is wired straight to ${board} pin ${boardPin}. A pin cannot power a relay coil, and the coil's voltage spike can damage the board. Drive it through a transistor with a flyback diode, or use a relay module.`,
    stepper: (part, pin, board, boardPin) =>
        `${part} coil ${pin} is wired straight to ${board} pin ${boardPin}. Pins cannot drive motor coils; connect the motor through a stepper driver such as a ULN2003 or A4988.`,
});

const CONSTRAINT_MESSAGES = Object.freeze({
    serial_reserved: (board, pin, part) =>
        `${part} is on ${board} pin ${pin}, which is shared with USB serial. Uploading and Serial Monitor may fail; move it to another pin.`,
    boot_strap: (board, pin, part) =>
        `${part} is on ${board} pin ${pin}, a boot strapping pin. The board may fail to boot or flash; move it to another pin if possible.`,
});

function issue(id, severity, message, instanceId = null, icon = null, extra = {}) {
    return { id, severity, message, instanceId, icon, ...extra };
}

function displayName(component) {
    const definition = getComponentDef(component.definitionId);
    return `${definition?.name || component.definitionId} (${component.id})`;
}

function isController(definition) {
    return Boolean(definition?.autoWirePins);
}

function isPassive(definition) {
    return Boolean(definition?.isPassive);
}

/** Electrical role of a component pin (pinMeta), e.g. VCC, GND, I2C_SDA. */
function electricalRole(definition, pinId) {
    return definition?.pinMeta?.[pinId] || null;
}

function componentPinIds(component) {
    const footprint = getFootprintDefinition(component.footprintId);
    const definition = getComponentDef(component.definitionId);
    const ids = footprint?.pins?.map(pin => pin.pinId) || Object.keys(definition?.pinMeta || {});
    return [...new Set(ids.map(String))];
}

/**
 * Index the connectivity graph once: every ref key maps to its net root, and
 * every root maps to the component pins on that net.
 */
function buildNetIndex(project, connectivity) {
    const componentsById = new Map((project.components || []).map(component => [component.id, component]));
    const pinsByRoot = new Map();
    const rootOf = ref => connectivity.graph.find(connectionRefKey(ref));
    for (const [key, ref] of connectivity.refs) {
        if (ref.type !== 'component-pin') continue;
        const component = componentsById.get(ref.componentId);
        if (!component) continue;
        const root = connectivity.graph.find(key);
        if (!pinsByRoot.has(root)) pinsByRoot.set(root, []);
        pinsByRoot.get(root).push({ component, definition: getComponentDef(component.definitionId), pinId: ref.pinId });
    }
    return {
        componentsById,
        rootOf,
        pinsOn(root) {
            return pinsByRoot.get(root) || [];
        },
        pinsWith(component, pinId) {
            return pinsByRoot.get(rootOf(componentPinRef(component.id, pinId))) || [];
        },
        roots() {
            return pinsByRoot.keys();
        },
    };
}

function otherComponents(members, componentId) {
    return members.filter(member => member.component.id !== componentId);
}

function controllerPinsIn(members) {
    return members.filter(member => isController(member.definition));
}

function isPowerPin(member) {
    return (member.definition.autoWirePins.power || []).includes(member.pinId);
}

function isGroundPin(member) {
    return (member.definition.autoWirePins.ground || []).includes(member.pinId);
}

function hasSeriesResistor(members, componentId) {
    return otherComponents(members, componentId).some(member => member.component.definitionId === 'resistor');
}

function isIoPin(member) {
    return isController(member.definition) && !isPowerPin(member) && !isGroundPin(member);
}

function boardName(member) {
    return member.definition.name || member.component.definitionId;
}

function supplyVoltageOf(member) {
    return supplyPinVoltage(member.pinId, member.definition.autoWirePins.logicVoltage);
}

function logicVoltage(member) {
    return Number(member.definition.autoWirePins.logicVoltage) || null;
}

/** Resistance in ohms from a resistor's value property ("220", "4.7k", 1000). */
function resistorOhms(component) {
    const raw = component.properties?.value ?? getComponentDef(component.definitionId)?.attrs?.value;
    const match = String(raw ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*([kKmM]?)/);
    if (!match) return null;
    const scale = { '': 1, k: 1e3, K: 1e3, m: 1e6, M: 1e6 }[match[2]];
    const ohms = Number(match[1]) * scale;
    return ohms > 0 ? ohms : null;
}

/** Pin groups a part joins internally (a push button's two legs on one side). */
function internalGroups(component) {
    const footprint = getFootprintDefinition(component.footprintId);
    const groups = footprint?.internalNets?.length
        ? footprint.internalNets.map(net => net.pins || [])
        : getComponentDef(component.definitionId)?.pinGroups || [];
    return groups.map(pins => new Set(pins.map(String)));
}

/**
 * Members on a pin's net plus, through each series resistor on that net, the
 * members on the resistor's far side. Returns the resistors crossed too.
 */
function throughResistors(index, component, pinId) {
    const direct = index.pinsWith(component, pinId);
    const resistors = new Map();
    const reached = [...direct];
    for (const member of otherComponents(direct, component.id)) {
        if (member.component.definitionId !== 'resistor' || resistors.has(member.component.id)) continue;
        resistors.set(member.component.id, member.component);
        const farPin = componentPinIds(member.component).find(id => id !== member.pinId);
        if (farPin) reached.push(...index.pinsWith(member.component, farPin));
    }
    return { direct, reached, resistors: [...resistors.values()] };
}

/** Supply voltage a part's VCC pins receive from controller supply pins, or null. */
function partSupplyVoltage(component, index) {
    const definition = getComponentDef(component.definitionId);
    const voltages = componentPinIds(component)
        .filter(pinId => electricalRole(definition, pinId) === PIN.VCC)
        .flatMap(pinId => controllerPinsIn(index.pinsWith(component, pinId)).filter(isPowerPin))
        .map(supplyVoltageOf)
        .filter(Number.isFinite);
    return voltages.length ? Math.max(...voltages) : null;
}

// ─── Rules ─────────────────────────────────────────────

/** VAL-04 current overload/high current, per controller supply budget. */
function ruleCurrentBudget(project, index, results) {
    for (const controller of project.components || []) {
        const definition = getComponentDef(controller.definitionId);
        const limit = Number(definition?.autoWirePins?.maxCurrent_mA);
        if (!isController(definition) || !(limit > 0)) continue;

        // Every non-controller part reachable from this controller's pins draws
        // from its supply, including parts wired in series through others.
        const reached = new Set();
        const visitedRoots = new Set();
        const queue = componentPinIds(controller).map(pinId => index.rootOf(componentPinRef(controller.id, pinId)));
        while (queue.length) {
            const root = queue.shift();
            if (visitedRoots.has(root)) continue;
            visitedRoots.add(root);
            for (const member of index.pinsOn(root)) {
                if (isController(member.definition) || reached.has(member.component.id)) continue;
                reached.add(member.component.id);
                for (const pinId of componentPinIds(member.component)) {
                    queue.push(index.rootOf(componentPinRef(member.component.id, pinId)));
                }
            }
        }
        const total = [...reached].reduce((sum, id) =>
            sum + Number(getComponentDef(index.componentsById.get(id).definitionId)?.currentDraw_mA || 0), 0);
        if (total > limit) {
            results.push(issue(`current-overload:${controller.id}`, SEV.ERROR,
                `Connected parts draw about ${total} mA, more than the ${limit} mA that ${displayName(controller)} can supply. Power the heavy parts from an external supply.`,
                controller.id, 'bolt', { relatedIds: [...reached] }));
        } else if (total > limit * CURRENT_HIGH_RATIO) {
            results.push(issue(`current-high:${controller.id}`, SEV.WARNING,
                `Connected parts draw about ${total} mA, ${Math.round(total / limit * 100)}% of the ${limit} mA that ${displayName(controller)} can supply. Consider an external supply.`,
                controller.id, 'bolt', { relatedIds: [...reached] }));
        }
    }
}

/**
 * VAL-04 serial/strapping conflicts and wrong signal pins (including I2C).
 * Each component signal pin that shares a net with a controller pin is
 * checked against that pin's capabilities and constraints.
 */
function ruleControllerPinCompatibility(project, index, results) {
    for (const component of project.components || []) {
        const definition = getComponentDef(component.definitionId);
        if (!definition || isController(definition) || isPassive(definition)) continue;
        for (const pinId of componentPinIds(component)) {
            if (SUPPLY_ROLES.has(electricalRole(definition, pinId))) continue;
            for (const member of controllerPinsIn(index.pinsWith(component, pinId))) {
                if (isPowerPin(member) || isGroundPin(member)) continue;
                const result = pinCompatibility(member.component, member.pinId, component, pinId);
                const board = member.definition.name || member.component.definitionId;
                // Supply requirements (a switch leg meant for VCC) belong to the supply rules.
                const signalNeeds = result.requiredCapabilities
                    .filter(capability => capability !== PIN_CAPABILITY.VCC && capability !== PIN_CAPABILITY.GND);
                if (!result.compatible && signalNeeds.length) {
                    results.push(issue(`pin-mismatch:${component.id}:${pinId}`, SEV.ERROR,
                        mismatchMessage(definition, pinId, member, result), component.id, 'locationDot',
                        { pinName: pinId, relatedIds: [member.component.id] }));
                    continue;
                }
                for (const constraint of result.warnings) {
                    const message = CONSTRAINT_MESSAGES[constraint.type]?.(board, member.pinId, displayName(component))
                        || `${displayName(component)} is on ${board} pin ${member.pinId}, which has a ${constraint.type.replace(/_/g, ' ')} restriction.`;
                    results.push(issue(`pin-constraint:${member.component.id}:${member.pinId}:${constraint.type}`,
                        SEV.WARNING, message, component.id, 'triangleExclamation',
                        { pinName: pinId, relatedIds: [member.component.id] }));
                }
            }
        }
    }
}

function mismatchMessage(definition, pinId, member, result) {
    const board = member.definition.name || member.component.definitionId;
    const part = definition.name || definition.id;
    const i2c = member.definition.autoWirePins.i2c;
    const role = electricalRole(definition, pinId);
    if (role === PIN.I2C_SDA || role === PIN.I2C_SCL) {
        const expected = role === PIN.I2C_SDA ? i2c?.sda : i2c?.scl;
        return expected
            ? `${part} ${pinId} must connect to ${board} pin ${expected} (it is on ${member.pinId}).`
            : `${board} has no hardware I2C pins for ${part} ${pinId}.`;
    }
    const missing = result.missingCapabilities;
    if (missing.includes(PIN_CAPABILITY.PWM)) return `${part} ${pinId} needs a PWM pin, but ${board} pin ${member.pinId} has no PWM.`;
    if (missing.includes(PIN_CAPABILITY.ANALOG)) return `${part} ${pinId} needs an analog input, but ${board} pin ${member.pinId} is not analog.`;
    if (missing.includes(PIN_CAPABILITY.DIGITAL_OUTPUT)) return `${part} ${pinId} needs an output pin, but ${board} pin ${member.pinId} is input-only.`;
    if (!missing.length) return `${board} pin ${member.pinId} is not a usable I/O pin for ${part} ${pinId}.`;
    return `${part} ${pinId} cannot use ${board} pin ${member.pinId}: ${result.reason}`;
}

/**
 * VAL-04/VAL-06 duplicate signal-pin use. A controller I/O pin may drive one
 * point-to-point signal; several devices on a shared I2C line are legal.
 * Passive parts (resistors, switches modeled as passive) do not count.
 */
function ruleDuplicateSignalPin(project, index, results) {
    for (const root of index.roots()) {
        const members = index.pinsOn(root);
        const controllerPins = controllerPinsIn(members).filter(member => !isPowerPin(member) && !isGroundPin(member));
        if (!controllerPins.length) continue;
        const devices = new Map();
        for (const member of members) {
            if (isController(member.definition) || isPassive(member.definition)) continue;
            const role = electricalRole(member.definition, member.pinId);
            if (BUS_ROLES.has(role) || SUPPLY_ROLES.has(role)) continue;
            devices.set(member.component.id, member.component);
        }
        if (devices.size < 2) continue;
        const pin = controllerPins[0];
        const board = pin.definition.name || pin.component.definitionId;
        results.push(issue(`duplicate-pin:${pin.component.id}:${pin.pinId}`, SEV.ERROR,
            `${board} pin ${pin.pinId} is connected to ${[...devices.values()].map(displayName).join(', ')}. Each I/O pin should carry one signal.`,
            pin.component.id, 'shuffle', { pinName: pin.pinId, relatedIds: [...devices.keys()] }));
    }
}

/** VAL-04/VAL-05 supply shorts: power to ground, or two different supply pins tied. */
function ruleSupplyShorts(project, index, results) {
    for (const root of index.roots()) {
        const controllerPins = controllerPinsIn(index.pinsOn(root));
        const power = controllerPins.filter(isPowerPin);
        const ground = controllerPins.filter(isGroundPin);
        if (power.length && ground.length) {
            results.push(issue(`power-short:${power[0].component.id}:${power[0].pinId}`, SEV.ERROR,
                `Short circuit: ${power[0].definition.name} ${power[0].pinId} is connected directly to ground.`,
                power[0].component.id, 'fire', { pinName: power[0].pinId }));
            continue;
        }
        // Two rails at the same voltage (Franzininho VCC.1/VCC.2) may be joined.
        const distinctSupplies = new Map(power.map(member => [`${member.component.id}:${member.pinId}`, member]));
        const sameBoardSupplies = [...distinctSupplies.values()].filter(member => member.component.id === power[0]?.component.id);
        if (new Set(sameBoardSupplies.map(supplyVoltageOf)).size > 1) {
            const names = sameBoardSupplies.map(member => member.pinId).join(' and ');
            results.push(issue(`supply-conflict:${power[0].component.id}:${sameBoardSupplies.map(member => member.pinId).sort().join('+')}`,
                SEV.ERROR, `${power[0].definition.name} supply pins ${names} are connected together.`,
                power[0].component.id, 'fire'));
        }
    }
}

/** VAL-04 missing or reversed VCC/GND on parts that need a supply. */
function ruleSupplyPins(project, index, results) {
    for (const component of project.components || []) {
        const definition = getComponentDef(component.definitionId);
        if (!definition || isController(definition) || isPassive(definition)) continue;
        if (!isWired(component, index)) continue;
        for (const pinId of componentPinIds(component)) {
            const role = electricalRole(definition, pinId);
            if (!SUPPLY_ROLES.has(role)) continue;
            const wantPower = role === PIN.VCC;
            const members = index.pinsWith(component, pinId);
            const others = otherComponents(members, component.id);
            const label = wantPower ? 'power (VCC)' : 'ground (GND)';
            if (!others.length) {
                results.push(issue(`missing-${wantPower ? 'vcc' : 'gnd'}:${component.id}:${pinId}`, SEV.WARNING,
                    `${displayName(component)} pin ${pinId} needs a ${label} connection.`, component.id, 'plug', { pinName: pinId }));
                continue;
            }
            const controllers = controllerPinsIn(others);
            const wrong = controllers.find(member => wantPower ? isGroundPin(member) : isPowerPin(member));
            const right = controllers.some(member => wantPower ? isPowerPin(member) : isGroundPin(member));
            if (wrong && !right) {
                results.push(issue(`reversed-supply:${component.id}:${pinId}`, SEV.ERROR,
                    `${displayName(component)} pin ${pinId} should go to ${label}, but it is connected to ${wrong.definition.name} ${wrong.pinId}.`,
                    component.id, 'fire', { pinName: pinId, relatedIds: [wrong.component.id] }));
            } else if (!right && !others.some(member => isPassive(member.definition))) {
                results.push(issue(`no-supply:${component.id}:${pinId}`, SEV.WARNING,
                    `${displayName(component)} pin ${pinId} is wired, but its net never reaches a controller ${wantPower ? 'power' : 'ground'} pin.`,
                    component.id, 'plug', { pinName: pinId }));
            }
        }
    }
}

function isWired(component, index) {
    return componentPinIds(component).some(pinId =>
        otherComponents(index.pinsWith(component, pinId), component.id).length > 0);
}

/** VAL-04 unconnected parts and floating required pins. */
function ruleUnconnectedAndFloating(project, index, results) {
    for (const component of project.components || []) {
        const definition = getComponentDef(component.definitionId);
        if (!definition || isController(definition) || definition.pinless) continue;
        const pinIds = componentPinIds(component);
        if (!pinIds.length) continue;
        if (!isWired(component, index)) {
            results.push(issue(`unconnected:${component.id}`, SEV.INFO,
                `${displayName(component)} is not connected to anything yet.`, component.id, 'link'));
            continue;
        }
        if (isPassive(definition)) continue;
        const checkedRoots = new Set();
        // Only pins with a declared role are required; spare relay contacts and
        // similar undeclared terminals may stay empty.
        for (const pinId of pinIds.filter(id => electricalRole(definition, id))) {
            const role = electricalRole(definition, pinId);
            if (OPTIONAL_PINS.has(pinId) || SUPPLY_ROLES.has(role)) continue;
            // Internally joined pins (a push button's two legs) are one terminal.
            const root = index.rootOf(componentPinRef(component.id, pinId));
            if (checkedRoots.has(root)) continue;
            checkedRoots.add(root);
            if (otherComponents(index.pinsOn(root), component.id).length) continue;
            results.push(issue(`floating-pin:${component.id}:${pinId}`, SEV.WARNING,
                `${displayName(component)} pin ${pinId} is not connected.`, component.id, 'thumbtack', { pinName: pinId }));
        }
    }
}

/**
 * VAL-04 missing current-limiting resistor. A resistor in series on either
 * side of the diode (signal pin or common/cathode pin) limits the current.
 */
function ruleLedResistor(project, index, results) {
    for (const component of project.components || []) {
        const definition = getComponentDef(component.definitionId);
        if (!definition?.needsResistor) continue;
        const pinIds = componentPinIds(component);
        const commonProtected = pinIds
            .filter(pinId => electricalRole(definition, pinId) === PIN.GND)
            .some(pinId => hasSeriesResistor(index.pinsWith(component, pinId), component.id));
        if (commonProtected) continue;
        const unprotected = pinIds.filter(pinId => {
            if (electricalRole(definition, pinId) === PIN.GND) return false;
            const members = index.pinsWith(component, pinId);
            return otherComponents(members, component.id).length > 0 && !hasSeriesResistor(members, component.id);
        });
        if (!unprotected.length) continue;
        results.push(issue(`led-no-resistor:${component.id}`, SEV.WARNING,
            `${displayName(component)} is wired without a current-limiting resistor, which can burn it out. Add a resistor (about 220 Ω) in series.`,
            component.id, 'fire', { pinName: unprotected[0] }));
    }
}

/**
 * VAL-04 controller I/O pin shorted: wired straight to a supply pin, or tied
 * to another I/O pin of the same controller. Pins of different controllers
 * may legally meet (UART, shared I2C).
 */
function ruleIoShorts(project, index, results) {
    for (const root of index.roots()) {
        const controllers = controllerPinsIn(index.pinsOn(root));
        const io = controllers.filter(isIoPin);
        if (!io.length) continue;
        const supply = controllers.find(member => isPowerPin(member) || isGroundPin(member));
        if (supply) {
            const pin = io[0];
            const target = isGroundPin(supply) ? 'ground' : 'power';
            results.push(issue(`io-short:${pin.component.id}:${pin.pinId}`, SEV.ERROR,
                `${boardName(pin)} pin ${pin.pinId} is wired straight to ${boardName(supply)} ${supply.pinId} (${target}). It shorts as soon as the pin outputs ${target === 'ground' ? 'HIGH' : 'LOW'}; connect it through a part instead.`,
                pin.component.id, 'fire', { pinName: pin.pinId, relatedIds: [supply.component.id] }));
            continue;
        }
        const byController = new Map();
        for (const member of io) {
            if (!byController.has(member.component.id)) byController.set(member.component.id, []);
            byController.get(member.component.id).push(member);
        }
        for (const [controllerId, pins] of byController) {
            const names = [...new Set(pins.map(member => member.pinId))].sort();
            if (names.length < 2) continue;
            results.push(issue(`io-tied:${controllerId}:${names.join('+')}`, SEV.WARNING,
                `${boardName(pins[0])} pins ${names.join(' and ')} are wired together. If one outputs HIGH while another outputs LOW they short; use one pin.`,
                controllerId, 'shuffle', { pinName: names[0] }));
        }
    }
}

/** VAL-04 switch contacts bridging power and ground: a short when operated. */
function ruleSwitchShorts(project, index, results) {
    for (const component of project.components || []) {
        const definition = getComponentDef(component.definitionId);
        for (const [a, b] of definition?.switchContacts || []) {
            const sideA = controllerPinsIn(index.pinsWith(component, a));
            const sideB = controllerPinsIn(index.pinsWith(component, b));
            const shorts = (power, ground) => power.some(isPowerPin) && ground.some(isGroundPin);
            if (!shorts(sideA, sideB) && !shorts(sideB, sideA)) continue;
            results.push(issue(`switch-short:${component.id}:${a}+${b}`, SEV.ERROR,
                `${displayName(component)} connects power straight to ground when it is pressed or switched. Wire one side to an input pin instead, with a resistor if you need a pull-up or pull-down.`,
                component.id, 'fire', { pinName: a }));
        }
    }
}

/**
 * VAL-04 LED polarity: the anode (+, longer leg) must face the supply or I/O
 * pin and the cathode (-) ground. Looks through one series resistor.
 */
function ruleLedPolarity(project, index, results) {
    for (const component of project.components || []) {
        const definition = getComponentDef(component.definitionId);
        if (!definition?.needsResistor || !definition.pinMeta?.A || !definition.pinMeta?.C) continue;
        const anode = controllerPinsIn(throughResistors(index, component, 'A').reached);
        const cathode = controllerPinsIn(throughResistors(index, component, 'C').reached);
        const anodeToGround = anode.some(isGroundPin) && !anode.some(member => !isGroundPin(member));
        const cathodeDriven = cathode.some(member => !isGroundPin(member));
        if (!anodeToGround || !cathodeDriven) continue;
        results.push(issue(`led-reversed:${component.id}`, SEV.ERROR,
            `${displayName(component)} is in backwards: its anode (A, the longer leg) goes to ground. Swap the legs so A faces the pin or supply and C faces GND.`,
            component.id, 'triangleExclamation', { pinName: 'A' }));
    }
}

/** VAL-04 LED current from the series resistor value, supply and LED colour. */
function ruleLedCurrent(project, index, results) {
    for (const component of project.components || []) {
        const definition = getComponentDef(component.definitionId);
        if (!definition?.needsResistor || !definition.pinMeta?.A || !definition.pinMeta?.C) continue;
        const anode = throughResistors(index, component, 'A');
        const cathode = throughResistors(index, component, 'C');
        const resistors = [...anode.resistors, ...cathode.resistors];
        if (!resistors.length) continue;
        const source = controllerPinsIn(anode.reached).find(member => !isGroundPin(member));
        const sink = controllerPinsIn(cathode.reached).find(isGroundPin);
        if (!source || !sink) continue;
        const ohms = resistors.map(resistorOhms);
        if (ohms.some(value => !value)) continue;
        const sourceVoltage = isPowerPin(source) ? supplyVoltageOf(source) : logicVoltage(source);
        const forward = LED_COLOR_PROFILES[canonicalLedColor(component.properties?.color ?? definition.attrs?.color)].forwardVoltage;
        if (!(sourceVoltage > forward)) continue;
        const resistance = ohms.reduce((sum, value) => sum + value, 0);
        const current = (sourceVoltage - forward) / resistance * 1000;
        const pinLimit = isIoPin(source) ? Number(source.definition.autoWirePins.pinMaxCurrent_mA) || null : null;
        const shown = `${Math.round(current)} mA through ${formatOhms(resistance)}`;
        let severity = null;
        let message = null;
        if (pinLimit && current > pinLimit) {
            severity = SEV.ERROR;
            message = `${displayName(component)} would draw about ${shown}, more than the ${pinLimit} mA ${boardName(source)} pin ${source.pinId} can give. Use a larger resistor (220 Ω to 330 Ω).`;
        } else if (current > LED_CURRENT_WARNING_mA) {
            severity = SEV.WARNING;
            message = `${displayName(component)} would draw about ${shown}, which overdrives a standard LED. Use a larger resistor (220 Ω to 330 Ω).`;
        } else if (current < LED_CURRENT_DIM_mA) {
            severity = SEV.INFO;
            message = `${displayName(component)} gets only about ${current.toFixed(1)} mA through ${formatOhms(resistance)} and will be very dim. Use a smaller resistor (220 Ω to 330 Ω).`;
        }
        if (severity) results.push(issue(`led-current:${component.id}`, severity, message, component.id, 'bolt',
            { relatedIds: resistors.map(resistor => resistor.id) }));
    }
}

function formatOhms(ohms) {
    if (ohms >= 1e6) return `${+(ohms / 1e6).toFixed(2)} MΩ`;
    if (ohms >= 1e3) return `${+(ohms / 1e3).toFixed(2)} kΩ`;
    return `${+ohms.toFixed(1)} Ω`;
}

/** VAL-06 two devices with the same I2C address on one bus. */
function ruleI2cAddressConflicts(project, index, results) {
    const buses = new Map();
    for (const component of project.components || []) {
        const definition = getComponentDef(component.definitionId);
        const address = Number(component.properties?.i2cAddress ?? definition?.i2cAddress);
        if (!Number.isInteger(address)) continue;
        const sda = componentPinIds(component).find(pinId => electricalRole(definition, pinId) === PIN.I2C_SDA);
        if (!sda || !otherComponents(index.pinsWith(component, sda), component.id).length) continue;
        const key = `${index.rootOf(componentPinRef(component.id, sda))}|${address}`;
        if (!buses.has(key)) buses.set(key, { address, components: [] });
        buses.get(key).components.push(component);
    }
    for (const { address, components } of buses.values()) {
        if (components.length < 2) continue;
        const hex = `0x${address.toString(16).toUpperCase().padStart(2, '0')}`;
        const ids = components.map(component => component.id).sort();
        results.push(issue(`i2c-address-conflict:${hex}:${ids.join('+')}`, SEV.WARNING,
            `${components.map(displayName).join(' and ')} share I2C address ${hex} on one bus, so the board cannot tell them apart. Change one module's address (jumper or address pin) or use a different device.`,
            components[0].id, 'shuffle', { relatedIds: ids }));
    }
}

/** VAL-04 two terminals of one part on the same net (shorted or bypassed). */
function ruleShortedPartPins(project, index, connectivity, results) {
    for (const component of project.components || []) {
        const definition = getComponentDef(component.definitionId);
        if (!definition || isController(definition)) continue;
        const groups = internalGroups(component);
        const byRoot = new Map();
        for (const pinId of componentPinIds(component)) {
            if (OPTIONAL_PINS.has(pinId)) continue;
            const root = index.rootOf(componentPinRef(component.id, pinId));
            if (!byRoot.has(root)) byRoot.set(root, []);
            byRoot.get(root).push(pinId);
        }
        for (const pins of byRoot.values()) {
            const pair = firstShortedPair(component, pins, groups, definition, connectivity);
            if (!pair) continue;
            results.push(issue(`shorted-pins:${component.id}:${pair.join('+')}`, SEV.WARNING,
                `${displayName(component)} pins ${pair[0]} and ${pair[1]} are connected to each other, so the part is shorted out and does nothing. Move one leg to a different row or net.`,
                component.id, 'triangleExclamation', { pinName: pair[0] }));
        }
    }
}

function firstShortedPair(component, pins, groups, definition, connectivity) {
    for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
        const [a, b] = [pins[i], pins[j]];
        if (groups.some(group => group.has(a) && group.has(b))) continue;
        // Repeated supply pins (GND.1/GND.2) are meant to share a net.
        const roleA = electricalRole(definition, a);
        if (roleA && SUPPLY_ROLES.has(roleA) && roleA === electricalRole(definition, b)) continue;
        if (a.split('.')[0] === b.split('.')[0]) continue;
        // Two legs in one breadboard strip are reported by the placement check.
        const holeA = connectivity.resolveElectricalGroup(component.id, a);
        const holeB = connectivity.resolveElectricalGroup(component.id, b);
        if (holeA && holeB && holeA.surfaceId === holeB.surfaceId && holeA.electricalGroup === holeB.electricalGroup) continue;
        return [a, b];
    }
    return null;
}

/**
 * VAL-04 supply voltage and logic level: a 5 V part on a 3.3 V supply will
 * not work reliably, and a 5 V part's output can damage a 3.3 V input.
 */
function ruleVoltageLevels(project, index, results) {
    for (const component of project.components || []) {
        const definition = getComponentDef(component.definitionId);
        if (!definition || isController(definition)) continue;
        const range = definition.supplyVoltage;
        const supply = partSupplyVoltage(component, index);
        if (range && supply !== null && supply < range.min) {
            const vccPin = componentPinIds(component).find(pinId => electricalRole(definition, pinId) === PIN.VCC);
            results.push(issue(`under-voltage:${component.id}`, SEV.WARNING,
                `${displayName(component)} needs ${range.min} to ${range.max} V but gets ${supply} V, so it may not work. Power it from a 5 V supply${supply < 4 ? ' and use a level shifter for its signals' : ''}.`,
                component.id, 'bolt', { pinName: vccPin }));
        }
        if (supply === null) continue;
        for (const pinId of componentPinIds(component)) {
            const role = electricalRole(definition, pinId);
            if (!role || SUPPLY_ROLES.has(role) || BUS_ROLES.has(role)) continue;
            const needs = requiredControllerCapabilities(component, pinId);
            const isOutput = needs.includes(PIN_CAPABILITY.DIGITAL_INPUT) || needs.includes(PIN_CAPABILITY.ANALOG);
            if (!isOutput) continue;
            const target = controllerPinsIn(index.pinsWith(component, pinId))
                .find(member => isIoPin(member) && supply > (logicVoltage(member) ?? Infinity) + LOGIC_VOLTAGE_MARGIN);
            if (!target) continue;
            results.push(issue(`signal-over-voltage:${component.id}:${pinId}`, SEV.ERROR,
                `${displayName(component)} runs at ${supply} V, so its ${pinId} signal can damage ${boardName(target)} pin ${target.pinId}, which only takes ${logicVoltage(target)} V. Add a level shifter or a voltage divider.`,
                component.id, 'fire', { pinName: pinId, relatedIds: [target.component.id] }));
        }
    }
}

/** VAL-04 coils (relays, stepper motors) driven straight from controller pins. */
function ruleNeedsDriver(project, index, results) {
    for (const component of project.components || []) {
        const definition = getComponentDef(component.definitionId);
        const driver = definition?.needsDriver;
        if (!driver) continue;
        for (const pinId of driver.pins || []) {
            const pin = controllerPinsIn(index.pinsWith(component, pinId)).find(isIoPin);
            if (!pin) continue;
            const message = (DRIVER_MESSAGES[driver.kind] || DRIVER_MESSAGES.relay)(
                definition.name || definition.id, pinId, boardName(pin), pin.pinId);
            results.push(issue(`needs-driver:${component.id}`, SEV.ERROR, message, component.id, 'bolt',
                { pinName: pinId, relatedIds: [pin.component.id] }));
            break;
        }
    }
}

/** VAL-05 guidance: parts that need a breadboard when the scene has none. */
function ruleBreadboardGuidance(project, results) {
    if ((project.surfaces || []).length) return;
    const needing = (project.components || []).filter(component =>
        getComponentDef(component.definitionId)?.breadboard?.required === true);
    if (!needing.length) return;
    results.push(issue('breadboard-required', SEV.INFO,
        `${needing.length === 1 ? displayName(needing[0]) + ' needs' : 'Some parts need'} a breadboard to be built for real. Add a breadboard or run Auto Layout.`,
        null, 'circleInfo', { relatedIds: needing.map(component => component.id) }));
}

/**
 * Run every electrical rule and return the findings in a stable order.
 * `connectivity` is the ConnectivityResolver for the same project.
 */
export function validateElectrical(project, connectivity) {
    const results = [];
    const index = buildNetIndex(project, connectivity);
    ruleSupplyShorts(project, index, results);
    ruleIoShorts(project, index, results);
    ruleSwitchShorts(project, index, results);
    ruleCurrentBudget(project, index, results);
    ruleVoltageLevels(project, index, results);
    ruleNeedsDriver(project, index, results);
    ruleControllerPinCompatibility(project, index, results);
    ruleDuplicateSignalPin(project, index, results);
    ruleSupplyPins(project, index, results);
    ruleLedResistor(project, index, results);
    ruleLedPolarity(project, index, results);
    ruleLedCurrent(project, index, results);
    ruleI2cAddressConflicts(project, index, results);
    ruleShortedPartPins(project, index, connectivity, results);
    ruleUnconnectedAndFloating(project, index, results);
    ruleBreadboardGuidance(project, results);
    // A pin reached through several controller pins reports once per id.
    const seen = new Set();
    return results.filter(item => !seen.has(item.id) && seen.add(item.id));
}

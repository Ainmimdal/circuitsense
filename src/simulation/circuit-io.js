import { getComponentDef } from '../component-library.js';
import { getBoardPinTable } from '../core/board-pins.js';
import { LED_COLOR_PROFILES } from '../core/led-resistor.js';
import { ConnectivityResolver, UnionFind } from '../physical/connectivity.js';
import { componentPinRef, connectionRefKey } from '../physical/model.js';
import { solveDc } from './dc-solver.js';

// Connects the running program to the circuit on the canvas: which parts light
// up, move or sound for the current pin activity, and what voltage each input
// pin sees. Voltages are a share of 5 V (0 to 1); null means nothing connected.
//
// Voltages and LED currents come from the DC solver; buzzers and servos are
// treated as drawing no current and follow the signal on their pin.

const SIMULATED_BOARDS = ['arduino-uno', 'arduino-nano'];
const SUPPLY_VOLTS = 5;
const PULLUP_OHMS = 35_000;
const DIAL_OHMS = 10_000;
const FULL_BRIGHTNESS_AMPS = .008;
const INTERNAL_5V = 'internal-5v';
const SERVO_MIN_MICROS = 544;
const SERVO_MAX_MICROS = 2400;

const clamp = value => Math.max(0, Math.min(1, value));

/**
 * Prepare a project for simulation. Returns `{ error }` in beginner language
 * when it cannot run, otherwise `{ boardId, inputs, evaluate }`. `inputs`
 * lists the parts a person operates (buttons and dials) with a starting value.
 */
export function createCircuitSimulation(project) {
    const controllers = project.components.filter(component => getComponentDef(component.definitionId)?.isControllerBoard);
    const board = controllers.find(component => SIMULATED_BOARDS.includes(component.definitionId));
    if (!board) {
        return {
            error: controllers.length
                ? 'The simulator can run code on an Arduino Uno or Nano for now. Swap the board to try your code here.'
                : 'Add an Arduino Uno to the canvas first. The code needs a board to run on.',
        };
    }

    const resolver = new ConnectivityResolver(project);
    const net = (componentId, pinId) => resolver.graph.find(connectionRefKey(componentPinRef(componentId, pinId)));
    const boardPins = getBoardPinTable(board.definitionId).pins;
    const supplies = boardPins.flatMap(pin => pin.capabilities.includes('ground') ? [[net(board.id, pin.name), 0]]
        : pin.capabilities.includes('power') ? [[net(board.id, pin.name), pin.name.startsWith('3') ? .66 : 1]] : []);
    // Ground first, so a 5 V to ground short reads as 0 instead of lighting things.
    supplies.sort((a, b) => a[1] - b[1]);
    const ioPins = boardPins.filter(pin => /^(\d+|A[0-5])$/.test(pin.name)).map(pin => ({ name: pin.name, net: net(board.id, pin.name) }));

    const parts = [];
    const inputs = [];
    for (const component of project.components) {
        const definition = getComponentDef(component.definitionId);
        const simulation = definition?.simulation;
        if (!simulation) continue;
        const pin = pinId => net(component.id, pinId);
        parts.push({ id: component.id, definition, simulation, pin, properties: component.properties || {} });
        if (simulation.kind === 'button') inputs.push({ id: component.id, kind: 'button', label: definition.name, value: 0 });
        if (simulation.kind === 'switch') inputs.push({ id: component.id, kind: 'switch', label: definition.name, value: 0 });
        if (simulation.kind === 'dial') inputs.push({ id: component.id, kind: 'dial', label: simulation.label, value: .5 });
    }
    // Two knobs become "Knob 1" and "Knob 2".
    for (const input of inputs) {
        const same = inputs.filter(other => other.kind === input.kind && other.label.replace(/ \d+$/, '') === input.label);
        if (same.length > 1) same.forEach((other, index) => { other.label = `${input.label} ${index + 1}`; });
    }

    /**
     * `pins` is AvrRunner.sample(); `values` maps input part ids to 0..1.
     * Returns the properties to show on each part, the level on every input
     * pin and the tone a buzzer is playing (or null).
     */
    function evaluate(pins, values = {}) {
        const merged = new UnionFind();
        const root = id => merged.find(id);
        for (const part of parts) {
            const contacts = part.definition.switchContacts || [];
            // A button closes all its contacts while held; a slide switch always closes one pair.
            const closed = part.simulation.kind === 'button' ? (values[part.id] ? contacts : [])
                : part.simulation.kind === 'switch' ? [contacts[values[part.id] ? 1 : 0]] : [];
            for (const [a, b] of closed) merged.union(part.pin(a), part.pin(b));
        }

        // Supplies and output pins hold their net at a voltage; the first claim wins, ground first.
        const fixed = new Map([[INTERNAL_5V, SUPPLY_VOLTS]]);
        const hold = (id, volts) => { if (!fixed.has(root(id))) fixed.set(root(id), volts); };
        for (const [id, share] of supplies) hold(id, share * SUPPLY_VOLTS);
        // A PWM pin is solved at its HIGH level; LEDs it feeds are dimmed by its duty afterwards.
        for (const pin of ioPins) if (pins[pin.name]?.output) hold(pin.net, pins[pin.name].level > 0 ? SUPPLY_VOLTS : 0);

        const resistors = [];
        const diodes = [];
        const links = new Map();
        const resistor = (a, b, ohms) => {
            resistors.push({ a: root(a), b: root(b), ohms });
            for (const [from, to] of [[root(a), root(b)], [root(b), root(a)]]) {
                if (!links.has(from)) links.set(from, []);
                links.get(from).push(to);
            }
        };
        for (const part of parts) {
            const { simulation, pin } = part;
            if (simulation.kind === 'resistor') {
                resistor(pin(simulation.pins[0]), pin(simulation.pins[1]), Math.max(1, Number(part.properties.value) || 220));
            } else if (simulation.kind === 'dial') {
                const position = clamp(values[part.id] ?? .5);
                const share = simulation.inverted ? 1 - position : position;
                const [power, ground] = [pin(simulation.power), pin(simulation.ground)];
                resistors.push({ a: root(power), b: root(pin(simulation.output)), ohms: Math.max(1, (1 - share) * DIAL_OHMS) });
                resistors.push({ a: root(pin(simulation.output)), b: root(ground), ohms: Math.max(1, share * DIAL_OHMS) });
                // A sensor module's digital pin snaps to one rail.
                if (simulation.digitalOutput) resistors.push({ a: root(pin(simulation.digitalOutput)), b: root(share > .5 ? power : ground), ohms: 100 });
            } else if (simulation.kind === 'led') {
                diodes.push({ part, prop: null, anode: root(pin(simulation.anode)), cathode: root(pin(simulation.cathode)),
                    forwardVoltage: LED_COLOR_PROFILES[part.properties.color]?.forwardVoltage || 2 });
            } else if (simulation.kind === 'rgb-led') {
                for (const [prop, channel] of Object.entries(simulation.channels)) {
                    diodes.push({ part, prop, anode: root(pin(channel)), cathode: root(pin(simulation.common)), forwardVoltage: prop === 'ledRed' ? 2 : 3 });
                }
            }
        }
        for (const pin of ioPins) if (pins[pin.name]?.pullup) resistors.push({ a: root(pin.net), b: INTERNAL_5V, ohms: PULLUP_OHMS });

        const solved = solveDc({ fixed, resistors, diodes });
        const volts = id => solved.voltage(root(id));
        const grounded = id => { const value = volts(id); return value != null && value < .1; };

        // The Arduino output that reaches this terminal directly or through one resistor.
        const outputPins = ioPins.filter(pin => pins[pin.name]?.output);
        const driver = id => {
            const reach = new Set([root(id), ...(links.get(root(id)) || [])]);
            return pins[outputPins.find(pin => reach.has(root(pin.net)))?.name] || null;
        };
        // Brightness from the current through each LED: full at about 8 mA.
        const glow = new Map();
        diodes.forEach((diode, i) => {
            const duty = (driver(diode.anode)?.level ?? 1) * (1 - (driver(diode.cathode)?.level ?? 0));
            glow.set(`${diode.part.id}:${diode.prop}`, clamp(solved.diodeCurrents[i] / FULL_BRIGHTNESS_AMPS) * duty);
        });

        const components = {};
        let sound = null;
        for (const part of parts) {
            const { simulation, pin } = part;
            if (simulation.kind === 'led') {
                const brightness = glow.get(`${part.id}:null`);
                components[part.id] = { value: brightness > .02, brightness: Math.max(.25, brightness) };
            } else if (simulation.kind === 'rgb-led') {
                components[part.id] = Object.fromEntries(Object.keys(simulation.channels).map(prop => [prop, glow.get(`${part.id}:${prop}`)]));
            } else if (simulation.kind === 'buzzer') {
                const [a, b] = simulation.pins.map(pin);
                const signal = grounded(b) ? driver(a) : grounded(a) ? driver(b) : null;
                const frequency = signal?.frequency > 20 ? signal.frequency : 0;
                components[part.id] = { hasSignal: frequency > 0 };
                if (frequency) sound = { frequency };
            } else if (simulation.kind === 'servo') {
                const signal = driver(pin(simulation.signal));
                const powered = volts(pin(simulation.power)) > 4 && grounded(pin(simulation.ground));
                if (powered && signal && signal.pulseMicros > 400 && signal.pulseMicros < 2600 && signal.frequency > 20) {
                    components[part.id] = {
                        angle: Math.round(clamp((signal.pulseMicros - SERVO_MIN_MICROS) / (SERVO_MAX_MICROS - SERVO_MIN_MICROS)) * 180),
                    };
                }
            } else if (simulation.kind === 'button') {
                components[part.id] = { pressed: Boolean(values[part.id]) };
            } else if (simulation.kind === 'switch') {
                components[part.id] = { value: values[part.id] ? 1 : 0 };
            } else if (simulation.kind === 'dial' && simulation.visual) {
                components[part.id] = { [simulation.visual.prop]: clamp(values[part.id] ?? .5) * simulation.visual.scale };
            }
        }

        const pinLevels = {};
        for (const pin of ioPins) if (!pins[pin.name]?.output) {
            const value = volts(pin.net);
            pinLevels[pin.name] = value == null ? null : value / SUPPLY_VOLTS;
        }
        return { components, pinLevels, sound };
    }

    return { boardId: board.definitionId, inputs, evaluate };
}

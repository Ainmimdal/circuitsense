import { getComponentDef } from '../component-library.js';
import { getBoardPinTable } from '../core/board-pins.js';
import { ConnectivityResolver, UnionFind } from '../physical/connectivity.js';
import { componentPinRef, connectionRefKey } from '../physical/model.js';

// Connects the running program to the circuit on the canvas: which parts light
// up, move or sound for the current pin activity, and what voltage each input
// pin sees. Voltages are a share of 5 V (0 to 1); null means nothing connected.
//
// shortcut: this follows wires, closed switches and resistor dividers, not a
// full circuit solver, so LEDs in series and resistor meshes are approximate;
// replace `level` with the DC solver when it lands.

const SIMULATED_BOARDS = ['arduino-uno', 'arduino-nano'];
const PULLUP_OHMS = 35_000;
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
            if (part.simulation.kind !== 'button' || !values[part.id]) continue;
            for (const [a, b] of part.definition.switchContacts || []) merged.union(part.pin(a), part.pin(b));
        }

        const driven = new Map([[INTERNAL_5V, 1]]);
        const drive = (id, level) => { if (!driven.has(root(id))) driven.set(root(id), level); };
        for (const [id, level] of supplies) drive(id, level);
        for (const pin of ioPins) if (pins[pin.name]?.output) drive(pin.net, pins[pin.name].level);

        const links = new Map();
        const link = (a, b, ohms) => {
            for (const [from, to] of [[root(a), root(b)], [root(b), root(a)]]) {
                if (!links.has(from)) links.set(from, []);
                links.get(from).push({ to, ohms });
            }
        };
        const dials = new Map();
        for (const part of parts) {
            const { simulation } = part;
            if (simulation.kind === 'resistor') {
                link(part.pin(simulation.pins[0]), part.pin(simulation.pins[1]), Math.max(1, Number(part.properties.value) || 220));
            } else if (simulation.kind === 'dial') {
                const position = clamp(values[part.id] ?? .5);
                const share = simulation.inverted ? 1 - position : position;
                dials.set(root(part.pin(simulation.output)), { part, share });
                if (simulation.digitalOutput) dials.set(root(part.pin(simulation.digitalOutput)), { part, share: share > .5 ? 1 : 0 });
            }
        }
        for (const pin of ioPins) if (pins[pin.name]?.pullup) link(pin.net, INTERNAL_5V, PULLUP_OHMS);

        const settled = new Map();
        function level(id, visiting = new Set()) {
            const key = root(id);
            if (driven.has(key)) return driven.get(key);
            if (settled.has(key)) return settled.get(key);
            if (visiting.has(key)) return null;
            visiting.add(key);
            let result = null;
            const dial = dials.get(key);
            if (dial) {
                const high = level(dial.part.pin(dial.part.simulation.power), visiting);
                const low = level(dial.part.pin(dial.part.simulation.ground), visiting);
                if (high != null && low != null) result = low + (high - low) * dial.share;
            }
            if (result == null) {
                let conductance = 0, sum = 0;
                for (const { to, ohms } of links.get(key) || []) {
                    const other = level(to, visiting);
                    if (other == null) continue;
                    conductance += 1 / ohms;
                    sum += other / ohms;
                }
                if (conductance) result = sum / conductance;
            }
            visiting.delete(key);
            // A value found while part of the loop was still being walked may be incomplete.
            if (!visiting.size) settled.set(key, result);
            return result;
        }

        // The Arduino output that reaches this terminal directly or through one resistor.
        const outputPins = ioPins.filter(pin => pins[pin.name]?.output);
        const driver = id => {
            const reach = new Set([root(id), ...(links.get(root(id)) || []).map(item => item.to)]);
            return pins[outputPins.find(pin => reach.has(root(pin.net)))?.name] || null;
        };
        const glow = (anode, cathode) => {
            const high = level(anode), low = level(cathode);
            return high == null || low == null ? 0 : clamp(high - low);
        };

        const components = {};
        let sound = null;
        for (const part of parts) {
            const { simulation, pin } = part;
            if (simulation.kind === 'led') {
                const brightness = glow(pin(simulation.anode), pin(simulation.cathode));
                components[part.id] = { value: brightness > .02, brightness: Math.max(.25, brightness) };
            } else if (simulation.kind === 'rgb-led') {
                components[part.id] = Object.fromEntries(Object.entries(simulation.channels)
                    .map(([prop, channel]) => [prop, glow(pin(channel), pin(simulation.common))]));
            } else if (simulation.kind === 'buzzer') {
                const [a, b] = simulation.pins.map(pin);
                const signal = level(b) === 0 ? driver(a) : level(a) === 0 ? driver(b) : null;
                const frequency = signal?.frequency > 20 ? signal.frequency : 0;
                components[part.id] = { hasSignal: frequency > 0 };
                if (frequency) sound = { frequency };
            } else if (simulation.kind === 'servo') {
                const signal = driver(pin(simulation.signal));
                const powered = level(pin(simulation.power)) > .8 && level(pin(simulation.ground)) === 0;
                if (powered && signal && signal.pulseMicros > 400 && signal.pulseMicros < 2600 && signal.frequency > 20) {
                    components[part.id] = {
                        angle: Math.round(clamp((signal.pulseMicros - SERVO_MIN_MICROS) / (SERVO_MAX_MICROS - SERVO_MIN_MICROS)) * 180),
                    };
                }
            } else if (simulation.kind === 'button') {
                components[part.id] = { pressed: Boolean(values[part.id]) };
            } else if (simulation.kind === 'dial' && simulation.visual) {
                components[part.id] = { [simulation.visual.prop]: clamp(values[part.id] ?? .5) * simulation.visual.scale };
            }
        }

        const pinLevels = {};
        for (const pin of ioPins) if (!pins[pin.name]?.output) pinLevels[pin.name] = level(pin.net);
        return { components, pinLevels, sound };
    }

    return { boardId: board.definitionId, inputs, evaluate };
}

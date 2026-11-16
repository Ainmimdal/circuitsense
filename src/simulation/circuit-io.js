import { getComponentDef } from '../component-library.js';
import { getBoardPinTable } from '../core/board-pins.js';
import { LED_COLOR_PROFILES } from '../core/led-resistor.js';
import { ConnectivityResolver, UnionFind } from '../physical/connectivity.js';
import { componentPinRef, connectionRefKey } from '../physical/model.js';
import { solveDc } from './dc-solver.js';
import { createI2cDevice } from './i2c-devices.js';
import { createPinDevice } from './pin-devices.js';
import { createSpiDevice } from './spi-devices.js';

// Connects the running program to the circuit on the canvas: which parts light
// up, move or sound for the current pin activity, and what voltage each input
// pin sees. Voltages are a share of 5 V (0 to 1); null means nothing connected.
//
// Voltages and LED currents come from the DC solver; buzzers and servos are
// treated as drawing no current and follow the signal on their pin. Capacitors
// charge and discharge between calls to evaluate(), one time step per call.
// Screens and other I2C parts listen to the bytes the program sends them.

const SIMULATED_BOARDS = ['arduino-uno', 'arduino-nano'];
const SUPPLY_VOLTS = 5;
const PULLUP_OHMS = 35_000;
const DIAL_OHMS = 10_000;
const FULL_BRIGHTNESS_AMPS = .008;
const MOTOR_OHMS = 25;
const RELAY_COIL_OHMS = 70;
// Clock and data levels of a rotary encoder through one click: clock falls first when turning clockwise.
const ENCODER_PHASES = [[1, 1], [0, 1], [0, 0], [1, 0]];
const DISTANCE_CM = [2, 400];
const TRANSISTOR_ON_OHMS = 2;
const INTERNAL_5V = 'internal-5v';
const SERVO_MIN_MICROS = 544;
const SERVO_MAX_MICROS = 2400;

const clamp = value => Math.max(0, Math.min(1, value));

// Wokwi's single pixel has r, g, b; the ring takes setPixel(index) and the matrix setPixel(row, column).
function paintPixels(artwork, colors) {
    if (!artwork.setPixel) Object.assign(artwork, colors[0]);
    else colors.forEach((color, index) => artwork.cols ? artwork.setPixel(Math.floor(index / artwork.cols), index % artwork.cols, color) : artwork.setPixel(index, color));
}

/**
 * Prepare a project for simulation. Returns `{ error }` in beginner language
 * when it cannot run, otherwise `{ boardId, inputs, evaluate }`. `inputs`
 * lists the parts a person operates (buttons and dials) with a starting value;
 * `echoes` lists ultrasonic sensors as { trigger, echo, centimetres(values) }
 * and `i2c` the devices on the I2C bus as { address, device }; `spi` the devices
 * on the SPI bus as { select, command, device }; `pixelStrips` lists NeoPixel
 * chains as { pin, show(bytes) } and `pinDevices` the parts that work by
 * timing on plain pins as { device, read(values, index) }. A `paint` entry in a part's
 * state is a function that draws on its artwork.
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
    const echoes = [];
    const i2c = [];
    const spi = [];
    const pinDevices = [];
    const bus = pinId => net(board.id, pinId);
    for (const component of project.components) {
        const definition = getComponentDef(component.definitionId);
        if (!definition?.simulation) continue;
        const pin = pinId => net(component.id, pinId);
        // A part with several controls (a joystick) lists one behaviour per control.
        [].concat(definition.simulation).forEach((simulation, index) => {
            const key = index ? `${component.id}:${index}` : component.id;
            parts.push({ id: component.id, key, definition, simulation, pin, properties: component.properties || {} });
            if (simulation.kind === 'button') inputs.push({ id: key, kind: 'button', label: definition.name, value: 0 });
            if (simulation.kind === 'signal') inputs.push({ id: key, kind: 'button', label: definition.name, action: simulation.action, value: 0 });
            if (simulation.kind === 'keypad') inputs.push({ id: key, kind: 'keypad', label: definition.name, keys: simulation.keys, value: 0 });
            if (simulation.kind === 'switch') inputs.push({ id: key, kind: 'switch', label: definition.name, value: 0 });
            if (['dial', 'light-resistor'].includes(simulation.kind)) inputs.push({ id: key, kind: 'dial', label: simulation.label, value: .5 });
            if (simulation.kind === 'i2c') {
                const part = parts[parts.length - 1];
                if (simulation.input) inputs.push({ id: key, kind: 'dial', label: simulation.input, value: .5 });
                part.device = createI2cDevice(simulation.device, { ...simulation, tilt: () => part.tilt ?? .5 });
                // On an Uno and Nano the I2C bus is pins A4 (SDA) and A5 (SCL).
                if (pin(simulation.sda) === bus('A4') && pin(simulation.scl) === bus('A5')) i2c.push({ address: definition.i2cAddress, device: part.device });
            }
            if (simulation.kind === 'encoder') inputs.push({ id: key, kind: 'dial', label: simulation.label, value: .5 });
            if (simulation.kind === 'pin-device') {
                const part = parts[parts.length - 1];
                const inputId = index => index ? `${key}/${index}` : key;
                (simulation.inputs || []).forEach((input, index) => inputs.push({ kind: 'dial', value: input.kind === 'keypad' ? 0 : .5, ...input, id: inputId(index) }));
                const wired = pinId => ioPins.find(io => io.net === pin(pinId))?.name;
                const names = Object.fromEntries(Object.entries(simulation.pins).map(([role, ids]) => [role, Array.isArray(ids) ? ids.map(wired) : wired(ids)]));
                if (Object.values(names).flat().every(Boolean)) {
                    part.device = createPinDevice(simulation.device, { ...simulation.options, ...names });
                    pinDevices.push({ device: part.device, read: (values, index) => values[inputId(index)] });
                }
            }
            if (simulation.kind === 'spi') {
                const part = parts[parts.length - 1];
                part.device = createSpiDevice(simulation.device, simulation.options);
                const wired = pinId => ioPins.find(io => io.net === pin(pinId))?.name;
                // On an Uno and Nano the SPI bus is pins 11 (data out), 12 (data in) and 13 (clock).
                const onBus = pin(simulation.data) === bus('11') && pin(simulation.clock) === bus('13') &&
                    (!simulation.reply || pin(simulation.reply) === bus('12'));
                if (onBus && wired(simulation.select)) spi.push({ select: wired(simulation.select), command: simulation.command && wired(simulation.command), device: part.device });
            }
            if (simulation.kind === 'distance') {
                inputs.push({ id: key, kind: 'dial', label: 'Distance', value: .1, range: DISTANCE_CM, unit: ' cm' });
                const wired = pinId => ioPins.find(io => io.net === pin(pinId))?.name;
                // shortcut: the echo ignores whether VCC and GND are wired; check them if a lesson teaches powering the sensor.
                if (wired(simulation.trigger) && wired(simulation.echo)) {
                    echoes.push({ trigger: wired(simulation.trigger), echo: wired(simulation.echo),
                        centimetres: values => DISTANCE_CM[0] + clamp(values[key] ?? .1) * (DISTANCE_CM[1] - DISTANCE_CM[0]) });
                }
            }
        });
    }
    // NeoPixels: the part on an Arduino pin takes the first colours and passes the rest out of DOUT to the next part.
    const pixelParts = parts.filter(part => part.simulation.kind === 'pixels');
    const pixelStrips = pixelParts.flatMap(head => {
        const pinName = ioPins.find(io => io.net === head.pin(head.simulation.input))?.name;
        if (!pinName) return [];
        const chain = [head];
        for (let next; (next = pixelParts.find(part => !chain.includes(part) &&
            part.pin(part.simulation.input) === chain[chain.length - 1].pin(chain[chain.length - 1].simulation.output)));) chain.push(next);
        return [{ pin: pinName, show(bytes) {
            let offset = 0;
            for (const part of chain) {
                const colors = Array.from({ length: part.simulation.count }, (_, index) => {
                    const [green = 0, red = 0, blue = 0] = bytes.subarray(offset + index * 3, offset + index * 3 + 3);
                    // Real pixels look bright long before full power, so lift the low values.
                    return { r: (red / 255) ** .45, g: (green / 255) ** .45, b: (blue / 255) ** .45 };
                });
                offset += part.simulation.count * 3;
                part.colors = colors;
                part.paint = artwork => paintPixels(artwork, colors);
            }
        } }];
    });

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
    function evaluate(pins, values = {}, seconds = 0) {
        const merged = new UnionFind();
        const root = id => merged.find(id);
        for (const part of parts) {
            const contacts = part.definition.switchContacts || [];
            // A button closes all its contacts while held; a slide switch always closes one pair.
            const closed = part.simulation.kind === 'button' ? (values[part.key] ? contacts : [])
                : part.simulation.kind === 'switch' ? [contacts[values[part.key] ? 1 : 0]] : [];
            for (const [a, b] of closed) merged.union(part.pin(a), part.pin(b));
            // Pins that are one piece of metal inside the part (a display's two common pins).
            for (const [a, b] of part.simulation.joined || []) merged.union(part.pin(a), part.pin(b));
            if (part.simulation.kind === 'keypad' && values[part.key]) {
                const key = values[part.key] - 1;
                merged.union(part.pin(part.simulation.rows[key >> 2]), part.pin(part.simulation.cols[key & 3]));
            }
        }

        // Supplies and output pins hold their net at a voltage; the first claim wins, ground first.
        const fixed = new Map([[INTERNAL_5V, SUPPLY_VOLTS]]);
        const hold = (id, volts) => { if (!fixed.has(root(id))) fixed.set(root(id), volts); };
        for (const [id, share] of supplies) hold(id, share * SUPPLY_VOLTS);

        const resistors = [];
        const diodes = [];
        const sources = [];
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
                const position = clamp(values[part.key] ?? .5);
                const share = simulation.inverted ? 1 - position : position;
                const [power, ground] = [pin(simulation.power), pin(simulation.ground)];
                resistors.push({ a: root(power), b: root(pin(simulation.output)), ohms: Math.max(1, (1 - share) * DIAL_OHMS) });
                resistors.push({ a: root(pin(simulation.output)), b: root(ground), ohms: Math.max(1, share * DIAL_OHMS) });
                // A sensor module's digital pin snaps to one rail.
                if (simulation.digitalOutput) resistors.push({ a: root(pin(simulation.digitalOutput)), b: root(share > .5 ? power : ground), ohms: 100 });
            } else if (simulation.kind === 'signal') {
                // A digital sensor output: at one rail while triggered, the other (or disconnected) at rest.
                const active = Boolean(values[part.key]) !== Boolean(simulation.activeLow);
                if (!simulation.floating || values[part.key]) {
                    resistors.push({ a: root(pin(simulation.output)), b: root(pin(active ? simulation.power : simulation.ground)), ohms: 100 });
                }
            } else if (simulation.kind === 'light-resistor') {
                // About 200 k in the dark down to 1 k in bright light.
                resistor(pin(simulation.pins[0]), pin(simulation.pins[1]), 10 ** (5.3 - 2.3 * clamp(values[part.key] ?? .5)));
            } else if (simulation.kind === 'capacitor') {
                // One backward-Euler step: the capacitor is its present voltage behind a resistance of step / C.
                part.source = { a: root(pin(simulation.pins[0])), b: root(pin(simulation.pins[1])), volts: part.volts || 0,
                    ohms: Math.max(.05, seconds / simulation.farads) };
                sources.push(part.source);
            } else if (simulation.kind === 'relay') {
                resistor(pin(simulation.coil[0]), pin(simulation.coil[1]), RELAY_COIL_OHMS);
                // Each pole rests on its "normally closed" contact and moves to "normally open" when the coil pulls.
                part.contacts = simulation.poles.map(([pole, open, closed]) => ({ a: root(pin(pole)), b: root(pin(part.on ? open : closed)), ohms: .05 }));
                resistors.push(...part.contacts);
            } else if (simulation.kind === 'encoder') {
                const target = Math.round(clamp(values[part.key] ?? .5) * 40);
                part.detent ??= target;
                part.phase ??= 0;
                // One quarter of a click per frame, so the sketch sees every change.
                if (seconds > 0 && part.phase) {
                    part.phase = (part.phase + 1) % 4;
                    if (!part.phase) part.detent += part.direction;
                } else if (seconds > 0 && target !== part.detent) {
                    part.direction = Math.sign(target - part.detent);
                    part.phase = 1;
                }
                const levels = ENCODER_PHASES[part.phase];
                const [clock, data] = part.direction < 0 ? [levels[1], levels[0]] : levels;
                const rail = level => root(pin(level ? simulation.power : simulation.ground));
                resistors.push({ a: root(pin(simulation.clock)), b: rail(clock), ohms: 100 }, { a: root(pin(simulation.data)), b: rail(data), ohms: 100 });
            } else if (simulation.kind === 'motor') {
                resistor(pin(simulation.pins[0]), pin(simulation.pins[1]), MOTOR_OHMS);
            } else if (simulation.kind === 'diode') {
                diodes.push({ part, prop: null, anode: root(pin(simulation.anode)), cathode: root(pin(simulation.cathode)), forwardVoltage: .7 });
            } else if (simulation.kind === 'transistor') {
                part.junction = diodes.length;
                diodes.push({ part, prop: 'base', anode: root(pin(simulation.base)), cathode: root(pin(simulation.emitter)), forwardVoltage: .7 });
            } else if (simulation.kind === 'led') {
                diodes.push({ part, prop: null, anode: root(pin(simulation.anode)), cathode: root(pin(simulation.cathode)),
                    forwardVoltage: LED_COLOR_PROFILES[part.properties.color]?.forwardVoltage || 2 });
            } else if (simulation.kind === 'rgb-led') {
                for (const [prop, channel] of Object.entries(simulation.channels)) {
                    diodes.push({ part, prop, anode: root(pin(channel)), cathode: root(pin(simulation.common)), forwardVoltage: prop === 'ledRed' ? 2 : 3 });
                }
            } else if (simulation.kind === 'led-array') {
                simulation.leds.forEach(([anode, cathode], index) => {
                    diodes.push({ part, prop: index, anode: root(pin(anode)), cathode: root(pin(cathode)), forwardVoltage: 2 });
                });
            }
        }

        // A PWM pin is normally solved at its HIGH level and the LEDs it feeds are dimmed by its duty
        // afterwards. Where a capacitor can smooth it, the pin is held at its average voltage instead.
        const outputPins = ioPins.filter(pin => pins[pin.name]?.output);
        const smoothed = new Set();
        if (sources.length) {
            const stops = new Set([...fixed.keys(), ...outputPins.map(pin => root(pin.net))]);
            const charged = new Set(sources.flatMap(source => [source.a, source.b]));
            for (const pin of outputPins) {
                if (!(pins[pin.name].level > 0 && pins[pin.name].level < 1)) continue;
                const queue = [root(pin.net)];
                const seen = new Set(queue);
                while (queue.length && !smoothed.has(pin.name)) {
                    const node = queue.pop();
                    if (charged.has(node)) smoothed.add(pin.name);
                    for (const next of links.get(node) || []) if (!seen.has(next) && !stops.has(next)) { seen.add(next); queue.push(next); }
                }
            }
        }
        for (const pin of outputPins) {
            const level = pins[pin.name].level;
            hold(pin.net, smoothed.has(pin.name) ? level * SUPPLY_VOLTS : level > 0 ? SUPPLY_VOLTS : 0);
        }
        for (const pin of ioPins) if (pins[pin.name]?.pullup) resistors.push({ a: root(pin.net), b: INTERNAL_5V, ohms: PULLUP_OHMS });

        let solved = solveDc({ fixed, resistors, diodes, sources });
        // shortcut: a transistor is a switch that closes fully once base current flows (no gain, no
        // linear region); model hFE if a lesson ever needs dimming through a transistor.
        const conducting = new Set();
        for (let pass = 0; pass < 6; pass++) {
            const turnedOn = parts.filter(part => part.simulation.kind === 'transistor' && !conducting.has(part) &&
                solved.diodeCurrents[part.junction] > 1e-5);
            for (const part of turnedOn) {
                conducting.add(part);
                resistors.push({ a: root(part.pin(part.simulation.collector)), b: root(part.pin(part.simulation.emitter)), ohms: TRANSISTOR_ON_OHMS });
            }
            // A relay pulls in above about 3.5 V on its coil and lets go below about 1 V.
            const switched = parts.filter(part => {
                if (part.simulation.kind !== 'relay') return false;
                const [a, b] = part.simulation.coil.map(id => solved.voltage(root(part.pin(id))));
                const across = a == null || b == null ? 0 : Math.abs(a - b);
                return (across > (part.on ? 1 : 3.5)) !== Boolean(part.on);
            });
            for (const part of switched) {
                part.on = !part.on;
                part.simulation.poles.forEach(([, open, closed], index) => { part.contacts[index].b = root(part.pin(part.on ? open : closed)); });
            }
            if (!turnedOn.length && !switched.length) break;
            solved = solveDc({ fixed, resistors, diodes, sources });
        }
        const volts = id => solved.voltage(root(id));
        const grounded = id => { const value = volts(id); return value != null && value < .1; };

        // The Arduino output that reaches this terminal directly or through one resistor.
        const driverPin = id => {
            const reach = new Set([root(id), ...(links.get(root(id)) || [])]);
            return outputPins.find(pin => reach.has(root(pin.net)));
        };
        const driver = id => pins[driverPin(id)?.name] || null;
        // A smoothed pin already carries its duty in its voltage.
        const duty = id => { const pin = driverPin(id); return pin && !smoothed.has(pin.name) ? pins[pin.name] : null; };
        // Brightness from the current through each LED: full at about 8 mA.
        const glow = new Map();
        diodes.forEach((diode, i) => {
            const share = (duty(diode.anode)?.level ?? 1) * (1 - (duty(diode.cathode)?.level ?? 0));
            glow.set(`${diode.part.id}:${diode.prop}`, clamp(solved.diodeCurrents[i] / FULL_BRIGHTNESS_AMPS) * share);
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
            } else if (simulation.kind === 'led-array') {
                const values = simulation.leds.map((_, index) => glow.get(`${part.id}:${index}`) > .02 ? 1 : 0);
                // The artwork redraws when it is handed a new array, so keep the old one while nothing changed.
                if (part.shown?.join() !== values.join()) part.shown = values;
                components[part.id] = { values: part.shown };
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
            } else if (simulation.kind === 'motor') {
                const [plus, minus] = simulation.pins.map(id => volts(pin(id)));
                const across = plus == null || minus == null ? 0 : plus - minus;
                components[part.id] = { spinning: Math.abs(across) > 1, reverse: across < 0 };
            } else if (simulation.kind === 'button') {
                components[part.id] = { pressed: Boolean(values[part.key]) };
            } else if (simulation.kind === 'switch') {
                components[part.id] = { value: values[part.key] ? 1 : 0 };
            } else if (simulation.kind === 'dial' && simulation.visual) {
                components[part.id] = { [simulation.visual.prop]: clamp(values[part.key] ?? .5) * simulation.visual.scale };
            }
        }

        for (const part of parts) {
            if (part.simulation.kind === 'capacitor') {
                const [a, b] = [solved.voltage(part.source.a), solved.voltage(part.source.b)];
                if (a != null && b != null) part.volts = a - b;
            } else if (part.simulation.kind === 'pixels') {
                const powered = volts(part.pin(part.simulation.power)) > 3 && grounded(part.pin(part.simulation.ground));
                if (powered && part.paint) components[part.id] = { paint: part.paint };
            } else if (part.simulation.kind === 'encoder') {
                components[part.id] = { ...components[part.id], angle: part.detent * 18 };
            } else if (part.simulation.kind === 'pin-device' && part.device?.state) {
                components[part.id] = { ...components[part.id], ...part.device.state() };
            } else if (part.simulation.kind === 'spi') {
                const powered = volts(part.pin(part.simulation.power)) > 3 && grounded(part.pin(part.simulation.ground));
                if (powered) components[part.id] = part.device.state();
            } else if (part.simulation.kind === 'i2c') {
                part.tilt = values[part.key];
                const powered = volts(part.pin(part.simulation.power)) > 3 && grounded(part.pin(part.simulation.ground));
                if (powered) components[part.id] = part.device.state();
            }
        }

        const pinLevels = {};
        for (const pin of ioPins) if (!pins[pin.name]?.output) {
            const value = volts(pin.net);
            pinLevels[pin.name] = value == null ? null : value / SUPPLY_VOLTS;
        }
        return { components, pinLevels, sound };
    }

    return { boardId: board.definitionId, inputs, echoes, i2c, spi, pinDevices, pixelStrips, parts, evaluate };
}

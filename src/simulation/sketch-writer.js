import { getComponentDef } from '../component-library.js';
import { getBoardPinTable } from '../core/board-pins.js';
import { ConnectivityResolver } from '../physical/connectivity.js';
import { componentPinRef, connectionRefKey } from '../physical/model.js';

// Writes an Arduino sketch for the circuit on the canvas from its wiring.
// When the circuit has a sensor and something to drive, the sensor controls
// it ("the harder you turn, the brighter"); otherwise every part is tried in
// turn. Everything is also printed to the Serial Monitor.
//
// shortcut: Uno and Nano pin rules only, and parts without a recipe below get
// a comment instead of code; add a recipe when a lesson needs the part.

const PWM_PINS = ['3', '5', '6', '9', '10', '11'];
const BUTTON_LEGS = { pushbutton: ['1.l', '2.l', '1.r', '2.r'], 'pushbutton-6mm': ['1.l', '2.l', '1.r', '2.r'], 'slide-switch': ['2', '1', '3'] };

// Each recipe gets the part's wiring as `pin(partPin)` (an Arduino pin name or
// null) and a unique NAME, and returns the lines it adds. `level` is an
// expression from 0.0 to 1.0 for sensors; `drive(level)` gives the lines that
// make an output follow a level.
const RECIPES = {
    led: ({ pin, NAME }) => pin('A') && {
        globals: [`const int ${NAME} = ${pin('A')};`],
        setup: [`pinMode(${NAME}, OUTPUT);`],
        drive: level => [PWM_PINS.includes(pin('A')) ? `analogWrite(${NAME}, ${level} * 255);` : `digitalWrite(${NAME}, ${level} > 0.5 ? HIGH : LOW);`],
    },
    'rgb-led': ({ pin, ID }) => pin('R') && pin('G') && pin('B') && {
        globals: [`const int ${ID}_RED = ${pin('R')}, ${ID}_GREEN = ${pin('G')}, ${ID}_BLUE = ${pin('B')};`],
        setup: [`pinMode(${ID}_RED, OUTPUT);`, `pinMode(${ID}_GREEN, OUTPUT);`, `pinMode(${ID}_BLUE, OUTPUT);`],
        // Low levels are blue, high levels are red.
        drive: level => [`analogWrite(${ID}_RED, ${level} * 255);`, `analogWrite(${ID}_GREEN, 0);`, `analogWrite(${ID}_BLUE, (1.0 - ${level}) * 255);`],
    },
    buzzer: ({ pin, NAME }) => (pin('1') || pin('2')) && {
        globals: [`const int ${NAME} = ${pin('1') || pin('2')};`],
        setup: [`pinMode(${NAME}, OUTPUT);`],
        drive: level => [`if (${level} > 0.5) tone(${NAME}, 440); else noTone(${NAME});`],
    },
    servo: ({ pin, name }) => pin('PWM') && {
        includes: ['Servo.h'],
        globals: [`Servo ${name};`],
        setup: [`${name}.attach(${pin('PWM')});`],
        drive: level => [`${name}.write(${level} * 180);`],
    },
    button: ({ pin, NAME, legs, grounded }) => {
        const wired = legs.find(pin);
        // With the other side on ground, the Arduino's own pull-up resistor keeps the pin HIGH until the press.
        const pullUp = legs.some(grounded);
        return wired && {
            globals: [`const int ${NAME} = ${pin(wired)};`],
            setup: [`pinMode(${NAME}, ${pullUp ? 'INPUT_PULLUP' : 'INPUT'});`],
            level: `(digitalRead(${NAME}) == ${pullUp ? 'LOW' : 'HIGH'} ? 1.0 : 0.0)`,
        };
    },
    signal: ({ pin, NAME, simulation }) => pin(simulation.output) && {
        globals: [`const int ${NAME} = ${pin(simulation.output)};`],
        setup: [`pinMode(${NAME}, INPUT);`],
        level: `(digitalRead(${NAME}) == ${simulation.activeLow ? 'LOW' : 'HIGH'} ? 1.0 : 0.0)`,
    },
    dial: ({ pin, NAME, simulation }) => {
        const analog = pin(simulation.output), digital = simulation.digitalOutput && pin(simulation.digitalOutput);
        if (/^A\d$/.test(analog || '')) return { globals: [`const int ${NAME} = ${analog};`], level: `(analogRead(${NAME}) / 1023.0)` };
        return (analog || digital) && {
            globals: [`const int ${NAME} = ${analog || digital};`], setup: [`pinMode(${NAME}, INPUT);`], level: `(digitalRead(${NAME}) == HIGH ? 1.0 : 0.0)`,
        };
    },
    'light-resistor': ({ pin, NAME, simulation }) => {
        const wired = simulation.pins.map(pin).find(name => /^A\d$/.test(name || ''));
        return wired && { globals: [`const int ${NAME} = ${wired};`], level: `(analogRead(${NAME}) / 1023.0)` };
    },
    distance: ({ pin, ID, name, simulation }) => pin(simulation.trigger) && pin(simulation.echo) && {
        globals: [`const int ${ID}_TRIG = ${pin(simulation.trigger)}, ${ID}_ECHO = ${pin(simulation.echo)};`, '',
            '// Sends a click of sound and times the echo. Sound takes about 58 microseconds per centimetre, there and back.',
            `float ${name}Centimetres() {`, `  digitalWrite(${ID}_TRIG, HIGH);`, '  delayMicroseconds(10);', `  digitalWrite(${ID}_TRIG, LOW);`,
            `  return pulseIn(${ID}_ECHO, HIGH, 30000) / 58.0;`, '}'],
        setup: [`pinMode(${ID}_TRIG, OUTPUT);`, `pinMode(${ID}_ECHO, INPUT);`],
        // Closer is a higher level: 1.0 when touching, 0.0 at a metre or more (or when nothing answers).
        level: `closeness(${name}Centimetres())`,
        helpers: ['float closeness(float centimetres) {', '  if (centimetres <= 0 || centimetres > 100) return 0.0;', '  return 1.0 - centimetres / 100.0;', '}'],
    },
    lcd: ({ onBus, name, simulation }) => onBus && {
        includes: ['Wire.h', 'LiquidCrystal_I2C.h'],
        globals: [`LiquidCrystal_I2C ${name}(0x27, ${simulation.cols}, ${simulation.rows});`],
        setup: [`${name}.init();`, `${name}.backlight();`, `${name}.print("Hello!");`],
        show: level => [`${name}.setCursor(0, 1);`, `${name}.print(${level} * 100);`, `${name}.print(" %   ");`],
    },
    pixels: ({ pin, ID, name, simulation }) => pin(simulation.input) && {
        includes: ['Adafruit_NeoPixel.h'],
        globals: [`const int ${ID}_COUNT = ${simulation.count};`, `Adafruit_NeoPixel ${name}(${ID}_COUNT, ${pin(simulation.input)}, NEO_GRB + NEO_KHZ800);`],
        setup: [`${name}.begin();`],
        // The level fills the pixels one after another, like a bar.
        drive: level => [`for (int i = 0; i < ${ID}_COUNT; i++) ${name}.setPixelColor(i, i < ${level} * ${ID}_COUNT + 0.5 ? ${name}.Color(0, 60, 40) : 0);`, `${name}.show();`],
    },
    dht: ({ pin, name }) => pin('SDA') && {
        includes: ['DHT.h'],
        globals: [`DHT ${name}(${pin('SDA')}, DHT22);`],
        setup: [`${name}.begin();`],
        // 0 to 50 degrees Celsius.
        level: `constrain(${name}.readTemperature() / 50.0, 0.0, 1.0)`,
    },
};

function recipeFor(definition, simulation) {
    if (BUTTON_LEGS[definition.id]) return 'button';
    if (simulation.kind === 'i2c') return simulation.device === 'lcd' ? 'lcd' : null;
    if (simulation.kind === 'pin-device') return simulation.device === 'dht' ? 'dht' : null;
    return RECIPES[simulation.kind] ? simulation.kind : null;
}

const indent = lines => lines.map(line => (line ? `  ${line}` : ''));

/** `{ code, skipped }` for the project, or `{ error }` in beginner language when there is nothing to write for. */
export function writeSketch(project) {
    const board = project.components.find(component => ['arduino-uno', 'arduino-nano'].includes(component.definitionId));
    if (!board) return { error: 'Add an Arduino Uno to the canvas first, then wire your parts to it.' };
    const resolver = new ConnectivityResolver(project);
    const net = (componentId, pinId) => resolver.graph.find(connectionRefKey(componentPinRef(componentId, pinId)));
    const boardPins = getBoardPinTable(board.definitionId).pins.map(pin => pin.name);
    const boardNet = new Map(boardPins.map(name => [net(board.id, name), name]));
    const resistors = project.components.filter(component => getComponentDef(component.definitionId)?.simulation?.kind === 'resistor')
        .map(component => [net(component.id, '1'), net(component.id, '2')]);
    // The board pin on this net, or on the far side of one resistor.
    const boardPin = id => boardNet.get(id) ?? resistors.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : [])).map(other => boardNet.get(other)).find(Boolean);
    const isIo = name => /^(\d+|A[0-5])$/.test(name || '');

    const used = new Map(), parts = [], skipped = [];
    for (const component of project.components) {
        const definition = getComponentDef(component.definitionId);
        if (!definition?.simulation || component === board) continue;
        for (const simulation of [].concat(definition.simulation)) {
            if (['resistor', 'capacitor', 'diode', 'transistor'].includes(simulation.kind)) continue;
            const kind = recipeFor(definition, simulation);
            const base = (BUTTON_LEGS[definition.id] ? (definition.id === 'slide-switch' ? 'switch' : 'button')
                : { led: 'led', 'rgb-led': 'rgb', buzzer: 'buzzer', servo: 'servo', distance: 'distance', lcd: 'lcd', pixels: 'pixels', dht: 'weather' }[kind]
                    || String(simulation.label || definition.name).toLowerCase().replace(/[^a-z]+(.)?/g, (_, letter) => (letter || '').toUpperCase()) || 'part');
            const count = (used.get(base) || 0) + 1;
            used.set(base, count);
            const name = count > 1 ? `${base}${count}` : base;
            const ID = name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
            const pin = pinId => { const found = boardPin(net(component.id, pinId)); return isIo(found) ? found : null; };
            const made = kind && RECIPES[kind]({
                pin, name, ID, NAME: `${ID}_PIN`,
                simulation, legs: BUTTON_LEGS[definition.id],
                grounded: pinId => /^GND/.test(boardNet.get(net(component.id, pinId)) || ''),
                onBus: simulation.sda && boardPin(net(component.id, simulation.sda)) === 'A4' && boardPin(net(component.id, simulation.scl)) === 'A5',
            });
            if (made) parts.push({ ...made, title: definition.name, lower: definition.name.replace(/[A-Z][a-z]/g, letters => letters.toLowerCase()), name });
            else skipped.push(kind ? `${definition.name} (not wired to an Arduino pin yet)` : `${definition.name} (no starter code for this part yet)`);
        }
    }
    if (!parts.length) {
        return { error: skipped.length ? `Nothing to write code for yet: ${skipped[0]}.` : 'Add a part such as an LED or a button and wire it to the Arduino first.' };
    }

    const sensor = parts.find(part => part.level);
    const outputs = parts.filter(part => part.drive);
    const screens = parts.filter(part => part.show);
    const loop = [];
    if (sensor) {
        loop.push(`// ${sensor.title} gives a level from 0.0 (nothing) to 1.0 (full).`, `float level = ${sensor.level};`);
        for (const part of outputs) loop.push('', `// The ${part.lower} follows the level.`, ...part.drive('level'));
        for (const part of screens) loop.push('', ...part.show('level'));
        for (const part of parts.filter(item => item.level && item !== sensor)) loop.push('', `Serial.print("${part.title}: ");`, `Serial.println(${part.level});`);
        loop.push('', `Serial.print("${sensor.title}: ");`, 'Serial.println(level);', 'delay(100);');
    } else {
        // Nothing to read, so each output is switched on and off in turn.
        for (const part of outputs) loop.push(`// Try the ${part.lower}.`, ...part.drive('1.0'), 'delay(500);', ...part.drive('0.0'), 'delay(500);', '');
        if (!outputs.length) loop.push('delay(1000);');
        else loop.pop();
    }

    const includes = [...new Set(parts.flatMap(part => part.includes || []))];
    const helpers = [...new Set(parts.map(part => (part.helpers || []).join('\n')).filter(Boolean))];
    const code = [
        '// Written by Elera from your circuit. Change anything you like!',
        ...skipped.map(text => `// Not included: ${text}.`),
        ...(includes.length ? ['', ...includes.map(file => `#include <${file}>`)] : []),
        ...(helpers.length ? ['', ...helpers] : []),
        '', ...parts.flatMap(part => part.globals || []),
        '', 'void setup() {', ...indent(['Serial.begin(9600);', ...parts.flatMap(part => part.setup || [])]), '}',
        '', 'void loop() {', ...indent(loop), '}', '',
    ].join('\n');
    return { code, skipped };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getLesson } from '../src/lessons/catalog.js';
import { advance, AvrRunner, CPU_HZ } from '../src/simulation/avr-runner.js';
import { createCircuitSimulation } from '../src/simulation/circuit-io.js';
import { createI2cDevice } from '../src/simulation/i2c-devices.js';
import { componentPinRef } from '../src/physical/model.js';

// Programs built by scripts/compile-i2c-test-programs.mjs.
const programs = JSON.parse(readFileSync(new URL('./fixtures/i2c-programs.json', import.meta.url), 'utf8'));

function circuit(parts, links) {
    const project = getLesson('blink').build();
    project.components = [project.components.find(component => component.id === 'uno'), ...parts.map(([id, definitionId]) => ({
        id, definitionId, footprintId: `free:${definitionId}`, properties: {}, placement: { type: 'free', position: { x: 0, y: 0 }, rotation: 0 },
    }))];
    project.wires = links.map(([a, b], index) => ({
        id: `w${index}`, from: componentPinRef(...a.split(':')), to: componentPinRef(...b.split(':')),
        color: '#fff', route: { mode: 'auto', waypoints: [] }, properties: {},
    }));
    return createCircuitSimulation(project);
}

function run(program, simulation, seconds, values = {}) {
    const session = { serial: '' };
    const runner = new AvrRunner(programs[program], { onSerial: text => { session.serial += text; } });
    for (let frame = 0; frame < seconds * 100; frame++) session.state = advance(runner, simulation, values, CPU_HZ / 100);
    return session;
}
const text = characters => String.fromCharCode(...characters);

test('an LCD shows what the sketch writes, a clock answers and an empty address does not', () => {
    const simulation = circuit([['lcd', 'lcd1602'], ['rtc', 'ds1307']], [
        ['lcd:VCC', 'uno:5V'], ['lcd:GND', 'uno:GND.1'], ['lcd:SDA', 'uno:A4'], ['lcd:SCL', 'uno:A5'],
        ['rtc:5V', 'uno:5V'], ['rtc:GND', 'uno:GND.1'], ['rtc:SDA', 'uno:A4'], ['rtc:SCL', 'uno:A5'],
    ]);
    const { state, serial } = run('lcdAndClock', simulation, .5);
    assert.equal(text(state.components.lcd.characters), 'Hello           OK              ');
    assert.equal(state.components.lcd.backlight, true);
    assert.deepEqual([state.components.lcd.cursorX, state.components.lcd.cursorY], [2, 1]);
    // Hours:minutes:seconds in BCD, then 2 = "nobody acknowledged the address".
    assert.match(serial, /^[0-2]?\d:[0-5]?\d:[0-5]?\d\r\n2\r\n$/);
});

test('an LCD wired to the wrong pins or without power stays blank', () => {
    const swapped = circuit([['lcd', 'lcd1602']], [['lcd:VCC', 'uno:5V'], ['lcd:GND', 'uno:GND.1'], ['lcd:SDA', 'uno:A5'], ['lcd:SCL', 'uno:A4']]);
    assert.equal(text(run('lcdAndClock', swapped, .3).state.components.lcd.characters).trim(), '');
    const unpowered = circuit([['lcd', 'lcd1602']], [['lcd:GND', 'uno:GND.1'], ['lcd:SDA', 'uno:A4'], ['lcd:SCL', 'uno:A5']]);
    assert.equal(run('lcdAndClock', unpowered, .3).state.components.lcd, undefined);
});

test('an OLED shows the pixels Adafruit_SSD1306 draws', () => {
    const simulation = circuit([['oled', 'ssd1306']], [['oled:VIN', 'uno:5V'], ['oled:GND', 'uno:GND.1'], ['oled:DATA', 'uno:A4'], ['oled:CLK', 'uno:A5']]);
    const { serial } = run('oled', simulation, 1);
    assert.match(serial, /done/);
    const { device } = simulation.i2c[0];
    assert.equal(device.lit(5, 7), true);
    assert.equal(device.lit(6, 7), false);
    assert.equal(device.lit(103, 43), true);
    assert.equal(device.lit(104, 44), false);
});

test('the motion sensor reports its tilt slider as acceleration', () => {
    const simulation = circuit([['imu', 'mpu6050']], [['imu:VCC', 'uno:5V'], ['imu:GND', 'uno:GND.1'], ['imu:SDA', 'uno:A4'], ['imu:SCL', 'uno:A5']]);
    assert.deepEqual(simulation.inputs.map(input => input.label), ['Tilt']);
    assert.match(run('motion', simulation, .3, { imu: .5 }).serial, /^(0\r\n)+$/);
    assert.match(run('motion', simulation, .3, { imu: 1 }).serial, /16384\r\n$/);
});

test('a 20x4 LCD maps its four rows', () => {
    const lcd = createI2cDevice('lcd', { cols: 20, rows: 4 });
    const pulse = value => { lcd.write(value | 0x0c); lcd.write(value | 0x08); };
    const send = (value, rs) => { pulse(value & 0xf0 | rs); pulse(value << 4 & 0xf0 | rs); };
    [0x30, 0x30, 0x30, 0x20].forEach(pulse);
    send(0x0c, 0);
    send(0x80 | 0x14, 0);
    send('3'.charCodeAt(0), 1);
    send(0x80 | 0x54, 0);
    send('4'.charCodeAt(0), 1);
    assert.deepEqual(lcd.lines().map(line => line.trim()), ['', '', '3', '4']);
});

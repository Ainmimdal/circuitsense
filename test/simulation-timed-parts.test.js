import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getLesson } from '../src/lessons/catalog.js';
import { advance, AvrRunner, CPU_HZ } from '../src/simulation/avr-runner.js';
import { createCircuitSimulation } from '../src/simulation/circuit-io.js';
import { createSpiDevice } from '../src/simulation/spi-devices.js';
import { componentPinRef } from '../src/physical/model.js';

// Programs built by scripts/compile-test-programs.mjs.
const programs = JSON.parse(readFileSync(new URL('./fixtures/programs.json', import.meta.url), 'utf8'));

function circuit(parts, links) {
    const project = getLesson('blink').build();
    project.components = [project.components.find(component => component.id === 'uno'), ...parts.map(([id, definitionId, properties = {}]) => ({
        id, definitionId, footprintId: `free:${definitionId}`, properties, placement: { type: 'free', position: { x: 0, y: 0 }, rotation: 0 },
    }))];
    project.wires = links.map(([a, b], index) => ({
        id: `w${index}`, from: componentPinRef(...a.split(':')), to: componentPinRef(...b.split(':')),
        color: '#fff', route: { mode: 'auto', waypoints: [] }, properties: {},
    }));
    return createCircuitSimulation(project);
}

function session(program, simulation) {
    const result = { serial: '', simulation };
    const runner = new AvrRunner(programs[program], { onSerial: text => { result.serial += text; } });
    result.run = (seconds, values = {}) => {
        for (let frame = 0; frame < seconds * 100; frame++) result.state = advance(runner, simulation, values, CPU_HZ / 100);
        return result;
    };
    return result;
}
const high = { output: true, level: 1 };
const low = { output: true, level: 0 };

test('a DHT22 sends the temperature and humidity on its sliders', () => {
    const simulation = circuit([['dht', 'dht22']], [['dht:VCC', 'uno:5V'], ['dht:GND', 'uno:GND.1'], ['dht:SDA', 'uno:2']]);
    assert.deepEqual(simulation.inputs.map(input => [input.id, input.label]), [['dht', 'Temperature'], ['dht/1', 'Humidity']]);
    assert.match(session('dht', simulation).run(.5, { dht: .75, 'dht/1': .4 }).serial, /35\.00 40\.00 ok/);
});

test('a key on the remote arrives at the IR receiver as its code', () => {
    const simulation = circuit([['ir', 'ir-receiver']], [['ir:VCC', 'uno:5V'], ['ir:GND', 'uno:GND.1'], ['ir:DAT', 'uno:2']]);
    const run = session('remote', simulation);
    run.run(.1);
    assert.equal(run.serial, '');
    // The fifth key is "4", which the remote sends as 16.
    assert.match(run.run(.3, { ir: 5 }).serial, /^16\r\n$/);
});

test('a load cell amplifier clocks out the weight', () => {
    const simulation = circuit([['scale', 'hx711']], [['scale:VCC', 'uno:5V'], ['scale:GND', 'uno:GND.1'], ['scale:DT', 'uno:3'], ['scale:SCK', 'uno:4']]);
    // 0.2 of 5 kg = 1000 g at 420 counts per gram.
    assert.match(session('loadCell', simulation).run(.5, { scale: .2 }).serial, /(420000\r\n)+$/);
});

test('a stepper motor turns 1.8 degrees for each step', () => {
    const simulation = circuit([['motor', 'stepper-motor']], [['motor:A+', 'uno:8'], ['motor:A-', 'uno:9'], ['motor:B+', 'uno:10'], ['motor:B-', 'uno:11']]);
    const run = session('stepper', simulation).run(1);
    assert.match(run.serial, /done/);
    // The first of the 51 steps only energises the coils.
    assert.equal(run.state.components.motor.angle, 90);
});

test('a relay switches its contacts when a transistor powers the coil', () => {
    const simulation = circuit(
        [['rb', 'resistor', { value: '1000' }], ['q', 'transistor-npn'], ['k', 'relay-dpdt'], ['r', 'resistor', { value: '1000' }]],
        [['uno:9', 'rb:1'], ['rb:2', 'q:B'], ['q:E', 'uno:GND.1'], ['k:COIL1', 'uno:5V'], ['k:COIL2', 'q:C'],
            ['k:P1', 'uno:A0'], ['k:NO1', 'uno:5V'], ['k:NC1', 'uno:GND.2']],
    );
    assert.ok(simulation.evaluate({ 9: low }).pinLevels.A0 < .1);
    assert.ok(simulation.evaluate({ 9: high }).pinLevels.A0 > .9);
    assert.ok(simulation.evaluate({ 9: low }).pinLevels.A0 < .1);
});

test('a rotary encoder steps through its two signals one click at a time', () => {
    const simulation = circuit([['knob', 'rotary-encoder']],
        [['knob:VCC', 'uno:5V'], ['knob:GND', 'uno:GND.1'], ['knob:CLK', 'uno:2'], ['knob:DT', 'uno:3']]);
    const read = value => { const { pinLevels } = simulation.evaluate({}, { knob: value }, .01); return `${Math.round(pinLevels[2])}${Math.round(pinLevels[3])}`; };
    assert.equal(read(.5), '11');
    // One click clockwise: clock falls first.
    assert.deepEqual([read(.525), read(.525), read(.525), read(.525), read(.525)], ['01', '00', '10', '11', '11']);
    // And back: data falls first.
    assert.deepEqual([read(.5), read(.5), read(.5), read(.5)], ['10', '00', '01', '11']);
});

test('files on the SD card are still there on the next run', () => {
    const saved = new Map();
    const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
    const wires = [['sd:VCC', 'uno:5V'], ['sd:GND', 'uno:GND.1'], ['sd:DI', 'uno:11'], ['sd:DO', 'uno:12'], ['sd:SCK', 'uno:13'], ['sd:CS', 'uno:10']];
    const withCard = () => {
        const simulation = circuit([['sd', 'microsd-card']], wires);
        simulation.spi[0].device = createSpiDevice('sd', { storage });
        return simulation;
    };
    assert.match(session('sdRead', withCard()).run(2).serial, /no file/);
    assert.match(session('sd', withCard()).run(2).serial, /saved/);
    assert.match(session('sdRead', withCard()).run(2).serial, /hello 42/);
});

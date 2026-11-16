import test from 'node:test';
import assert from 'node:assert/strict';

import { getLesson } from '../src/lessons/catalog.js';
import { createCircuitSimulation } from '../src/simulation/circuit-io.js';
import { componentPinRef } from '../src/physical/model.js';

// An Uno with loose parts joined pin to pin; `pins` is what the program is doing.
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
const high = { output: true, level: 1 };
const low = { output: true, level: 0 };

test('a transistor lets an Arduino pin switch a motor', () => {
    const simulation = circuit(
        [['rb', 'resistor', { value: '1000' }], ['q', 'transistor-npn'], ['m', 'dc-motor']],
        [['uno:9', 'rb:1'], ['rb:2', 'q:B'], ['q:E', 'uno:GND.1'], ['m:+', 'uno:5V'], ['m:-', 'q:C']],
    );
    assert.equal(simulation.evaluate({ 9: high }).components.m.spinning, true);
    assert.equal(simulation.evaluate({ 9: low }).components.m.spinning, false);
});

test('a diode passes current one way only', () => {
    const build = (anode, cathode) => circuit(
        [['d', 'diode'], ['r', 'resistor', { value: '1000' }]],
        [['uno:5V', `d:${anode}`], [`d:${cathode}`, 'r:1'], ['r:2', 'uno:GND.1'], ['r:1', 'uno:A0']],
    );
    assert.ok(Math.abs(build('A', 'C').evaluate({}).pinLevels.A0 - 4.3 / 5) < .02);
    assert.ok(build('C', 'A').evaluate({}).pinLevels.A0 < .01);
});

test('a photoresistor divider reads higher in brighter light', () => {
    const simulation = circuit(
        [['ldr', 'photoresistor'], ['r', 'resistor', { value: '10000' }]],
        [['uno:5V', 'ldr:1'], ['ldr:2', 'r:1'], ['r:2', 'uno:GND.1'], ['r:1', 'uno:A0']],
    );
    assert.deepEqual(simulation.inputs.map(input => input.label), ['Light']);
    const dark = simulation.evaluate({}, { ldr: 0 }).pinLevels.A0;
    const bright = simulation.evaluate({}, { ldr: 1 }).pinLevels.A0;
    assert.ok(dark < .1 && bright > .85, `${dark} ${bright}`);
});

test('a joystick has two axes and a push switch that needs a pull-up', () => {
    const simulation = circuit([['joy', 'analog-joystick']],
        [['joy:VCC', 'uno:5V'], ['joy:GND', 'uno:GND.1'], ['joy:HORZ', 'uno:A0'], ['joy:VERT', 'uno:A1'], ['joy:SEL', 'uno:2']]);
    assert.deepEqual(simulation.inputs.map(input => input.id), ['joy', 'joy:1', 'joy:2']);
    const pullup = { 2: { pullup: true } };
    const state = simulation.evaluate(pullup, { joy: .25, 'joy:1': 1 });
    assert.ok(Math.abs(state.pinLevels.A0 - .25) < .01 && state.pinLevels.A1 > .99);
    assert.ok(state.pinLevels[2] > .9);
    assert.ok(simulation.evaluate(pullup, { 'joy:2': 1 }).pinLevels[2] < .1);
});

test('a motion sensor output goes HIGH while triggered', () => {
    const simulation = circuit([['pir', 'pir-motion']], [['pir:VCC', 'uno:5V'], ['pir:GND', 'uno:GND.1'], ['pir:OUT', 'uno:2']]);
    assert.ok(simulation.evaluate({}, {}).pinLevels[2] < .1);
    assert.ok(simulation.evaluate({}, { pir: 1 }).pinLevels[2] > .9);
});

test('a capacitor charges through a resistor over time and holds its charge', () => {
    // Pin 9 - 1 k - A0, with 100 uF from A0 to ground: time constant 0.1 s.
    const simulation = circuit(
        [['r', 'resistor', { value: '1000' }], ['c', 'capacitor-electrolytic']],
        [['uno:9', 'r:1'], ['r:2', 'c:+'], ['c:-', 'uno:GND.1'], ['c:+', 'uno:A0']],
    );
    const step = (pin, seconds) => simulation.evaluate({ 9: pin }, {}, seconds).pinLevels.A0 * 5;
    assert.ok(step(high, 0) < .01);
    let volts = 0;
    for (let i = 0; i < 100; i++) volts = step(high, .001);
    assert.ok(Math.abs(volts - 5 * (1 - Math.exp(-1))) < .05, `after one time constant: ${volts}`);
    assert.ok(Math.abs(step(high, 0) - volts) < .01, 'no time passing changes nothing');
    for (let i = 0; i < 100; i++) volts = step(low, .001);
    assert.ok(Math.abs(volts - 3.16 * Math.exp(-1)) < .05, `discharging: ${volts}`);
});

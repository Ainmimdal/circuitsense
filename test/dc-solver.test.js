import test from 'node:test';
import assert from 'node:assert/strict';

import { getLesson } from '../src/lessons/catalog.js';
import { componentPinRef } from '../src/physical/model.js';
import { createCircuitSimulation } from '../src/simulation/circuit-io.js';
import { solveDc } from '../src/simulation/dc-solver.js';

const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ${expected}`);
const rails = () => new Map([['5v', 5], ['gnd', 0]]);

test('a voltage divider and a resistor mesh settle at the hand-calculated voltages', () => {
    const divider = solveDc({ fixed: rails(), resistors: [{ a: '5v', b: 'mid', ohms: 1000 }, { a: 'mid', b: 'gnd', ohms: 3000 }] });
    near(divider.voltage('mid'), 3.75);
    // Two dividers bridged by a resistor (a Wheatstone bridge).
    const bridge = solveDc({ fixed: rails(), resistors: [
        { a: '5v', b: 'left', ohms: 100 }, { a: 'left', b: 'gnd', ohms: 100 },
        { a: '5v', b: 'right', ohms: 100 }, { a: 'right', b: 'gnd', ohms: 300 },
        { a: 'left', b: 'right', ohms: 100 },
    ] });
    near(bridge.voltage('left'), 25 / 9);
    near(bridge.voltage('right'), 10 / 3);
});

test('an LED drops its forward voltage and the resistor sets the current', () => {
    const led = { anode: 'a', cathode: 'gnd', forwardVoltage: 2 };
    const one = solveDc({ fixed: rails(), resistors: [{ a: '5v', b: 'a', ohms: 220 }], diodes: [led] });
    near(one.diodeCurrents[0], 3 / 230);
    const backwards = solveDc({ fixed: rails(), resistors: [{ a: '5v', b: 'a', ohms: 220 }], diodes: [{ anode: 'gnd', cathode: 'a', forwardVoltage: 2 }] });
    assert.equal(backwards.diodeCurrents[0], 0);
    near(backwards.voltage('a'), 5, 1e-3);
});

test('LEDs in series share the supply, and too many of them stay dark', () => {
    const chain = count => solveDc({
        fixed: rails(),
        resistors: [{ a: '5v', b: 'n0', ohms: 220 }],
        diodes: Array.from({ length: count }, (_, i) => ({ anode: `n${i}`, cathode: i === count - 1 ? 'gnd' : `n${i + 1}`, forwardVoltage: 2 })),
    });
    const two = chain(2);
    near(two.diodeCurrents[0], 1 / 240);
    near(two.diodeCurrents[1], 1 / 240);
    assert.deepEqual(chain(3).diodeCurrents, [0, 0, 0]);
});

test('a node with no path to a supply is floating', () => {
    const solved = solveDc({ fixed: rails(), resistors: [{ a: 'x', b: 'y', ohms: 100 }] });
    assert.equal(solved.voltage('x'), null);
    assert.equal(solved.voltage('nowhere'), null);
    assert.equal(solved.voltage('5v'), 5);
});

test('a bigger resistor makes the lesson LED dimmer', () => {
    const brightness = value => {
        const project = getLesson('blink').build();
        project.components.find(component => component.id === 'r1').properties.value = value;
        return createCircuitSimulation(project).evaluate({ 13: { output: true, level: 1 } }).components.led.brightness;
    };
    assert.equal(brightness('220'), 1);
    assert.ok(brightness('1000') < .5);
});

test('a slide switch connects its middle pin to one side or the other', () => {
    const project = getLesson('blink').build();
    project.components.push({ id: 'sw', definitionId: 'slide-switch', footprintId: 'free:slide-switch', properties: {},
        placement: { type: 'free', position: { x: 150, y: 80 }, rotation: 0 } });
    const wire = (id, from, to) => ({ id, from: componentPinRef(...from), to: componentPinRef(...to), color: '#fff', route: { mode: 'auto', waypoints: [] }, properties: {} });
    project.wires.push(wire('s1', ['sw', '1'], ['uno', '5V']), wire('s2', ['sw', '2'], ['uno', '2']), wire('s3', ['sw', '3'], ['uno', 'GND.2']));
    const circuit = createCircuitSimulation(project);
    assert.deepEqual(circuit.inputs.map(input => input.kind), ['switch']);
    assert.equal(circuit.evaluate({}, { sw: 0 }).pinLevels[2], 1);
    assert.equal(circuit.evaluate({}, { sw: 1 }).pinLevels[2], 0);
});

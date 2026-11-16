import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getLesson } from '../src/lessons/catalog.js';
import { advance, AvrRunner, CPU_HZ } from '../src/simulation/avr-runner.js';
import { createCircuitSimulation } from '../src/simulation/circuit-io.js';
import { componentPinRef } from '../src/physical/model.js';

// Programs built by scripts/compile-test-programs.mjs.
const programs = JSON.parse(readFileSync(new URL('./fixtures/programs.json', import.meta.url), 'utf8'));

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

test('NeoPixels take their colours in order and pass the rest down the chain', () => {
    const simulation = circuit([['ring', 'led-ring'], ['one', 'neopixel']], [
        ['ring:VCC', 'uno:5V'], ['ring:GND', 'uno:GND.1'], ['ring:DIN', 'uno:6'],
        ['ring:DOUT', 'one:DIN'], ['one:VDD', 'uno:5V'], ['one:VSS', 'uno:GND.1'],
    ]);
    const runner = new AvrRunner(programs.pixels);
    let state;
    for (let frame = 0; frame < 20; frame++) state = advance(runner, simulation, {}, CPU_HZ / 100);
    const colors = id => simulation.parts.find(part => part.id === id).colors;
    assert.deepEqual(colors('ring')[0], { r: 1, g: 0, b: 0 });
    assert.deepEqual(colors('ring')[3], { r: 0, g: 0, b: 1 });
    assert.deepEqual(colors('ring')[1], { r: 0, g: 0, b: 0 });
    assert.deepEqual(colors('one'), [{ r: 0, g: 1, b: 0 }]);
    // The single pixel's artwork takes r, g, b; the ring is painted pixel by pixel.
    const single = {};
    state.components.one.paint(single);
    assert.deepEqual(single, { r: 0, g: 1, b: 0 });
    const painted = [];
    state.components.ring.paint({ setPixel: (index, color) => painted.push([index, color.r]) });
    assert.deepEqual(painted.slice(0, 2), [[0, 1], [1, 0]]);
});

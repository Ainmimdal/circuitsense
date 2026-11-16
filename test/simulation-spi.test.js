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

function run(program, simulation, seconds) {
    let serial = '';
    const runner = new AvrRunner(programs[program], { onSerial: text => { serial += text; } });
    for (let frame = 0; frame < seconds * 100; frame++) advance(runner, simulation, {}, CPU_HZ / 100);
    return serial;
}

test('the colour screen shows the pixels sent over SPI', () => {
    const simulation = circuit([['tft', 'ili9341']], [
        ['tft:VCC', 'uno:5V'], ['tft:GND', 'uno:GND.1'], ['tft:MOSI', 'uno:11'], ['tft:SCK', 'uno:13'], ['tft:CS', 'uno:10'], ['tft:D/C', 'uno:9'],
    ]);
    assert.match(run('tft', simulation, .3), /done/);
    const { device } = simulation.spi[0];
    assert.deepEqual(device.pixel(10, 20), [255, 0, 0]);
    assert.deepEqual(device.pixel(11, 21), [255, 0, 0]);
    assert.deepEqual(device.pixel(12, 20), [0, 0, 0]);
    assert.deepEqual(device.pixel(100, 200), [0, 255, 0]);
});

const SD_WIRES = [['sd:VCC', 'uno:5V'], ['sd:GND', 'uno:GND.1'], ['sd:DI', 'uno:11'], ['sd:DO', 'uno:12'], ['sd:SCK', 'uno:13'], ['sd:CS', 'uno:10']];

test('the SD library can save a file to the card and read it back', () => {
    assert.match(run('sd', circuit([['sd', 'microsd-card']], SD_WIRES), 2), /hello 42\r\nsaved/);
});

test('a card whose data-out wire is missing is not found', () => {
    const wires = SD_WIRES.filter(([from]) => from !== 'sd:DO');
    assert.match(run('sd', circuit([['sd', 'microsd-card']], wires), 3), /no card/);
});

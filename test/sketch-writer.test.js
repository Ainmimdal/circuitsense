import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getLesson, listLessons } from '../src/lessons/catalog.js';
import { advance, AvrRunner, CPU_HZ } from '../src/simulation/avr-runner.js';
import { createCircuitSimulation } from '../src/simulation/circuit-io.js';
import { writeSketch } from '../src/simulation/sketch-writer.js';

// Programs built by scripts/compile-test-programs.mjs from the code writeSketch produces.
const programs = JSON.parse(readFileSync(new URL('./fixtures/programs.json', import.meta.url), 'utf8'));

function run(id, seconds, values = {}, session = null) {
    session ||= { serial: '', circuit: createCircuitSimulation(getLesson(id).build()) };
    session.runner ||= new AvrRunner(programs[`written:${id}`], { onSerial: text => { session.serial += text; } });
    for (let frame = 0; frame < seconds * 100; frame++) session.state = advance(session.runner, session.circuit, values, CPU_HZ / 100);
    return session;
}

test('every lesson circuit gets code with nothing left out', () => {
    for (const { id } of listLessons()) {
        const written = writeSketch(getLesson(id).build());
        assert.equal(written.error, undefined, id);
        assert.deepEqual(written.skipped, [], id);
        assert.match(written.code, /void setup\(\) \{[\s\S]+void loop\(\) \{/, id);
    }
});

test('the written code uses the pins the parts are wired to', () => {
    const code = writeSketch(getLesson('doorbell').build()).code;
    assert.match(code, /const int BUZZER_PIN = 9;/);
    assert.match(code, /pinMode\(BUTTON_PIN, INPUT_PULLUP\);/);
});

test('a circuit with nothing wired explains what to do', () => {
    const project = getLesson('blink').build();
    project.wires = [];
    assert.match(writeSketch(project).error, /LED \(not wired to an Arduino pin yet\)/);
    project.components = project.components.filter(component => component.definitionId !== 'arduino-uno');
    assert.match(writeSketch(project).error, /Add an Arduino Uno/);
});

test('written code without a sensor tries each LED in turn', () => {
    const lit = new Set();
    const session = run('traffic-light', .1);
    for (let step = 0; step < 35; step++) {
        run('traffic-light', .1, {}, session);
        const on = Object.entries(session.state.components).filter(([, state]) => state.value).map(([id]) => id);
        assert.ok(on.length <= 1);
        on.forEach(id => lit.add(id));
    }
    assert.equal(lit.size, 3);
});

test('written code makes the button sound the buzzer', () => {
    const session = run('doorbell', .3);
    assert.ok(!session.state.sound);
    run('doorbell', .3, { btn: 1 }, session);
    assert.equal(Math.round(session.state.sound.frequency), 440);
    assert.match(session.serial, /Push Button: 1\.00/);
});

test('written code turns the servo with the knob and reads the distance sensor', () => {
    const servo = run('servo-knob', .5, { pot: 1 });
    assert.ok(Object.values(servo.state.components).some(state => state.angle > 170));
    const near = run('distance-alarm', .5, { sonar: 0 });
    assert.match(near.serial, /Distance Sensor: 0\.9\d/);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { getLesson, listLessons } from '../src/lessons/catalog.js';
import { advance, AvrRunner, CPU_HZ } from '../src/simulation/avr-runner.js';
import { createCircuitSimulation } from '../src/simulation/circuit-io.js';
import { compileSketch, DEFAULT_SKETCH, explainCompileErrors, prebuiltHex } from '../src/simulation/compile.js';

// Runs a lesson's own starter program on its finished circuit for `seconds` of simulated time.
function runLesson(id, seconds, values = {}, session = null) {
    const lesson = getLesson(id);
    session ||= { serial: '', circuit: createCircuitSimulation(lesson.build()) };
    session.runner ||= new AvrRunner(prebuiltHex(lesson.code), { onSerial: text => { session.serial += text; } });
    for (let frame = 0; frame < seconds * 100; frame++) session.state = advance(session.runner, session.circuit, values, CPU_HZ / 100);
    return session;
}

test('every lesson and the default sketch has a prebuilt program', () => {
    for (const code of [DEFAULT_SKETCH, ...listLessons().map(lesson => lesson.code)]) {
        assert.ok(prebuiltHex(code), `run "node scripts/compile-lesson-sketches.mjs <compile server>" after editing lesson code:\n${code.split('\n')[0]}`);
    }
});

test('Blink turns the LED on for a second, then off', () => {
    const session = runLesson('blink', .5);
    assert.equal(session.state.components.led.value, true);
    runLesson('blink', 1, {}, session);
    assert.equal(session.state.components.led.value, false);
});

test('Push to light follows the button and is dark until it is pressed', () => {
    const session = runLesson('button-led', .2);
    assert.equal(session.state.components.led.value, false);
    runLesson('button-led', .2, { btn: 1 }, session);
    assert.equal(session.state.components.led.value, true);
    assert.equal(session.state.components.btn.pressed, true);
    runLesson('button-led', .2, {}, session);
    assert.equal(session.state.components.led.value, false);
});

test('Traffic light starts on red only', () => {
    const { state } = runLesson('traffic-light', .5);
    assert.deepEqual(['led-red', 'led-yellow', 'led-green'].map(id => state.components[id].value), [true, false, false]);
});

test('Knob dimmer brightness follows the knob through PWM', () => {
    const session = runLesson('knob-dimmer', .3, { pot: .25 });
    assert.ok(Math.abs(session.state.components.led.brightness - .25) < .05, `brightness ${session.state.components.led.brightness}`);
    runLesson('knob-dimmer', .3, { pot: 0 }, session);
    assert.equal(session.state.components.led.value, false);
});

test('Doorbell is silent until pressed, then plays the 659 Hz ding', () => {
    const session = runLesson('doorbell', .3);
    assert.equal(session.state.sound, null);
    runLesson('doorbell', .2, { btn: 1 }, session);
    assert.ok(Math.abs(session.state.sound.frequency - 659) < 15, `frequency ${session.state.sound?.frequency}`);
    assert.equal(session.state.components.buzzer.hasSignal, true);
});

test('Night light switches on in the dark and prints readings', () => {
    const session = runLesson('night-light', .5, { ldr: 0 });
    assert.equal(session.state.components.led.value, true);
    assert.match(session.serial, /^\d+\r\n/);
    runLesson('night-light', .5, { ldr: 1 }, session);
    assert.equal(session.state.components.led.value, false);
});

test('Colour mixer starts red and fades toward green', () => {
    const session = runLesson('rgb-mixer', .1);
    assert.ok(session.state.components.rgb.ledRed > .8 && session.state.components.rgb.ledBlue < .1);
    runLesson('rgb-mixer', 1.8, {}, session);
    assert.ok(session.state.components.rgb.ledGreen > .7, `green ${session.state.components.rgb.ledGreen}`);
});

test('Servo steering turns the arm to the knob position', () => {
    const session = runLesson('servo-knob', .3, { pot: 1 });
    assert.ok(session.state.components.servo.angle >= 175, `angle ${session.state.components.servo.angle}`);
    runLesson('servo-knob', .3, { pot: .5 }, session);
    assert.ok(Math.abs(session.state.components.servo.angle - 90) <= 4, `angle ${session.state.components.servo.angle}`);
});

test('a servo without power does not move', () => {
    const project = getLesson('servo-knob').build();
    project.wires = project.wires.filter(wire => wire.id !== 'w-servo-5v');
    const session = runLesson('servo-knob', .3, { pot: 1 }, { serial: '', circuit: createCircuitSimulation(project) });
    assert.equal(session.state.components.servo, undefined);
});

test('a project without a supported board explains what to do', () => {
    const project = getLesson('blink').build();
    project.components = project.components.filter(component => component.id !== 'uno');
    assert.match(createCircuitSimulation(project).error, /Add an Arduino Uno/);
});

test('compiler errors are explained for beginners with their line', () => {
    const problems = explainCompileErrors([
        "sketch.ino: In function 'void setup()':",
        "sketch.ino:3:3: error: expected ';' before 'digitalwrite'",
        'sketch.ino:3:9: error: something else on the same line',
        "sketch.ino:7:3: error: 'ledPin' was not declared in this scope",
        "sketch.ino:9:1: error: expected '}' at end of input",
        'sketch.ino:1:10: fatal error: Wire2.h: No such file or directory',
    ].join('\n'));
    assert.deepEqual(problems.map(problem => problem.line), [3, 7, 9, 1]);
    assert.match(problems[0].message, /semicolon/);
    assert.match(problems[1].message, /"ledPin"/);
    assert.match(problems[2].message, /curly brackets/);
    assert.match(problems[3].message, /"Wire2\.h" is not available/);
    assert.match(explainCompileErrors("x.o: undefined reference to `loop'")[0].message, /needs a loop\(\) function/);
    assert.equal(explainCompileErrors('').length, 0);
});

test('compileSketch uses prebuilt programs, the server for edits, and says when there is no server', async () => {
    assert.ok((await compileSketch(getLesson('blink').code, { server: '' })).hex);
    assert.match((await compileSketch('void setup(){}', { server: '' })).unavailable, /compile server/);
    const fetchImpl = async () => ({ json: async () => ({ errors: "sketch.ino:1:1: error: expected ';' before 'x'" }) });
    assert.equal((await compileSketch('void setup(){}', { server: 'http://compile.test', fetchImpl })).problems[0].line, 1);
});

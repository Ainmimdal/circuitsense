import test from 'node:test';
import assert from 'node:assert/strict';

import { createFullBreadboardSurface, createHalfBreadboardSurface } from '../src/physical/breadboard.js';
import { defaultFootprintForComponent } from '../src/physical/footprints.js';
import {
    componentPinRef, createComponentInstance, createPhysicalProject, surfaceHoleRef,
} from '../src/physical/model.js';
import { validatePhysicalProject } from '../src/physical/validation.js';

function part(id, definitionId, x = 0, y = 0) {
    return createComponentInstance({ id, definitionId, footprintId: defaultFootprintForComponent(definitionId).id, x, y });
}

let wireCount = 0;
function pin(componentId, pinId) {
    return componentPinRef(componentId, pinId);
}

function wire(from, to) {
    wireCount += 1;
    return { id: `w${wireCount}`, from, to, route: { mode: 'auto', waypoints: [] }, color: '#22d3ee', properties: {} };
}

function connect(...pairs) {
    return pairs.map(([a, b]) => wire(pin(...a), pin(...b)));
}

function project({ components, wires = [], surfaces = [] }) {
    return createPhysicalProject({ surfaces, components, wires });
}

function findings(input) {
    return validatePhysicalProject(input).all;
}

function ids(input) {
    return findings(input).map(item => item.id);
}

function byId(input, id) {
    return findings(input).find(item => item.id === id);
}

// An Uno-driven LED with a series resistor on the anode, fully wired.
function ledCircuit({ resistorOn = 'anode' } = {}) {
    const components = [part('uno', 'arduino-uno'), part('led', 'led'), part('r1', 'resistor')];
    const wires = resistorOn === 'anode'
        ? connect([['uno', '13'], ['r1', '1']], [['r1', '2'], ['led', 'A']], [['led', 'C'], ['uno', 'GND.1']])
        : resistorOn === 'cathode'
            ? connect([['uno', '13'], ['led', 'A']], [['led', 'C'], ['r1', '1']], [['r1', '2'], ['uno', 'GND.1']])
            : connect([['uno', '13'], ['led', 'A']], [['led', 'C'], ['uno', 'GND.1']]);
    return project({ components, wires });
}

test('a correctly wired LED circuit has no electrical findings', () => {
    assert.deepEqual(validatePhysicalProject(ledCircuit()).all
        .filter(item => item.severity !== 'info'), []);
});

test('led-no-resistor accepts a resistor on either side of the LED', () => {
    assert.ok(!ids(ledCircuit({ resistorOn: 'cathode' })).includes('led-no-resistor:led'));
    const bare = byId(ledCircuit({ resistorOn: 'none' }), 'led-no-resistor:led');
    assert.equal(bare?.severity, 'warning');
    assert.equal(bare.instanceId, 'led');
});

test('led-no-resistor ignores an LED that is mounted but not wired to anything', () => {
    const surface = createHalfBreadboardSurface();
    const led = part('led', 'led');
    led.placement = { type: 'surface', surfaceId: surface.id, rotation: 0, bindings: { C: 'C10', A: 'C11' } };
    const result = ids(project({ surfaces: [surface], components: [part('uno', 'arduino-uno'), led] }));
    assert.ok(!result.includes('led-no-resistor:led'));
    assert.ok(result.includes('unconnected:led'));
});

test('current-overload and current-high use the board file supply limit', () => {
    const servos = count => {
        const components = [part('uno', 'arduino-uno')];
        const wires = [];
        for (let index = 0; index < count; index++) {
            components.push(part(`s${index}`, 'servo'));
            wires.push(...connect([[`s${index}`, 'V+'], ['uno', '5V']], [[`s${index}`, 'GND'], ['uno', 'GND.1']],
                [[`s${index}`, 'PWM'], ['uno', ['3', '5', '6'][index]]]));
        }
        return { components, wires };
    };
    // 3 x 200 mA exceeds the Uno's 500 mA budget.
    const overload = byId(project(servos(3)), 'current-overload:uno');
    assert.equal(overload?.severity, 'error');
    assert.match(overload.message, /600 mA.*500 mA/);
    assert.deepEqual(overload.relatedIds.sort(), ['s0', 's1', 's2']);

    // 2 x 200 mA + 15 mA is above 80 % of the budget.
    const high = servos(2);
    high.components.push(part('sonar', 'hc-sr04'));
    high.wires.push(...connect([['sonar', 'VCC'], ['uno', '5V']], [['sonar', 'GND'], ['uno', 'GND.2']],
        [['sonar', 'TRIG'], ['uno', '7']], [['sonar', 'ECHO'], ['uno', '8']]));
    const result = ids(project(high));
    assert.ok(result.includes('current-high:uno'));
    assert.ok(!result.includes('current-overload:uno'));

    // Unwired parts draw nothing from the board.
    const idle = servos(0);
    idle.components.push(part('s0', 'servo'), part('s1', 'servo'), part('s2', 'servo'));
    assert.ok(!ids(project(idle)).some(id => id.startsWith('current-')));
});

test('current budget counts parts powered through breadboard rails', () => {
    const surface = createHalfBreadboardSurface();
    const components = [part('uno', 'arduino-uno'), part('s0', 'servo'), part('s1', 'servo'), part('s2', 'servo')];
    const wires = [wire(pin('uno', '5V'), surfaceHoleRef(surface.id, 'TP1')), wire(pin('uno', 'GND.1'), surfaceHoleRef(surface.id, 'TN1'))];
    ['s0', 's1', 's2'].forEach((id, index) => wires.push(
        wire(pin(id, 'V+'), surfaceHoleRef(surface.id, `TP${index + 3}`)),
        wire(pin(id, 'GND'), surfaceHoleRef(surface.id, `TN${index + 3}`)),
        wire(pin(id, 'PWM'), pin('uno', ['3', '5', '6'][index]))));
    assert.ok(ids(project({ surfaces: [surface], components, wires })).includes('current-overload:uno'));
});

test('pin-mismatch reports a servo on a non-PWM pin', () => {
    const issue = byId(project({
        components: [part('uno', 'arduino-uno'), part('servo', 'servo')],
        wires: connect([['servo', 'PWM'], ['uno', '2']], [['servo', 'V+'], ['uno', '5V']], [['servo', 'GND'], ['uno', 'GND.1']]),
    }), 'pin-mismatch:servo:PWM');
    assert.equal(issue?.severity, 'error');
    assert.match(issue.message, /PWM/);
    assert.deepEqual(issue.relatedIds, ['uno']);
});

test('pin-mismatch reports I2C lines that miss the board SDA/SCL pins', () => {
    const wrong = project({
        components: [part('uno', 'arduino-uno'), part('lcd', 'lcd1602')],
        wires: connect([['lcd', 'VCC'], ['uno', '5V']], [['lcd', 'GND'], ['uno', 'GND.1']],
            [['lcd', 'SDA'], ['uno', '7']], [['lcd', 'SCL'], ['uno', 'A5']]),
    });
    const sda = byId(wrong, 'pin-mismatch:lcd:SDA');
    assert.equal(sda?.severity, 'error');
    assert.match(sda.message, /pin A4 \(it is on 7\)/);
    assert.ok(!ids(wrong).includes('pin-mismatch:lcd:SCL'));
});

test('pin-mismatch reports an output on an ESP32 input-only pin', () => {
    const result = byId(project({
        components: [part('esp', 'esp32-devkit-v1'), part('led', 'led'), part('r1', 'resistor')],
        wires: connect([['esp', 'D34'], ['led', 'A']], [['led', 'C'], ['r1', '1']], [['r1', '2'], ['esp', 'GND.1']]),
    }), 'pin-mismatch:led:A');
    assert.equal(result?.severity, 'error');
    assert.match(result.message, /input-only/);
});

test('pin-constraint warns about devices on serial pins', () => {
    const issue = byId(project({
        components: [part('uno', 'arduino-uno'), part('btn', 'pushbutton')],
        wires: connect([['btn', '1.l'], ['uno', '0']], [['btn', '2.l'], ['uno', 'GND.1']]),
    }), 'pin-constraint:uno:0:serial_reserved');
    assert.equal(issue?.severity, 'warning');
    assert.match(issue.message, /USB serial/);
    assert.equal(issue.instanceId, 'btn');
});

test('duplicate-pin flags two point-to-point devices on one controller pin', () => {
    const components = [part('uno', 'arduino-uno'), part('led1', 'led'), part('led2', 'led'), part('r1', 'resistor'), part('r2', 'resistor')];
    const wires = connect([['uno', '13'], ['led1', 'A']], [['uno', '13'], ['led2', 'A']],
        [['led1', 'C'], ['r1', '1']], [['r1', '2'], ['uno', 'GND.1']],
        [['led2', 'C'], ['r2', '1']], [['r2', '2'], ['uno', 'GND.2']]);
    const issue = byId(project({ components, wires }), 'duplicate-pin:uno:13');
    assert.equal(issue?.severity, 'error');
    assert.deepEqual(issue.relatedIds.sort(), ['led1', 'led2']);
});

test('duplicate-pin allows a shared I2C bus and a pull resistor on a signal pin', () => {
    const components = [part('uno', 'arduino-uno'), part('lcd1', 'lcd1602'), part('lcd2', 'lcd1602'),
        part('btn', 'pushbutton'), part('pull', 'resistor')];
    const wires = connect(
        [['lcd1', 'SDA'], ['uno', 'A4']], [['lcd1', 'SCL'], ['uno', 'A5']],
        [['lcd2', 'SDA'], ['uno', 'A4']], [['lcd2', 'SCL'], ['uno', 'A5']],
        [['lcd1', 'VCC'], ['uno', '5V']], [['lcd2', 'VCC'], ['uno', '5V']],
        [['lcd1', 'GND'], ['uno', 'GND.1']], [['lcd2', 'GND'], ['uno', 'GND.1']],
        [['btn', '1.l'], ['uno', '2']], [['pull', '1'], ['uno', '2']], [['pull', '2'], ['uno', 'GND.2']],
        [['btn', '2.l'], ['uno', '5V']]);
    const result = findings(project({ components, wires }));
    assert.deepEqual(result.filter(item => item.severity !== 'info').map(item => item.id), []);
});

test('power-short catches 5V tied to GND directly and through a breadboard rail', () => {
    const direct = byId(project({ components: [part('uno', 'arduino-uno')], wires: connect([['uno', '5V'], ['uno', 'GND.1']]) }),
        'power-short:uno:5V');
    assert.equal(direct?.severity, 'error');

    const surface = createHalfBreadboardSurface();
    const viaRail = project({
        surfaces: [surface],
        components: [part('uno', 'arduino-uno')],
        wires: [wire(pin('uno', '5V'), surfaceHoleRef(surface.id, 'TP1')), wire(pin('uno', 'GND.2'), surfaceHoleRef(surface.id, 'TP4'))],
    });
    assert.ok(ids(viaRail).includes('power-short:uno:5V'));
});

test('supply checks resolve full-size breadboard rails through that board definition', () => {
    const surface = createFullBreadboardSurface();
    const tie = (powerHole, groundHole) => project({
        surfaces: [surface],
        components: [part('uno', 'arduino-uno')],
        wires: [wire(pin('uno', '5V'), surfaceHoleRef(surface.id, powerHole)), wire(pin('uno', 'GND.1'), surfaceHoleRef(surface.id, groundHole))],
    });
    // TP45 and TP48 only exist on the 830-point board and share its right-hand rail segment.
    assert.ok(ids(tie('TP45', 'TP48')).includes('power-short:uno:5V'));
    // The full-size rail is split in the middle, so the halves are separate nets.
    assert.ok(!ids(tie('TP1', 'TP45')).includes('power-short:uno:5V'));
});

test('supply-conflict catches two different supply pins tied together', () => {
    const issue = byId(project({ components: [part('uno', 'arduino-uno')], wires: connect([['uno', '5V'], ['uno', '3.3V']]) }),
        'supply-conflict:uno:3.3V+5V');
    assert.equal(issue?.severity, 'error');
});

test('reversed-supply catches a VCC pin wired to ground', () => {
    const issue = byId(project({
        components: [part('uno', 'arduino-uno'), part('pot', 'potentiometer')],
        wires: connect([['pot', 'VCC'], ['uno', 'GND.1']], [['pot', 'GND'], ['uno', 'GND.2']], [['pot', 'SIG'], ['uno', 'A0']]),
    }), 'reversed-supply:pot:VCC');
    assert.equal(issue?.severity, 'error');
});

test('missing supply and floating pins are warnings on a partly wired part', () => {
    const partial = project({
        components: [part('uno', 'arduino-uno'), part('sonar', 'hc-sr04')],
        wires: connect([['sonar', 'VCC'], ['uno', '5V']], [['sonar', 'TRIG'], ['uno', '7']]),
    });
    const result = findings(partial);
    assert.equal(result.find(item => item.id === 'missing-gnd:sonar:GND')?.severity, 'warning');
    assert.equal(result.find(item => item.id === 'floating-pin:sonar:ECHO')?.severity, 'warning');
    assert.ok(!result.some(item => item.id === 'floating-pin:sonar:GND'), 'supply pins report once, as missing-gnd');
    // Incomplete wiring is a normal editing state and must not block single-wire edits.
    assert.deepEqual(result.filter(item => item.severity === 'error'), []);
});

test('floating-pin treats internally joined push-button legs as one terminal', () => {
    const result = ids(project({
        components: [part('uno', 'arduino-uno'), part('btn', 'pushbutton')],
        wires: connect([['btn', '1.r'], ['uno', '2']], [['btn', '2.l'], ['uno', 'GND.1']]),
    }));
    assert.ok(!result.some(id => id.startsWith('floating-pin:btn')));
});

test('no-supply warns when a supply pin is wired but never reaches the controller supply', () => {
    const surface = createHalfBreadboardSurface();
    const components = [part('uno', 'arduino-uno'), part('pot', 'potentiometer')];
    const wires = [wire(pin('pot', 'VCC'), surfaceHoleRef(surface.id, 'TP3')), wire(pin('pot', 'GND'), pin('uno', 'GND.1')),
        wire(pin('pot', 'SIG'), pin('uno', 'A0')), wire(pin('uno', 'A1'), surfaceHoleRef(surface.id, 'TP5'))];
    assert.ok(ids(project({ surfaces: [surface], components, wires })).includes('no-supply:pot:VCC'));
});

test('unconnected and breadboard-required are info-level guidance', () => {
    const lonely = project({ components: [part('uno', 'arduino-uno'), part('led', 'led')] });
    const result = findings(lonely);
    assert.equal(result.find(item => item.id === 'unconnected:led')?.severity, 'info');
    assert.equal(result.find(item => item.id === 'breadboard-required')?.severity, 'info');
    assert.ok(!result.some(item => item.id.startsWith('floating-pin:led')));

    const withBoard = project({ surfaces: [createHalfBreadboardSurface()], components: [part('uno', 'arduino-uno'), part('led', 'led')] });
    assert.ok(!ids(withBoard).includes('breadboard-required'));
});

test('electrical finding ids are unique within one result', () => {
    const components = [part('uno', 'arduino-uno'), part('btn', 'pushbutton'), part('led1', 'led'), part('led2', 'led')];
    const wires = connect([['btn', '1.l'], ['uno', '0']], [['led1', 'A'], ['uno', '0']], [['led2', 'A'], ['uno', '0']]);
    const result = ids(project({ components, wires }));
    assert.equal(new Set(result).size, result.length);
});

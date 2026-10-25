import test from 'node:test';
import assert from 'node:assert/strict';

import { createHalfBreadboardSurface } from '../src/physical/breadboard.js';
import { defaultFootprintForComponent } from '../src/physical/footprints.js';
import { componentPinRef, createComponentInstance, createPhysicalProject, surfaceHoleRef } from '../src/physical/model.js';
import { buildLessonSteps, isLessonStepComplete, lessonProgress } from '../src/physical/lessons.js';

function part(id, definitionId) {
    return createComponentInstance({ id, definitionId, footprintId: defaultFootprintForComponent(definitionId).id });
}

function wire(id, from, to) {
    return { id, from, to, route: { mode: 'auto', waypoints: [] }, color: '#22d3ee', properties: {} };
}

// Blink: LED in C10/C11, signal from pin 13 to the anode strip, cathode strip to GND.
function blink() {
    const surface = createHalfBreadboardSurface();
    const led = part('led', 'led');
    led.placement = { type: 'surface', surfaceId: surface.id, rotation: 0, bindings: { C: 'C10', A: 'C11' } };
    return createPhysicalProject({
        surfaces: [surface],
        components: [led, part('uno', 'arduino-uno')],
        wires: [
            wire('sig', componentPinRef('uno', '13'), surfaceHoleRef(surface.id, 'A11')),
            wire('gnd', surfaceHoleRef(surface.id, 'A10'), componentPinRef('uno', 'GND.1')),
        ],
    });
}

test('lesson steps go breadboard, board, parts, then ground before signal wires', () => {
    const steps = buildLessonSteps(blink());
    assert.deepEqual(steps.map(step => step.id), [steps[0].id, 'uno', 'led', 'gnd', 'sig']);
    assert.equal(steps[0].kind, 'surface');
    assert.equal(steps[3].wireKind, 'ground');
    assert.equal(steps[4].wireKind, 'signal');
});

test('lesson progress accepts any hole in the right strip', () => {
    const target = blink();
    const steps = buildLessonSteps(target);
    const current = createPhysicalProject({ surfaces: target.surfaces, components: [part('uno', 'arduino-uno')] });
    assert.equal(lessonProgress(steps, target, current), 2);

    const led = part('led', 'led');
    led.placement = { ...target.components[0].placement, bindings: { C: 'E10', A: 'B11' } };
    current.components.push(led);
    assert.equal(lessonProgress(steps, target, current), 3);

    const surfaceId = target.surfaces[0].id;
    current.wires.push(wire('mine', surfaceHoleRef(surfaceId, 'D10'), componentPinRef('uno', 'GND.1')));
    assert.equal(lessonProgress(steps, target, current), 4);
    current.wires.push(wire('mine2', componentPinRef('uno', '13'), surfaceHoleRef(surfaceId, 'E11')));
    assert.equal(lessonProgress(steps, target, current), steps.length);
});

test('a part in the wrong strip does not complete its step', () => {
    const target = blink();
    const led = part('led', 'led');
    led.placement = { ...target.components[0].placement, bindings: { C: 'C12', A: 'C13' } };
    const current = createPhysicalProject({ surfaces: target.surfaces, components: [led] });
    const step = buildLessonSteps(target).find(item => item.id === 'led');
    assert.equal(isLessonStepComplete(step, target, current), false);
});

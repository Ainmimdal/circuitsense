import test from 'node:test';
import assert from 'node:assert/strict';

import { createHalfBreadboardSurface, holeWorldPosition } from '../src/physical/breadboard.js';
import { defaultFootprintForComponent, getFootprintDefinition, projectFootprintPoint } from '../src/physical/footprints.js';
import { applyTransform } from '../src/physical/geometry.js';
import {
    componentPinRef, createComponentInstance, createPhysicalProject, mountedComponentTransform, surfaceHoleRef,
} from '../src/physical/model.js';
import {
    buildLessonSteps, isLessonStepComplete, lessonProgress, lessonStepGhost, lessonStepHint, lessonStepMutation,
} from '../src/physical/lessons.js';
import { validatePhysicalProject } from '../src/physical/validation.js';
import { listLessons } from '../src/lessons/catalog.js';

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

test('a build with fresh ids from the sidebar still completes every step', () => {
    const target = blink();
    const steps = buildLessonSteps(target);
    const board = createHalfBreadboardSurface({ id: 'bb-7' });
    const led = part('part-42', 'led');
    led.placement = { type: 'surface', surfaceId: 'bb-7', rotation: 0, bindings: { C: 'D10', A: 'D11' } };
    const current = createPhysicalProject({
        surfaces: [board],
        components: [part('part-41', 'arduino-uno'), led],
        wires: [
            wire('x1', componentPinRef('part-41', 'GND.1'), surfaceHoleRef('bb-7', 'B10')),
            wire('x2', componentPinRef('part-41', '13'), componentPinRef('part-42', 'A')),
        ],
    });
    assert.equal(lessonProgress(steps, target, current), steps.length);
});

test('every preset lesson is a valid circuit whose steps all complete on itself', () => {
    for (const lesson of listLessons()) {
        const target = lesson.build();
        for (const component of target.components.filter(item => item.placement.type === 'surface')) {
            const footprint = getFootprintDefinition(component.footprintId);
            const transform = mountedComponentTransform(target, component);
            for (const footprintPin of footprint.pins) {
                const expected = applyTransform(projectFootprintPoint(footprint, footprintPin), transform);
                const actual = holeWorldPosition(target.surfaces[0], component.placement.bindings[footprintPin.pinId]);
                assert.ok(Math.hypot(expected.x - actual.x, expected.y - actual.y) < 1e-6,
                    `${lesson.id}: ${component.id} pin ${footprintPin.pinId} is not where its footprint puts it`);
            }
        }
        const errors = validatePhysicalProject(target).all.filter(item => item.severity === 'error');
        assert.deepEqual(errors.map(item => item.id), [], lesson.id);
        const steps = buildLessonSteps(target);
        assert.equal(lessonProgress(steps, target, target), steps.length, lesson.id);
        assert.ok(lesson.code.includes('void loop()'), lesson.id);
    }
});

test('show me completes each step of a lesson from an empty workspace', () => {
    const target = listLessons().find(lesson => lesson.id === 'traffic-light').build();
    const steps = buildLessonSteps(target);
    let counter = 0;
    const ids = { surface: () => `bb-${++counter}`, component: () => `part-${++counter}`, wire: () => `wire-${++counter}` };
    const current = createPhysicalProject({});
    for (let index = 0; index < steps.length; index++) {
        assert.equal(lessonProgress(steps, target, current), index);
        assert.ok(lessonStepGhost(steps[index], target, current), `ghost for ${steps[index].id}`);
        lessonStepMutation(steps[index], target, current, ids)(current);
    }
    assert.equal(lessonProgress(steps, target, current), steps.length);
});

test('a misplaced LED gets a hint naming the leg and column', () => {
    const target = blink();
    const led = part('led', 'led');
    led.placement = { ...target.components[0].placement, bindings: { C: 'C12', A: 'C13' } };
    const current = createPhysicalProject({ surfaces: target.surfaces, components: [led] });
    const step = buildLessonSteps(target).find(item => item.id === 'led');
    assert.match(lessonStepHint(step, target, current), /short leg belongs in column 10/);
});

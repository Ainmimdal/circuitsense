import test from 'node:test';
import assert from 'node:assert/strict';

import { createHalfBreadboardSurface } from '../src/physical/breadboard.js';
import { defaultFootprintForComponent } from '../src/physical/footprints.js';
import { componentPinRef, createComponentInstance, createPhysicalProject, surfaceHoleRef } from '../src/physical/model.js';
import { validatePhysicalProject } from '../src/physical/validation.js';

// One focused fixture per physical finding that had none (this closed GAP-06). The others
// (occupied, incomplete-net, breadboard-net-conflict, redundant-wire) are in
// test/physical-core.test.js and test/physical-automation.test.js.

function part(id, definitionId) {
    return createComponentInstance({ id, definitionId, footprintId: defaultFootprintForComponent(definitionId).id, x: 140, y: 20 });
}

function wire(id, from, to) {
    return { id, from, to, color: '#fff', route: { mode: 'auto', waypoints: [] }, properties: {} };
}

function findings(project) {
    const result = validatePhysicalProject(project);
    return new Map(result.all.map(item => [item.id, item]));
}

function board(components = [], wires = []) {
    return createPhysicalProject({ surfaces: [createHalfBreadboardSurface()], components, wires });
}

test('empty-project is an info on a canvas with no parts, and goes away with one', () => {
    assert.equal(findings(board()).get('empty-project')?.severity, 'info');
    assert.equal(findings(board([part('uno', 'arduino-uno')])).has('empty-project'), false);
});

test('no-controller warns when parts have no board to run them', () => {
    assert.equal(findings(board([part('led', 'led')])).get('no-controller')?.severity, 'warning');
    assert.equal(findings(board([part('led', 'led'), part('uno', 'arduino-uno')])).has('no-controller'), false);
});

test('missing-footprint is an error for a part whose package is unknown', () => {
    const led = part('led', 'led');
    led.footprintId = 'no-such-package';
    assert.equal(findings(board([part('uno', 'arduino-uno'), led])).get('missing-footprint:led')?.severity, 'error');
});

test('invalid-placement is an error for a mounted part whose legs are not in holes that fit it', () => {
    const led = part('led', 'led');
    // An LED's legs are one hole apart; these are eight columns apart.
    led.placement = { type: 'surface', surfaceId: 'breadboard-1', rotation: 0, bindings: { C: 'C10', A: 'C18' } };
    assert.equal(findings(board([part('uno', 'arduino-uno'), led])).get('invalid-placement:led')?.severity, 'error');
    led.placement.bindings = { C: 'C10', A: 'C11' };
    assert.equal(findings(board([part('uno', 'arduino-uno'), led])).has('invalid-placement:led'), false);
});

test('broken-wire is an error for a wire whose end points at a part that is gone', () => {
    const project = board([part('uno', 'arduino-uno')], [wire('w1', componentPinRef('uno', '13'), componentPinRef('ghost', 'A'))]);
    assert.equal(findings(project).get('broken-wire:w1')?.severity, 'error');
});

test('loop-wire warns about a wire that starts and ends on the same pin', () => {
    const project = board([part('uno', 'arduino-uno')], [wire('w1', componentPinRef('uno', '13'), componentPinRef('uno', '13'))]);
    assert.equal(findings(project).get('loop-wire:w1')?.severity, 'warning');
});

test('invalid-wire-hole is an error for a wire into a hole the breadboard does not have', () => {
    const project = board([part('uno', 'arduino-uno')], [wire('w1', componentPinRef('uno', '13'), surfaceHoleRef('breadboard-1', 'Z99'))]);
    const ids = [...findings(project).keys()];
    assert.ok(ids.includes('invalid-wire-hole:w1:breadboard-1:Z99'), ids.join());
});

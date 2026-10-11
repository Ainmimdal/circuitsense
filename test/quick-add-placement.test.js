import test from 'node:test';
import assert from 'node:assert/strict';

import { createHalfBreadboardSurface, getSurfaceDefinition } from '../src/physical/breadboard.js';
import { defaultFootprintForComponent } from '../src/physical/footprints.js';
import { firstIsolatedMount } from '../src/physical/placement.js';
import { createComponentInstance, createPhysicalProject } from '../src/physical/model.js';
import { validatePhysicalProject } from '../src/physical/validation.js';

function addFreePart(project, id, definitionId) {
    const footprint = defaultFootprintForComponent(definitionId);
    const component = createComponentInstance({ id, definitionId, footprintId: footprint.id, x: 0, y: 0 });
    project.components.push(component);
    return component;
}

function mountFirstIsolated(project, component) {
    const candidate = firstIsolatedMount(project, component, project.surfaces[0]);
    assert.ok(candidate, `${component.id} should find an empty spot`);
    component.placement = {
        type: 'surface', surfaceId: candidate.surfaceId, rotation: candidate.rotation, bindings: candidate.bindings,
    };
    component.footprintId = candidate.footprintId || component.footprintId;
    return candidate;
}

function strips(project, component) {
    const definition = getSurfaceDefinition(project.surfaces[0]);
    return Object.values(component.placement.bindings).map(holeId => definition.getHole(holeId).electricalGroup);
}

test('quick-added parts each get their own breadboard strips', () => {
    const project = createPhysicalProject({ surfaces: [createHalfBreadboardSurface({ x: 30, y: 20 })] });
    const parts = ['led', 'buzzer', 'pushbutton', 'resistor'].map((definitionId, index) => {
        const part = addFreePart(project, `part-${index}`, definitionId);
        mountFirstIsolated(project, part);
        return part;
    });

    const seen = new Map();
    for (const part of parts) {
        for (const strip of strips(project, part)) {
            assert.equal(seen.get(strip) ?? part.id, part.id, `${part.id} shares strip ${strip} with ${seen.get(strip)}`);
            seen.set(strip, part.id);
        }
    }
    // With nothing wired, no part may already look connected to another.
    const issues = validatePhysicalProject(project).all.map(issue => issue.id);
    assert.ok(!issues.some(id => /short|occupied|collision/i.test(id)), issues.join(', '));
});

test('a strip holding only a jumper end is treated as in use', () => {
    const project = createPhysicalProject({ surfaces: [createHalfBreadboardSurface({ x: 30, y: 20 })] });
    const board = project.surfaces[0];
    project.wires.push({
        id: 'wire-1',
        from: { type: 'surface-hole', surfaceId: board.id, holeId: 'A1' },
        to: { type: 'surface-hole', surfaceId: board.id, holeId: 'A10' },
        route: { mode: 'auto', waypoints: [] },
    });
    const led = addFreePart(project, 'led-1', 'led');
    const candidate = mountFirstIsolated(project, led);
    const definition = getSurfaceDefinition(board);
    const used = new Set(['A1', 'A10'].map(holeId => definition.getHole(holeId).electricalGroup));
    for (const holeId of Object.values(candidate.bindings)) {
        assert.ok(!used.has(definition.getHole(holeId).electricalGroup), `${holeId} joins a wired strip`);
    }
});

test('returns null when every strip is taken', () => {
    const project = createPhysicalProject({ surfaces: [createHalfBreadboardSurface({ x: 30, y: 20 })] });
    let placed = 0;
    for (let index = 0; index < 200; index += 1) {
        const led = addFreePart(project, `led-${index}`, 'led');
        const candidate = firstIsolatedMount(project, led, project.surfaces[0]);
        if (!candidate) {
            assert.ok(placed > 0);
            return;
        }
        led.placement = { type: 'surface', surfaceId: candidate.surfaceId, rotation: candidate.rotation, bindings: candidate.bindings };
        placed += 1;
    }
    assert.fail('the board never filled up');
});

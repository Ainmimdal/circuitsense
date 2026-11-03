import test from 'node:test';
import assert from 'node:assert/strict';

import { componentLibrary } from '../src/component-library.js';
import { createHalfBreadboardSurface, getSurfaceDefinition } from '../src/physical/breadboard.js';
import { defaultFootprintForComponent, footprintsForComponent } from '../src/physical/footprints.js';
import { firstIsolatedMount } from '../src/physical/placement.js';
import { createComponentInstance, createPhysicalProject } from '../src/physical/model.js';
import { validatePhysicalProject } from '../src/physical/validation.js';

const HEADER_MODULES = [
    'hc-sr04', 'pir-motion', 'mpu6050', 'ssd1306', 'ds1307', 'microsd-card', 'small-sound-sensor',
    'big-sound-sensor', 'flame-sensor', 'gas-sensor', 'ntc-temperature-sensor', 'photoresistor-sensor',
    'tilt-switch',
];

function freePart(definitionId) {
    return createComponentInstance({
        id: `${definitionId}-1`, definitionId, footprintId: defaultFootprintForComponent(definitionId).id, x: 0, y: 0,
    });
}

test('header modules start beside the board with their free artwork', () => {
    for (const id of HEADER_MODULES) {
        assert.equal(componentLibrary[id].breadboard.mountable, true, id);
        assert.equal(componentLibrary[id].breadboard.required, false, id);
        assert.equal(defaultFootprintForComponent(id).placementMode, 'free', id);
    }
});

test('every header module snaps into the breadboard with one pin per strip', () => {
    for (const id of HEADER_MODULES) {
        const project = createPhysicalProject({ surfaces: [createHalfBreadboardSurface()] });
        const component = freePart(id);
        project.components.push(component);
        const candidate = firstIsolatedMount(project, component, project.surfaces[0]);
        assert.ok(candidate, `${id} should find a legal header mount`);
        const header = footprintsForComponent(id).find(footprint => footprint.id === candidate.footprintId);
        assert.equal(header.placementMode, 'breadboard-rigid', id);
        assert.equal(Object.keys(candidate.bindings).length, header.pins.length, id);

        const definition = getSurfaceDefinition(project.surfaces[0]);
        const strips = Object.values(candidate.bindings).map(holeId => definition.getHole(holeId).electricalGroup);
        assert.equal(new Set(strips).size, strips.length, `${id} pins must not share a strip`);

        component.footprintId = candidate.footprintId;
        component.placement = {
            type: 'surface', surfaceId: candidate.surfaceId, rotation: candidate.rotation, bindings: candidate.bindings,
        };
        const issues = validatePhysicalProject(project).all.map(issue => issue.id);
        assert.ok(!issues.some(issueId => /short|occupied|collision/i.test(issueId)), `${id}: ${issues.join(', ')}`);
    }
});

test('a module whose header runs down its artwork turns to lie along the board', () => {
    const project = createPhysicalProject({ surfaces: [createHalfBreadboardSurface()] });
    const rtc = freePart('ds1307');
    project.components.push(rtc);
    const candidate = firstIsolatedMount(project, rtc, project.surfaces[0]);
    assert.ok([90, 270].includes(candidate.rotation));
    const rows = new Set(Object.values(candidate.bindings).map(holeId => holeId.replace(/\d+$/, '')));
    assert.equal(rows.size, 1, 'all five RTC pins sit in one breadboard row');
});

test('every part that stays off the board says why in its own words', () => {
    for (const component of Object.values(componentLibrary)) {
        if (component.isBreadboard || component.breadboard?.mountable) continue;
        assert.ok(component.breadboard.reason, component.id);
        assert.doesNotMatch(component.breadboard.reason, /no 2\.54 mm pins that fit/,
            `${component.id} should have a specific off-board reason`);
    }
});

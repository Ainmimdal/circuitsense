import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGoalProject, GOAL_OUTPUTS, GOAL_SENSORS } from '../src/lessons/goal-build.js';
import { buildLessonSteps, lessonProgress } from '../src/physical/lessons.js';
import { validatePhysicalProject } from '../src/physical/validation.js';

test('every goal builds a wired circuit with no errors and code for all its parts', () => {
    for (const sensor of GOAL_SENSORS) for (const output of GOAL_OUTPUTS) {
        const label = `${sensor.id} -> ${output.id}`;
        const built = buildGoalProject({ sensor: sensor.id, output: output.id });
        assert.equal(built.error, undefined, label);
        const validation = validatePhysicalProject(built.project);
        assert.deepEqual(validation.errors.map(issue => issue.id), [], label);
        assert.deepEqual(validation.warnings.map(issue => issue.id), [], label);
        assert.doesNotMatch(built.project.properties.sketch, /Not included/, label);
        if (sensor.definitionId) assert.match(built.project.properties.sketch, /float level = /, label);
        // The guide can rebuild it step by step.
        const steps = buildLessonSteps(built.project);
        assert.equal(lessonProgress(steps, built.project, built.project), steps.length, label);
    }
});

test('an unknown goal is refused', () => {
    assert.match(buildGoalProject({ sensor: 'button', output: 'nothing' }).error, /Pick/);
});

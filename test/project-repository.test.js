import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicalCircuitStore } from '../src/physical/circuit-store.js';
import {
    deleteNamedProject,
    getNamedProjects,
    loadNamedProject,
    saveNamedProject,
} from '../src/physical/project-repository.js';

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
    };
}

test('named project persistence stores and restores the active physical schema', () => {
    const storage = memoryStorage();
    const store = new PhysicalCircuitStore({ load: false, routingWorker: null });
    store.project.properties.title = 'First version';
    const saved = saveNamedProject(store, 'Sensor lab', storage);

    store.project.properties.title = 'Unsaved version';
    assert.equal(loadNamedProject(store, saved.id, storage), true);
    assert.equal(store.project.properties.title, 'First version');
    assert.equal(store.project.schemaVersion, 4);
    assert.equal(store.project.surfaces[0].definitionId, 'half-breadboard-400');
});

test('named project persistence updates by name and deletes by stable id', () => {
    const storage = memoryStorage();
    const store = new PhysicalCircuitStore({ load: false, routingWorker: null });
    const first = saveNamedProject(store, 'Demo', storage);
    store.project.properties.revision = 2;
    const updated = saveNamedProject(store, 'Demo', storage);

    assert.equal(updated.id, first.id);
    assert.equal(getNamedProjects(storage).length, 1);
    assert.equal(getNamedProjects(storage)[0].data.properties.revision, 2);
    assert.equal(deleteNamedProject(first.id, storage), true);
    assert.deepEqual(getNamedProjects(storage), []);
});

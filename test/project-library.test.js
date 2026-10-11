import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { PhysicalCircuitStore } from '../src/physical/circuit-store.js';
import { normalizePersistedProject } from '../src/physical/model.js';
import { createIndexedDbProjectStore, createMemoryProjectStore } from '../src/persistence/local-project-store.js';
import {
    CURRENT_PROJECT_STORAGE_KEY,
    LEGACY_NAMED_PROJECTS_STORAGE_KEY,
    ProjectLibrary,
} from '../src/persistence/project-library.js';

function memoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
        has: key => values.has(key),
    };
}

// In-memory stand-in for the Supabase `projects` table of one user.
function fakeRemote() {
    const rows = new Map();
    return {
        rows,
        failNext: false,
        async listMeta() {
            if (this.failNext) {
                this.failNext = false;
                throw new Error('network down');
            }
            return [...rows.values()].map(({ id, name, updatedAt, deletedAt }) => ({ id, name, updatedAt, deletedAt }));
        },
        async fetch(ids) {
            return new Map(ids.filter(id => rows.has(id)).map(id => [id, structuredClone(rows.get(id))]));
        },
        async upsert(records) {
            for (const record of records) {
                rows.set(record.id, {
                    id: record.id,
                    name: record.name,
                    data: record.deletedAt ? {} : structuredClone(record.data),
                    updatedAt: record.updatedAt,
                    deletedAt: record.deletedAt || null,
                });
            }
        },
    };
}

function clock(start = 1000) {
    let now = start;
    const fn = () => now;
    fn.advance = (ms = 1000) => { now += ms; };
    return fn;
}

function library(options = {}) {
    let n = 0;
    return new ProjectLibrary({
        store: createMemoryProjectStore(),
        storage: memoryStorage(),
        now: clock(),
        createId: () => `p${++n}`,
        autoSyncDelay: null,
        ...options,
    });
}

test('saved projects restore the active physical schema', async () => {
    const lib = library();
    const store = new PhysicalCircuitStore({ load: false, routingWorker: null });
    store.project.properties.title = 'First version';
    const saved = await lib.saveAs('Sensor lab', store.project);

    store.project.properties.title = 'Unsaved version';
    const record = await lib.get(saved.id);
    store.importProject(normalizePersistedProject(record.data));
    assert.equal(store.project.properties.title, 'First version');
    assert.equal(store.project.schemaVersion, 4);
    assert.equal(store.project.surfaces[0].definitionId, 'half-breadboard-400');
});

test('saving with an existing name updates that project, and delete removes it', async () => {
    const lib = library();
    const first = await lib.saveAs('Demo', { revision: 1 });
    const second = await lib.saveAs('Demo', { revision: 2 });

    assert.equal(second.id, first.id);
    assert.ok(second.updatedAt > first.updatedAt);
    assert.deepEqual((await lib.list()).map(p => p.data.revision), [2]);
    lib.setCurrentProjectId(first.id);
    assert.equal(await lib.remove(first.id), true);
    assert.deepEqual(await lib.list(), []);
    assert.equal(lib.getCurrentProjectId(), null);
});

test('projects from the old localStorage library move into device storage once', async () => {
    const storage = memoryStorage({
        [LEGACY_NAMED_PROJECTS_STORAGE_KEY]: JSON.stringify([{ id: 'old-1', name: 'Blink', updatedAt: 5, data: { title: 'Blink' } }]),
    });
    const lib = library({ storage });
    const projects = await lib.list();
    assert.deepEqual(projects.map(p => [p.id, p.name, p.data.title]), [['old-1', 'Blink', 'Blink']]);
    assert.equal(storage.has(LEGACY_NAMED_PROJECTS_STORAGE_KEY), false);
});

test('signing in moves guest projects into the account and uploads them', async () => {
    const lib = library();
    await lib.saveAs('Guest work', { a: 1 });
    const remote = fakeRemote();
    await lib.setAccount('user-1', remote);

    assert.equal(lib.status.state, 'synced');
    assert.deepEqual([...remote.rows.values()].map(row => row.name), ['Guest work']);
    const [record] = await lib.list();
    assert.equal(record.ownerId, 'user-1');
    assert.equal(record.dirty, false);
});

test("two devices see each other's saves, edits and deletes", async () => {
    const remote = fakeRemote();
    const time = clock();
    const laptop = library({ now: time, createId: () => 'shared-1' });
    const lab = library({ now: time, createId: () => 'never-used' });
    await laptop.setAccount('user-1', remote);
    await lab.setAccount('user-1', remote);

    await laptop.saveAs('Traffic light', { leds: 3 });
    await laptop.sync();
    await lab.sync();
    assert.deepEqual((await lab.list()).map(p => [p.name, p.data.leds]), [['Traffic light', 3]]);

    time.advance();
    await lab.update('shared-1', { leds: 4 });
    await lab.sync();
    await laptop.sync();
    assert.equal((await laptop.get('shared-1')).data.leds, 4);

    time.advance();
    await laptop.remove('shared-1');
    await laptop.sync();
    await lab.sync();
    assert.deepEqual(await lab.list(), []);
    assert.equal(remote.rows.get('shared-1').deletedAt > 0, true);
});

test('a local edit beats the older cloud copy even when the other device clock ran ahead', async () => {
    const remote = fakeRemote();
    const lib = library({ now: clock(1000) });
    remote.rows.set('p-future', { id: 'p-future', name: 'Future', data: { v: 1 }, updatedAt: 9_000_000, deletedAt: null });
    await lib.setAccount('user-1', remote);
    await lib.update('p-future', { v: 2 });
    await lib.sync();
    assert.equal(remote.rows.get('p-future').data.v, 2);
    assert.equal((await lib.get('p-future')).data.v, 2);
});

test('sync failures keep work on the device and retry later', async () => {
    const remote = fakeRemote();
    const lib = library();
    await lib.setAccount('user-1', remote);
    await lib.saveAs('Offline work', { x: 1 });
    remote.failNext = true;
    await lib.sync();
    assert.equal(lib.status.state, 'error');
    assert.equal((await lib.list())[0].dirty, true);

    await lib.sync();
    assert.equal(lib.status.state, 'synced');
    assert.equal(remote.rows.size, 1);
});

test("signing out removes that account's synced copies from the device", async () => {
    const storage = memoryStorage();
    const remote = fakeRemote();
    const lib = library({ storage });
    await lib.setAccount('user-1', remote);
    const saved = await lib.saveAs('Private', { y: 1 });
    lib.setCurrentProjectId(saved.id);
    await lib.signOut();

    assert.deepEqual(await lib.list(), []);
    assert.equal(storage.has(CURRENT_PROJECT_STORAGE_KEY), false);
    assert.equal(remote.rows.size, 1);

    await lib.setAccount('user-1', remote);
    assert.deepEqual((await lib.list()).map(p => p.name), ['Private']);
});

test('the IndexedDB store round-trips project records', async () => {
    const store = createIndexedDbProjectStore(globalThis.indexedDB);
    await store.put({ id: 'idb-1', name: 'Stored', data: { n: 1 } });
    assert.deepEqual((await store.get('idb-1')).data, { n: 1 });
    assert.equal((await store.getAll()).length, 1);
    await store.delete('idb-1');
    assert.equal(await store.get('idb-1'), null);
});

test('the account service links a Google session to the library and unlinks on sign out', async () => {
    const { AccountService } = await import('../src/persistence/account.js');
    const lib = library();
    await lib.saveAs('Before sign-in', { z: 1 });
    const listeners = [];
    const rows = [];
    const query = {
        select: () => Object.assign(Promise.resolve({ data: rows, error: null }), { in: async () => ({ data: [], error: null }) }),
        upsert: async upserted => { rows.push(...upserted); return { error: null }; },
    };
    const client = {
        from: () => query,
        auth: {
            onAuthStateChange: callback => listeners.push(callback),
            getSession: async () => ({
                data: { session: { user: { id: 'google-user', email: 'student@example.com', user_metadata: { full_name: 'Aina Student' } } } },
            }),
            signOut: async () => listeners.forEach(callback => callback('SIGNED_OUT', null)),
        },
    };
    const account = new AccountService({ library: lib, getClient: async () => client, cloudConfigured: true });
    await account.init();

    assert.deepEqual(account.user, { id: 'google-user', email: 'student@example.com', name: 'Aina Student', avatarUrl: '' });
    assert.equal(lib.userId, 'google-user');
    assert.deepEqual(rows.map(row => [row.owner_id, row.name]), [['google-user', 'Before sign-in']]);

    await account.signOut();
    assert.equal(account.user, null);
    assert.equal(lib.userId, null);
});

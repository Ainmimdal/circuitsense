// Device-local storage for the project library. IndexedDB holds far more than
// the ~5 MB localStorage quota, so a student's whole library fits on the device.

const DB_NAME = 'elera';
const DB_VERSION = 1;
const PROJECTS = 'projects';

function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export function createIndexedDbProjectStore(indexedDB = globalThis.indexedDB) {
    let dbPromise = null;
    function db() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = () => {
                    if (!request.result.objectStoreNames.contains(PROJECTS)) {
                        request.result.createObjectStore(PROJECTS, { keyPath: 'id' });
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
                request.onblocked = () => reject(new Error('Elera storage is open in an older tab. Close other Elera tabs and reload.'));
            });
        }
        return dbPromise;
    }
    async function run(mode, action) {
        const database = await db();
        const tx = database.transaction(PROJECTS, mode);
        const result = await requestToPromise(action(tx.objectStore(PROJECTS)));
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted.'));
        });
        return result;
    }
    return {
        kind: 'indexeddb',
        getAll: () => run('readonly', store => store.getAll()),
        get: async id => (await run('readonly', store => store.get(id))) ?? null,
        put: record => run('readwrite', store => store.put(record)).then(() => record),
        delete: id => run('readwrite', store => store.delete(id)).then(() => undefined),
    };
}

export function createMemoryProjectStore(records = []) {
    const values = new Map(records.map(record => [record.id, structuredClone(record)]));
    return {
        kind: 'memory',
        getAll: async () => [...values.values()].map(record => structuredClone(record)),
        get: async id => (values.has(id) ? structuredClone(values.get(id)) : null),
        put: async record => {
            values.set(record.id, structuredClone(record));
            return record;
        },
        delete: async id => {
            values.delete(id);
        },
    };
}

// Falls back to memory when IndexedDB is missing or blocked (some private
// browsing modes), so the editor still works and simply forgets on reload.
export function createDefaultProjectStore() {
    if (typeof globalThis.indexedDB === 'undefined') return createMemoryProjectStore();
    return createIndexedDbProjectStore(globalThis.indexedDB);
}

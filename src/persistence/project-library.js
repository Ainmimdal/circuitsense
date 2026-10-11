import { createDefaultProjectStore, createMemoryProjectStore } from './local-project-store.js';

// Local-first project library. Every project lives on the device; when a user
// signs in, their projects also sync to the cloud (last write wins per project).
//
// Record shape: { id, ownerId, name, data, updatedAt, deletedAt, dirty }
// - ownerId: null for guest projects, otherwise the signed-in user's id.
// - deletedAt: tombstone kept until the deletion has reached the cloud.
// - dirty: changed locally since the last successful sync.

export const LEGACY_NAMED_PROJECTS_STORAGE_KEY = 'elera_physical_named_projects_v1';
export const CURRENT_PROJECT_STORAGE_KEY = 'elera_current_project_id';

function newProjectId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `project-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function describeSyncError(error) {
    if (globalThis.navigator && globalThis.navigator.onLine === false) {
        return { state: 'offline', message: 'You are offline. Changes will sync when you reconnect.' };
    }
    const detail = error?.message ? ` (${error.message})` : '';
    return { state: 'error', message: `Could not sync with the cloud${detail}. Your projects are still saved on this device.` };
}

export class ProjectLibrary extends EventTarget {
    constructor({
        store = createDefaultProjectStore(),
        storage = globalThis.localStorage,
        now = () => Date.now(),
        createId = newProjectId,
        autoSyncDelay = 1500,
    } = {}) {
        super();
        this.store = store;
        this.storage = storage;
        this.now = now;
        this.createId = createId;
        this.autoSyncDelay = autoSyncDelay;
        this.userId = null;
        this.remote = null;
        this.status = { state: 'local', message: 'Saved on this device.', lastSyncedAt: null };
        this._readyPromise = null;
        this._syncPromise = null;
        this._syncAgain = false;
        this._syncTimer = null;
        this._lastTimestamp = 0;
    }

    ready() {
        if (!this._readyPromise) this._readyPromise = this.#prepare();
        return this._readyPromise;
    }

    async #prepare() {
        try {
            await this.store.getAll();
        } catch (error) {
            console.warn('[Elera] Device storage is unavailable; projects will last until this tab closes.', error);
            this.store = createMemoryProjectStore();
            this.#setStatus({ state: 'error', message: 'This browser blocked device storage. Export your project to keep it.' });
        }
        await this.#migrateLegacyProjects();
    }

    async #migrateLegacyProjects() {
        let legacy;
        try {
            legacy = JSON.parse(this.storage?.getItem(LEGACY_NAMED_PROJECTS_STORAGE_KEY) || 'null');
        } catch {
            legacy = null;
        }
        if (!Array.isArray(legacy)) return;
        for (const project of legacy) {
            if (!project?.id || !project.data || await this.store.get(project.id)) continue;
            await this.store.put({
                id: project.id,
                ownerId: null,
                name: String(project.name || 'Untitled project'),
                data: project.data,
                updatedAt: Number(project.updatedAt) || this.now(),
                deletedAt: null,
                dirty: true,
            });
        }
        this.storage.removeItem?.(LEGACY_NAMED_PROJECTS_STORAGE_KEY);
    }

    #timestamp(after = 0) {
        // Strictly increasing, and newer than the version being replaced even
        // when another device's clock ran ahead, so a local edit always wins
        // over the copy it was based on.
        this._lastTimestamp = Math.max(this.now(), this._lastTimestamp + 1, after + 1);
        return this._lastTimestamp;
    }

    #isVisible(record) {
        return !record.deletedAt && record.ownerId === (this.userId || null);
    }

    #setStatus(status) {
        this.status = { ...this.status, ...status };
        this.dispatchEvent(new CustomEvent('status', { detail: this.status }));
    }

    #changed() {
        this.dispatchEvent(new CustomEvent('change'));
        if (this.remote && this.userId && this.autoSyncDelay !== null) {
            clearTimeout(this._syncTimer);
            this._syncTimer = setTimeout(() => this.sync(), this.autoSyncDelay);
        }
    }

    async list() {
        await this.ready();
        return (await this.store.getAll())
            .filter(record => this.#isVisible(record))
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }

    async get(id) {
        await this.ready();
        const record = await this.store.get(id);
        return record && this.#isVisible(record) ? record : null;
    }

    // Saves under a name; saving again with the same name updates that project.
    async saveAs(name, data) {
        await this.ready();
        const normalizedName = String(name || '').trim();
        if (!normalizedName) return null;
        const existing = (await this.list()).find(record => record.name === normalizedName);
        const record = {
            id: existing?.id || this.createId(),
            ownerId: this.userId || null,
            name: normalizedName,
            data: structuredClone(data),
            updatedAt: this.#timestamp(existing?.updatedAt),
            deletedAt: null,
            dirty: true,
        };
        await this.store.put(record);
        this.#changed();
        return record;
    }

    async update(id, data) {
        const existing = await this.get(id);
        if (!existing) return null;
        const record = { ...existing, data: structuredClone(data), updatedAt: this.#timestamp(existing.updatedAt), dirty: true };
        await this.store.put(record);
        this.#changed();
        return record;
    }

    async remove(id) {
        const existing = await this.get(id);
        if (!existing) return false;
        if (existing.ownerId) {
            const deletedAt = this.#timestamp(existing.updatedAt);
            await this.store.put({ ...existing, data: {}, deletedAt, updatedAt: deletedAt, dirty: true });
        } else {
            await this.store.delete(id);
        }
        if (this.getCurrentProjectId() === id) this.setCurrentProjectId(null);
        this.#changed();
        return true;
    }

    getCurrentProjectId() {
        try {
            return this.storage?.getItem(CURRENT_PROJECT_STORAGE_KEY) || null;
        } catch {
            return null;
        }
    }

    setCurrentProjectId(id) {
        try {
            if (id) this.storage?.setItem(CURRENT_PROJECT_STORAGE_KEY, id);
            else this.storage?.removeItem?.(CURRENT_PROJECT_STORAGE_KEY);
        } catch {
            // Remembering the open project is a convenience only.
        }
        this.dispatchEvent(new CustomEvent('change'));
    }

    // Signs a user in: guest projects on this device move into their account,
    // then everything syncs.
    async setAccount(userId, remote) {
        await this.ready();
        this.userId = userId;
        this.remote = remote;
        for (const record of await this.store.getAll()) {
            if (record.ownerId === null && !record.deletedAt) {
                await this.store.put({ ...record, ownerId: userId, dirty: true });
            }
        }
        this.#setStatus({ state: 'syncing', message: 'Syncing your projects...' });
        this.dispatchEvent(new CustomEvent('change'));
        await this.sync();
    }

    // Signs out: pushes pending changes, then removes that account's synced
    // copies from this device (shared lab computers stay private).
    async signOut({ sync = true } = {}) {
        const userId = this.userId;
        if (!userId) return;
        clearTimeout(this._syncTimer);
        if (sync) await this.sync();
        else await this._syncPromise?.catch(() => {});
        const current = this.getCurrentProjectId();
        for (const record of await this.store.getAll()) {
            if (record.ownerId !== userId || record.dirty) continue;
            await this.store.delete(record.id);
            if (record.id === current) this.setCurrentProjectId(null);
        }
        this.userId = null;
        this.remote = null;
        this.#setStatus({ state: 'local', message: 'Saved on this device.', lastSyncedAt: null });
        this.dispatchEvent(new CustomEvent('change'));
    }

    sync() {
        if (!this.remote || !this.userId) return Promise.resolve(this.status);
        if (this._syncPromise) {
            this._syncAgain = true;
            return this._syncPromise;
        }
        this._syncPromise = (async () => {
            do {
                this._syncAgain = false;
                await this.#syncOnce();
            } while (this._syncAgain && this.remote);
            return this.status;
        })().finally(() => {
            this._syncPromise = null;
        });
        return this._syncPromise;
    }

    async #syncOnce() {
        const userId = this.userId;
        const remote = this.remote;
        if (!userId || !remote) return;
        this.#setStatus({ state: 'syncing', message: 'Syncing your projects...' });
        try {
            const remoteMeta = await remote.listMeta();
            const owned = (await this.store.getAll()).filter(record => record.ownerId === userId);
            const localById = new Map(owned.map(record => [record.id, record]));
            const remoteById = new Map(remoteMeta.map(row => [row.id, row]));

            const toPull = remoteMeta.filter(row => {
                const local = localById.get(row.id);
                return !local || row.updatedAt > local.updatedAt;
            });
            const pulledData = await remote.fetch(toPull.filter(row => !row.deletedAt).map(row => row.id));
            if (this.userId !== userId) return;
            let changed = false;
            for (const row of toPull) {
                const local = localById.get(row.id);
                if (row.deletedAt) {
                    if (local) {
                        await this.store.delete(row.id);
                        changed = true;
                    }
                    continue;
                }
                const full = pulledData.get(row.id);
                if (!full) continue;
                await this.store.put({
                    id: row.id,
                    ownerId: userId,
                    name: full.name,
                    data: full.data,
                    updatedAt: full.updatedAt,
                    deletedAt: null,
                    dirty: false,
                });
                changed = true;
            }

            const pulledIds = new Set(toPull.map(row => row.id));
            const toPush = owned.filter(record => !pulledIds.has(record.id) && (record.dirty || !remoteById.has(record.id)));
            if (toPush.length) {
                await remote.upsert(toPush);
                if (this.userId !== userId) return;
                for (const pushed of toPush) {
                    const current = await this.store.get(pushed.id);
                    // Skip records edited again while the upload was in flight.
                    if (!current || current.updatedAt !== pushed.updatedAt) continue;
                    if (current.deletedAt) await this.store.delete(current.id);
                    else await this.store.put({ ...current, dirty: false });
                }
            }
            if (changed) this.dispatchEvent(new CustomEvent('change'));
            this.#setStatus({ state: 'synced', message: 'Synced to your account.', lastSyncedAt: this.now() });
        } catch (error) {
            console.warn('[Elera] Project sync failed:', error);
            this.#setStatus(describeSyncError(error));
        }
    }
}

export const projectLibrary = new ProjectLibrary();

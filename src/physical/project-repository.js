import { normalizePersistedProject } from './model.js';

export const NAMED_PROJECTS_STORAGE_KEY = 'elera_physical_named_projects_v1';

export function getNamedProjects(storage = globalThis.localStorage) {
    if (!storage) return [];
    try {
        const value = JSON.parse(storage.getItem(NAMED_PROJECTS_STORAGE_KEY) || '[]');
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

export function saveNamedProject(store, name, storage = globalThis.localStorage) {
    const normalizedName = String(name || '').trim();
    if (!normalizedName || !storage) return null;
    const projects = getNamedProjects(storage);
    const updatedAt = Date.now();
    let saved = projects.find(project => project.name === normalizedName);
    if (saved) {
        saved.data = structuredClone(store.project);
        saved.updatedAt = updatedAt;
    } else {
        saved = {
            id: `project-${updatedAt}-${Math.random().toString(36).slice(2, 8)}`,
            name: normalizedName,
            updatedAt,
            data: structuredClone(store.project),
        };
        projects.push(saved);
    }
    storage.setItem(NAMED_PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    return saved;
}

export function loadNamedProject(store, id, storage = globalThis.localStorage) {
    const saved = getNamedProjects(storage).find(project => project.id === id);
    if (!saved) return false;
    store.importProject(normalizePersistedProject(saved.data));
    return true;
}

export function deleteNamedProject(id, storage = globalThis.localStorage) {
    if (!storage) return false;
    const projects = getNamedProjects(storage);
    const remaining = projects.filter(project => project.id !== id);
    if (remaining.length === projects.length) return false;
    storage.setItem(NAMED_PROJECTS_STORAGE_KEY, JSON.stringify(remaining));
    return true;
}

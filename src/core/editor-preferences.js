export const EDITOR_PREFERENCES_STORAGE_KEY = 'elera_editor_preferences';

export const DEFAULT_EDITOR_PREFERENCES = Object.freeze({
    autoWireLedResistors: true,
});

export function normalizeEditorPreferences(raw = {}) {
    return {
        ...DEFAULT_EDITOR_PREFERENCES,
        ...raw,
        autoWireLedResistors: raw.autoWireLedResistors !== false,
    };
}

export function loadEditorPreferences(storage = globalThis.localStorage) {
    try {
        return normalizeEditorPreferences(JSON.parse(storage?.getItem?.(EDITOR_PREFERENCES_STORAGE_KEY) || '{}'));
    } catch {
        return normalizeEditorPreferences();
    }
}

export function saveEditorPreferences(preferences, storage = globalThis.localStorage) {
    const normalized = normalizeEditorPreferences(preferences);
    try {
        storage?.setItem?.(EDITOR_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
        // Storage may be blocked in private or sandboxed browsing contexts.
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('elera-editor-preferences-change', { detail: { preferences: normalized } }));
    }
    return normalized;
}

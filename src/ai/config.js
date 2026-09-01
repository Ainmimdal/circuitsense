export const AI_SETTINGS_STORAGE_KEY = 'elera_ai_settings';
export const AI_KEY_SESSION_STORAGE_KEY = 'elera_ai_api_key';
export const MIN_AI_TOOL_ROUNDS = 5;
export const MAX_AI_TOOL_ROUNDS = 50;

export const AI_PROVIDERS = Object.freeze({
    deepseek: Object.freeze({
        id: 'deepseek',
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    }),
    gemini: Object.freeze({
        id: 'gemini',
        label: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        models: ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'],
    }),
    openai: Object.freeze({
        id: 'openai',
        label: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    }),
    openrouter: Object.freeze({
        id: 'openrouter',
        label: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        models: ['google/gemini-2.5-flash', 'deepseek/deepseek-chat-v3.1', 'openai/gpt-4.1-mini'],
        configurableBaseUrl: true,
    }),
    custom: Object.freeze({
        id: 'custom',
        label: 'Custom OpenAI-compatible',
        baseUrl: '',
        models: ['custom-model'],
        configurableBaseUrl: true,
    }),
});

export const DEFAULT_AI_SETTINGS = Object.freeze({
    provider: 'deepseek',
    apiKey: '',
    baseUrl: '',
    model: AI_PROVIDERS.deepseek.models[0],
    reasoning: 'balanced',
    actionMode: 'ask-before-apply',
    includeCircuitJson: true,
    includeValidationErrors: true,
    includeProjectMetadata: false,
    preferArduinoUno: true,
    preferMinimalComponents: false,
    includeCodeByDefault: true,
    maxToolRounds: 20,
});

function storageValue(storage, key) {
    try {
        return storage?.getItem?.(key) || '';
    } catch {
        return '';
    }
}

function setStorageValue(storage, key, value) {
    try {
        if (value) storage?.setItem?.(key, value);
        else storage?.removeItem?.(key);
    } catch {
        // Storage may be blocked in private or sandboxed browsing contexts.
    }
}

export function providerDefinition(providerId) {
    return AI_PROVIDERS[providerId] || AI_PROVIDERS.custom;
}

export function normalizeAiSettings(raw = {}) {
    const provider = AI_PROVIDERS[raw.provider] ? raw.provider : DEFAULT_AI_SETTINGS.provider;
    const definition = providerDefinition(provider);
    const model = String(raw.model || definition.models[0]).trim();
    const requestedToolRounds = Number(raw.maxToolRounds);
    const maxToolRounds = Number.isFinite(requestedToolRounds)
        ? Math.min(MAX_AI_TOOL_ROUNDS, Math.max(MIN_AI_TOOL_ROUNDS, Math.round(requestedToolRounds)))
        : DEFAULT_AI_SETTINGS.maxToolRounds;
    return {
        ...DEFAULT_AI_SETTINGS,
        ...raw,
        provider,
        model: model || definition.models[0],
        apiKey: String(raw.apiKey || '').trim(),
        baseUrl: String(raw.baseUrl || '').trim(),
        maxToolRounds,
    };
}

export function loadAiSettings({ local = globalThis.localStorage, session = globalThis.sessionStorage } = {}) {
    let persisted = {};
    try {
        persisted = JSON.parse(storageValue(local, AI_SETTINGS_STORAGE_KEY) || '{}');
    } catch {
        persisted = {};
    }

    // Migrate keys written by the earlier prototype out of persistent storage.
    const migratedKey = String(persisted.apiKey || '').trim();
    if (migratedKey && !storageValue(session, AI_KEY_SESSION_STORAGE_KEY)) {
        setStorageValue(session, AI_KEY_SESSION_STORAGE_KEY, migratedKey);
    }
    delete persisted.apiKey;
    if (migratedKey) setStorageValue(local, AI_SETTINGS_STORAGE_KEY, JSON.stringify(persisted));

    return normalizeAiSettings({
        ...persisted,
        apiKey: storageValue(session, AI_KEY_SESSION_STORAGE_KEY) || migratedKey,
    });
}

export function saveAiSettings(settings, { local = globalThis.localStorage, session = globalThis.sessionStorage } = {}) {
    const normalized = normalizeAiSettings(settings);
    const { apiKey, ...persisted } = normalized;
    setStorageValue(local, AI_SETTINGS_STORAGE_KEY, JSON.stringify(persisted));
    setStorageValue(session, AI_KEY_SESSION_STORAGE_KEY, apiKey);
    return normalized;
}

export function providerBaseUrl(settings) {
    const normalized = normalizeAiSettings(settings);
    const definition = providerDefinition(normalized.provider);
    const baseUrl = (definition.configurableBaseUrl && normalized.baseUrl
        ? normalized.baseUrl
        : definition.baseUrl).replace(/\/+$/, '');
    if (!baseUrl) throw new TypeError('A base URL is required for a custom provider.');

    let parsed;
    try {
        parsed = new URL(baseUrl);
    } catch {
        throw new TypeError('The AI provider base URL is invalid.');
    }
    const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !localHttp) {
        throw new TypeError('AI provider URLs must use HTTPS (HTTP is allowed only for localhost).');
    }
    return parsed.toString().replace(/\/$/, '');
}

export function chatCompletionsUrl(settings) {
    const baseUrl = providerBaseUrl(settings);
    const parsed = new URL(baseUrl);
    return /\/chat\/completions$/i.test(parsed.pathname)
        ? parsed.toString().replace(/\/$/, '')
        : `${baseUrl}/chat/completions`;
}

export function modelsUrl(settings) {
    const normalized = normalizeAiSettings(settings);
    const baseUrl = providerBaseUrl(normalized).replace(/\/chat\/completions$/i, '');
    const url = new URL(`${baseUrl.replace(/\/+$/, '')}/models`);
    if (normalized.provider === 'openrouter') {
        url.searchParams.set('output_modalities', 'text');
        url.searchParams.set('supported_parameters', 'tools');
    }
    return url.toString();
}

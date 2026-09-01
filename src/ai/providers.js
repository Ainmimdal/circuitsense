import { chatCompletionsUrl, modelsUrl, normalizeAiSettings, providerBaseUrl, providerDefinition } from './config.js';

export class AiProviderError extends Error {
    constructor(message, { status = 0, code = 'AI_PROVIDER_ERROR', details = null } = {}) {
        super(message);
        this.name = 'AiProviderError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

function responseErrorMessage(body, response) {
    return body?.error?.message || body?.message || `${response.status} ${response.statusText}`.trim();
}

function temperatureFor(reasoning) {
    if (reasoning === 'fast') return 0.1;
    if (reasoning === 'deep') return 0.3;
    return 0.2;
}

function finiteToken(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function normalizeTokenUsage(provider, usage = null) {
    if (!usage || typeof usage !== 'object') return null;
    const inputTokens = finiteToken(usage.input_tokens ?? usage.total_input_tokens ?? usage.prompt_tokens);
    const cachedInputTokens = finiteToken(
        usage.input_tokens_details?.cached_tokens
        ?? usage.prompt_tokens_details?.cached_tokens
        ?? usage.prompt_cache_hit_tokens
        ?? usage.total_cached_tokens,
    );
    const cacheWriteTokens = finiteToken(
        usage.input_tokens_details?.cache_write_tokens
        ?? usage.prompt_tokens_details?.cache_write_tokens,
    );
    const outputTokens = finiteToken(usage.output_tokens ?? usage.total_output_tokens ?? usage.completion_tokens);
    const reasoningTokens = finiteToken(
        usage.output_tokens_details?.reasoning_tokens
        ?? usage.completion_tokens_details?.reasoning_tokens
        ?? usage.total_thought_tokens,
    );
    const totalTokens = finiteToken(usage.total_tokens) || inputTokens + outputTokens;
    return {
        provider,
        inputTokens,
        cachedInputTokens,
        cacheWriteTokens,
        outputTokens,
        reasoningTokens,
        totalTokens,
        cost: Number.isFinite(Number(usage.cost)) ? Number(usage.cost) : null,
    };
}

function responseTools(tools) {
    return tools.map(tool => ({
        type: 'function',
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
    }));
}

function messageText(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.map(part => typeof part === 'string' ? part : part?.text || '').filter(Boolean).join('\n');
}

function systemInstructions(messages) {
    return messages.filter(message => message.role === 'system')
        .map(message => messageText(message.content)).filter(Boolean).join('\n\n');
}

function continuationMessages(messages, state, transport, normalized) {
    const valid = state?.transport === transport
        && state.provider === normalized.provider
        && state.model === normalized.model
        && Number.isInteger(state.sentMessageCount)
        && state.sentMessageCount >= 0
        && state.sentMessageCount <= messages.length;
    return {
        previousId: valid ? state.continuationId : '',
        input: (valid ? messages.slice(state.sentMessageCount) : messages)
            .filter(message => message.role !== 'system'),
    };
}

function messagesToResponsesInput(messages) {
    const input = [];
    for (const message of messages) {
        const content = messageText(message.content);
        if ((message.role === 'user' || message.role === 'assistant') && content) {
            input.push({ role: message.role, content });
        }
        if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
            for (const call of message.tool_calls) {
                input.push({
                    type: 'function_call',
                    call_id: call.id,
                    name: call.function?.name || '',
                    arguments: typeof call.function?.arguments === 'string'
                        ? call.function.arguments
                        : JSON.stringify(call.function?.arguments || {}),
                });
            }
        }
        if (message.role === 'tool') {
            input.push({ type: 'function_call_output', call_id: message.tool_call_id, output: content });
        }
    }
    return input;
}

function responsesMessage(data) {
    const text = [];
    const toolCalls = [];
    for (const item of data?.output || []) {
        if (item?.type === 'message') {
            for (const part of item.content || []) {
                if (part?.type === 'output_text' && part.text) text.push(part.text);
            }
        } else if (item?.type === 'function_call') {
            toolCalls.push({
                id: item.call_id || item.id,
                type: 'function',
                function: { name: item.name, arguments: item.arguments || '{}' },
            });
        }
    }
    return {
        role: 'assistant',
        content: text.length ? text.join('\n') : null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
}

function messagesToGeminiInput(messages) {
    const input = [];
    for (const message of messages) {
        const content = messageText(message.content);
        if (message.role === 'user' && content) {
            input.push({ type: 'user_input', content: [{ type: 'text', text: content }] });
        } else if (message.role === 'assistant') {
            if (content) input.push({ type: 'model_output', content: [{ type: 'text', text: content }] });
            for (const call of message.tool_calls || []) {
                let args = call.function?.arguments || {};
                if (typeof args === 'string') {
                    try { args = JSON.parse(args); } catch { args = {}; }
                }
                input.push({ type: 'function_call', id: call.id, name: call.function?.name || '', arguments: args });
            }
        } else if (message.role === 'tool') {
            input.push({
                type: 'function_result',
                call_id: message.tool_call_id,
                name: message.name || '',
                result: [{ type: 'text', text: content }],
            });
        }
    }
    return input;
}

function geminiMessage(data) {
    const text = [];
    const toolCalls = [];
    for (const step of data?.steps || []) {
        if (step?.type === 'model_output') {
            for (const part of step.content || []) {
                if (part?.type === 'text' && part.text) text.push(part.text);
            }
        } else if (step?.type === 'function_call') {
            toolCalls.push({
                id: step.id,
                type: 'function',
                function: {
                    name: step.name,
                    arguments: typeof step.arguments === 'string'
                        ? step.arguments
                        : JSON.stringify(step.arguments || {}),
                },
            });
        }
    }
    return {
        role: 'assistant',
        content: text.length ? text.join('\n') : null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
}

async function fetchProviderJson(url, { headers, body, signal, fetchImpl, providerLabel }) {
    let response;
    try {
        response = await fetchImpl(url, {
            method: 'POST', headers, body: JSON.stringify(body), signal,
        });
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw new AiProviderError(`Could not reach ${providerLabel}: ${error?.message || error}`, {
            code: 'NETWORK_ERROR',
        });
    }
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) {
        throw new AiProviderError(responseErrorMessage(data, response), {
            status: response.status,
            code: data?.error?.code || 'PROVIDER_HTTP_ERROR',
            details: data?.error || data,
        });
    }
    return data;
}

async function requestOpenAiResponses(normalized, options) {
    const { messages, tools, signal, maxTokens, fetchImpl, state, sessionId } = options;
    const continuation = continuationMessages(messages, state, 'openai-responses', normalized);
    const root = providerBaseUrl(normalized).replace(/\/chat\/completions$/i, '');
    const turnInput = messagesToResponsesInput(continuation.input);
    const replayPrefix = !continuation.previousId && Array.isArray(state?.replayInput)
        ? state.replayInput
        : [];
    const body = {
        model: normalized.model,
        instructions: systemInstructions(messages),
        input: [...replayPrefix, ...turnInput],
        temperature: temperatureFor(normalized.reasoning),
        max_output_tokens: maxTokens,
        store: true,
        prompt_cache_key: sessionId,
    };
    if (continuation.previousId) body.previous_response_id = continuation.previousId;
    if (/^gpt-5\.6(?:-|$)/i.test(normalized.model)) {
        body.prompt_cache_options = { mode: 'implicit', ttl: '30m' };
    }
    if (tools.length) {
        body.tools = responseTools(tools);
        body.tool_choice = 'auto';
    }
    const data = await fetchProviderJson(`${root}/responses`, {
        headers: { Authorization: `Bearer ${normalized.apiKey}`, 'Content-Type': 'application/json' },
        body, signal, fetchImpl, providerLabel: providerDefinition(normalized.provider).label,
    });
    const message = responsesMessage(data);
    if (!data?.id || (!message.content && !message.tool_calls?.length)) {
        throw new AiProviderError('The provider returned an invalid Responses API result.', {
            code: 'INVALID_PROVIDER_RESPONSE', details: data,
        });
    }
    return {
        message,
        usage: normalizeTokenUsage(normalized.provider, data.usage),
        state: {
            transport: 'openai-responses', provider: normalized.provider, model: normalized.model,
            continuationId: data.id, sentMessageCount: messages.length + 1,
            replayInput: [
                ...(Array.isArray(state?.replayInput) ? state.replayInput : []),
                ...turnInput,
                ...(Array.isArray(data.output) ? data.output : []),
            ],
        },
        raw: data,
    };
}

async function requestGeminiInteractions(normalized, options) {
    const { messages, tools, signal, maxTokens, fetchImpl, state } = options;
    const continuation = continuationMessages(messages, state, 'gemini-interactions', normalized);
    const turnInput = messagesToGeminiInput(continuation.input);
    const replayPrefix = !continuation.previousId && Array.isArray(state?.replayInput)
        ? state.replayInput
        : [];
    const body = {
        model: normalized.model,
        system_instruction: systemInstructions(messages),
        input: [...replayPrefix, ...turnInput],
        store: true,
        generation_config: {
            max_output_tokens: maxTokens,
            temperature: temperatureFor(normalized.reasoning),
            tool_choice: tools.length ? 'auto' : 'none',
        },
    };
    if (continuation.previousId) body.previous_interaction_id = continuation.previousId;
    if (tools.length) body.tools = responseTools(tools);
    const data = await fetchProviderJson('https://generativelanguage.googleapis.com/v1beta/interactions', {
        headers: { 'x-goog-api-key': normalized.apiKey, 'Content-Type': 'application/json' },
        body, signal, fetchImpl, providerLabel: providerDefinition(normalized.provider).label,
    });
    const message = geminiMessage(data);
    if (!data?.id || (!message.content && !message.tool_calls?.length)) {
        throw new AiProviderError('Gemini returned an invalid Interactions API result.', {
            code: 'INVALID_PROVIDER_RESPONSE', details: data,
        });
    }
    return {
        message,
        usage: normalizeTokenUsage(normalized.provider, data.usage),
        state: {
            transport: 'gemini-interactions', provider: normalized.provider, model: normalized.model,
            continuationId: data.id, sentMessageCount: messages.length + 1,
            replayInput: [
                ...(Array.isArray(state?.replayInput) ? state.replayInput : []),
                ...turnInput,
                ...(Array.isArray(data.steps) ? data.steps : []),
            ],
        },
        raw: data,
    };
}

const NON_CHAT_MODEL_MARKERS = [
    'audio', 'embedding', 'image', 'moderation', 'realtime', 'search-preview',
    'sora', 'transcribe', 'tts', 'whisper', 'computer-use',
];

function isToolCapableModel(provider, model) {
    const id = String(model?.id || model?.name || '').replace(/^models\//, '').trim();
    if (!id) return false;
    const lower = id.toLowerCase();
    if (NON_CHAT_MODEL_MARKERS.some(marker => lower.includes(marker))) return false;
    if (Array.isArray(model.supported_parameters) && !model.supported_parameters.includes('tools')) return false;
    if (Array.isArray(model.supportedGenerationMethods)
        && !model.supportedGenerationMethods.includes('generateContent')) return false;

    if (provider === 'openrouter') {
        return true;
    }
    if (provider === 'openai') {
        return lower === 'chat-latest' || /^(?:gpt-|o[134](?:-|$)|ft:(?:gpt-|o[134](?:-|$)))/.test(lower);
    }
    if (provider === 'gemini') {
        return lower.startsWith('gemini-')
            && !/(?:-live|-tts|-image|embedding|robotics)/.test(lower);
    }
    return true;
}

export function normalizeProviderModels(provider, body) {
    const source = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [];
    const unique = new Map();
    for (const model of source) {
        if (!isToolCapableModel(provider, model)) continue;
        const id = String(model?.id || model?.name || '').replace(/^models\//, '').trim();
        if (!id || unique.has(id)) continue;
        unique.set(id, {
            id,
            label: String(model?.displayName || model?.name || id).replace(/^models\//, '').trim() || id,
        });
    }
    return [...unique.values()].sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

export async function listProviderModels(settings, {
    signal,
    fetchImpl = globalThis.fetch,
} = {}) {
    const normalized = normalizeAiSettings(settings);
    if (typeof fetchImpl !== 'function') {
        throw new AiProviderError('This browser cannot load provider models.', { code: 'FETCH_UNAVAILABLE' });
    }

    const headers = { 'Accept': 'application/json' };
    if (normalized.apiKey) headers.Authorization = `Bearer ${normalized.apiKey}`;

    let response;
    try {
        response = await fetchImpl(modelsUrl(normalized), { method: 'GET', headers, signal });
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw new AiProviderError(`Could not load models from ${providerDefinition(normalized.provider).label}: ${error?.message || error}`, {
            code: 'NETWORK_ERROR',
        });
    }

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }
    if (!response.ok) {
        throw new AiProviderError(responseErrorMessage(data, response), {
            status: response.status,
            code: data?.error?.code || 'PROVIDER_HTTP_ERROR',
            details: data?.error || data,
        });
    }

    const models = normalizeProviderModels(normalized.provider, data);
    if (!models.length) {
        throw new AiProviderError('The provider returned no compatible chat models.', {
            code: 'NO_COMPATIBLE_MODELS', details: data,
        });
    }
    return models;
}

export async function requestChatCompletion(settings, {
    messages,
    tools = [],
    signal,
    maxTokens = 1800,
    fetchImpl = globalThis.fetch,
    state = null,
    sessionId = '',
} = {}) {
    const normalized = normalizeAiSettings(settings);
    if (!normalized.apiKey) throw new AiProviderError('Add an API key in AI settings.', { code: 'MISSING_API_KEY' });
    if (!normalized.model) throw new AiProviderError('Choose a model in AI settings.', { code: 'MISSING_MODEL' });
    if (typeof fetchImpl !== 'function') throw new AiProviderError('This browser cannot make provider requests.', { code: 'FETCH_UNAVAILABLE' });

    const nativeOptions = { messages, tools, signal, maxTokens, fetchImpl, state, sessionId };
    if (normalized.provider === 'openai') {
        try {
            return await requestOpenAiResponses(normalized, nativeOptions);
        } catch (error) {
            if (!state || ![400, 404].includes(error?.status)) throw error;
            return requestOpenAiResponses(normalized, {
                ...nativeOptions, state: { ...state, continuationId: '' },
            });
        }
    }
    if (normalized.provider === 'gemini') {
        try {
            return await requestGeminiInteractions(normalized, nativeOptions);
        } catch (error) {
            if (!state || ![400, 404].includes(error?.status)) throw error;
            return requestGeminiInteractions(normalized, {
                ...nativeOptions, state: { ...state, continuationId: '' },
            });
        }
    }

    const body = {
        model: normalized.model,
        messages,
        temperature: temperatureFor(normalized.reasoning),
        max_tokens: maxTokens,
        stream: false,
    };
    if (tools.length) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }
    if (normalized.provider === 'openrouter' && sessionId) body.session_id = sessionId;

    let response;
    try {
        response = await fetchImpl(chatCompletionsUrl(normalized), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${normalized.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal,
        });
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw new AiProviderError(`Could not reach ${providerDefinition(normalized.provider).label}: ${error?.message || error}`, {
            code: 'NETWORK_ERROR',
        });
    }

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }
    if (!response.ok) {
        throw new AiProviderError(responseErrorMessage(data, response), {
            status: response.status,
            code: data?.error?.code || 'PROVIDER_HTTP_ERROR',
            details: data?.error || data,
        });
    }
    const message = data?.choices?.[0]?.message;
    if (!message || message.role !== 'assistant') {
        throw new AiProviderError('The provider returned an invalid chat-completion response.', {
            code: 'INVALID_PROVIDER_RESPONSE', details: data,
        });
    }
    return { message, usage: normalizeTokenUsage(normalized.provider, data.usage), state: null, raw: data };
}

export async function testAiConnection(settings, options = {}) {
    const result = await requestChatCompletion(settings, {
        ...options,
        maxTokens: 8,
        tools: [],
        messages: [
            { role: 'system', content: 'Reply with OK only.' },
            { role: 'user', content: 'Connection test.' },
        ],
    });
    return { ok: true, model: normalizeAiSettings(settings).model, usage: result.usage };
}

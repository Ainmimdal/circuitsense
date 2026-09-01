import { getComponentDef } from '../component-library.js';
import { validatePhysicalProject } from '../physical/validation.js';
import { MAX_AI_TOOL_ROUNDS, normalizeAiSettings } from './config.js';
import { requestChatCompletion } from './providers.js';
import { createEleraToolRegistry, toolDefinitions } from './tools.js';

const MAX_TOOL_RESULT_CHARS = 14000;
const MAX_HISTORY_MESSAGES = 48;
const MAX_HISTORY_CHARS = 32000;
const MAX_SUMMARY_CHARS = 6000;
const RECENT_USER_TURNS = 8;

export class AiAgentError extends Error {
    constructor(message, code = 'AI_AGENT_ERROR') {
        super(message);
        this.name = 'AiAgentError';
        this.code = code;
    }
}

function textContent(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.map(part => typeof part === 'string' ? part : part?.text || '').filter(Boolean).join('\n');
}

function parseArguments(raw, toolName) {
    if (raw && typeof raw === 'object') return raw;
    if (!raw || !String(raw).trim()) return {};
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
        return parsed;
    } catch {
        throw new AiAgentError(`${toolName} returned invalid JSON arguments.`, 'INVALID_TOOL_ARGUMENTS');
    }
}

function safeToolResult(value) {
    let serialized;
    try {
        serialized = JSON.stringify(value ?? null);
    } catch {
        serialized = JSON.stringify({ status: 'error', error: 'Tool returned a non-serializable result.' });
    }
    if (serialized.length <= MAX_TOOL_RESULT_CHARS) return serialized;
    return JSON.stringify({
        status: 'truncated',
        summary: serialized.slice(0, MAX_TOOL_RESULT_CHARS),
        originalCharacters: serialized.length,
    });
}

function newSessionId() {
    return globalThis.crypto?.randomUUID?.()
        || `elera-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function providerStateSignature(settings) {
    return JSON.stringify({
        provider: settings.provider,
        model: settings.model,
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
    });
}

function emptyUsage() {
    return {
        requests: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        cost: null,
    };
}

function addUsage(total, usage) {
    if (!usage) return total;
    return {
        requests: total.requests + 1,
        inputTokens: total.inputTokens + (usage.inputTokens || 0),
        cachedInputTokens: total.cachedInputTokens + (usage.cachedInputTokens || 0),
        cacheWriteTokens: total.cacheWriteTokens + (usage.cacheWriteTokens || 0),
        outputTokens: total.outputTokens + (usage.outputTokens || 0),
        reasoningTokens: total.reasoningTokens + (usage.reasoningTokens || 0),
        totalTokens: total.totalTokens + (usage.totalTokens || 0),
        cost: usage.cost == null
            ? total.cost
            : (total.cost || 0) + usage.cost,
    };
}

function circuitSnapshot(store, settings) {
    const snapshot = {};
    if (settings.includeCircuitJson) {
        snapshot.circuit = {
            components: store.project.components.slice(0, 80).map(component => ({
                instanceId: component.id,
                componentId: component.definitionId,
                name: getComponentDef(component.definitionId)?.name || component.definitionId,
                placement: component.placement,
            })),
            wires: store.project.wires.slice(0, 160).map(wire => ({ id: wire.id, from: wire.from, to: wire.to })),
            surfaces: store.project.surfaces.slice(0, 20).map(surface => ({ id: surface.id, type: surface.type })),
            totals: {
                components: store.project.components.length,
                wires: store.project.wires.length,
                surfaces: store.project.surfaces.length,
            },
        };
    }
    if (settings.includeValidationErrors) {
        const issues = validatePhysicalProject(store.project).all;
        snapshot.validation = issues.slice(0, 60).map(issue => ({
            id: issue.id, severity: issue.severity, message: issue.message, instanceId: issue.instanceId || undefined,
        }));
        snapshot.validationTotal = issues.length;
    }
    if (settings.includeProjectMetadata) snapshot.metadata = store.project.properties || {};
    return snapshot;
}

export function buildEleraSystemPrompt(store, settings) {
    const normalized = normalizeAiSettings(settings);
    const preferences = {
        actionMode: normalized.actionMode,
        preferArduinoUno: normalized.preferArduinoUno,
        preferMinimalComponents: normalized.preferMinimalComponents,
        includeCodeByDefault: normalized.includeCodeByDefault,
    };
    return [
        'You are Elera AI, the circuit-building agent inside the Elera Arduino editor.',
        'You may reason about circuits, but only Elera tools may inspect or mutate the actual project.',
        'Use exact component and instance IDs returned by Elera tools.',
        'For a build request, first identify every required component type. Resolve all unknown component IDs together with one list_available_components call using its queries array. Never call it once per component, never repeat a resolved query, and reuse its result from conversation history.',
        'Inspect the circuit as needed, place all required parts in one call, identify every required signal type, and batch compatible-pin requirements in find_compatible_pins.',
        'You choose every exact controller pin, then commit those choices with connect_pins. Determine circuit topology first; optimize physical presentation afterward.',
        'After semantic wiring, validate, run arrange_components, run route_wires, then validate the final physical circuit. A build is successful when validation has zero errors; report any warnings.',
        'Auto Wire is a separate deterministic pin-allocation helper. Use auto_wire only when the user explicitly requests automatic wiring or when you intentionally choose that helper instead of selecting pins yourself.',
        'Never invent successful placements, pins, wires, validation results, or instance IDs. Never claim a tool ran until its result says it succeeded.',
        'Do not clear or delete existing work unless the user clearly asked to replace/remove it. Elera’s pin metadata and deterministic validation engines are authoritative.',
        'If you include Arduino code, derive every pin constant from the final inspected circuit and explain any remaining validation warning.',
        'Keep the final response concise and student-friendly.',
        `User preferences: ${JSON.stringify(preferences)}`,
    ].join('\n');
}

export function buildEleraProjectContext(store, settings) {
    const normalized = normalizeAiSettings(settings);
    return `Current Elera project context for this user turn. It is newer than earlier project snapshots: ${JSON.stringify(circuitSnapshot(store, normalized))}`;
}

export class EleraAiAgent {
    constructor({
        store,
        settings,
        request = requestChatCompletion,
        registry = null,
        onEvent = null,
        approve = null,
        maxToolRounds = null,
    } = {}) {
        if (!store?.project) throw new TypeError('EleraAiAgent requires a physical circuit store.');
        this.store = store;
        this.settings = normalizeAiSettings(settings);
        this.request = request;
        this.registry = registry || createEleraToolRegistry(store);
        this.onEvent = onEvent;
        this.approve = approve;
        this.maxToolRounds = Number.isInteger(maxToolRounds) && maxToolRounds > 0
            ? Math.min(MAX_AI_TOOL_ROUNDS, maxToolRounds)
            : null;
        this.history = [];
        this.summary = '';
        this.providerState = null;
        this.providerSignature = providerStateSignature(this.settings);
        this.sessionId = newSessionId();
        this.runUsage = emptyUsage();
        this.running = false;
        this.catalogQueriesThisRun = new Set();
    }

    updateSettings(settings) {
        const next = normalizeAiSettings(settings);
        const signature = providerStateSignature(next);
        if (signature !== this.providerSignature) {
            this.providerState = null;
            this.providerSignature = signature;
            this.sessionId = newSessionId();
        }
        this.settings = next;
    }

    reset() {
        if (this.running) throw new AiAgentError('Cannot reset while the agent is running.', 'AGENT_BUSY');
        this.history = [];
        this.summary = '';
        this.providerState = null;
        this.sessionId = newSessionId();
        this.runUsage = emptyUsage();
    }

    #requestMessages(extraMessages = []) {
        return [
            { role: 'system', content: buildEleraSystemPrompt(this.store, this.settings) },
            ...(this.summary ? [{ role: 'system', content: `Earlier conversation summary:\n${this.summary}` }] : []),
            ...this.history,
            ...extraMessages,
        ];
    }

    async #requestModel(tools, signal, extraMessages = []) {
        const response = await this.request(this.settings, {
            messages: this.#requestMessages(extraMessages),
            tools,
            signal,
            state: this.providerState,
            sessionId: this.sessionId,
        });
        this.providerState = response.state || null;
        if (response.usage) {
            this.runUsage = addUsage(this.runUsage, response.usage);
            await this.#emit({ type: 'usage', usage: response.usage, total: this.runUsage });
        }
        return response;
    }

    #summarizeMessages(messages) {
        const lines = [];
        for (const message of messages) {
            if (message.eleraContext || message.role === 'tool') continue;
            const content = textContent(message.content).trim();
            if (message.role === 'user' && content) lines.push(`User: ${content}`);
            if (message.role === 'assistant' && content) lines.push(`Elera: ${content}`);
        }
        if (!lines.length) return;
        this.summary = [this.summary, ...lines].filter(Boolean).join('\n').slice(-MAX_SUMMARY_CHARS);
    }

    #compactHistory() {
        const characters = this.history.reduce((total, message) => total + textContent(message.content).length, 0);
        const userIndexes = this.history
            .map((message, index) => message.role === 'user' && !message.eleraContext ? index : -1)
            .filter(index => index >= 0);
        if (this.history.length <= MAX_HISTORY_MESSAGES
            && characters <= MAX_HISTORY_CHARS
            && userIndexes.length <= RECENT_USER_TURNS) return;
        const keepTurns = characters > MAX_HISTORY_CHARS ? Math.min(4, RECENT_USER_TURNS) : RECENT_USER_TURNS;
        if (userIndexes.length <= keepTurns) return;
        const cut = userIndexes[userIndexes.length - keepTurns];
        this.#summarizeMessages(this.history.slice(0, cut));
        this.history = this.history.slice(cut);
    }

    #settleHistory() {
        const compact = [];
        for (const message of this.history) {
            if (message.role === 'tool') continue;
            if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
                const content = textContent(message.content).trim();
                if (content) compact.push({ role: 'assistant', content });
                continue;
            }
            compact.push(message);
        }
        this.history = compact;
        this.#compactHistory();
        if (this.providerState) {
            this.providerState = {
                ...this.providerState,
                sentMessageCount: this.#requestMessages().length,
            };
        }
    }

    async #emit(event) {
        if (typeof this.onEvent === 'function') await this.onEvent(event);
    }

    #shouldRequestApproval(toolEntry) {
        if (!toolEntry.mutating) return false;
        if (toolEntry.alwaysConfirm) return true;
        return ['ask-before-apply', 'explain-first'].includes(this.settings.actionMode);
    }

    async #executeTool(call, signal) {
        const name = String(call?.function?.name || '');
        const entry = this.registry.get(name);
        const eventBase = { callId: call.id, name, mutating: Boolean(entry?.mutating) };
        if (!entry) {
            const result = { status: 'error', code: 'UNKNOWN_TOOL', error: `Unknown Elera tool "${name}".` };
            await this.#emit({ type: 'tool-result', ...eventBase, status: 'error', result });
            return result;
        }

        let args;
        try {
            args = parseArguments(call.function.arguments, name);
        } catch (error) {
            const result = { status: 'error', code: error.code, error: error.message };
            await this.#emit({ type: 'tool-result', ...eventBase, status: 'error', result });
            return result;
        }

        let catalogQueryKey = '';
        if (name === 'list_available_components') {
            const requested = Array.isArray(args.queries) ? args.queries : [args.query ?? ''];
            catalogQueryKey = JSON.stringify([...new Set(requested
                .map(query => String(query).trim().toLowerCase()))].sort());
            if (this.catalogQueriesThisRun.has(catalogQueryKey)) {
                const result = {
                    status: 'cached',
                    message: 'These catalog queries were already resolved in this request. Reuse the earlier tool result.',
                    queries: JSON.parse(catalogQueryKey),
                };
                await this.#emit({ type: 'tool-call', ...eventBase, args, status: 'running' });
                await this.#emit({ type: 'tool-result', ...eventBase, args, status: 'done', result });
                return result;
            }
        }

        await this.#emit({ type: 'tool-call', ...eventBase, args, status: this.#shouldRequestApproval(entry) ? 'pending' : 'running' });
        if (signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError');

        if (entry.mutating && this.settings.actionMode === 'suggest-only') {
            const result = { status: 'not-executed', code: 'SUGGEST_ONLY', message: 'The user selected suggest-only mode.' };
            await this.#emit({ type: 'tool-result', ...eventBase, args, status: 'skipped', result });
            return result;
        }

        if (this.#shouldRequestApproval(entry)) {
            const approved = typeof this.approve === 'function' && await this.approve({
                callId: call.id, name, args, description: entry.description, alwaysConfirm: entry.alwaysConfirm,
            });
            if (!approved) {
                const result = { status: 'not-executed', code: 'USER_REJECTED', message: 'The user rejected this circuit change.' };
                await this.#emit({ type: 'tool-result', ...eventBase, args, status: 'rejected', result });
                return result;
            }
            await this.#emit({ type: 'tool-call', ...eventBase, args, status: 'running' });
        }

        try {
            const result = await entry.execute(args, { signal });
            if (catalogQueryKey) this.catalogQueriesThisRun.add(catalogQueryKey);
            await this.#emit({ type: 'tool-result', ...eventBase, args, status: result?.status === 'failure' ? 'error' : 'done', result });
            return result;
        } catch (error) {
            const result = { status: 'error', code: error?.code || 'TOOL_EXECUTION_ERROR', error: error?.message || String(error) };
            await this.#emit({ type: 'tool-result', ...eventBase, args, status: 'error', result });
            return result;
        }
    }

    async run(prompt, { signal } = {}) {
        const userText = String(prompt || '').trim();
        if (!userText) throw new AiAgentError('Enter a circuit request first.', 'EMPTY_PROMPT');
        if (this.running) throw new AiAgentError('Elera AI is already working.', 'AGENT_BUSY');
        if (!this.settings.apiKey) throw new AiAgentError('Add an API key in AI settings first.', 'MISSING_API_KEY');
        this.running = true;
        this.catalogQueriesThisRun = new Set();
        this.runUsage = emptyUsage();
        this.#compactHistory();
        this.history.push({
            role: 'user',
            content: buildEleraProjectContext(this.store, this.settings),
            eleraContext: true,
        });
        this.history.push({ role: 'user', content: userText });
        let repeatedSignature = '';
        let repeatedCount = 0;

        try {
            const maxToolRounds = this.maxToolRounds ?? this.settings.maxToolRounds;
            let requestRounds = 0;
            for (let toolRound = 0; toolRound < maxToolRounds; toolRound++) {
                if (signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError');
                await this.#emit({ type: 'thinking', round: requestRounds });
                const response = await this.#requestModel(toolDefinitions(this.registry), signal);
                requestRounds++;
                const assistant = response.message;
                this.history.push(assistant);
                const content = textContent(assistant.content).trim();
                if (content) await this.#emit({ type: 'assistant-text', text: content, usage: response.usage || null });

                const calls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls : [];
                if (!calls.length) {
                    this.#settleHistory();
                    return { text: content, usage: this.runUsage, rounds: requestRounds, toolRounds: toolRound };
                }

                const signature = calls.map(call => `${call.function?.name}:${call.function?.arguments}`).join('|');
                repeatedCount = signature === repeatedSignature ? repeatedCount + 1 : 0;
                repeatedSignature = signature;
                if (repeatedCount >= 2) throw new AiAgentError('The model repeated the same tool calls without making progress.', 'REPEATED_TOOL_CALLS');

                for (const call of calls) {
                    const result = await this.#executeTool(call, signal);
                    this.history.push({
                        role: 'tool',
                        tool_call_id: call.id,
                        name: call.function?.name || '',
                        content: safeToolResult(result),
                    });
                }
            }

            if (signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError');
            await this.#emit({ type: 'thinking', round: requestRounds, finalizing: true });
            const finalResponse = await this.#requestModel([], signal, [{
                role: 'user',
                content: `The configured limit of ${maxToolRounds} tool rounds has been reached. Do not request or claim any more tool actions. Briefly summarize what succeeded, what remains, and any known validation issues.`,
            }]);
            requestRounds++;
            const finalAssistant = finalResponse.message;
            this.history.push(finalAssistant);
            const finalText = textContent(finalAssistant.content).trim()
                || `I reached the configured limit of ${maxToolRounds} tool rounds. Completed circuit changes remain applied; continue with another request to finish.`;
            await this.#emit({ type: 'assistant-text', text: finalText, usage: finalResponse.usage || null });
            this.#settleHistory();
            return {
                text: finalText,
                usage: this.runUsage,
                rounds: requestRounds,
                toolRounds: maxToolRounds,
                limitReached: true,
            };
        } catch (error) {
            this.providerState = null;
            this.#settleHistory();
            throw error;
        } finally {
            this.running = false;
            await this.#emit({ type: 'idle' });
        }
    }
}

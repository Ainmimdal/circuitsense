import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEleraProjectContext, buildEleraSystemPrompt, EleraAiAgent } from '../src/ai/agent.js';
import {
    AI_KEY_SESSION_STORAGE_KEY,
    AI_SETTINGS_STORAGE_KEY,
    chatCompletionsUrl,
    loadAiSettings,
    modelsUrl,
    normalizeAiSettings,
    saveAiSettings,
} from '../src/ai/config.js';
import {
    AiProviderError,
    listProviderModels,
    normalizeProviderModels,
    normalizeTokenUsage,
    requestChatCompletion,
} from '../src/ai/providers.js';
import { createEleraToolRegistry } from '../src/ai/tools.js';
import { PhysicalCircuitStore } from '../src/physical/circuit-store.js';

class MemoryStorage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
}

function emptyStore() {
    const store = new PhysicalCircuitStore({ load: false, routingWorker: null });
    store.clear();
    return store;
}

test('AI settings persist configuration but keep API keys in session storage', () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    saveAiSettings({
        provider: 'gemini', model: 'gemini-test-flash', apiKey: 'secret-key', maxToolRounds: 32,
    }, { local, session });

    const persisted = JSON.parse(local.getItem(AI_SETTINGS_STORAGE_KEY));
    assert.equal(persisted.provider, 'gemini');
    assert.equal(persisted.model, 'gemini-test-flash');
    assert.equal(persisted.maxToolRounds, 32);
    assert.equal('apiKey' in persisted, false);
    assert.equal(session.getItem(AI_KEY_SESSION_STORAGE_KEY), 'secret-key');
    assert.equal(loadAiSettings({ local, session }).apiKey, 'secret-key');
});

test('AI tool-round preference is bounded to the supported BYOK range', () => {
    assert.equal(normalizeAiSettings({ maxToolRounds: 1 }).maxToolRounds, 5);
    assert.equal(normalizeAiSettings({ maxToolRounds: 27.6 }).maxToolRounds, 28);
    assert.equal(normalizeAiSettings({ maxToolRounds: 500 }).maxToolRounds, 50);
    assert.equal(normalizeAiSettings({ maxToolRounds: 'invalid' }).maxToolRounds, 20);
});

test('loading legacy settings migrates a persisted key into tab storage', () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    local.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify({ provider: 'deepseek', apiKey: 'legacy-secret' }));
    assert.equal(loadAiSettings({ local, session }).apiKey, 'legacy-secret');
    assert.equal(session.getItem(AI_KEY_SESSION_STORAGE_KEY), 'legacy-secret');
    assert.equal('apiKey' in JSON.parse(local.getItem(AI_SETTINGS_STORAGE_KEY)), false);
});

test('provider URLs support DeepSeek, Gemini, and a custom OpenAI-compatible endpoint', () => {
    assert.equal(chatCompletionsUrl({ provider: 'deepseek' }), 'https://api.deepseek.com/chat/completions');
    assert.equal(chatCompletionsUrl({ provider: 'gemini' }), 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    assert.equal(chatCompletionsUrl({ provider: 'custom', baseUrl: 'http://localhost:11434/v1/' }), 'http://localhost:11434/v1/chat/completions');
    assert.throws(() => chatCompletionsUrl({ provider: 'custom', baseUrl: 'http://example.com/v1' }), /HTTPS/);
});

test('provider model URLs use official discovery endpoints and request tool-capable OpenRouter models', () => {
    assert.equal(modelsUrl({ provider: 'deepseek' }), 'https://api.deepseek.com/models');
    assert.equal(modelsUrl({ provider: 'gemini' }), 'https://generativelanguage.googleapis.com/v1beta/openai/models');
    assert.equal(
        modelsUrl({ provider: 'custom', baseUrl: 'http://localhost:11434/v1/chat/completions' }),
        'http://localhost:11434/v1/models',
    );
    const openRouter = new URL(modelsUrl({ provider: 'openrouter' }));
    assert.equal(openRouter.origin + openRouter.pathname, 'https://openrouter.ai/api/v1/models');
    assert.equal(openRouter.searchParams.get('output_modalities'), 'text');
    assert.equal(openRouter.searchParams.get('supported_parameters'), 'tools');
});

test('provider model discovery filters non-chat models and keeps tool-capable catalog entries', async () => {
    let captured;
    const fetchImpl = async (url, options) => {
        captured = { url, options };
        return new Response(JSON.stringify({ data: [
            { id: 'vendor/tool-model', name: 'Tool Model', supported_parameters: ['tools', 'temperature'] },
            { id: 'vendor/plain-model', name: 'Plain Model', supported_parameters: ['temperature'] },
            { id: 'vendor/image-model', name: 'Image Model', supported_parameters: ['tools'] },
        ] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const models = await listProviderModels({ provider: 'openrouter', apiKey: 'or-key' }, { fetchImpl });

    assert.equal(captured.options.method, 'GET');
    assert.equal(captured.options.headers.Authorization, 'Bearer or-key');
    assert.deepEqual(models, [{ id: 'vendor/tool-model', label: 'Tool Model' }]);
});

test('Gemini model discovery accepts chat models from native and OpenAI-compatible response shapes', () => {
    assert.deepEqual(normalizeProviderModels('gemini', { models: [
        { name: 'models/gemini-3.7-flash', displayName: 'Gemini 3.7 Flash' },
        { name: 'models/gemini-embedding-001', displayName: 'Gemini Embedding' },
    ] }), [{ id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' }]);
});

test('provider adapter sends OpenAI-compatible tool calls without exposing configuration fields', async () => {
    let captured;
    const fetchImpl = async (url, options) => {
        captured = { url, options, body: JSON.parse(options.body) };
        return new Response(JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'ready' } }],
            usage: { total_tokens: 4 },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const result = await requestChatCompletion({
        provider: 'deepseek', model: 'deepseek-test', apiKey: 'ds-test', reasoning: 'fast',
    }, {
        messages: [{ role: 'user', content: 'hello' }],
        tools: [{ type: 'function', function: { name: 'inspect', description: 'Inspect', parameters: { type: 'object' } } }],
        fetchImpl,
    });

    assert.equal(captured.url, 'https://api.deepseek.com/chat/completions');
    assert.equal(captured.options.headers.Authorization, 'Bearer ds-test');
    assert.equal(captured.body.model, 'deepseek-test');
    assert.equal(captured.body.tool_choice, 'auto');
    assert.equal(captured.body.apiKey, undefined);
    assert.equal(result.message.content, 'ready');
    assert.equal(result.usage.totalTokens, 4);
});

test('token usage normalization covers chat, Responses, Gemini, and cache-specific fields', () => {
    assert.deepEqual(normalizeTokenUsage('deepseek', {
        prompt_tokens: 100, prompt_cache_hit_tokens: 70, completion_tokens: 20, total_tokens: 120,
    }), {
        provider: 'deepseek', inputTokens: 100, cachedInputTokens: 70, cacheWriteTokens: 0,
        outputTokens: 20, reasoningTokens: 0, totalTokens: 120, cost: null,
    });
    assert.equal(normalizeTokenUsage('openai', {
        input_tokens: 90, input_tokens_details: { cached_tokens: 64, cache_write_tokens: 8 },
        output_tokens: 15, output_tokens_details: { reasoning_tokens: 5 }, total_tokens: 105,
    }).cachedInputTokens, 64);
    assert.deepEqual(normalizeTokenUsage('gemini', {
        total_input_tokens: 80, total_cached_tokens: 50, total_output_tokens: 12,
        total_thought_tokens: 4, total_tokens: 96,
    }), {
        provider: 'gemini', inputTokens: 80, cachedInputTokens: 50, cacheWriteTokens: 0,
        outputTokens: 12, reasoningTokens: 4, totalTokens: 96, cost: null,
    });
});

test('OpenAI Responses transport continues by response ID and sends only incremental input', async () => {
    const requests = [];
    const fetchImpl = async (url, options) => {
        const body = JSON.parse(options.body);
        requests.push({ url, options, body });
        const index = requests.length;
        return new Response(JSON.stringify({
            id: `resp-${index}`,
            output: [{
                type: 'message', role: 'assistant',
                content: [{ type: 'output_text', text: index === 1 ? 'Hello.' : 'I remember.' }],
            }],
            usage: {
                input_tokens: index === 1 ? 20 : 6,
                input_tokens_details: { cached_tokens: index === 1 ? 0 : 4 },
                output_tokens: 3,
                total_tokens: index === 1 ? 23 : 9,
            },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const settings = { provider: 'openai', model: 'gpt-5.6-sol', apiKey: 'oa-key' };
    const firstMessages = [
        { role: 'system', content: 'Stable instructions.' },
        { role: 'user', content: 'Remember me.' },
    ];
    const first = await requestChatCompletion(settings, {
        messages: firstMessages, tools: [], sessionId: 'chat-cache-key', fetchImpl,
    });
    const secondMessages = [...firstMessages, first.message, { role: 'user', content: 'Do you remember?' }];
    const second = await requestChatCompletion(settings, {
        messages: secondMessages, tools: [], state: first.state, sessionId: 'chat-cache-key', fetchImpl,
    });

    assert.match(requests[0].url, /\/responses$/);
    assert.equal(requests[0].body.instructions, 'Stable instructions.');
    assert.equal(requests[0].body.prompt_cache_key, 'chat-cache-key');
    assert.equal(requests[0].body.input.length, 1);
    assert.equal(requests[1].body.previous_response_id, 'resp-1');
    assert.deepEqual(requests[1].body.input, [{ role: 'user', content: 'Do you remember?' }]);
    assert.equal(second.message.content, 'I remember.');
    assert.equal(second.usage.cachedInputTokens, 4);
});

test('expired native continuation replays preserved provider output without losing the turn', async () => {
    const requests = [];
    const fetchImpl = async (_url, options) => {
        const body = JSON.parse(options.body);
        requests.push(body);
        if (requests.length === 2) {
            return new Response(JSON.stringify({ error: { message: 'Response expired', code: 'not_found' } }), {
                status: 404, headers: { 'content-type': 'application/json' },
            });
        }
        const text = requests.length === 1 ? 'First reply.' : 'Recovered reply.';
        return new Response(JSON.stringify({
            id: `resp-${requests.length}`,
            output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
            usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const settings = { provider: 'openai', model: 'gpt-5.6-sol', apiKey: 'oa-key' };
    const firstMessages = [{ role: 'system', content: 'Stable.' }, { role: 'user', content: 'First turn.' }];
    const first = await requestChatCompletion(settings, { messages: firstMessages, fetchImpl });
    const secondMessages = [...firstMessages, first.message, { role: 'user', content: 'Second turn.' }];
    const second = await requestChatCompletion(settings, {
        messages: secondMessages, state: first.state, fetchImpl,
    });

    assert.equal(requests.length, 3);
    assert.equal(requests[1].previous_response_id, 'resp-1');
    assert.equal(requests[2].previous_response_id, undefined);
    assert.ok(requests[2].input.some(item => item.type === 'message'
        && item.content?.[0]?.text === 'First reply.'));
    assert.deepEqual(requests[2].input.at(-1), { role: 'user', content: 'Second turn.' });
    assert.equal(second.message.content, 'Recovered reply.');
});

test('Gemini Interactions transport continues tool calls by interaction ID', async () => {
    const requests = [];
    const fetchImpl = async (url, options) => {
        const body = JSON.parse(options.body);
        requests.push({ url, options, body });
        const first = requests.length === 1;
        return new Response(JSON.stringify(first ? {
            id: 'int-1', status: 'requires_action',
            steps: [{ type: 'function_call', id: 'call-1', name: 'inspect_circuit', arguments: {} }],
            usage: { total_input_tokens: 30, total_cached_tokens: 10, total_output_tokens: 4, total_tokens: 34 },
        } : {
            id: 'int-2', status: 'completed',
            steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Circuit inspected.' }] }],
            usage: { total_input_tokens: 8, total_cached_tokens: 6, total_output_tokens: 3, total_tokens: 11 },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const tools = [{ type: 'function', function: {
        name: 'inspect_circuit', description: 'Inspect', parameters: { type: 'object', properties: {} },
    } }];
    const settings = { provider: 'gemini', model: 'gemini-3.5-flash', apiKey: 'gem-key' };
    const firstMessages = [
        { role: 'system', content: 'Stable instructions.' },
        { role: 'user', content: 'Inspect it.' },
    ];
    const first = await requestChatCompletion(settings, { messages: firstMessages, tools, fetchImpl });
    const secondMessages = [
        ...firstMessages,
        first.message,
        { role: 'tool', tool_call_id: 'call-1', name: 'inspect_circuit', content: '{"valid":true}' },
    ];
    const second = await requestChatCompletion(settings, {
        messages: secondMessages, tools, state: first.state, fetchImpl,
    });

    assert.match(requests[0].url, /\/v1beta\/interactions$/);
    assert.equal(requests[0].options.headers['x-goog-api-key'], 'gem-key');
    assert.equal(requests[0].body.tools[0].name, 'inspect_circuit');
    assert.equal(requests[1].body.previous_interaction_id, 'int-1');
    assert.deepEqual(requests[1].body.input, [{
        type: 'function_result', call_id: 'call-1', name: 'inspect_circuit',
        result: [{ type: 'text', text: '{"valid":true}' }],
    }]);
    assert.equal(second.message.content, 'Circuit inspected.');
    assert.equal(second.usage.cachedInputTokens, 6);
});

test('OpenRouter stateless transport keeps full history and sets a sticky cache session', async () => {
    let captured;
    const fetchImpl = async (url, options) => {
        captured = { url, body: JSON.parse(options.body) };
        return new Response(JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'ok' } }],
            usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12,
                prompt_tokens_details: { cached_tokens: 7 } },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const messages = [
        { role: 'system', content: 'Stable.' },
        { role: 'user', content: 'First.' },
        { role: 'assistant', content: 'Reply.' },
        { role: 'user', content: 'Second.' },
    ];
    const result = await requestChatCompletion({
        provider: 'openrouter', model: 'google/gemini-2.5-flash', apiKey: 'or-key',
    }, { messages, sessionId: 'elera-session', fetchImpl });

    assert.deepEqual(captured.body.messages, messages);
    assert.equal(captured.body.session_id, 'elera-session');
    assert.equal(result.usage.cachedInputTokens, 7);
});

test('provider adapter returns useful API errors', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ error: { message: 'invalid key', code: 'bad_key' } }), {
        status: 401, headers: { 'content-type': 'application/json' },
    });
    await assert.rejects(
        requestChatCompletion({ provider: 'gemini', model: 'gemini-test', apiKey: 'bad' }, {
            messages: [{ role: 'user', content: 'hello' }], fetchImpl,
        }),
        error => error instanceof AiProviderError && error.status === 401 && error.message === 'invalid key',
    );
});

test('Elera tool registry places parts atomically and Auto Wire uses the physical store', async () => {
    const store = emptyStore();
    const registry = createEleraToolRegistry(store);
    const placed = await registry.get('place_components').execute({
        mount_on_breadboard: false,
        components: [{ component_id: 'arduino-uno' }, { component_id: 'led' }],
    });
    assert.equal(placed.status, 'success');
    assert.equal(store.project.components.length, 2);
    assert.equal(store.history.length, 2);

    const wired = await registry.get('auto_wire').execute({});
    assert.equal(wired.status, 'success');
    assert.ok(store.project.wires.length >= 2);
    assert.ok(store.project.components.some(component => component.definitionId === 'resistor'));
});

test('component discovery resolves multiple required parts in one batched call', async () => {
    const registry = createEleraToolRegistry(emptyStore());
    const result = await registry.get('list_available_components').execute({
        queries: ['Arduino Uno', 'LED', '220Ω resistor'],
    });

    assert.deepEqual(result.queries.map(item => item.query), ['Arduino Uno', 'LED', '220Ω resistor']);
    assert.ok(result.components.some(component => component.componentId === 'arduino-uno'));
    assert.ok(result.components.some(component => component.componentId === 'led'));
    assert.ok(result.components.some(component => component.componentId === 'resistor'));
});

test('system prompt omits the full catalog and instructs one batched component lookup', () => {
    const prompt = buildEleraSystemPrompt(emptyStore(), { apiKey: 'key' });
    const projectContext = buildEleraProjectContext(emptyStore(), { apiKey: 'key' });

    assert.doesNotMatch(prompt, /Available component summary/);
    assert.doesNotMatch(prompt, /arduino-mega/);
    assert.doesNotMatch(prompt, /Current Elera project context/);
    assert.match(prompt, /one list_available_components call using its queries array/);
    assert.match(prompt, /Never call it once per component/);
    assert.match(projectContext, /Current Elera project context/);
    assert.match(projectContext, /"components":\[\]/);
});

test('AI-selected semantic connections survive layout and route-only cleanup unchanged', async () => {
    const store = emptyStore();
    const registry = createEleraToolRegistry(store);
    const placed = await registry.get('place_components').execute({
        mount_on_breadboard: false,
        components: [{ component_id: 'arduino-uno' }, { component_id: 'servo' }],
    });
    const [controller, servo] = placed.placed.map(item => item.instanceId);
    await registry.get('connect_pins').execute({ connections: [{
        from_instance_id: controller, from_pin: '9',
        to_instance_id: servo, to_pin: 'PWM',
    }] });
    const semanticBefore = store.project.wires.map(wire => ({ from: wire.from, to: wire.to }));

    await registry.get('arrange_components').execute({});
    await registry.get('route_wires').execute({});

    assert.deepEqual(store.project.wires.map(wire => ({ from: wire.from, to: wire.to })), semanticBefore);
});

test('connect_pins rejects an MCU pin that cannot satisfy the endpoint capability atomically', async () => {
    const store = emptyStore();
    const registry = createEleraToolRegistry(store);
    const placed = await registry.get('place_components').execute({
        mount_on_breadboard: false,
        components: [{ component_id: 'esp32-devkit-v1' }, { component_id: 'servo' }],
    });
    const [controller, servo] = placed.placed.map(item => item.instanceId);
    const historyBefore = store.history.length;

    assert.throws(() => registry.get('connect_pins').execute({ connections: [{
        from_instance_id: controller, from_pin: 'D34',
        to_instance_id: servo, to_pin: 'PWM',
    }] }), /PWM|output/i);

    assert.equal(store.project.wires.length, 0);
    assert.equal(store.history.length, historyBefore);
});

test('find_compatible_pins batches requirements and narrows authoritative MCU candidates', async () => {
    const store = emptyStore();
    const registry = createEleraToolRegistry(store);
    const placed = await registry.get('place_components').execute({
        mount_on_breadboard: false,
        components: [{ component_id: 'arduino-uno' }],
    });
    const controller = placed.placed[0].instanceId;

    const result = await registry.get('find_compatible_pins').execute({
        instance_id: controller,
        requirements: [
            { id: 'motor_pwm', capabilities: ['PWM', 'DIGITAL_OUTPUT'] },
            { id: 'potentiometer', capabilities: ['ANALOG'] },
            { id: 'serial_rx', capabilities: ['UART_RX'] },
        ],
    });

    assert.deepEqual(result.candidates.motor_pwm.map(pin => pin.pinId), ['3', '5', '6', '9', '10', '11']);
    assert.deepEqual(result.candidates.potentiometer.map(pin => pin.pinId), ['A0', 'A1', 'A2', 'A3', 'A4', 'A5']);
    assert.deepEqual(result.candidates.serial_rx.map(pin => pin.pinId), ['0']);
});

test('inspect_pin_usage reports controller capabilities, constraints, and current connections', async () => {
    const store = emptyStore();
    const registry = createEleraToolRegistry(store);
    const placed = await registry.get('place_components').execute({
        mount_on_breadboard: false,
        components: [{ component_id: 'arduino-uno' }, { component_id: 'servo' }],
    });
    const [controller, servo] = placed.placed.map(item => item.instanceId);
    await registry.get('connect_pins').execute({ connections: [{
        from_instance_id: controller, from_pin: '9',
        to_instance_id: servo, to_pin: 'PWM',
    }] });

    const usage = await registry.get('inspect_pin_usage').execute({ instance_id: controller });
    const pin9 = usage.pins.find(pin => pin.pinId === '9');
    const serialRx = usage.pins.find(pin => pin.pinId === '0');
    assert.ok(pin9.capabilities.includes('PWM'));
    assert.deepEqual(pin9.usage, [{ instanceId: servo, pinId: 'PWM' }]);
    assert.ok(serialRx.capabilities.includes('UART_RX'));
    assert.ok(serialRx.constraints.some(constraint => constraint.type === 'serial_reserved'));
});

test('agent executes an approved model tool call and returns its result to the model', async () => {
    const store = emptyStore();
    const requests = [];
    let round = 0;
    const request = async (_settings, options) => {
        requests.push(options);
        round++;
        if (round === 1) {
            return { message: {
                role: 'assistant', content: null,
                tool_calls: [{
                    id: 'call-place', type: 'function',
                    function: { name: 'place_components', arguments: JSON.stringify({ components: [{ component_id: 'arduino-uno' }] }) },
                }],
            } };
        }
        return { message: { role: 'assistant', content: 'Arduino Uno placed.' } };
    };
    const approvals = [];
    const events = [];
    const agent = new EleraAiAgent({
        store,
        settings: { provider: 'deepseek', model: 'test', apiKey: 'key', actionMode: 'ask-before-apply' },
        request,
        approve: async approval => { approvals.push(approval); return true; },
        onEvent: event => events.push(event),
    });

    const result = await agent.run('Place an Arduino Uno');
    assert.equal(result.text, 'Arduino Uno placed.');
    assert.equal(store.project.components.length, 1);
    assert.equal(approvals.length, 1);
    assert.equal(approvals[0].name, 'place_components');
    assert.ok(requests[1].messages.some(message => message.role === 'tool' && message.tool_call_id === 'call-place'));
    assert.ok(events.some(event => event.type === 'tool-result' && event.status === 'done'));
});

test('suggest-only mode reports mutation tools without changing the circuit', async () => {
    const store = emptyStore();
    let round = 0;
    const request = async () => {
        round++;
        return round === 1
            ? { message: { role: 'assistant', content: null, tool_calls: [{
                id: 'call-place', type: 'function',
                function: { name: 'place_components', arguments: '{"components":[{"component_id":"led"}]}' },
            }] } }
            : { message: { role: 'assistant', content: 'I left the circuit unchanged.' } };
    };
    const agent = new EleraAiAgent({
        store,
        settings: { provider: 'gemini', model: 'test', apiKey: 'key', actionMode: 'suggest-only' },
        request,
    });
    await agent.run('Suggest an LED circuit');
    assert.equal(store.project.components.length, 0);
});

test('agent returns a compact cached result for an identical catalog lookup in one run', async () => {
    const store = emptyStore();
    const events = [];
    let round = 0;
    const request = async () => {
        round++;
        if (round <= 2) {
            return { message: { role: 'assistant', content: null, tool_calls: [{
                id: `catalog-${round}`, type: 'function',
                function: {
                    name: 'list_available_components',
                    arguments: JSON.stringify({ queries: ['Arduino Uno', 'LED'] }),
                },
            }] } };
        }
        return { message: { role: 'assistant', content: 'I reused the component results.' } };
    };
    const agent = new EleraAiAgent({
        store,
        settings: { provider: 'gemini', model: 'test', apiKey: 'key' },
        request,
        onEvent: event => events.push(event),
    });

    const result = await agent.run('Find an Uno and LED');
    const catalogResults = events.filter(event => event.type === 'tool-result'
        && event.name === 'list_available_components');
    assert.equal(result.text, 'I reused the component results.');
    assert.equal(catalogResults.length, 2);
    assert.equal(catalogResults[1].result.status, 'cached');
    assert.match(catalogResults[1].result.message, /already resolved/);
});

test('tool-round limit reserves one final provider request with tools disabled', async () => {
    const store = emptyStore();
    const requests = [];
    let round = 0;
    const request = async (_settings, options) => {
        requests.push(options);
        round++;
        if (round <= 2) {
            return { message: { role: 'assistant', content: null, tool_calls: [{
                id: `catalog-${round}`, type: 'function',
                function: {
                    name: 'list_available_components',
                    arguments: JSON.stringify({ queries: [round === 1 ? 'Arduino Uno' : 'LED'] }),
                },
            }] } };
        }
        return { message: { role: 'assistant', content: 'I found the parts, but wiring remains.' } };
    };
    const agent = new EleraAiAgent({
        store,
        settings: { provider: 'gemini', model: 'test', apiKey: 'key', maxToolRounds: 30 },
        request,
        maxToolRounds: 2,
    });

    const result = await agent.run('Build a circuit');
    assert.equal(requests.length, 3);
    assert.ok(requests[0].tools.length > 0);
    assert.ok(requests[1].tools.length > 0);
    assert.deepEqual(requests[2].tools, []);
    assert.match(requests[2].messages.at(-1).content, /limit of 2 tool rounds/);
    assert.equal(result.text, 'I found the parts, but wiring remains.');
    assert.equal(result.toolRounds, 2);
    assert.equal(result.limitReached, true);
});

test('agent preserves canonical multi-turn chat context and survives provider changes', async () => {
    const store = emptyStore();
    const requests = [];
    const request = async (settings, options) => {
        requests.push({ provider: settings.provider, messages: structuredClone(options.messages) });
        return { message: { role: 'assistant', content: settings.provider === 'deepseek'
            ? 'I will remember the LED.'
            : 'Yes, you previously asked about the LED.' } };
    };
    const agent = new EleraAiAgent({
        store,
        settings: { provider: 'deepseek', model: 'test', apiKey: 'key' },
        request,
    });

    await agent.run('Remember that the LED is active-high.');
    agent.updateSettings({ provider: 'openrouter', model: 'test-2', apiKey: 'key' });
    await agent.run('What did I say about the LED?');

    const secondTurn = requests[1].messages.map(message => message.content).join('\n');
    assert.match(secondTurn, /Remember that the LED is active-high/);
    assert.match(secondTurn, /I will remember the LED/);
    assert.match(secondTurn, /What did I say about the LED/);
    assert.equal(agent.history.at(-1).content, 'Yes, you previously asked about the LED.');
});

test('agent compacts older canonical turns into lightweight conversation memory', async () => {
    const store = emptyStore();
    const request = async (_settings, options) => {
        const latestUser = [...options.messages].reverse()
            .find(message => message.role === 'user' && !String(message.content).startsWith('Current Elera project context'));
        return { message: { role: 'assistant', content: `Acknowledged: ${latestUser.content}` } };
    };
    const agent = new EleraAiAgent({
        store,
        settings: { provider: 'custom', model: 'test', apiKey: 'key', baseUrl: 'http://localhost:11434/v1' },
        request,
    });

    for (let index = 0; index < 20; index++) await agent.run(`Conversation fact ${index}`);

    assert.match(agent.summary, /Conversation fact 0/);
    assert.ok(agent.history.filter(message => message.role === 'user' && !message.eleraContext).length <= 8);
    assert.match(agent.history.at(-1).content, /Conversation fact 19/);
});

test('agent aggregates provider usage from tool-only and final response rounds', async () => {
    const store = emptyStore();
    const events = [];
    let round = 0;
    const request = async () => {
        round++;
        return round === 1 ? {
            message: { role: 'assistant', content: null, tool_calls: [{
                id: 'inspect-1', type: 'function',
                function: { name: 'inspect_circuit', arguments: '{}' },
            }] },
            usage: {
                inputTokens: 100, cachedInputTokens: 60, cacheWriteTokens: 0,
                outputTokens: 10, reasoningTokens: 0, totalTokens: 110, cost: null,
            },
        } : {
            message: { role: 'assistant', content: 'Done.' },
            usage: {
                inputTokens: 40, cachedInputTokens: 30, cacheWriteTokens: 0,
                outputTokens: 5, reasoningTokens: 0, totalTokens: 45, cost: null,
            },
        };
    };
    const agent = new EleraAiAgent({
        store,
        settings: { provider: 'deepseek', model: 'test', apiKey: 'key' },
        request,
        onEvent: event => events.push(event),
    });

    const result = await agent.run('Inspect the circuit');
    assert.equal(events.filter(event => event.type === 'usage').length, 2);
    assert.equal(result.usage.requests, 2);
    assert.equal(result.usage.inputTokens, 140);
    assert.equal(result.usage.cachedInputTokens, 90);
    assert.equal(result.usage.outputTokens, 15);
});

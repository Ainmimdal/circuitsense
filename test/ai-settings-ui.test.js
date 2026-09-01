import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const loginModalSource = await readFile(new URL('../src/components/login-modal.js', import.meta.url), 'utf8');
const aiAssistantSource = await readFile(new URL('../src/components/ai-assistant.js', import.meta.url), 'utf8');

test('AI settings renders known provider models as visible select options', () => {
    const keysTab = loginModalSource.match(/_renderKeysTab\(\) \{([\s\S]*?)\n    _renderPreferencesTab/)?.[1] || '';

    assert.match(keysTab, /<select[\s\S]*modelOptions\.map/);
    assert.match(keysTab, /<option value=\$\{model\.id\}>/);
    assert.doesNotMatch(keysTab, /<datalist|list="ai-provider-models"/);
});

test('AI settings loads provider models and keeps a manual model ID fallback', () => {
    const keysTab = loginModalSource.match(/_renderKeysTab\(\) \{([\s\S]*?)\n    _renderPreferencesTab/)?.[1] || '';

    assert.match(loginModalSource, /listProviderModels\(this\._aiSettings/);
    assert.match(keysTab, /Enter model ID manually/);
    assert.match(keysTab, /placeholder="Model ID"/);
    assert.match(keysTab, /this\._refreshModels\(\)/);
});

test('AI preferences exposes the bounded BYOK tool-round budget', () => {
    const preferencesTab = loginModalSource.match(/_renderPreferencesTab\(\) \{([\s\S]*?)\n    _renderCheck/)?.[1] || '';

    assert.match(preferencesTab, /Maximum AI tool rounds/);
    assert.match(preferencesTab, /min=\$\{MIN_AI_TOOL_ROUNDS\}/);
    assert.match(preferencesTab, /max=\$\{MAX_AI_TOOL_ROUNDS\}/);
    assert.match(preferencesTab, /maxToolRounds/);
    assert.match(preferencesTab, /Uses your API key/);
});

test('AI panel reports input, cached input, and output token totals', () => {
    assert.match(aiAssistantSource, /event\.type === 'usage'/);
    assert.match(aiAssistantSource, /cachedInputTokens/);
    assert.match(aiAssistantSource, /In \$\{this\._formatTokens\(this\._usage\.inputTokens\)\}/);
    assert.match(aiAssistantSource, /cached\) · Out/);
});

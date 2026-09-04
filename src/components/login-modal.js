import { LitElement, html, css } from 'lit';
import { faIcon } from '../utils/fa-icons.js';
import {
    AI_PROVIDERS,
    MAX_AI_TOOL_ROUNDS,
    MIN_AI_TOOL_ROUNDS,
    loadAiSettings,
    providerDefinition,
    saveAiSettings,
} from '../ai/config.js';
import { listProviderModels, testAiConnection } from '../ai/providers.js';
import { loadEditorPreferences, saveEditorPreferences } from '../core/editor-preferences.js';

class LoginModal extends LitElement {
    static properties = {
        open: { type: Boolean, reflect: true },
        user: { type: Object },
        initialTab: { type: String },
        _activeTab: { state: true },
        _name: { state: true },
        _email: { state: true },
        _aiSettings: { state: true },
        _testStatus: { state: true },
        _testMessage: { state: true },
        _providerModels: { state: true },
        _modelsStatus: { state: true },
        _modelsMessage: { state: true },
        _manualModel: { state: true },
        _editorPreferences: { state: true },
    };

    static styles = css`
        :host {
            display: none;
            position: fixed;
            inset: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.62);
            z-index: 1000;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
            box-sizing: border-box;
            padding: 16px;
        }

        :host([open]) {
            display: flex;
        }

        * {
            box-sizing: border-box;
        }

        .modal {
            width: 680px;
            max-width: 100%;
            max-height: calc(100vh - 32px);
            background: #18181b;
            border: 1px solid #27272a;
            border-radius: 12px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4);
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .header {
            padding: 18px 20px;
            border-bottom: 1px solid #27272a;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex: 0 0 auto;
        }

        .title {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
        }

        .title-icon {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: var(--primary);
            color: #fff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
        }

        h2 {
            margin: 0;
            color: #fafafa;
            font-size: 18px;
            font-weight: 600;
            line-height: 1.2;
        }

        .badge {
            display: inline-flex;
            align-items: center;
            width: fit-content;
            margin-top: 5px;
            border: 1px solid #3f3f46;
            border-radius: 999px;
            color: #a1a1aa;
            font-size: 11px;
            padding: 2px 8px;
        }

        .close-btn {
            background: none;
            border: none;
            color: #a1a1aa;
            cursor: pointer;
            padding: 6px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
        }

        .close-btn:hover {
            background: #27272a;
            color: #fafafa;
        }

        .tabs {
            display: flex;
            gap: 4px;
            padding: 10px 12px 0;
            background: #18181b;
            border-bottom: 1px solid #27272a;
            flex: 0 0 auto;
            overflow-x: auto;
        }

        .tab {
            min-width: 110px;
            height: 36px;
            border: 1px solid transparent;
            border-bottom: none;
            border-radius: 8px 8px 0 0;
            background: transparent;
            color: #a1a1aa;
            cursor: pointer;
            font-family: inherit;
            font-size: 12px;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            padding: 0 12px;
            white-space: nowrap;
        }

        .tab:hover {
            color: #fafafa;
            background: #27272a;
        }

        .tab.active {
            background: #111113;
            border-color: #27272a;
            color: #fafafa;
        }

        .body {
            padding: 20px;
            overflow-y: auto;
            background: #111113;
        }

        form,
        .section {
            display: flex;
            flex-direction: column;
            gap: 14px;
            margin: 0;
        }

        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }

        label,
        .field {
            display: flex;
            flex-direction: column;
            gap: 6px;
            color: #d4d4d8;
            font-size: 12px;
            font-weight: 600;
        }

        input,
        select {
            width: 100%;
            height: 38px;
            background: #27272a;
            border: 1px solid #3f3f46;
            border-radius: 6px;
            color: #fafafa;
            padding: 0 11px;
            font-family: inherit;
            font-size: 14px;
        }

        input:focus,
        select:focus {
            outline: none;
            border-color: var(--primary-hover);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);
        }

        .helper {
            color: #71717a;
            font-size: 11px;
            font-weight: 500;
            line-height: 1.45;
        }

        .model-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
        }

        .model-refresh {
            min-width: 104px;
            padding-inline: 10px;
        }

        .model-status.ready {
            color: #22c55e;
        }

        .model-status.failed {
            color: #f59e0b;
        }

        .actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 6px;
            flex-wrap: wrap;
        }

        button {
            font-family: inherit;
        }

        .btn {
            height: 38px;
            border-radius: 6px;
            border: 1px solid #3f3f46;
            background: #27272a;
            color: #e4e4e7;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            min-width: 120px;
            padding: 0 14px;
        }

        .btn:hover {
            background: #3f3f46;
            border-color: #52525b;
        }

        .btn-primary {
            background: var(--primary);
            color: #fff;
            border-color: var(--primary);
        }

        .btn-primary:hover {
            background: var(--primary-hover);
            border-color: var(--primary-hover);
        }

        .btn-danger {
            color: #f87171;
            border-color: #7f1d1d;
            background: rgba(127, 29, 29, 0.18);
        }

        .btn-danger:hover {
            background: #ef4444;
            border-color: #ef4444;
            color: #fff;
        }

        .btn:disabled {
            background: #27272a;
            border-color: #3f3f46;
            color: #71717a;
            cursor: not-allowed;
        }

        .account {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .account-row {
            display: grid;
            grid-template-columns: 44px 1fr;
            gap: 12px;
            align-items: center;
            min-width: 0;
            background: #18181b;
            border: 1px solid #27272a;
            border-radius: 8px;
            padding: 14px;
        }

        .avatar {
            width: 44px;
            height: 44px;
            border-radius: 10px;
            background: var(--primary);
            color: #fff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 16px;
        }

        .account-name {
            color: #fafafa;
            font-weight: 700;
            font-size: 15px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .account-meta {
            margin-top: 3px;
            color: #a1a1aa;
            font-size: 12px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .status-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 11px 12px;
            border: 1px solid #27272a;
            border-radius: 8px;
            background: #18181b;
            color: #a1a1aa;
            font-size: 12px;
        }

        .status {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-weight: 700;
        }

        .status.ready {
            color: #22c55e;
        }

        .status.missing,
        .status.failed {
            color: #f87171;
        }

        .status.testing {
            color: #eab308;
        }

        .check-list {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }

        .check {
            min-height: 42px;
            display: grid;
            grid-template-columns: 18px 1fr;
            align-items: start;
            gap: 9px;
            padding: 10px;
            border: 1px solid #27272a;
            border-radius: 8px;
            background: #18181b;
            color: #d4d4d8;
            font-size: 12px;
            font-weight: 600;
            line-height: 1.35;
            cursor: pointer;
        }

        .check input {
            width: 16px;
            height: 16px;
            padding: 0;
            margin: 1px 0 0;
            accent-color: var(--primary-hover);
        }

        .preference-group {
            display: grid;
            gap: 10px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--panel-border);
        }
        .preference-group h3 { margin: 0; color: var(--text); font-size: 13px; }

        :host { background: color-mix(in srgb, var(--ink) 72%, transparent); font-family: var(--font-ui, 'Public Sans', sans-serif); }
        .modal, .tabs, .body, .account-row, .status-row, .check { background: var(--panel); border-color: var(--panel-border); color: var(--text); }
        .modal, .account-row, .status-row, .check { border-radius: 4px; }
        .header, .tabs { border-color: var(--panel-border); }
        h2, .account-name, label, .field { color: var(--text); }
        .title-icon, .avatar { background: var(--primary); color: var(--text); border-radius: 4px; }
        .badge { border-color: var(--panel-border); border-radius: 4px; color: var(--text-muted); }
        .close-btn { width: 34px; height: 34px; padding: 0; border: 1px solid var(--panel-border); border-radius: 4px; color: var(--text-muted); }
        .close-btn:hover { background: var(--primary-hover); color: var(--text); }
        .tab { height: 34px; border-radius: 4px 4px 0 0; color: var(--text-muted); }
        .tab:hover, .tab.active { color: var(--text); background: var(--primary); border-color: var(--panel-border); }
        input, select { height: 34px; background: var(--panel); border-color: var(--panel-border); border-radius: 4px; color: var(--text); }
        input:focus, select:focus { border-color: var(--primary-hover); box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 35%, transparent); }
        .helper, .account-meta, .status-row { color: var(--text-muted); }
        .btn { height: 34px; border-radius: 4px; border-color: var(--panel-border); background: var(--panel); color: var(--text); }
        .btn:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
        .btn-primary { background: var(--primary); border-color: var(--primary); color: var(--text); }
        .btn-primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
        .btn:disabled { background: var(--panel-border); border-color: var(--panel-border); color: var(--text-muted); }
        .check input { accent-color: var(--primary-hover); }

        @media (max-width: 640px) {
            .grid,
            .check-list {
                grid-template-columns: 1fr;
            }

            .body {
                padding: 16px;
            }

            .tab {
                min-width: 96px;
            }

            .model-row {
                grid-template-columns: 1fr;
            }
        }
    `;

    constructor() {
        super();
        this.open = false;
        this.user = null;
        this.initialTab = 'account';
        this._activeTab = 'account';
        this._name = '';
        this._email = '';
        this._aiSettings = this._loadAiSettings();
        this._editorPreferences = loadEditorPreferences();
        this._testStatus = 'idle';
        this._testMessage = '';
        this._providerModels = [];
        this._modelsStatus = 'idle';
        this._modelsMessage = '';
        this._manualModel = this._aiSettings.provider === 'custom' && this._aiSettings.model === 'custom-model';
        this._modelRequestId = 0;
        this._modelsAbortController = null;
        this._modelsRefreshTimer = null;
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('open') && this.open) {
            this._activeTab = this.initialTab || 'account';
            this._syncFieldsFromUser();
            this._aiSettings = this._loadAiSettings();
            this._editorPreferences = loadEditorPreferences();
            this._testStatus = 'idle';
            this._testMessage = '';
            this._providerModels = [];
            this._modelsStatus = 'idle';
            this._modelsMessage = '';
            this._manualModel = this._aiSettings.provider === 'custom' && this._aiSettings.model === 'custom-model';
        }

        if (changedProperties.has('initialTab') && this.open && this.initialTab) {
            this._activeTab = this.initialTab;
        }
    }

    updated(changedProperties) {
        if (changedProperties.has('open') && this.open && this._activeTab === 'keys') {
            this._scheduleModelRefresh();
        }
    }

    _loadAiSettings() {
        return loadAiSettings();
    }

    _saveAiSettings() {
        this._aiSettings = saveAiSettings(this._aiSettings);
        this._testStatus = this._aiSettings.apiKey.trim() ? 'ready' : 'missing';
        this._testMessage = this._aiSettings.apiKey
            ? 'Configuration saved. The key remains only for this browser tab.'
            : 'Add an API key before running Elera AI.';
        this.dispatchEvent(new CustomEvent('ai-settings-updated', {
            detail: { settings: { ...this._aiSettings, apiKey: '' } },
            bubbles: true,
            composed: true,
        }));
    }

    _savePreferences() {
        this._editorPreferences = saveEditorPreferences(this._editorPreferences);
        this._saveAiSettings();
    }

    _setEditorPreference(key, value) {
        this._editorPreferences = { ...this._editorPreferences, [key]: value };
    }

    _syncFieldsFromUser() {
        this._name = this.user?.name || '';
        this._email = this.user?.email || '';
    }

    _close() {
        clearTimeout(this._modelsRefreshTimer);
        this._modelsRefreshTimer = null;
        this._cancelModelRequest();
        this.open = false;
        this.dispatchEvent(new CustomEvent('close'));
    }

    _stopTextKeyEvent(e) {
        e.stopPropagation();
    }

    _setTab(tab) {
        this._activeTab = tab;
        if (tab === 'keys') this._scheduleModelRefresh();
    }

    _scheduleModelRefresh(delay = 0) {
        clearTimeout(this._modelsRefreshTimer);
        this._modelsRefreshTimer = null;
        if (!this._aiSettings.apiKey.trim()) return;
        this._modelsRefreshTimer = setTimeout(() => {
            this._modelsRefreshTimer = null;
            if (this.open && this._activeTab === 'keys' && this._modelsStatus === 'idle') {
                this._refreshModels();
            }
        }, delay);
    }

    _cancelModelRequest() {
        this._modelRequestId++;
        this._modelsAbortController?.abort();
        this._modelsAbortController = null;
    }

    async _refreshModels() {
        clearTimeout(this._modelsRefreshTimer);
        this._modelsRefreshTimer = null;
        if (!this._aiSettings.apiKey.trim()) {
            this._modelsStatus = 'missing';
            this._modelsMessage = 'Add an API key to load models available to your account.';
            return;
        }
        if (this._aiSettings.provider === 'custom' && !this._aiSettings.baseUrl.trim()) {
            this._modelsStatus = 'missing';
            this._modelsMessage = 'Add the custom provider base URL to load its models.';
            return;
        }

        this._cancelModelRequest();
        const requestId = this._modelRequestId;
        const controller = new AbortController();
        this._modelsAbortController = controller;
        this._modelsStatus = 'loading';
        this._modelsMessage = `Loading models from ${providerDefinition(this._aiSettings.provider).label}...`;
        try {
            const models = await listProviderModels(this._aiSettings, { signal: controller.signal });
            if (requestId !== this._modelRequestId) return;
            this._providerModels = models;
            this._modelsStatus = 'ready';
            this._modelsMessage = `${models.length} compatible models loaded from the provider.`;
            if (models.some(model => model.id === this._aiSettings.model)) this._manualModel = false;
        } catch (error) {
            if (error?.name === 'AbortError' || requestId !== this._modelRequestId) return;
            this._providerModels = [];
            this._modelsStatus = 'failed';
            this._modelsMessage = `${error?.message || 'Could not load provider models.'} Showing fallback models.`;
        } finally {
            if (requestId === this._modelRequestId) this._modelsAbortController = null;
        }
    }

    _chooseModel(value) {
        if (value === '__manual__') {
            this._manualModel = true;
            return;
        }
        this._manualModel = false;
        this._setAiSetting('model', value);
    }

    _setAiSetting(key, value) {
        const next = { ...this._aiSettings, [key]: value };
        if (key === 'provider') {
            next.model = providerDefinition(value).models[0];
            if (!providerDefinition(value).configurableBaseUrl) {
                next.baseUrl = '';
            }
        }
        this._aiSettings = next;
        if (key === 'provider') {
            this._cancelModelRequest();
            this._providerModels = [];
            this._modelsStatus = 'idle';
            this._modelsMessage = '';
            this._manualModel = value === 'custom';
            this._scheduleModelRefresh();
        } else if (key === 'apiKey' || key === 'baseUrl') {
            this._cancelModelRequest();
            this._providerModels = [];
            this._modelsStatus = 'idle';
            this._modelsMessage = '';
        }
        this._testStatus = 'idle';
        this._testMessage = '';
    }

    async _testConnection() {
        if (!this._aiSettings.apiKey.trim()) {
            this._testStatus = 'missing';
            return;
        }
        this._testStatus = 'testing';
        this._testMessage = `Contacting ${providerDefinition(this._aiSettings.provider).label}...`;
        try {
            await testAiConnection(this._aiSettings);
            this._testStatus = 'ready';
            this._testMessage = `Connected to ${this._aiSettings.model}.`;
        } catch (error) {
            this._testStatus = 'failed';
            this._testMessage = error?.message || 'Connection failed.';
        }
    }

    _submit(e) {
        e.preventDefault();
        const name = this._name.trim();
        const email = this._email.trim();
        if (!name || !email) return;

        this.dispatchEvent(new CustomEvent('login-success', {
            detail: {
                user: {
                    id: this.user?.id || `mock-${Date.now()}`,
                    name,
                    email,
                    signedInAt: Date.now(),
                },
            },
            bubbles: true,
            composed: true,
        }));
    }

    _useDemoAccount() {
        this.dispatchEvent(new CustomEvent('login-success', {
            detail: {
                user: {
                    id: 'mock-demo-student',
                    name: 'Nur',
                    email: 'n.izzati@elera.local',
                    signedInAt: Date.now(),
                },
            },
            bubbles: true,
            composed: true,
        }));
    }

    _logout() {
        this.dispatchEvent(new CustomEvent('logout', {
            bubbles: true,
            composed: true,
        }));
    }

    _initials(name) {
        return (name || 'User')
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part[0]?.toUpperCase())
            .join('') || 'U';
    }

    _providerNeedsBaseUrl() {
        return Boolean(providerDefinition(this._aiSettings.provider).configurableBaseUrl);
    }

    _statusLabel() {
        if (this._testStatus === 'testing') return 'Testing';
        if (this._testStatus === 'ready') return 'Connected';
        if (this._testStatus === 'missing') return 'API key missing';
        if (this._testStatus === 'failed') return 'Connection failed';
        return this._aiSettings.apiKey ? 'Available this tab' : 'Not configured';
    }

    _renderTabs() {
        const tabs = [
            ['account', 'user', 'Account'],
            ['keys', 'key', 'AI Keys'],
            ['preferences', 'gear', 'Preferences'],
        ];

        return html`
            <div class="tabs">
                ${tabs.map(([id, icon, label]) => html`
                    <button
                        class="tab ${this._activeTab === id ? 'active' : ''}"
                        type="button"
                        @click=${() => this._setTab(id)}
                    >
                        ${faIcon(icon)}
                        ${label}
                    </button>
                `)}
            </div>
        `;
    }

    _renderAccountTab() {
        const isSignedIn = Boolean(this.user);
        if (isSignedIn) {
            return html`
                <div class="account">
                    <div class="account-row">
                        <div class="avatar">${this._initials(this.user.name)}</div>
                        <div>
                            <div class="account-name">${this.user.name}</div>
                            <div class="account-meta">${this.user.email}</div>
                        </div>
                    </div>
                    <div class="actions">
                        <button class="btn" type="button" @click=${() => this._setTab('keys')}>
                            ${faIcon('key')}
                            AI keys
                        </button>
                        <button class="btn btn-danger" type="button" @click=${this._logout}>
                            ${faIcon('rightFromBracket')}
                            Log out
                        </button>
                    </div>
                </div>
            `;
        }

        return html`
            <form @submit=${this._submit}>
                <div class="grid">
                    <label>
                        Name
                        <input
                            type="text"
                            autocomplete="name"
                            placeholder="Your name"
                            .value=${this._name}
                            @input=${(e) => this._name = e.target.value}
                        />
                    </label>
                    <label>
                        Email
                        <input
                            type="email"
                            autocomplete="email"
                            placeholder="you@example.com"
                            .value=${this._email}
                            @input=${(e) => this._email = e.target.value}
                        />
                    </label>
                </div>
                <div class="actions">
                    <button class="btn" type="button" @click=${this._useDemoAccount}>
                        ${faIcon('user')}
                        Demo account
                    </button>
                    <button class="btn btn-primary" type="submit" ?disabled=${!this._name.trim() || !this._email.trim()}>
                        ${faIcon('rightToBracket')}
                        Continue
                    </button>
                </div>
            </form>
        `;
    }

    _renderKeysTab() {
        const fallbackModels = providerDefinition(this._aiSettings.provider).models
            .map(id => ({ id, label: id }));
        const models = this._modelsStatus === 'ready' ? this._providerModels : fallbackModels;
        const selectedModel = String(this._aiSettings.model || '').trim();
        const modelOptions = selectedModel && !models.some(model => model.id === selectedModel)
            ? [{ id: selectedModel, label: selectedModel }, ...models]
            : models;
        const canRefreshModels = Boolean(this._aiSettings.apiKey.trim())
            && (this._aiSettings.provider !== 'custom' || Boolean(this._aiSettings.baseUrl.trim()));

        return html`
            <div class="section">
                <div class="grid">
                    <label>
                        Provider
                        <select
                            .value=${this._aiSettings.provider}
                            @change=${(e) => this._setAiSetting('provider', e.target.value)}
                        >
                            ${Object.values(AI_PROVIDERS).map(provider => html`
                                <option value=${provider.id}>${provider.label}</option>
                            `)}
                        </select>
                    </label>
                    <div class="field">
                        <span>Default model</span>
                        <div class="model-row">
                            <select
                                .value=${this._manualModel ? '__manual__' : selectedModel}
                                @change=${(e) => this._chooseModel(e.target.value)}
                                ?disabled=${this._modelsStatus === 'loading'}
                            >
                                ${modelOptions.map(model => html`
                                    <option value=${model.id}>${model.label === model.id ? model.id : `${model.label} — ${model.id}`}</option>
                                `)}
                                <option value="__manual__">Enter model ID manually...</option>
                            </select>
                            <button
                                class="btn model-refresh"
                                type="button"
                                @click=${() => this._refreshModels()}
                                ?disabled=${!canRefreshModels || this._modelsStatus === 'loading'}
                                title="Reload models available from this provider"
                            >
                                ${faIcon('rotateRight')}
                                ${this._modelsStatus === 'loading' ? 'Loading' : 'Refresh'}
                            </button>
                        </div>
                        ${this._manualModel ? html`
                            <input
                                type="text"
                                placeholder="Model ID"
                                .value=${this._aiSettings.model}
                                @input=${(e) => this._setAiSetting('model', e.target.value)}
                            />
                        ` : ''}
                        <span class="helper model-status ${this._modelsStatus}">
                            ${this._modelsMessage || 'Fallback models are shown until the provider catalog is loaded.'}
                        </span>
                    </div>
                </div>

                <label>
                    API key
                    <input
                        type="password"
                        autocomplete="off"
                        placeholder="Paste key for the selected provider"
                        .value=${this._aiSettings.apiKey}
                        @input=${(e) => this._setAiSetting('apiKey', e.target.value)}
                        @change=${() => this._scheduleModelRefresh()}
                    />
                    <span class="helper">Kept in session storage for this tab only. It is sent directly to the selected provider.</span>
                </label>

                ${this._providerNeedsBaseUrl() ? html`
                    <label>
                        Base URL
                        <input
                            type="url"
                            placeholder=${this._aiSettings.provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'http://localhost:11434/v1'}
                            .value=${this._aiSettings.baseUrl}
                            @input=${(e) => this._setAiSetting('baseUrl', e.target.value)}
                            @change=${() => this._scheduleModelRefresh()}
                        />
                    </label>
                ` : ''}

                <div class="status-row">
                    <span class="status ${this._testStatus}">
                        ${faIcon(this._testStatus === 'ready' ? 'circleCheck' : this._testStatus === 'missing' ? 'circleXmark' : 'shield')}
                        ${this._statusLabel()}
                    </span>
                    <span title=${this._testMessage}>${this._testMessage || 'BYOK configuration'}</span>
                </div>

                <div class="actions">
                    <button class="btn" type="button" @click=${this._testConnection}>
                        ${faIcon('bolt')}
                        Test
                    </button>
                    <button class="btn btn-primary" type="button" @click=${this._saveAiSettings}>
                        ${faIcon('save')}
                        Save AI settings
                    </button>
                </div>
            </div>
        `;
    }

    _renderPreferencesTab() {
        return html`
            <div class="section">
                <div class="preference-group">
                    <h3>Auto Wire</h3>
                    <label>
                        LED current limiting
                        <select
                            .value=${this._editorPreferences.autoWireLedResistors ? 'recommended' : 'direct'}
                            @change=${event => this._setEditorPreference('autoWireLedResistors', event.target.value === 'recommended')}
                        >
                            <option value="recommended">Add a recommended resistor</option>
                            <option value="direct">Connect directly and show a warning</option>
                        </select>
                        <span class="helper">Recommended resistors are calculated from the LED color and controller logic voltage. Direct wiring remains allowed, but electrical validation warns about it.</span>
                    </label>
                </div>

                <div class="preference-group">
                    <h3>AI assistant</h3>
                <label>
                    Reasoning
                    <select
                        .value=${this._aiSettings.reasoning}
                        @change=${(e) => this._setAiSetting('reasoning', e.target.value)}
                    >
                        <option value="fast">Fast</option>
                        <option value="balanced">Balanced</option>
                        <option value="deep">Deep</option>
                    </select>
                </label>

                <label>
                    Action mode
                    <select
                        .value=${this._aiSettings.actionMode}
                        @change=${(e) => this._setAiSetting('actionMode', e.target.value)}
                    >
                        <option value="explain-first">Explain before acting</option>
                        <option value="ask-before-apply">Ask before modifying circuit</option>
                        <option value="suggest-only">Auto-suggest only</option>
                        <option value="auto-apply-safe">Auto-apply safe fixes</option>
                    </select>
                </label>

                <label>
                    Maximum AI tool rounds
                    <input
                        type="number"
                        min=${MIN_AI_TOOL_ROUNDS}
                        max=${MAX_AI_TOOL_ROUNDS}
                        step="1"
                        .value=${String(this._aiSettings.maxToolRounds)}
                        @change=${(e) => this._setAiSetting('maxToolRounds', e.target.value)}
                    />
                    <span class="helper">Uses your API key. Higher limits allow more complex builds but may use more tokens. Elera always reserves a separate final summary.</span>
                </label>

                <div class="check-list">
                    ${this._renderCheck('includeCircuitJson', 'Include current circuit JSON')}
                    ${this._renderCheck('includeValidationErrors', 'Include validation errors')}
                    ${this._renderCheck('includeProjectMetadata', 'Include project name and metadata')}
                    ${this._renderCheck('preferArduinoUno', 'Prefer Arduino Uno')}
                    ${this._renderCheck('preferMinimalComponents', 'Prefer minimal components')}
                    ${this._renderCheck('includeCodeByDefault', 'Include Arduino code by default')}
                </div>
                </div>

                <div class="actions">
                    <button class="btn btn-primary" type="button" @click=${this._savePreferences}>
                        ${faIcon('save')}
                        Save preferences
                    </button>
                </div>
            </div>
        `;
    }

    _renderCheck(key, label) {
        return html`
            <label class="check">
                <input
                    type="checkbox"
                    .checked=${Boolean(this._aiSettings[key])}
                    @change=${(e) => this._setAiSetting(key, e.target.checked)}
                />
                <span>${label}</span>
            </label>
        `;
    }

    render() {
        const isSignedIn = Boolean(this.user);
        const title = this._activeTab === 'account' && !isSignedIn ? 'Sign In' : 'Settings';

        return html`
            <div class="modal" @keydown=${this._stopTextKeyEvent} @keypress=${this._stopTextKeyEvent} @keyup=${this._stopTextKeyEvent}>
                <div class="header">
                    <div class="title">
                        <span class="title-icon">${faIcon(this._activeTab === 'keys' ? 'key' : this._activeTab === 'preferences' ? 'gear' : isSignedIn ? 'user' : 'rightToBracket')}</span>
                        <div>
                            <h2>${title}</h2>
                            <span class="badge">Local mock</span>
                        </div>
                    </div>
                    <button class="close-btn" @click=${this._close} title="Close">${faIcon('xmark')}</button>
                </div>
                ${this._renderTabs()}
                <div class="body">
                    ${this._activeTab === 'account' ? this._renderAccountTab() : ''}
                    ${this._activeTab === 'keys' ? this._renderKeysTab() : ''}
                    ${this._activeTab === 'preferences' ? this._renderPreferencesTab() : ''}
                </div>
            </div>
        `;
    }
}

customElements.define('login-modal', LoginModal);

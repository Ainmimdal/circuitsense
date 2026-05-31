import { LitElement, html, css } from 'lit';
import { faIcon } from '../utils/fa-icons.js';

const AI_SETTINGS_STORAGE_KEY = 'elera_ai_settings';

const DEFAULT_AI_SETTINGS = {
    provider: 'openai',
    apiKey: '',
    baseUrl: '',
    model: 'gpt-4.1-mini',
    reasoning: 'balanced',
    actionMode: 'ask-before-apply',
    includeCircuitJson: true,
    includeValidationErrors: true,
    includeProjectMetadata: false,
    preferArduinoUno: true,
    preferMinimalComponents: false,
    includeCodeByDefault: true,
};

const PROVIDER_MODELS = {
    openai: ['gpt-4.1-mini', 'gpt-4.1', 'o4-mini'],
    openrouter: ['openai/gpt-4.1-mini', 'anthropic/claude-3.7-sonnet', 'google/gemini-2.5-flash'],
    anthropic: ['claude-3.7-sonnet', 'claude-3.5-haiku'],
    gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    custom: ['custom-model'],
};

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
            background: #0284c7;
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
            border-color: #0284c7;
            box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.18);
        }

        .helper {
            color: #71717a;
            font-size: 11px;
            font-weight: 500;
            line-height: 1.45;
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
            background: #0284c7;
            color: #fff;
            border-color: #0284c7;
        }

        .btn-primary:hover {
            background: #0369a1;
            border-color: #0369a1;
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
            background: #0284c7;
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
            accent-color: #0284c7;
        }

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
        this._testStatus = 'idle';
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('open') && this.open) {
            this._activeTab = this.initialTab || 'account';
            this._syncFieldsFromUser();
            this._aiSettings = this._loadAiSettings();
            this._testStatus = 'idle';
        }

        if (changedProperties.has('initialTab') && this.open && this.initialTab) {
            this._activeTab = this.initialTab;
        }
    }

    _loadAiSettings() {
        try {
            return { ...DEFAULT_AI_SETTINGS, ...JSON.parse(localStorage.getItem(AI_SETTINGS_STORAGE_KEY)) };
        } catch {
            return { ...DEFAULT_AI_SETTINGS };
        }
    }

    _saveAiSettings() {
        localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(this._aiSettings));
        this._testStatus = this._aiSettings.apiKey.trim() ? 'ready' : 'missing';
        this.dispatchEvent(new CustomEvent('ai-settings-updated', {
            detail: { settings: this._aiSettings },
            bubbles: true,
            composed: true,
        }));
    }

    _syncFieldsFromUser() {
        this._name = this.user?.name || '';
        this._email = this.user?.email || '';
    }

    _close() {
        this.open = false;
        this.dispatchEvent(new CustomEvent('close'));
    }

    _stopTextKeyEvent(e) {
        e.stopPropagation();
    }

    _setTab(tab) {
        this._activeTab = tab;
    }

    _setAiSetting(key, value) {
        const next = { ...this._aiSettings, [key]: value };
        if (key === 'provider') {
            next.model = PROVIDER_MODELS[value]?.[0] || 'custom-model';
            if (value !== 'openrouter' && value !== 'custom') {
                next.baseUrl = '';
            }
        }
        this._aiSettings = next;
        this._testStatus = 'idle';
    }

    async _testConnection() {
        if (!this._aiSettings.apiKey.trim()) {
            this._testStatus = 'missing';
            return;
        }
        this._testStatus = 'testing';
        await new Promise(resolve => setTimeout(resolve, 450));
        this._testStatus = 'ready';
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
        return this._aiSettings.provider === 'openrouter' || this._aiSettings.provider === 'custom';
    }

    _statusLabel() {
        if (this._testStatus === 'testing') return 'Testing';
        if (this._testStatus === 'ready') return 'Connected';
        if (this._testStatus === 'missing') return 'API key missing';
        if (this._testStatus === 'failed') return 'Connection failed';
        return this._aiSettings.apiKey ? 'Saved locally' : 'Not configured';
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
        const models = PROVIDER_MODELS[this._aiSettings.provider] || PROVIDER_MODELS.custom;

        return html`
            <div class="section">
                <div class="grid">
                    <label>
                        Provider
                        <select
                            .value=${this._aiSettings.provider}
                            @change=${(e) => this._setAiSetting('provider', e.target.value)}
                        >
                            <option value="openai">OpenAI</option>
                            <option value="openrouter">OpenRouter</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="gemini">Google Gemini</option>
                            <option value="custom">Custom OpenAI-compatible</option>
                        </select>
                    </label>
                    <label>
                        Default model
                        <select
                            .value=${this._aiSettings.model}
                            @change=${(e) => this._setAiSetting('model', e.target.value)}
                        >
                            ${models.map(model => html`<option value=${model}>${model}</option>`)}
                        </select>
                    </label>
                </div>

                <label>
                    API key
                    <input
                        type="password"
                        autocomplete="off"
                        placeholder="Paste key for the selected provider"
                        .value=${this._aiSettings.apiKey}
                        @input=${(e) => this._setAiSetting('apiKey', e.target.value)}
                    />
                    <span class="helper">Stored in this browser only for the prototype.</span>
                </label>

                ${this._providerNeedsBaseUrl() ? html`
                    <label>
                        Base URL
                        <input
                            type="url"
                            placeholder=${this._aiSettings.provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'http://localhost:11434/v1'}
                            .value=${this._aiSettings.baseUrl}
                            @input=${(e) => this._setAiSetting('baseUrl', e.target.value)}
                        />
                    </label>
                ` : ''}

                <div class="status-row">
                    <span class="status ${this._testStatus}">
                        ${faIcon(this._testStatus === 'ready' ? 'circleCheck' : this._testStatus === 'missing' ? 'circleXmark' : 'shield')}
                        ${this._statusLabel()}
                    </span>
                    <span>BYOK configuration</span>
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

                <div class="check-list">
                    ${this._renderCheck('includeCircuitJson', 'Include current circuit JSON')}
                    ${this._renderCheck('includeValidationErrors', 'Include validation errors')}
                    ${this._renderCheck('includeProjectMetadata', 'Include project name and metadata')}
                    ${this._renderCheck('preferArduinoUno', 'Prefer Arduino Uno')}
                    ${this._renderCheck('preferMinimalComponents', 'Prefer minimal components')}
                    ${this._renderCheck('includeCodeByDefault', 'Include Arduino code by default')}
                </div>

                <div class="actions">
                    <button class="btn btn-primary" type="button" @click=${this._saveAiSettings}>
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

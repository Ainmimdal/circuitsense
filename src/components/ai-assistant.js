/** Provider-neutral Elera circuit agent panel. */
import { LitElement, html, css } from 'lit';
import { EleraAiAgent } from '../ai/agent.js';
import { loadAiSettings, providerDefinition } from '../ai/config.js';
import { physicalCircuitStore } from '../physical/circuit-store.js';
import { faIcon } from '../utils/fa-icons.js';

const DEMO_PROMPT = 'Build me an LED blink circuit with a push button to toggle it on and off';

class AiAssistant extends LitElement {
    static properties = {
        _open: { state: true },
        _messages: { state: true },
        _running: { state: true },
        _draft: { state: true },
        _settings: { state: true },
        _usage: { state: true },
    };

    static styles = css`
    :host {
      display: block;
    }

    /* ── Side Panel ─────────────────────────── */
    .panel {
      position: fixed;
      top: 49px;
      right: 0;
      bottom: 0;
      width: 380px;
      background: #111113;
      border-left: 1px solid #27272a;
      display: flex;
      flex-direction: column;
      min-height: 0;
      box-sizing: border-box;
      z-index: 100;
      animation: slideIn 0.2s ease;
    }

    @keyframes slideIn {
      from { transform: translateX(100%); }
      to   { transform: translateX(0); }
    }

    /* Header */
    .panel-header {
      padding: 14px 16px;
      border-bottom: 1px solid #27272a;
      display: flex;
      align-items: center;
      gap: 10px;
      background: #18181b;
      flex-shrink: 0;
    }

    .panel-header .icon {
      font-size: 16px;
      display: inline-flex;
    }

    .panel-header .title {
      font-size: 13px;
      font-weight: 600;
      color: #e4e4e7;
      flex: 1;
    }

    .panel-header .badge {
      font-size: 10px;
      background: var(--primary);
      padding: 2px 8px;
      border-radius: 10px;
      color: white;
      font-weight: 500;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .close-btn {
      background: none;
      border: none;
      color: #71717a;
      font-size: 16px;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .close-btn:hover {
      background: #27272a;
      color: #fafafa;
    }

    /* Messages */
    .messages {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .messages::-webkit-scrollbar { width: 5px; }
    .messages::-webkit-scrollbar-thumb {
      background: #3f3f46;
      border-radius: 3px;
    }

    /* Empty state */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      gap: 12px;
      padding: 40px 20px;
      text-align: center;
    }

    .empty-state .sparkle {
      font-size: 36px;
      opacity: 0.6;
      display: inline-flex;
    }

    .empty-state p {
      color: #71717a;
      font-size: 13px;
      line-height: 1.6;
      margin: 0;
    }

    .empty-state .hint {
      color: #52525b;
      font-size: 11px;
    }

    /* Message blocks */
    .msg-user {
      align-self: flex-end;
      background: #27272a;
      border: 1px solid #3f3f46;
      color: #e4e4e7;
      padding: 10px 14px;
      border-radius: 12px 12px 4px 12px;
      font-size: 13px;
      line-height: 1.5;
      max-width: 95%;
    }

    .msg-bot {
      color: #d4d4d8;
      font-size: 13px;
      line-height: 1.6;
      padding: 2px 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .msg-error {
      padding: 10px 12px;
      border: 1px solid #7f1d1d;
      border-radius: 4px;
      color: #fecaca;
      background: rgba(127, 29, 29, .18);
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    /* Plan list */
    .plan-block {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 10px 14px;
    }

    .plan-block .plan-title {
      font-size: 11px;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .plan-block .plan-item {
      font-size: 12px;
      color: #a1a1aa;
      padding: 3px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .plan-block .plan-item .dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--primary);
      flex-shrink: 0;
    }

    /* Tool call block */
    .toolcall {
      background: #0c0c0e;
      border: 1px solid #27272a;
      border-radius: 8px;
      overflow: hidden;
      font-family: var(--font-tech, '0xProto', monospace);
    }

    .toolcall-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #18181b;
      border-bottom: 1px solid #27272a;
      cursor: pointer;
      list-style: none;
      user-select: none;
    }

    .toolcall-header::-webkit-details-marker { display: none; }
    .toolcall-header::before {
      content: '';
      width: 0;
      height: 0;
      border-top: 4px solid transparent;
      border-bottom: 4px solid transparent;
      border-left: 5px solid currentColor;
      color: #71717a;
      transform-origin: 2px 4px;
      transition: transform 0.15s ease;
      flex-shrink: 0;
    }
    .toolcall[open] > .toolcall-header::before { transform: rotate(90deg); }
    .toolcall:not([open]) > .toolcall-header { border-bottom: 0; }
    .toolcall-header:focus-visible {
      outline: 2px solid var(--primary-hover);
      outline-offset: -2px;
    }

    .toolcall-header .fn-icon {
      font-size: 11px;
      color: var(--text);
      display: inline-flex;
    }

    .panel-header svg,
    .empty-state svg,
    .toolcall-header svg,
    .code-header svg {
      width: 1em;
      height: 1em;
    }

    .toolcall-header .fn-name {
      font-size: 11px;
      color: var(--text);
      font-weight: 600;
    }

    .toolcall-header .status {
      margin-left: auto;
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 8px;
      font-family: inherit;
    }

    .toolcall-header .status.running {
      background: rgba(234, 179, 8, 0.15);
      color: #eab308;
    }

    .toolcall-header .status.done {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }

    .toolcall-header .status.pending { background: rgba(234, 179, 8, .15); color: #facc15; }
    .toolcall-header .status.error,
    .toolcall-header .status.rejected { background: rgba(239, 68, 68, .15); color: #f87171; }
    .toolcall-header .status.skipped { background: rgba(113, 113, 122, .2); color: #a1a1aa; }

    .toolcall-body {
      padding: 10px 12px;
      font-size: 11px;
      color: #71717a;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .toolcall-body .key {
      color: var(--text);
    }

    .toolcall-body .val {
      color: #a1a1aa;
    }

    .tool-result {
      padding: 8px 12px;
      border-top: 1px solid #27272a;
      color: #a1a1aa;
      font-size: 10px;
      line-height: 1.45;
      white-space: pre-wrap;
      max-height: 110px;
      overflow: auto;
    }

    .approval-actions { display: flex; gap: 7px; padding: 0 12px 10px; }
    .approval-actions button {
      height: 30px;
      padding: 0 10px;
      border: 1px solid var(--panel-border);
      border-radius: 4px;
      color: var(--text);
      background: var(--panel);
      font: 600 10px var(--font-ui, 'Public Sans', sans-serif);
      cursor: pointer;
    }
    .approval-actions .approve { background: var(--primary); border-color: var(--primary); }
    .approval-actions button:hover { background: var(--primary-hover); }

    /* Code block */
    .code-block {
      background: #0c0c0e;
      border: 1px solid #27272a;
      border-radius: 8px;
      overflow: hidden;
    }

    .code-header {
      display: flex;
      align-items: center;
      padding: 6px 12px;
      background: #18181b;
      border-bottom: 1px solid #27272a;
      font-size: 11px;
      color: #71717a;
      gap: 6px;
    }

    .code-content {
      padding: 12px;
      font-family: var(--font-tech, '0xProto', monospace);
      font-size: 11px;
      line-height: 1.6;
      color: #a1a1aa;
      overflow-x: auto;
      white-space: pre;
    }

    /* Thinking indicator */
    .thinking {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
    }

    .thinking .dots {
      display: flex;
      gap: 3px;
    }

    .thinking .dots span {
      width: 6px;
      height: 6px;
      background: var(--primary);
      border-radius: 50%;
      animation: pulse 1.2s infinite;
    }

    .thinking .dots span:nth-child(2) { animation-delay: 0.15s; }
    .thinking .dots span:nth-child(3) { animation-delay: 0.3s; }

    @keyframes pulse {
      0%, 60%, 100% { opacity: 0.3; transform: scale(0.85); }
      30% { opacity: 1; transform: scale(1); }
    }

    .thinking .label {
      font-size: 12px;
      color: #71717a;
      font-style: italic;
    }

    /* Prompt area */
    .prompt-area {
      border-top: 1px solid #27272a;
      padding: 12px;
      background: #18181b;
      flex-shrink: 0;
    }

    .premade-prompt {
      width: 100%;
      padding: 10px 14px;
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 10px;
      color: #d4d4d8;
      font-size: 12px;
      line-height: 1.5;
      cursor: pointer;
      transition: all 0.15s;
      text-align: left;
      font-family: inherit;
    }

    .premade-prompt:hover {
      border-color: var(--primary-hover);
      background: #1e1e24;
    }

    .premade-prompt:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .premade-prompt .prefix {
      color: #71717a;
      font-size: 11px;
      display: block;
      margin-bottom: 4px;
    }

    .input-row {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .input-row input {
      flex: 1;
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 8px;
      padding: 9px 12px;
      color: #fafafa;
      font-size: 12px;
      font-family: inherit;
      outline: none;
    }

    .input-row input:focus {
      border-color: var(--primary-hover);
    }

    .input-row input::placeholder {
      color: #52525b;
    }

    .send-btn {
      padding: 9px 14px;
      border-radius: 8px;
      border: none;
      background: var(--primary);
      color: white;
      font-size: 12px;
      cursor: pointer;
      font-family: inherit;
      font-weight: 500;
      transition: background 0.15s;
    }

    .send-btn:hover { background: var(--primary-hover); }
    .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .send-btn.stop { background: #7f1d1d; border-color: #991b1b; }

    /* Powered by */
    .powered-by {
      text-align: center;
      padding: 8px;
      font-size: 10px;
      color: #3f3f46;
      border-top: 1px solid #1e1e22;
    }

    /* Shared editor design system. */
    .panel {
      top: 56px;
      background: var(--panel);
      border-left-color: var(--panel-border);
      color: var(--text);
      font-family: var(--font-ui, 'Public Sans', sans-serif);
      box-shadow: -14px 0 30px color-mix(in srgb, var(--ink) 72%, transparent);
    }
    .panel-header, .prompt-area { background: var(--panel); border-color: var(--panel-border); }
    .panel-header .title { color: var(--text); }
    .panel-header .badge {
      border: 1px solid var(--panel-border);
      border-radius: 4px;
      color: var(--text-muted);
      background: var(--primary);
      font: 9px/1.4 var(--font-ui, 'Public Sans', sans-serif);
    }
    .close-btn { width: 34px; height: 34px; padding: 0; border: 1px solid var(--panel-border); border-radius: 4px; color: var(--text-muted); }
    .close-btn:hover { background: var(--primary-hover); color: var(--text); }
    .messages::-webkit-scrollbar-thumb { background: var(--panel-border); border-radius: 1px; }
    .empty-state p, .thinking .label { color: var(--text-muted); }
    .empty-state .hint { color: var(--text-muted); }
    .empty-state .sparkle { color: var(--text-muted); }
    .msg-user, .plan-block, .toolcall, .code-block, .premade-prompt, .input-row input {
      border-color: var(--panel-border);
      border-radius: 4px;
      background: var(--panel);
    }
    .msg-bot, .msg-user { color: var(--text); }
    .plan-block .plan-title { color: var(--text-muted); text-transform: none; letter-spacing: 0; font-weight: 600; }
    .plan-block .plan-item { color: var(--text); }
    .plan-block .plan-item .dot, .thinking .dots span { border-radius: 50%; background: var(--primary-hover); }
    .toolcall { font-family: var(--font-ui, 'Public Sans', sans-serif); }
    .toolcall-header, .code-header { background: var(--panel); border-color: var(--panel-border); }
    .toolcall-header .fn-icon, .toolcall-header .fn-name, .toolcall-body .key { color: var(--text); }
    .toolcall-body, .toolcall-body .val, .code-header { color: var(--text-muted); }
    .toolcall-header .status.running, .toolcall-header .status.done { background: var(--primary); color: var(--text); }
    .toolcall-header .status { border-radius: 4px; }
    .premade-prompt:hover, .input-row input:focus { border-color: var(--primary-hover); background: var(--panel); }
    .input-row input { color: var(--text); }
    .input-row input::placeholder { color: var(--text-muted); }
    .send-btn { height: 34px; padding: 0 14px; border: 1px solid var(--primary); border-radius: 4px; background: var(--primary); color: var(--text); }
    .send-btn:hover { background: var(--primary-hover); }
    .powered-by { border-color: var(--panel-border); color: var(--text-muted); font-family: var(--font-ui, 'Public Sans', sans-serif); }

    @media (max-width: 900px) {
      .panel {
        top: auto;
        left: 0;
        right: 0;
        bottom: 0;
        width: auto;
        height: min(70vh, 620px);
        border-left: 0;
        border-top: 1px solid var(--panel-border);
        box-shadow: 0 -18px 38px color-mix(in srgb, var(--ink) 76%, transparent);
        animation-name: slideUp;
      }
      @keyframes slideUp {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }
      .close-btn, .send-btn { min-width: 34px; min-height: 34px; }
      .input-row input { min-height: 34px; box-sizing: border-box; }
    }
  `;

    constructor() {
        super();
        this._open = false;
        this._messages = [];
        this._running = false;
        this._draft = '';
        this._settings = loadAiSettings();
        this._usage = {
            requests: 0, inputTokens: 0, cachedInputTokens: 0,
            cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, cost: null,
        };
        this._abortController = null;
        this._approvalResolvers = new Map();
        this._settingsUpdatedHandler = () => {
            this._settings = loadAiSettings();
            this._agent.updateSettings(this._settings);
        };
        this._agent = new EleraAiAgent({
            store: physicalCircuitStore,
            settings: this._settings,
            onEvent: event => this._handleAgentEvent(event),
            approve: request => this._requestApproval(request),
        });
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('elera-ai-settings-updated', this._settingsUpdatedHandler);
    }

    disconnectedCallback() {
        this._abortController?.abort();
        for (const resolve of this._approvalResolvers.values()) resolve(false);
        this._approvalResolvers.clear();
        window.removeEventListener('elera-ai-settings-updated', this._settingsUpdatedHandler);
        super.disconnectedCallback();
    }

    toggle() {
        this._open = !this._open;
        this.dispatchEvent(new CustomEvent('panel-toggle', {
            detail: { open: this._open },
            bubbles: true,
            composed: true,
        }));
    }

    _withoutThinking() {
        return this._messages.filter(message => message.type !== 'thinking');
    }

    _scrollBottom() {
        const el = this.shadowRoot?.querySelector('.messages');
        if (el) el.scrollTop = el.scrollHeight;
    }

    _openSettings() {
        window.dispatchEvent(new CustomEvent('elera-open-ai-settings'));
    }

    async _handleAgentEvent(event) {
        if (event.type === 'thinking') {
            this._messages = [...this._withoutThinking(), { type: 'thinking', text: 'Analyzing the circuit and available tools...' }];
        } else if (event.type === 'assistant-text') {
            this._messages = [...this._withoutThinking(), { type: 'bot', text: event.text }];
        } else if (event.type === 'usage') {
            this._usage = {
                requests: this._usage.requests + 1,
                inputTokens: this._usage.inputTokens + (event.usage.inputTokens || 0),
                cachedInputTokens: this._usage.cachedInputTokens + (event.usage.cachedInputTokens || 0),
                cacheWriteTokens: this._usage.cacheWriteTokens + (event.usage.cacheWriteTokens || 0),
                outputTokens: this._usage.outputTokens + (event.usage.outputTokens || 0),
                reasoningTokens: this._usage.reasoningTokens + (event.usage.reasoningTokens || 0),
                totalTokens: this._usage.totalTokens + (event.usage.totalTokens || 0),
                cost: event.usage.cost == null
                    ? this._usage.cost
                    : (this._usage.cost || 0) + event.usage.cost,
            };
        } else if (event.type === 'tool-call') {
            const messages = this._withoutThinking();
            const index = messages.findIndex(message => message.type === 'toolcall' && message.callId === event.callId);
            const next = {
                type: 'toolcall', callId: event.callId, label: event.name,
                args: event.args || {}, status: event.status, mutating: event.mutating,
            };
            if (index >= 0) messages[index] = { ...messages[index], ...next };
            else messages.push(next);
            this._messages = [...messages];
        } else if (event.type === 'tool-result') {
            const messages = this._withoutThinking();
            const index = messages.findIndex(message => message.type === 'toolcall' && message.callId === event.callId);
            if (index >= 0) messages[index] = { ...messages[index], status: event.status, result: event.result };
            else messages.push({ type: 'toolcall', callId: event.callId, label: event.name, args: event.args || {}, status: event.status, result: event.result });
            this._messages = [...messages];
        } else if (event.type === 'idle') {
            this._messages = this._withoutThinking();
        }
        await this.updateComplete;
        this._scrollBottom();
    }

    _requestApproval(request) {
        return new Promise(resolve => {
            this._approvalResolvers.set(request.callId, resolve);
            this.requestUpdate();
        });
    }

    _resolveApproval(callId, approved) {
        const resolve = this._approvalResolvers.get(callId);
        if (!resolve) return;
        this._approvalResolvers.delete(callId);
        resolve(approved);
        this.requestUpdate();
    }

    async _send(event = null) {
        event?.preventDefault?.();
        if (this._running) return;
        const prompt = this._draft.trim();
        if (!prompt) return;
        this._settings = loadAiSettings();
        this._agent.updateSettings(this._settings);
        this._messages = [...this._withoutThinking(), { type: 'user', text: prompt }];
        this._draft = '';
        this._running = true;
        this._abortController = new AbortController();
        await this.updateComplete;
        this._scrollBottom();
        try {
            await this._agent.run(prompt, { signal: this._abortController.signal });
        } catch (error) {
            if (error?.name !== 'AbortError') {
                this._messages = [...this._withoutThinking(), { type: 'error', text: error?.message || String(error) }];
                if (error?.code === 'MISSING_API_KEY') this._openSettings();
            } else {
                this._messages = [...this._withoutThinking(), { type: 'bot', text: 'Request cancelled.' }];
            }
        } finally {
            for (const resolve of this._approvalResolvers.values()) resolve(false);
            this._approvalResolvers.clear();
            this._running = false;
            this._abortController = null;
            await this.updateComplete;
            this._scrollBottom();
        }
    }

    _cancel() {
        for (const resolve of this._approvalResolvers.values()) resolve(false);
        this._approvalResolvers.clear();
        this._abortController?.abort();
    }

    _newConversation() {
        if (this._running) return;
        this._agent.reset();
        this._messages = [];
        this._draft = '';
        this._usage = {
            requests: 0, inputTokens: 0, cachedInputTokens: 0,
            cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, cost: null,
        };
    }

    _formatTokens(value) {
        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
        if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
        return String(value || 0);
    }

    _renderToolCallBody(args) {
        return JSON.stringify(args, null, 2);
    }

    _statusLabel(status) {
        return ({ pending: 'Approval needed', running: 'Running', done: 'Done', error: 'Failed', rejected: 'Rejected', skipped: 'Skipped' })[status] || status;
    }

    render() {
        if (!this._open) return html``;

        const hasMessages = this._messages.filter(m => m.type !== 'thinking').length > 0;

        return html`
      <div class="panel">
        <div class="panel-header">
          <span class="icon">${faIcon('wand')}</span>
          <span class="title">Elera AI</span>
          <span class="badge">${providerDefinition(this._settings.provider).label}</span>
          <div class="header-actions">
            <button class="close-btn" @click=${this._newConversation} ?disabled=${this._running} title="New conversation">${faIcon('rotateLeft')}</button>
            <button class="close-btn" @click=${this._openSettings} title="AI settings">${faIcon('gear')}</button>
            <button class="close-btn" @click=${() => this.toggle()} title="Close">${faIcon('xmark')}</button>
          </div>
        </div>

        <div class="messages">
          ${!hasMessages ? html`
            <div class="empty-state">
              <div class="sparkle">${faIcon('wand')}</div>
              <p>Describe the Arduino circuit you want to build, and Elera AI will design and wire it for you.</p>
              <p class="hint">The model can use Elera’s component, wiring, layout, and validation tools.</p>
            </div>
          ` : ''}

          ${this._messages.map(m => this._renderMsg(m))}
        </div>

        <div class="prompt-area">
          ${!this._running && !hasMessages ? html`
            <button
              class="premade-prompt"
              @click=${() => { this._draft = DEMO_PROMPT; this._send(); }}
              ?disabled=${this._running}
            >
              <span class="prefix">Try this prompt:</span>
              "${DEMO_PROMPT}"
            </button>
          ` : ''}
          <form class="input-row" @submit=${this._send}>
            <input
              type="text"
              placeholder=${this._running ? 'Generating...' : 'Describe a circuit...'}
              ?disabled=${this._running}
              .value=${this._draft}
              @input=${event => { this._draft = event.target.value; }}
            />
            ${this._running
                ? html`<button class="send-btn stop" type="button" @click=${this._cancel}>Stop</button>`
                : html`<button class="send-btn" type="submit" ?disabled=${!this._draft.trim()}>Send</button>`}
          </form>
        </div>

        <div class="powered-by" title="Conversation token usage reported by the provider">
          ${this._settings.model || 'Configure a model'}
          ${this._usage.requests
                ? html` · In ${this._formatTokens(this._usage.inputTokens)} (${this._formatTokens(this._usage.cachedInputTokens)} cached) · Out ${this._formatTokens(this._usage.outputTokens)}`
                : html` · keys stay in this tab`}
        </div>
      </div>
    `;
    }

    _renderMsg(m) {
        switch (m.type) {
            case 'user':
                return html`<div class="msg-user">${m.text}</div>`;
            case 'bot':
                return html`<div class="msg-bot">${m.text}</div>`;
            case 'error':
                return html`<div class="msg-error">${m.text}</div>`;
            case 'thinking':
                return html`
          <div class="thinking">
            <div class="dots"><span></span><span></span><span></span></div>
            <span class="label">${m.text || 'Thinking...'}</span>
          </div>`;
            case 'toolcall':
                return html`
          <details class="toolcall" ?open=${m.status === 'pending' || m.status === 'running'}>
            <summary class="toolcall-header" title="Show or hide function call details">
              <span class="fn-icon">${faIcon('bolt')}</span>
              <span class="fn-name">${m.label}()</span>
              <span class="status ${m.status}">${this._statusLabel(m.status)}</span>
            </summary>
            <div class="toolcall-body">${this._renderToolCallBody(m.args)}</div>
            ${m.status === 'pending' ? html`
              <div class="approval-actions">
                <button class="approve" @click=${() => this._resolveApproval(m.callId, true)}>Apply change</button>
                <button @click=${() => this._resolveApproval(m.callId, false)}>Reject</button>
              </div>
            ` : ''}
            ${m.result ? html`<div class="tool-result">${JSON.stringify(m.result, null, 2)}</div>` : ''}
          </details>`;
            default:
                return '';
        }
    }
}

customElements.define('ai-assistant', AiAssistant);

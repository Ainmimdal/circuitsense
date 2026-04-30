/**
 * AI Assistant Side Panel — VS Code Copilot-style interface.
 * Demonstrates AI-assisted circuit generation with fake model responses
 * and real tool calls that place components and wire them.
 */
import { LitElement, html, css } from 'lit';
import { store } from '../store.js';
import { autoWire } from '../services/auto-wire-engine.js';

// ── Hardcoded demo scenario ──────────────────────────────
const DEMO_PROMPT = 'Build me an LED blink circuit with a push button to toggle it on and off';

const DEMO_STEPS = [
    {
        type: 'thinking',
        text: 'Analyzing request...',
        delay: 600,
    },
    {
        type: 'response',
        text: `I'll build a circuit with an Arduino Uno, an LED with a 220Ω current-limiting resistor, and a push button for toggling.

Here's my plan:`,
        delay: 400,
    },
    {
        type: 'plan',
        items: [
            '1 × Arduino Uno (main board)',
            '1 × LED (red, output indicator)',
            '1 × Resistor 220Ω (current limiter for LED)',
            '1 × Push Button (toggle input)',
        ],
        delay: 300,
    },
    {
        type: 'toolcall',
        label: 'elera.placeComponents',
        args: {
            components: [
                { id: 'arduino-uno', x: 100, y: 100 },
                { id: 'led', x: 520, y: 60 },
                { id: 'resistor', x: 520, y: 180 },
                { id: 'pushbutton', x: 520, y: 320 },
            ],
        },
        delay: 800,
    },
    {
        type: 'toolcall',
        label: 'elera.autoWire',
        args: { targets: ['led', 'resistor', 'pushbutton'] },
        delay: 600,
    },
    {
        type: 'toolcall',
        label: 'elera.connectSeries',
        args: {
            description: 'Wire resistor in series with LED (pin 7 → R1 → LED → GND)',
            wires: [
                { from: 'arduino:7', to: 'resistor:1' },
                { from: 'resistor:2', to: 'led:A' },
                { from: 'led:C', to: 'arduino:GND.1' },
            ],
        },
        delay: 500,
    },
    {
        type: 'response',
        text: `Circuit is ready. The LED is wired through the 220Ω resistor to digital pin 7, and the push button is on pin 2. Check the validation bar for any remaining issues.`,
        delay: 300,
    },
    {
        type: 'code',
        language: 'arduino',
        content: `// LED Toggle with Push Button
const int LED_PIN = 7;
const int BTN_PIN = 2;
bool ledState = false;
bool lastBtn = HIGH;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  pinMode(BTN_PIN, INPUT_PULLUP);
}

void loop() {
  bool btn = digitalRead(BTN_PIN);
  if (btn == LOW && lastBtn == HIGH) {
    ledState = !ledState;
    digitalWrite(LED_PIN, ledState ? HIGH : LOW);
    delay(50); // debounce
  }
  lastBtn = btn;
}`,
        delay: 200,
    },
];

class AiAssistant extends LitElement {
    static properties = {
        _open: { state: true },
        _messages: { state: true },
        _running: { state: true },
        _currentStep: { state: true },
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
    }

    .panel-header .title {
      font-size: 13px;
      font-weight: 600;
      color: #e4e4e7;
      flex: 1;
    }

    .panel-header .badge {
      font-size: 10px;
      background: #6366f1;
      padding: 2px 8px;
      border-radius: 10px;
      color: white;
      font-weight: 500;
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
      overflow-y: auto;
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
      background: #6366f1;
      flex-shrink: 0;
    }

    /* Tool call block */
    .toolcall {
      background: #0c0c0e;
      border: 1px solid #27272a;
      border-radius: 8px;
      overflow: hidden;
      font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
    }

    .toolcall-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #18181b;
      border-bottom: 1px solid #27272a;
    }

    .toolcall-header .fn-icon {
      font-size: 11px;
      color: #6366f1;
    }

    .toolcall-header .fn-name {
      font-size: 11px;
      color: #a78bfa;
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

    .toolcall-body {
      padding: 10px 12px;
      font-size: 11px;
      color: #71717a;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .toolcall-body .key {
      color: #6366f1;
    }

    .toolcall-body .val {
      color: #a1a1aa;
    }

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
      font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
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
      background: #6366f1;
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
      border-color: #6366f1;
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
      border-color: #6366f1;
    }

    .input-row input::placeholder {
      color: #52525b;
    }

    .send-btn {
      padding: 9px 14px;
      border-radius: 8px;
      border: none;
      background: #6366f1;
      color: white;
      font-size: 12px;
      cursor: pointer;
      font-family: inherit;
      font-weight: 500;
      transition: background 0.15s;
    }

    .send-btn:hover { background: #4f46e5; }
    .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Powered by */
    .powered-by {
      text-align: center;
      padding: 8px;
      font-size: 10px;
      color: #3f3f46;
      border-top: 1px solid #1e1e22;
    }
  `;

    constructor() {
        super();
        this._open = false;
        this._messages = [];
        this._running = false;
        this._currentStep = -1;
        // Track placed instance IDs for wiring
        this._placedInstances = {};
    }

    toggle() {
        this._open = !this._open;
        this.dispatchEvent(new CustomEvent('panel-toggle', {
            detail: { open: this._open },
            bubbles: true,
            composed: true,
        }));
    }

    async _runDemo() {
        if (this._running) return;
        this._running = true;

        // Add user message
        this._messages = [...this._messages, { type: 'user', text: DEMO_PROMPT }];
        this.requestUpdate();
        await this.updateComplete;
        this._scrollBottom();

        // Process each step
        for (let i = 0; i < DEMO_STEPS.length; i++) {
            this._currentStep = i;
            const step = DEMO_STEPS[i];

            // Show thinking for a beat
            this._messages = [...this._messages, { type: 'thinking', text: step.type === 'thinking' ? step.text : '' }];
            this.requestUpdate();
            await this.updateComplete;
            this._scrollBottom();

            await this._delay(step.delay);

            // Remove thinking indicator
            this._messages = this._messages.filter(m => m.type !== 'thinking');

            if (step.type === 'thinking') {
                // Already handled, skip
            } else if (step.type === 'response') {
                this._messages = [...this._messages, { type: 'bot', text: step.text }];
            } else if (step.type === 'plan') {
                this._messages = [...this._messages, { type: 'plan', items: step.items }];
            } else if (step.type === 'toolcall') {
                // Show tool call as "running"
                const tcMsg = { type: 'toolcall', label: step.label, args: step.args, status: 'running' };
                this._messages = [...this._messages, tcMsg];
                this.requestUpdate();
                await this.updateComplete;
                this._scrollBottom();

                // Execute the actual tool call
                await this._executeToolCall(step);
                await this._delay(400);

                // Mark as done
                tcMsg.status = 'done';
                this._messages = [...this._messages];
            } else if (step.type === 'code') {
                this._messages = [...this._messages, { type: 'code', language: step.language, content: step.content }];
            }

            this.requestUpdate();
            await this.updateComplete;
            this._scrollBottom();
        }

        this._running = false;
        this._currentStep = -1;
        this.requestUpdate();
    }

    async _executeToolCall(step) {
        if (step.label === 'elera.placeComponents') {
            // Clear canvas first
            store.clearProject();
            await this._delay(100);

            for (const comp of step.args.components) {
                const inst = store.addInstance(comp.id, comp.x, comp.y);
                this._placedInstances[comp.id] = inst.id;
            }
        } else if (step.label === 'elera.autoWire') {
            // Auto-wire the push button (it works standalone)
            await this._delay(200);
            for (const target of step.args.targets) {
                const instId = this._placedInstances[target];
                if (instId && target === 'pushbutton') {
                    autoWire(instId);
                }
            }
            store.commitAutoWire();
        } else if (step.label === 'elera.connectSeries') {
            // Manual series wiring for LED + resistor
            await this._delay(200);
            const arduinoId = this._placedInstances['arduino-uno'];
            const resistorId = this._placedInstances['resistor'];
            const ledId = this._placedInstances['led'];

            if (arduinoId && resistorId && ledId) {
                // Arduino pin 7 → Resistor pin 1
                store.completeWiringDirect(arduinoId, '7', resistorId, '1');
                await this._delay(150);
                // Resistor pin 2 → LED Anode
                store.completeWiringDirect(resistorId, '2', ledId, 'A');
                await this._delay(150);
                // LED Cathode → Arduino GND
                store.completeWiringDirect(ledId, 'C', arduinoId, 'GND.1');
                store.commitAutoWire();
            }
        }
    }

    _delay(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    _scrollBottom() {
        const el = this.shadowRoot?.querySelector('.messages');
        if (el) el.scrollTop = el.scrollHeight;
    }

    _renderToolCallBody(args) {
        if (args.components) {
            return args.components.map(c =>
                html`<span class="key">+</span> <span class="val">${c.id}</span> at (${c.x}, ${c.y})\n`
            );
        }
        if (args.targets) {
            return html`<span class="key">targets:</span> <span class="val">[${args.targets.join(', ')}]</span>`;
        }
        if (args.wires) {
            return html`<span class="val">${args.description}</span>\n${args.wires.map(w =>
                html`<span class="key">wire</span> ${w.from} → ${w.to}\n`
            )}`;
        }
        return JSON.stringify(args, null, 2);
    }

    render() {
        if (!this._open) return html``;

        const hasMessages = this._messages.filter(m => m.type !== 'thinking').length > 0;

        return html`
      <div class="panel">
        <div class="panel-header">
          <span class="icon">✨</span>
          <span class="title">Elera AI</span>
          <span class="badge">PREVIEW</span>
          <button class="close-btn" @click=${() => this.toggle()} title="Close">✕</button>
        </div>

        <div class="messages">
          ${!hasMessages ? html`
            <div class="empty-state">
              <div class="sparkle">✨</div>
              <p>Describe the Arduino circuit you want to build, and Elera AI will design and wire it for you.</p>
              <p class="hint">Powered by Google Gemini (coming soon)</p>
            </div>
          ` : ''}

          ${this._messages.map(m => this._renderMsg(m))}
        </div>

        <div class="prompt-area">
          ${!this._running && !hasMessages ? html`
            <button
              class="premade-prompt"
              @click=${() => this._runDemo()}
              ?disabled=${this._running}
            >
              <span class="prefix">Try this prompt:</span>
              "${DEMO_PROMPT}"
            </button>
          ` : ''}
          <div class="input-row">
            <input
              type="text"
              placeholder=${this._running ? 'Generating...' : 'Describe a circuit...'}
              ?disabled=${this._running}
            />
            <button class="send-btn" ?disabled=${this._running}>Send</button>
          </div>
        </div>

        <div class="powered-by">Elera AI · Gemini integration coming in FYP2</div>
      </div>
    `;
    }

    _renderMsg(m) {
        switch (m.type) {
            case 'user':
                return html`<div class="msg-user">${m.text}</div>`;
            case 'bot':
                return html`<div class="msg-bot">${m.text}</div>`;
            case 'thinking':
                return html`
          <div class="thinking">
            <div class="dots"><span></span><span></span><span></span></div>
            <span class="label">${m.text || 'Thinking...'}</span>
          </div>`;
            case 'plan':
                return html`
          <div class="plan-block">
            <div class="plan-title">Components needed</div>
            ${m.items.map(item => html`
              <div class="plan-item"><span class="dot"></span>${item}</div>
            `)}
          </div>`;
            case 'toolcall':
                return html`
          <div class="toolcall">
            <div class="toolcall-header">
              <span class="fn-icon">⚡</span>
              <span class="fn-name">${m.label}()</span>
              <span class="status ${m.status}">${m.status === 'running' ? '● Running' : '✓ Done'}</span>
            </div>
            <div class="toolcall-body">${this._renderToolCallBody(m.args)}</div>
          </div>`;
            case 'code':
                return html`
          <div class="code-block">
            <div class="code-header">
              <span>📄</span> ${m.language || 'code'}
            </div>
            <div class="code-content">${m.content}</div>
          </div>`;
            default:
                return '';
        }
    }
}

customElements.define('ai-assistant', AiAssistant);

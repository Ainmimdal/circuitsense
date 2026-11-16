import { LitElement, html, css } from 'lit';

import { physicalCircuitStore } from '../physical/circuit-store.js';
import { advance, AvrRunner, CPU_HZ } from '../simulation/avr-runner.js';
import { createCircuitSimulation } from '../simulation/circuit-io.js';
import { compileServerUrl, compileSketch, DEFAULT_SKETCH } from '../simulation/compile.js';
import { faIcon } from '../utils/fa-icons.js';
import { confirmDialog } from './app-dialogs.js';

// The code dock under the canvas: an editor for the Arduino sketch, Run and
// Stop, mistakes explained in plain language, the Serial Monitor and controls
// for the buttons and knobs in the circuit. Running code drives the parts on
// the canvas through the `elera-simulation-state` window event.

const SERIAL_LIMIT = 4000;
// Real-time work allowed per frame, so a slow laptop runs the program slower instead of freezing.
const FRAME_BUDGET_MS = 12;

class CodePanel extends LitElement {
    static properties = {
        lesson: { attribute: false },
        _status: { state: true },
        _problems: { state: true },
        _notice: { state: true },
        _serial: { state: true },
        _inputs: { state: true },
        _values: { state: true },
    };

    static styles = css`
        :host {
            display: flex; flex-direction: column; min-height: 0;
            color: var(--text); background: var(--panel); border-top: 1px solid var(--panel-border);
            font-family: var(--font-ui, 'Public Sans', sans-serif);
        }
        header { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-bottom: 1px solid var(--panel-border); }
        header strong { font-size: 12.5px; }
        header .name { color: var(--text-muted); font: 11px var(--font-tech, monospace); }
        header .state { margin-left: 6px; display: inline-flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 11.5px; }
        header .state i { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-sensors); }
        .spacer { flex: 1; }
        button {
            height: 30px; padding: 0 11px; display: inline-flex; align-items: center; gap: 6px;
            border: 1px solid var(--panel-border); border-radius: 4px; color: var(--text); background: transparent;
            font: 600 11.5px var(--font-ui, 'Public Sans', sans-serif); cursor: pointer;
        }
        button:hover:not([disabled]) { background: var(--primary); }
        button[disabled] { opacity: .5; cursor: default; }
        button.run { color: var(--ink); background: var(--accent); border-color: var(--accent); }
        button.run:hover:not([disabled]) { background: color-mix(in srgb, var(--accent) 85%, var(--text)); }
        button.icon { width: 30px; padding: 0; justify-content: center; }
        button .fa-icon { width: 12px; height: 12px; }
        .stop-mark { width: 9px; height: 9px; border-radius: 1px; background: currentColor; }

        .body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 290px; }
        .editor { min-width: 0; min-height: 0; overflow: hidden; background: var(--ink); }
        .editor .cm-editor { height: 100%; }
        .side { min-height: 0; overflow: auto; border-left: 1px solid var(--panel-border); padding: 10px 12px; display: flex; flex-direction: column; gap: 12px; }
        h3 { margin: 0 0 6px; color: var(--text-muted); font: 600 10px var(--font-ui, sans-serif); letter-spacing: .08em; text-transform: uppercase; }
        .hint { margin: 0; color: var(--text-muted); font-size: 12px; line-height: 1.5; }
        .notice { margin: 0; padding: 9px 10px; border: 1px solid var(--accent); border-radius: 4px; font-size: 12px; line-height: 1.5; }

        .problems { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
        .problems li { padding: 9px 10px; border: 1px solid var(--accent-ics); border-radius: 4px; font-size: 12px; line-height: 1.5; }
        .problems button { height: 22px; padding: 0 7px; margin-bottom: 5px; color: var(--accent-ics); border-color: var(--accent-ics); }
        .problems small { display: block; margin-top: 5px; color: var(--text-muted); font: 10px/1.4 var(--font-tech, monospace); overflow-wrap: anywhere; }

        .inputs { display: grid; gap: 8px; }
        .inputs label { display: grid; gap: 4px; font-size: 12px; }
        .inputs input[type="range"] { width: 100%; accent-color: var(--accent); }
        .inputs .hold { justify-content: center; user-select: none; touch-action: none; }
        .inputs .hold.down { color: var(--ink); background: var(--accent); border-color: var(--accent); }

        .serial { flex: 1; min-height: 70px; display: flex; flex-direction: column; }
        .serial pre {
            flex: 1; min-height: 54px; margin: 0; padding: 8px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere;
            background: var(--ink); border: 1px solid var(--panel-border); border-radius: 4px;
            font: 11px/1.5 var(--font-tech, monospace);
        }
        .serial pre:empty::before { content: 'Text from Serial.println appears here.'; color: var(--text-muted); font-family: var(--font-ui, sans-serif); }

        @media (max-width: 900px) {
            .body { grid-template-columns: 1fr; grid-template-rows: minmax(120px, 1fr) auto; overflow: auto; }
            .side { border-left: 0; border-top: 1px solid var(--panel-border); max-height: 40vh; }
            header .name { display: none; }
        }
    `;

    constructor() {
        super();
        this.lesson = null;
        this.store = physicalCircuitStore;
        this._status = 'idle';
        this._problems = [];
        this._notice = '';
        this._serial = '';
        this._inputs = [];
        this._values = {};
        this._storeHandler = event => {
            if (event.detail?.routesOnly) return;
            this._syncFromProject();
            if (this._status === 'running') this._rewire();
        };
        this._inputHandler = event => {
            const { componentId, value, toggle } = event.detail || {};
            this._setValue(componentId, toggle ? (this._values[componentId] ? 0 : 1) : value);
        };
    }

    connectedCallback() {
        super.connectedCallback();
        this.store.addEventListener('change', this._storeHandler);
        // A free compile server sleeps when idle; start waking it before Run is pressed.
        if (compileServerUrl()) fetch(`${compileServerUrl()}/health`).catch(() => {});
        window.addEventListener('elera-simulation-input', this._inputHandler);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stop();
        this.store.removeEventListener('change', this._storeHandler);
        window.removeEventListener('elera-simulation-input', this._inputHandler);
        this._view?.destroy();
        this._audio?.close();
    }

    get _starter() {
        return this.lesson?.code || DEFAULT_SKETCH;
    }

    // The project carries the sketch; a lesson supplies starter code until the student changes it.
    _projectSketch() {
        return this.store.project.properties?.sketch ?? this._starter;
    }

    get _code() {
        return this._view ? this._view.state.doc.toString() : this._projectSketch();
    }

    async firstUpdated() {
        // The editor is a large library, so it only loads when the code dock is opened.
        const [{ EditorView, basicSetup }, { cpp }, { HighlightStyle, syntaxHighlighting }, { tags }] = await Promise.all([
            import('codemirror'), import('@codemirror/lang-cpp'), import('@codemirror/language'), import('@lezer/highlight'),
        ]);
        if (!this.isConnected) return;
        const colours = HighlightStyle.define([
            { tag: [tags.comment], color: 'var(--text-muted)', fontStyle: 'italic' },
            { tag: [tags.keyword, tags.typeName, tags.processingInstruction], color: '#c792ea' },
            { tag: [tags.string], color: '#c3e88d' },
            { tag: [tags.number, tags.bool], color: '#f78c6c' },
            { tag: [tags.function(tags.variableName)], color: '#82aaff' },
        ]);
        const theme = EditorView.theme({
            '&': { color: 'var(--text)', backgroundColor: 'var(--ink)', fontSize: '12.5px' },
            '.cm-content': { fontFamily: "var(--font-tech, '0xProto', monospace)", caretColor: 'var(--accent)' },
            '.cm-cursor': { borderLeftColor: 'var(--accent)' },
            '.cm-gutters': { color: 'var(--text-muted)', backgroundColor: 'var(--ink)', border: 'none' },
            '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--primary) 55%, transparent)' },
            '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--primary-hover) !important' },
            '&.cm-focused': { outline: 'none' },
        }, { dark: true });
        this._view = new EditorView({
            doc: this._projectSketch(),
            root: this.shadowRoot,
            parent: this.shadowRoot.querySelector('.editor'),
            extensions: [basicSetup, cpp(), theme, syntaxHighlighting(colours), EditorView.updateListener.of(update => {
                if (update.docChanged) this._saveSketch();
            })],
        });
    }

    updated(changed) {
        if (changed.has('lesson')) this._syncFromProject();
    }

    // Runs on every edit, so the editor and the project never disagree.
    _saveSketch() {
        if (!this._view) return;
        const code = this._code;
        // Untouched starter code is not stored, so the next lesson shows its own starter.
        if (code !== this._projectSketch()) this.store.setSketch(code);
    }

    // Opening another project, starting a lesson or clearing the canvas swaps the code too.
    _syncFromProject() {
        if (!this._view) return;
        const next = this._projectSketch();
        if (next === this._code) return;
        this._view.dispatch({ changes: { from: 0, to: this._view.state.doc.length, insert: next } });
        this._problems = [];
    }

    async _run() {
        this._stop();
        this._problems = [];
        this._notice = '';
        const circuit = createCircuitSimulation(this.store.project);
        if (circuit.error) {
            this._notice = circuit.error;
            return;
        }
        // Browsers only allow sound that starts from a click.
        try { this._audio ||= new AudioContext(); } catch { /* No sound on this browser; everything else still works. */ }
        this._status = 'building';
        const result = await compileSketch(this._code);
        if (this._status !== 'building') return;
        if (!result.hex) {
            this._status = 'idle';
            this._problems = result.problems || [];
            this._notice = result.unavailable || '';
            return;
        }
        this._serialBuffer = '';
        this._serial = '';
        this._runner = new AvrRunner(result.hex, { onSerial: text => { if (text !== '\r') this._serialBuffer += text; } });
        this._circuit = circuit;
        this._inputs = circuit.inputs;
        this._values = Object.fromEntries(circuit.inputs.map(input => [input.id, this._values[input.id] ?? input.value]));
        this._status = 'running';
        let last = performance.now();
        const frame = now => {
            // After a pause (hidden tab, slow frame) the program resumes instead of racing to catch up.
            const elapsed = Math.min(now - last, 50);
            last = now;
            const state = advance(this._runner, this._circuit, this._values, elapsed / 1000 * CPU_HZ, FRAME_BUDGET_MS);
            window.dispatchEvent(new CustomEvent('elera-simulation-state', { detail: state.components }));
            this._playTone(state.sound);
            if (this._serialBuffer !== this._serial) {
                this._serialBuffer = this._serialBuffer.slice(-SERIAL_LIMIT);
                this._serial = this._serialBuffer;
            }
            this._frame = requestAnimationFrame(frame);
        };
        this._frame = requestAnimationFrame(frame);
    }

    _stop() {
        cancelAnimationFrame(this._frame);
        this._playTone(null);
        const wasRunning = this._status === 'running';
        this._status = 'idle';
        this._runner = null;
        if (wasRunning) window.dispatchEvent(new CustomEvent('elera-simulation-state', { detail: null }));
    }

    // The circuit can be rewired while the program runs, like a real breadboard.
    _rewire() {
        const circuit = createCircuitSimulation(this.store.project);
        if (circuit.error) {
            this._stop();
            this._notice = circuit.error;
            return;
        }
        this._circuit = circuit;
        this._inputs = circuit.inputs;
        this._values = Object.fromEntries(circuit.inputs.map(input => [input.id, this._values[input.id] ?? input.value]));
    }

    _playTone(sound) {
        if (!this._audio) return;
        if (!this._tone) {
            if (!sound) return;
            this._tone = { oscillator: this._audio.createOscillator(), gain: this._audio.createGain() };
            this._tone.oscillator.type = 'square';
            this._tone.gain.gain.value = 0;
            this._tone.oscillator.connect(this._tone.gain).connect(this._audio.destination);
            this._tone.oscillator.start();
        }
        if (sound) this._tone.oscillator.frequency.value = sound.frequency;
        this._tone.gain.gain.value = sound ? .04 : 0;
    }

    _setValue(id, value) {
        if (id == null || !(id in this._values)) return;
        this._values = { ...this._values, [id]: Number(value) };
    }

    async _restoreStarter() {
        if (this._code !== this._starter && !(await confirmDialog({
            title: 'Go back to the starter code?',
            message: 'Your changes to the code will be replaced.',
            confirmLabel: 'Replace my code',
        }))) return;
        this._stop();
        this.store.setSketch(null);
        this._syncFromProject();
    }

    _goToLine(lineNumber) {
        if (!this._view || !lineNumber) return;
        const line = this._view.state.doc.line(Math.min(lineNumber, this._view.state.doc.lines));
        this._view.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: true });
        this._view.focus();
    }

    _renderInput(input) {
        const value = this._values[input.id] ?? input.value;
        if (input.kind === 'button') {
            const press = down => () => this._setValue(input.id, down ? 1 : 0);
            return html`<button class="hold ${value ? 'down' : ''}" @pointerdown=${press(true)} @pointerup=${press(false)}
                @pointerleave=${press(false)} @pointercancel=${press(false)}
                @keydown=${event => { if (event.key === ' ' || event.key === 'Enter') this._setValue(input.id, 1); }}
                @keyup=${() => this._setValue(input.id, 0)}>Hold to press ${input.label}</button>`;
        }
        if (input.kind === 'switch') {
            return html`<button class="hold ${value ? 'down' : ''}" aria-pressed=${Boolean(value)}
                @click=${() => this._setValue(input.id, value ? 0 : 1)}>Flip ${input.label} (now ${value ? 'right' : 'left'})</button>`;
        }
        return html`<label>${input.label}: ${Math.round(value * 100)}%
            <input type="range" min="0" max="1" step="0.01" .value=${String(value)}
                @input=${event => this._setValue(input.id, event.currentTarget.value)} /></label>`;
    }

    render() {
        const running = this._status === 'running';
        const building = this._status === 'building';
        return html`
            <header>
                <strong>Code</strong>
                <span class="name">${this.lesson ? `${this.lesson.id}.ino` : 'sketch.ino'}</span>
                ${running ? html`<span class="state" role="status"><i></i>Running on the Arduino</span>` : ''}
                ${building ? html`<span class="state" role="status">Building your code…</span>` : ''}
                <span class="spacer"></span>
                <button @click=${this._restoreStarter} title="Replace the code with the starter code">${faIcon('rotateLeft')} Starter code</button>
                ${running
                    ? html`<button @click=${this._stop}><span class="stop-mark"></span> Stop</button>`
                    : html`<button class="run" ?disabled=${building} @click=${this._run}>${faIcon('play')} Run</button>`}
                <button class="icon" @click=${() => this.dispatchEvent(new CustomEvent('close'))} title="Close the code panel" aria-label="Close the code panel">${faIcon('xmark')}</button>
            </header>
            <div class="body">
                <div class="editor"></div>
                <div class="side">
                    ${this._notice ? html`<p class="notice" role="alert">${this._notice}</p>` : ''}
                    ${this._problems.length ? html`
                        <section>
                            <h3>${this._problems.length === 1 ? 'One thing to fix' : `${this._problems.length} things to fix`}</h3>
                            <ul class="problems" role="alert">
                                ${this._problems.map(problem => html`<li>
                                    ${problem.line ? html`<button @click=${() => this._goToLine(problem.line)}>Line ${problem.line}</button><br />` : ''}
                                    ${problem.message}
                                    <small>Compiler said: ${problem.detail}</small>
                                </li>`)}
                            </ul>
                        </section>` : ''}
                    ${running && this._inputs.length ? html`
                        <section>
                            <h3>Try your circuit</h3>
                            <div class="inputs">${this._inputs.map(input => this._renderInput(input))}</div>
                        </section>` : ''}
                    ${!running && !building && !this._problems.length && !this._notice ? html`
                        <p class="hint">Press Run to start the code on the Arduino in your circuit. LEDs light up, servos turn and buzzers sound, just like the real parts.</p>` : ''}
                    <section class="serial">
                        <h3>Serial Monitor</h3>
                        <pre aria-live="off">${this._serial}</pre>
                    </section>
                </div>
            </div>
        `;
    }
}

customElements.define('code-panel', CodePanel);

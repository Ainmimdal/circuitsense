import { LitElement, html, css } from 'lit';
import { listLessons } from '../lessons/catalog.js';
import { faIcon } from '../utils/fa-icons.js';

// Lesson picker: one uniform row per preset lesson, plus "guide me" on the
// circuit that is open now. Emits `start-lesson` with { lessonId } or { current: true }.

class LessonsModal extends LitElement {
    static properties = {
        open: { type: Boolean, reflect: true },
        canGuideCurrent: { type: Boolean },
        completed: { type: Array },
    };

    static styles = css`
        :host {
            position: fixed;
            inset: 0;
            z-index: 1000;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: color-mix(in srgb, var(--ink) 72%, transparent);
            font-family: var(--font-ui);
        }
        :host([open]) { display: flex; }

        .sheet {
            width: min(720px, 100%);
            max-height: 100%;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            color: var(--text);
            background: var(--panel);
            border: 1px solid var(--panel-border);
            border-radius: 4px;
        }
        header {
            display: flex;
            align-items: flex-start;
            gap: 16px;
            padding: 20px 20px 16px;
            border-bottom: 1px solid var(--panel-border);
        }
        h2 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
        header p { margin: 0; color: var(--text-muted); font-size: 12px; line-height: 1.5; }
        .close {
            flex: 0 0 auto;
            width: 32px;
            height: 32px;
            margin-left: auto;
            display: grid;
            place-items: center;
            color: var(--text-muted);
            background: transparent;
            border: 1px solid var(--panel-border);
            border-radius: 4px;
            cursor: pointer;
        }
        .close:hover { color: var(--text); background: var(--primary); }

        .list { margin: 0; padding: 8px; overflow: auto; list-style: none; }
        .row {
            display: grid;
            grid-template-columns: 28px 1fr auto;
            align-items: center;
            gap: 14px;
            width: 100%;
            min-height: 64px;
            padding: 10px 12px;
            color: var(--text);
            text-align: left;
            font: inherit;
            background: transparent;
            border: 1px solid transparent;
            border-radius: 4px;
            cursor: pointer;
        }
        .row:hover, .row:focus-visible { outline: none; background: var(--primary); border-color: var(--panel-border); }
        .number { color: var(--text-muted); font: 12px/1 var(--font-tech); }
        .title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
        .summary { margin-top: 3px; color: var(--text-muted); font-size: 12px; line-height: 1.4; }
        .meta { display: flex; align-items: center; gap: 12px; color: var(--text-muted); font-size: 11px; white-space: nowrap; }
        .built { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-weight: 600; }
        .built .fa-icon { width: 13px; height: 13px; }

        footer {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 20px;
            border-top: 1px solid var(--panel-border);
            color: var(--text-muted);
            font-size: 12px;
        }
        footer button {
            flex: 0 0 auto;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            height: 32px;
            margin-left: auto;
            padding: 0 12px;
            color: var(--text);
            background: transparent;
            border: 1px solid var(--panel-border);
            border-radius: 4px;
            font: 600 11px var(--font-ui);
            cursor: pointer;
        }
        footer button:hover:not([disabled]) { background: var(--primary); }
        footer button[disabled] { opacity: .45; cursor: default; }

        @media (max-width: 640px) {
            :host { padding: 0; }
            .sheet { height: 100%; border-radius: 0; }
            .row { grid-template-columns: 24px 1fr; }
            .meta { grid-column: 2; }
            footer { flex-wrap: wrap; }
            footer button { margin-left: 0; }
        }
    `;

    constructor() {
        super();
        this.open = false;
        this.canGuideCurrent = false;
        this.completed = [];
        this._keyHandler = event => { if (this.open && event.key === 'Escape') this._close(); };
        this.addEventListener('click', () => this._close());
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('keydown', this._keyHandler);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('keydown', this._keyHandler);
    }

    _close() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    _start(detail) {
        this.dispatchEvent(new CustomEvent('start-lesson', { detail }));
    }

    render() {
        if (!this.open) return '';
        return html`
            <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="lessons-title"
                @click=${event => event.stopPropagation()}>
                <header>
                    <div>
                        <h2 id="lessons-title">Lessons</h2>
                        <p>Build a real Arduino circuit one part and one wire at a time. Each step is checked as you go,
                            and you finish with code to upload to your board.</p>
                    </div>
                    <button class="close" @click=${this._close} aria-label="Close lessons">${faIcon('xmark')}</button>
                </header>
                <ol class="list">
                    ${listLessons().map((lesson, index) => html`
                        <li>
                            <button class="row" @click=${() => this._start({ lessonId: lesson.id })}>
                                <span class="number">${String(index + 1).padStart(2, '0')}</span>
                                <span>
                                    <span class="title">${lesson.title}</span>
                                    <span class="summary">${lesson.summary}</span>
                                </span>
                                <span class="meta">
                                    ${this.completed.includes(lesson.id) ? html`<span class="built">${faIcon('check')} Built</span>` : ''}
                                    <span>${lesson.level}</span>
                                    <span>${lesson.minutes} min</span>
                                </span>
                            </button>
                        </li>
                    `)}
                </ol>
                <footer>
                    <span>${this.canGuideCurrent
                        ? 'Or turn the circuit on the canvas into steps and rebuild it.'
                        : 'Build or open a circuit to get step-by-step instructions for it.'}</span>
                    <button ?disabled=${!this.canGuideCurrent} @click=${() => this._start({ current: true })}>
                        ${faIcon('listCheck')} Guide me through this circuit
                    </button>
                </footer>
            </div>
        `;
    }
}

customElements.define('lessons-modal', LessonsModal);

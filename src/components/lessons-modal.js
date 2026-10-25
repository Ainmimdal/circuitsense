import { LitElement, html, css } from 'lit';
import { listLessons } from '../lessons/catalog.js';
import { getComponentDef } from '../component-library.js';
import { faIcon } from '../utils/fa-icons.js';
import './part-preview.js';

// Lesson picker: one card per preset lesson, plus "guide me" on the circuit
// that is open now. Emits `start-lesson` with { lessonId } or { current: true }.

function featuredParts(lesson) {
    const ids = [];
    for (const component of lesson.build().components) {
        const definition = getComponentDef(component.definitionId);
        if (definition?.isBoard || component.definitionId === 'resistor' || ids.includes(component.definitionId)) continue;
        ids.push(component.definitionId);
    }
    return ids.slice(0, 3);
}

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
            background: color-mix(in srgb, var(--ink) 70%, transparent);
            backdrop-filter: blur(6px);
            font-family: var(--font-ui);
        }
        :host([open]) { display: flex; animation: fade .18s ease-out; }
        @keyframes fade { from { opacity: 0; } }
        @keyframes rise { from { opacity: 0; transform: translateY(14px) scale(.98); } }

        .sheet {
            width: min(1080px, 100%);
            max-height: 100%;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            color: var(--text);
            background: var(--panel);
            border: 1px solid var(--panel-border);
            border-radius: 10px;
            box-shadow: 0 30px 80px color-mix(in srgb, var(--ink) 85%, transparent);
            animation: rise .26s cubic-bezier(.2, .9, .3, 1.2);
        }
        header {
            position: relative;
            padding: 28px 30px 22px;
            border-bottom: 1px solid var(--panel-border);
            background:
                radial-gradient(600px 160px at 12% -40%, color-mix(in srgb, var(--accent) 22%, transparent), transparent),
                linear-gradient(180deg, color-mix(in srgb, var(--ink) 40%, transparent), transparent);
        }
        .eyebrow {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            color: var(--accent);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: .12em;
            text-transform: uppercase;
        }
        h2 { margin: 8px 0 6px; font-size: 26px; letter-spacing: -.02em; }
        header p { margin: 0; max-width: 620px; color: var(--text-muted); font-size: 14px; line-height: 1.5; }
        .close {
            position: absolute;
            top: 18px;
            right: 18px;
            width: 34px;
            height: 34px;
            display: grid;
            place-items: center;
            color: var(--text-muted);
            background: transparent;
            border: 1px solid var(--panel-border);
            border-radius: 6px;
            cursor: pointer;
        }
        .close:hover { color: var(--text); background: var(--primary); }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
            gap: 14px;
            padding: 22px 30px 30px;
            overflow: auto;
        }
        .card {
            --card-accent: var(--accent);
            position: relative;
            display: flex;
            flex-direction: column;
            min-height: 262px;
            padding: 0;
            overflow: hidden;
            color: var(--text);
            text-align: left;
            font: inherit;
            background: var(--ink);
            border: 1px solid var(--panel-border);
            border-radius: 9px;
            cursor: pointer;
            animation: rise .36s cubic-bezier(.2, .9, .3, 1.1) both;
            animation-delay: calc(var(--i) * 40ms);
            transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
        }
        .card:hover, .card:focus-visible {
            outline: none;
            transform: translateY(-3px);
            border-color: color-mix(in srgb, var(--card-accent) 70%, var(--panel-border));
            box-shadow: 0 14px 34px color-mix(in srgb, var(--card-accent) 18%, transparent);
        }
        .art {
            position: relative;
            height: 112px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            background:
                radial-gradient(circle at 50% 120%, color-mix(in srgb, var(--card-accent) 38%, transparent), transparent 70%),
                repeating-radial-gradient(circle at 0 0, color-mix(in srgb, var(--text) 7%, transparent) 0 1px, transparent 1px 9px);
            background-size: 100% 100%, 9px 9px;
            border-bottom: 1px solid var(--panel-border);
        }
        .card:hover .part { transform: translateY(-4px) scale(1.06); }
        .part {
            position: relative;
            width: 76px;
            height: 58px;
            transition: transform .25s cubic-bezier(.2, .9, .3, 1.4);
            filter: drop-shadow(0 6px 10px color-mix(in srgb, var(--ink) 80%, transparent));
        }
        .part:nth-child(2) { transition-delay: 30ms; }
        .part:nth-child(3) { transition-delay: 60ms; }
        .number {
            position: absolute;
            top: 10px;
            left: 12px;
            color: color-mix(in srgb, var(--text) 45%, transparent);
            font: 600 11px/1 var(--font-tech);
        }
        .done-badge {
            position: absolute;
            top: 9px;
            right: 10px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 7px;
            color: var(--ink);
            background: var(--card-accent);
            border-radius: 99px;
            font-size: 10px;
            font-weight: 700;
        }
        .body { display: flex; flex: 1; flex-direction: column; gap: 7px; padding: 14px 15px 15px; }
        .meta { display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 11px; }
        .level {
            padding: 2px 7px;
            color: var(--card-accent);
            background: color-mix(in srgb, var(--card-accent) 14%, transparent);
            border-radius: 99px;
            font-weight: 700;
        }
        .meta .fa-icon { width: 12px; height: 12px; }
        h3 { margin: 0; font-size: 16px; letter-spacing: -.01em; }
        .summary { margin: 0; color: var(--text-muted); font-size: 12.5px; line-height: 1.45; }
        .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: auto; padding-top: 6px; }
        .chip {
            padding: 3px 7px;
            color: var(--text-muted);
            border: 1px solid var(--panel-border);
            border-radius: 4px;
            font-size: 10.5px;
        }
        .card.own { --card-accent: var(--accent-sensors); }
        .card.own .art { flex-direction: column; color: var(--card-accent); gap: 8px; font-size: 12px; font-weight: 600; }
        .card.own .art .fa-icon { width: 34px; height: 34px; }
        .card[disabled] { cursor: not-allowed; opacity: .5; transform: none; box-shadow: none; }

        @media (max-width: 640px) {
            :host { padding: 0; }
            .sheet { border-radius: 0; height: 100%; }
            header { padding: 22px 18px 18px; }
            .grid { padding: 16px 18px 24px; grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) {
            :host([open]), .sheet, .card { animation: none; }
            .card, .part { transition: none; }
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
        const lessons = listLessons();
        return html`
            <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="lessons-title"
                @click=${event => event.stopPropagation()}>
                <header>
                    <span class="eyebrow">${faIcon('graduation')} Learn by building</span>
                    <h2 id="lessons-title">Pick a project to build</h2>
                    <p>Each lesson walks you through a real Arduino circuit one part and one wire at a time,
                        checks your work as you go, and ends with code you can upload to your board.</p>
                    <button class="close" @click=${this._close} aria-label="Close lessons">${faIcon('xmark')}</button>
                </header>
                <div class="grid">
                    ${lessons.map((lesson, index) => html`
                        <button class="card" style="--card-accent:${lesson.accent};--i:${index}"
                            @click=${() => this._start({ lessonId: lesson.id })}>
                            <div class="art">
                                <span class="number">${String(index + 1).padStart(2, '0')}</span>
                                ${this.completed.includes(lesson.id) ? html`<span class="done-badge">${faIcon('check')} Built</span>` : ''}
                                ${featuredParts(lesson).map(id => html`<div class="part"><elera-part-preview component-id=${id}></elera-part-preview></div>`)}
                            </div>
                            <div class="body">
                                <div class="meta">
                                    <span class="level">${lesson.level}</span>
                                    <span>${faIcon('clock')} ${lesson.minutes} min</span>
                                </div>
                                <h3>${lesson.title}</h3>
                                <p class="summary">${lesson.summary}</p>
                                <div class="chips">${lesson.concepts.map(concept => html`<span class="chip">${concept}</span>`)}</div>
                            </div>
                        </button>
                    `)}
                    <button class="card own" style="--i:${lessons.length}" ?disabled=${!this.canGuideCurrent}
                        @click=${() => this.canGuideCurrent && this._start({ current: true })}>
                        <div class="art">${faIcon('listCheck')} Your circuit</div>
                        <div class="body">
                            <h3>Guide me through this circuit</h3>
                            <p class="summary">${this.canGuideCurrent
                                ? 'Turn the circuit on the canvas into step-by-step instructions, then rebuild it from scratch.'
                                : 'Build or open a circuit first, then come back to turn it into a guided build.'}</p>
                            <div class="chips"><span class="chip">Any circuit</span><span class="chip">Real breadboard practice</span></div>
                        </div>
                    </button>
                </div>
            </div>
        `;
    }
}

customElements.define('lessons-modal', LessonsModal);

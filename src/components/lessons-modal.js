import { LitElement, html, css } from 'lit';
import { listLessons } from '../lessons/catalog.js';
import { buildLessonSteps, lessonMap } from '../physical/lessons.js';
import { billOfMaterials } from './lesson-guide.js';
import { faIcon } from '../utils/fa-icons.js';
import './lesson-map.js';

// Lesson picker: the course on the left, the selected lesson's finished
// circuit and facts on the right. Emits `start-lesson` with { lessonId } or { current: true }.

let lessonCache = null;
function lessons() {
    lessonCache ||= listLessons().map(lesson => {
        const target = lesson.build();
        return {
            lesson,
            map: lessonMap(target),
            steps: buildLessonSteps(target).length,
            wires: target.wires.length,
            parts: billOfMaterials(target).filter(([label]) => label !== 'Jumper wires'),
        };
    });
    return lessonCache;
}

class LessonsModal extends LitElement {
    static properties = {
        open: { type: Boolean, reflect: true },
        canGuideCurrent: { type: Boolean },
        completed: { type: Array },
        _selected: { state: true },
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
            background: color-mix(in srgb, #000 62%, transparent);
            font-family: var(--font-ui);
        }
        :host([open]) { display: flex; }

        .sheet {
            width: min(1160px, 100%);
            height: min(720px, 100%);
            display: grid;
            grid-template-columns: 280px 1fr;
            overflow: hidden;
            color: var(--text);
            background: var(--ink);
            border: 1px solid var(--panel-border);
            border-radius: 6px;
            box-shadow: 0 24px 64px rgb(0 0 0 / .5); /* taste-skill-ignore: a dialog floats */
        }

        /* Course column */
        .course { display: flex; flex-direction: column; min-height: 0; background: var(--panel); border-right: 1px solid var(--panel-border); }
        .course header { padding: 22px 20px 14px; }
        h2 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -.01em; }
        .progress { margin: 6px 0 0; color: var(--text-muted); font-size: 13px; }
        .progress b { color: var(--text); font: 600 13px var(--font-tech); }
        ol { flex: 1; margin: 0; padding: 0 10px 10px; overflow: auto; list-style: none; }
        .row {
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: baseline;
            gap: 2px 12px;
            width: 100%;
            padding: 11px 10px;
            color: var(--text-muted);
            text-align: left;
            font: inherit;
            background: transparent;
            border: 0;
            border-radius: 4px;
            cursor: pointer;
        }
        .row:hover { background: var(--primary); }
        .row:focus-visible { outline: 1px solid var(--accent); outline-offset: -1px; }
        .row .name { justify-self: start; color: var(--text); font-size: 14px; font-weight: 600; padding-bottom: 3px; border-bottom: 1px solid transparent; }
        .row[aria-current="true"] { background: var(--primary); }
        .row[aria-current="true"] .name { border-bottom-color: var(--accent); }
        .row .meta { grid-column: 1; font-size: 12px; }
        .row .state { grid-row: 1; grid-column: 2; font-size: 12px; }
        .row .state.built { color: var(--accent); }
        .guide { margin: 0 10px 12px; padding: 12px 10px; border-top: 1px solid var(--panel-border); }
        .guide button {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            padding: 0;
            color: var(--text);
            background: none;
            border: 0;
            font: 600 13px var(--font-ui);
            cursor: pointer;
        }
        .guide button:hover:not([disabled]) { color: var(--accent); }
        .guide button[disabled] { color: var(--text-muted); cursor: default; }
        .guide p { margin: 4px 0 0 22px; color: var(--text-muted); font-size: 12px; line-height: 1.45; }

        /* Detail */
        .detail { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 320px; min-height: 0; }
        .close {
            position: absolute;
            top: 14px;
            right: 14px;
            z-index: 1;
            width: 32px;
            height: 32px;
            display: grid;
            place-items: center;
            color: var(--text-muted);
            background: transparent;
            border: 0;
            border-radius: 4px;
            cursor: pointer;
        }
        .close:hover { color: var(--text); background: var(--primary); }
        lesson-map { min-height: 0; padding: 40px 32px; }
        .facts { display: flex; flex-direction: column; min-height: 0; overflow: auto; padding: 56px 28px 24px; border-left: 1px solid var(--panel-border); }
        h3 { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -.02em; line-height: 1.1; }
        .goal { margin: 8px 0 0; font-size: 15px; line-height: 1.5; }
        .learn { margin: 10px 0 0; color: var(--text-muted); font-size: 13px; line-height: 1.5; }
        .numbers { display: flex; gap: 24px; margin: 18px 0 0; }
        .numbers div { color: var(--text-muted); font-size: 12px; }
        .numbers b { display: block; color: var(--text); font: 600 20px/1.2 var(--font-tech); }
        .facts h4 { margin: 24px 0 6px; color: var(--text-muted); font-size: 12px; font-weight: 600; }
        .parts { margin: 0; padding: 0; list-style: none; font-size: 13px; line-height: 1.75; }
        .parts span { display: inline-block; min-width: 24px; color: var(--text-muted); font-family: var(--font-tech); }
        .start {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            height: 40px;
            margin-top: auto;
            flex: 0 0 auto;
            color: #1a1a1a;
            background: var(--accent);
            border: 0;
            border-radius: 4px;
            font: 700 14px var(--font-ui);
            cursor: pointer;
            transition: background .15s ease;
        }
        .start:hover { background: color-mix(in srgb, var(--accent) 86%, #fff); }
        .start:active { transform: translateY(1px); }
        .start:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }

        @media (max-width: 860px) {
            :host { padding: 0; }
            .sheet { height: 100%; border-radius: 0; grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
            .course { max-height: 40vh; border-right: 0; border-bottom: 1px solid var(--panel-border); }
            .detail { grid-template-columns: 1fr; }
            .facts { padding: 16px; border-left: 0; }
            .start { margin-top: 20px; }
            lesson-map { padding: 16px; }
        }
    `;

    constructor() {
        super();
        this.open = false;
        this.canGuideCurrent = false;
        this.completed = [];
        this._selected = null;
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

    willUpdate(changed) {
        // Open on the first lesson the student has not built yet.
        if (changed.has('open') && this.open) {
            this._selected = (lessons().find(item => !this.completed.includes(item.lesson.id)) || lessons()[0]).lesson.id;
        }
    }

    _close() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    _start(detail) {
        this.dispatchEvent(new CustomEvent('start-lesson', { detail }));
    }

    _onListKey(event) {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const ids = lessons().map(item => item.lesson.id);
        const next = ids[Math.max(0, Math.min(ids.length - 1, ids.indexOf(this._selected) + (event.key === 'ArrowDown' ? 1 : -1)))];
        this._selected = next;
        this.updateComplete.then(() => this.renderRoot.querySelector(`[data-id="${next}"]`)?.focus());
    }

    render() {
        if (!this.open) return '';
        const all = lessons();
        const item = all.find(entry => entry.lesson.id === this._selected) || all[0];
        const { lesson } = item;
        const built = all.filter(entry => this.completed.includes(entry.lesson.id)).length;
        return html`
            <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="lessons-title"
                @click=${event => event.stopPropagation()}>
                <section class="course">
                    <header>
                        <h2 id="lessons-title">Lessons</h2>
                        <p class="progress"><b>${built}</b> of <b>${all.length}</b> circuits built</p>
                    </header>
                    <ol @keydown=${this._onListKey}>
                        ${all.map(entry => {
                            const done = this.completed.includes(entry.lesson.id);
                            return html`<li>
                                <button class="row" data-id=${entry.lesson.id} aria-current=${entry === item ? 'true' : 'false'}
                                    @click=${() => { this._selected = entry.lesson.id; }}
                                    @dblclick=${() => this._start({ lessonId: entry.lesson.id })}>
                                    <span class="name">${entry.lesson.title}</span>
                                    <span class="meta">${entry.lesson.level} · ${entry.lesson.minutes} min</span>
                                    <span class="state ${done ? 'built' : ''}">${done ? 'Built' : ''}</span>
                                </button>
                            </li>`;
                        })}
                    </ol>
                    <div class="guide">
                        <button ?disabled=${!this.canGuideCurrent} @click=${() => this._start({ current: true })}>
                            ${faIcon('listCheck')} Guide me through my circuit
                        </button>
                        <p>${this.canGuideCurrent
                            ? 'Turns the circuit on your canvas into the same steps.'
                            : 'Put a circuit on the canvas first, then rebuild it step by step.'}</p>
                    </div>
                </section>

                <section class="detail" aria-live="polite">
                    <button class="close" @click=${this._close} aria-label="Close lessons">${faIcon('xmark')}</button>
                    <lesson-map .map=${item.map}></lesson-map>
                    <div class="facts">
                        <h3>${lesson.title}</h3>
                        <p class="goal">${lesson.goal}</p>
                        <p class="learn">You will learn: ${lesson.concepts.join(' · ')}</p>
                        <div class="numbers">
                            <div><b>${item.steps}</b>steps</div>
                            <div><b>${item.wires}</b>wires</div>
                            <div><b>${lesson.minutes}</b>minutes</div>
                        </div>
                        <h4>Parts</h4>
                        <ul class="parts">${item.parts.map(([label, count]) => html`<li><span>${count}</span>${label}</li>`)}</ul>
                        <button class="start" @click=${() => this._start({ lessonId: lesson.id })}>
                            ${this.completed.includes(lesson.id) ? 'Build it again' : 'Start lesson'} ${faIcon('arrowRight')}
                        </button>
                    </div>
                </section>
            </div>
        `;
    }
}

customElements.define('lessons-modal', LessonsModal);

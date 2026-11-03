import { LitElement, html, css } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { physicalCircuitStore } from '../physical/circuit-store.js';
import {
    buildLessonSteps, isLessonStepComplete, lessonMap, lessonStepGhost, lessonStepHint, lessonStepMutation, lessonStepNote,
    matchLessonBuild,
} from '../physical/lessons.js';
import { validatePhysicalProject } from '../physical/validation.js';
import { getComponentDef } from '../component-library.js';
import { faIcon } from '../utils/fa-icons.js';
import './lesson-map.js';

// Guided build panel. `session` is { target, lesson?, name }: the finished
// circuit to rebuild and, for preset lessons, the story and sketch. The panel
// watches the store, ticks steps off as the student builds and tells the
// canvas which ghost to draw through `elera-lesson-ghost`.

const KIND_LABELS = { surface: 'Breadboard', component: 'Part', power: 'Power wire', ground: 'Ground wire', signal: 'Signal wire' };
const CODE_TOKENS = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|\b(void|int|const|if|else|for|return|#include)\b|\b(\d+)\b|\b(pinMode|digitalWrite|digitalRead|analogWrite|analogRead|delay|tone|map|setup|loop|Serial|attach|write|println|begin)\b/g;

function stepKind(step) {
    return step.kind === 'wire' ? step.wireKind : step.kind;
}

function highlight(line) {
    const parts = [];
    let last = 0;
    for (const match of line.matchAll(CODE_TOKENS)) {
        if (match.index > last) parts.push(line.slice(last, match.index));
        const cls = match[1] ? 'c' : match[2] ? 's' : match[3] ? 'k' : match[4] ? 'n' : 'f';
        parts.push(html`<span class=${cls}>${match[0]}</span>`);
        last = match.index + match[0].length;
    }
    parts.push(line.slice(last));
    return parts;
}

export function billOfMaterials(target) {
    const counts = new Map();
    for (const component of target.components) {
        const definition = getComponentDef(component.definitionId);
        const detail = component.definitionId === 'resistor' ? ` ${component.properties?.value || 220} Ω`
            : component.definitionId === 'led' && component.properties?.color ? ` (${component.properties.color})` : '';
        const label = `${definition?.name || component.definitionId}${detail}`;
        counts.set(label, (counts.get(label) || 0) + 1);
    }
    for (const surface of target.surfaces) counts.set('Half breadboard', (counts.get('Half breadboard') || 0) + (surface ? 1 : 0));
    if (target.wires.length) counts.set('Jumper wires', target.wires.length);
    return [...counts];
}

class LessonGuide extends LitElement {
    static properties = {
        session: { attribute: false },
        _cursor: { state: true },
        _done: { state: true },
        _hint: { state: true },
        _celebrate: { state: true },
        _copied: { state: true },
        _showAll: { state: true },
    };

    static styles = css`
        :host {
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            z-index: 60;
            width: 372px;
            display: flex;
            flex-direction: column;
            color: var(--text);
            background: var(--panel);
            border-left: 1px solid var(--panel-border);
            font-family: var(--font-ui);
        }

        header { padding: 18px 18px 14px; border-bottom: 1px solid var(--panel-border); }
        .top { display: flex; align-items: flex-start; gap: 10px; }
        .sub { margin: 3px 0 0; color: var(--text-muted); font-size: 12.5px; }
        h2 { margin: 0; font-size: 19px; letter-spacing: -.01em; }
        .icon-btn {
            flex: 0 0 auto;
            width: 30px;
            height: 30px;
            margin-left: auto;
            display: grid;
            place-items: center;
            color: var(--text-muted);
            background: transparent;
            border: 1px solid var(--panel-border);
            border-radius: 4px;
            cursor: pointer;
        }
        .icon-btn:hover { color: var(--text); background: var(--primary); }

        .progress { display: flex; gap: 3px; margin-top: 14px; }
        .seg {
            flex: 1;
            height: 6px;
            padding: 0;
            background: var(--primary);
            border: 0;
            border-radius: 3px;
            cursor: pointer;
            transition: background .2s ease;
        }
        .seg:hover { background: var(--primary-hover); }
        .seg.done { background: var(--accent); }
        .seg.skipped { /* taste-skill-ignore: a hatch marks skipped steps */ background: repeating-linear-gradient(45deg, var(--primary-hover) 0 3px, var(--primary) 3px 6px); }
        .seg.current { background: var(--text); }
        .count { display: flex; justify-content: space-between; margin-top: 8px; color: var(--text-muted); font-size: 11.5px; }

        .scroll { flex: 1; overflow: auto; padding: 18px; }
        .card {
            position: relative;
            padding: 18px;
            background: var(--ink);
            border: 1px solid var(--panel-border);
            border-radius: 4px;
        }
        .card.success { border-color: var(--accent); }
        .kind {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            color: var(--text-muted);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: .06em;
            text-transform: uppercase;
        }
        .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--dot, var(--accent)); }
        h3 { margin: 10px 0 8px; font-size: 17px; line-height: 1.35; letter-spacing: -.01em; }
        .note { margin: 0; color: var(--text-muted); font-size: 13px; line-height: 1.55; }
        .hint {
            display: flex;
            gap: 9px;
            margin-top: 14px;
            padding: 10px 12px;
            color: var(--text);
            background: color-mix(in srgb, var(--accent) 12%, transparent);
            border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
            border-radius: 4px;
            font-size: 12.5px;
            line-height: 1.45;
        }
        .hint .fa-icon { flex: 0 0 auto; color: var(--accent); margin-top: 1px; }
        .done-mark {
            position: absolute;
            top: 14px;
            right: 14px;
            width: 30px;
            height: 30px;
            display: grid;
            place-items: center;
            color: var(--ink);
            background: var(--accent);
            border-radius: 50%;
        }
        .watch { display: flex; align-items: center; gap: 8px; margin-top: 14px; color: var(--text-muted); font-size: 11.5px; }
        .watch i { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }

        .list-toggle {
            display: flex;
            align-items: center;
            gap: 7px;
            width: 100%;
            margin-top: 16px;
            padding: 0;
            color: var(--text-muted);
            background: none;
            border: 0;
            font: 600 12px var(--font-ui);
            cursor: pointer;
        }
        .list-toggle:hover { color: var(--text); }
        ol { margin: 10px 0 0; padding: 0; list-style: none; }
        li button {
            display: flex;
            align-items: center;
            gap: 9px;
            width: 100%;
            padding: 6px 8px;
            color: var(--text-muted);
            background: none;
            border: 0;
            border-radius: 5px;
            font: 12px/1.35 var(--font-ui);
            text-align: left;
            cursor: pointer;
        }
        li button:hover { background: var(--primary); color: var(--text); }
        li.current button { color: var(--text); background: color-mix(in srgb, var(--accent) 10%, transparent); }
        li .tick { flex: 0 0 auto; width: 16px; height: 16px; display: grid; place-items: center; border: 1px solid var(--panel-border); border-radius: 50%; }
        li.done .tick { color: var(--ink); background: var(--accent); border-color: var(--accent); }
        li .tick .fa-icon { width: 10px; height: 10px; }

        footer { display: flex; gap: 8px; padding: 14px 18px; border-top: 1px solid var(--panel-border); }
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            height: 36px;
            padding: 0 14px;
            color: var(--text);
            background: transparent;
            border: 1px solid var(--panel-border);
            border-radius: 4px;
            font: 600 12px var(--font-ui);
            cursor: pointer;
            transition: background .15s ease;
        }
        .btn:hover:not([disabled]) { background: var(--primary); }
        .btn[disabled] { opacity: .4; cursor: default; }
        .btn.primary { margin-left: auto; color: var(--ink); background: var(--accent); border-color: var(--accent); }
        .btn.primary:hover:not([disabled]) { background: color-mix(in srgb, var(--accent) 85%, var(--text)); }
        .btn.wide { flex: 1; }

        .intro h3 { margin-top: 0; }
        .goal {
            margin: 0 0 14px;
            padding: 12px 14px;
            font-size: 14px;
            font-weight: 600;
            line-height: 1.45;
            background: var(--ink);
            border: 1px solid var(--panel-border);
            border-radius: 4px;
        }
        .section-title { margin: 18px 0 8px; color: var(--text-muted); font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
        .bom { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; font-size: 12.5px; }
        .bom li { display: flex; gap: 10px; padding: 6px 10px; background: var(--ink); border-radius: 5px; }
        .bom b { min-width: 22px; color: var(--accent); font-family: var(--font-tech); }
        .chips { display: flex; flex-wrap: wrap; gap: 5px; }
        .chip { padding: 3px 8px; color: var(--text-muted); border: 1px solid var(--panel-border); border-radius: 4px; font-size: 11px; }

        .map { height: 190px; margin: 0 0 14px; padding: 10px; background: var(--ink); border-radius: 4px; }
        .finish { position: relative; text-align: center; padding-top: 6px; }
        .finish h3 { font-size: 21px; margin: 0 0 6px; }
        .stats { display: flex; justify-content: center; gap: 18px; margin: 14px 0 4px; color: var(--text-muted); font-size: 11.5px; }
        .stats b { display: block; color: var(--text); font-size: 18px; font-family: var(--font-tech); }
        .code-box { margin-top: 6px; text-align: left; background: var(--ink); border: 1px solid var(--panel-border); border-radius: 4px; overflow: hidden; }
        .code-head { display: flex; align-items: center; padding: 7px 8px 7px 12px; border-bottom: 1px solid var(--panel-border); color: var(--text-muted); font-size: 11.5px; }
        .code-head .btn { height: 28px; margin-left: auto; padding: 0 10px; }
        pre { margin: 0; padding: 12px; max-height: 280px; overflow: auto; font: 11.5px/1.6 var(--font-tech); white-space: pre; }
        pre .c { color: var(--text-muted); font-style: italic; }
        pre .k { color: #c792ea; }
        pre .s { color: #c3e88d; }
        pre .n { color: #f78c6c; }
        pre .f { color: #82aaff; }
        .upload { margin: 0; padding-left: 18px; list-style: decimal; color: var(--text-muted); font-size: 12.5px; line-height: 1.7; text-align: left; }
        .challenge { margin-top: 14px; padding: 11px 13px; text-align: left; font-size: 12.5px; line-height: 1.5; border: 1px dashed var(--panel-border); border-radius: 4px; }
        .challenge b { color: var(--accent); }
        .ok { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; color: var(--accent-sensors); font-size: 12px; }
        .ok.warn { color: var(--accent-ics); }

        @media (max-width: 900px) { :host { width: min(372px, 100%); } }
    `;

    constructor() {
        super();
        this.session = null;
        this._cursor = -1;
        this._done = [];
        this._skipped = new Set();
        this._attempts = 0;
        this._storeHandler = () => this._evaluate({ fromBuild: true });
    }

    connectedCallback() {
        super.connectedCallback();
        physicalCircuitStore.addEventListener('change', this._storeHandler);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        physicalCircuitStore.removeEventListener('change', this._storeHandler);
        clearTimeout(this._advanceTimer);
        this._publishGhost(null);
    }

    willUpdate(changed) {
        if (!changed.has('session')) return;
        this._steps = this.session ? buildLessonSteps(this.session.target) : [];
        this._map = this.session ? lessonMap(this.session.target) : null;
        this._skipped = new Set();
        this._cursor = this.session?.lesson ? -1 : 0;
        this._startedAt = Date.now();
        this._evaluate();
        if (this._cursor >= 0) this._cursor = this._firstOpen();
    }

    updated() {
        this._syncGhost();
    }

    _firstOpen() {
        const index = this._done.findIndex(done => !done);
        return index === -1 ? this._steps.length : index;
    }

    _evaluate({ fromBuild = false } = {}) {
        if (!this.session) return;
        const target = this.session.target;
        const current = physicalCircuitStore.project;
        this._match = matchLessonBuild(target, current);
        const wasDone = this._done[this._cursor];
        this._done = this._steps.map(step => this._skipped.has(step.id)
            || isLessonStepComplete(step, target, current, this._match));
        const step = this._steps[this._cursor];
        if (!step) return;
        if (!wasDone && this._done[this._cursor] && fromBuild) {
            this._hint = null;
            this._celebrate = true;
            clearTimeout(this._advanceTimer);
            this._advanceTimer = setTimeout(() => {
                this._celebrate = false;
                this._goTo(this._firstOpen());
            }, 750);
            return;
        }
        if (fromBuild && !this._done[this._cursor]) {
            this._attempts += 1;
            const hint = lessonStepHint(step, target, current, this._match);
            if (hint && (step.kind !== 'wire' || this._attempts >= 2)) this._hint = hint;
        }
    }

    _goTo(index) {
        this._cursor = Math.max(0, Math.min(index, this._steps.length));
        if (this._cursor === this._steps.length && this.session?.lesson && !this._skipped.size) {
            this.dispatchEvent(new CustomEvent('lesson-complete', { detail: { lessonId: this.session.lesson.id } }));
        }
        this._attempts = 0;
        this._hint = null;
        this._celebrate = false;
    }

    _syncGhost() {
        const step = this._steps?.[this._cursor];
        if (!this.session || !step || this._done[this._cursor]) {
            this._publishGhost(null);
            return;
        }
        const ghost = lessonStepGhost(step, this.session.target, physicalCircuitStore.project, this._match);
        this._publishGhost(ghost);
    }

    _publishGhost(ghost) {
        const key = JSON.stringify(ghost);
        if (key === this._ghostKey) return;
        this._ghostKey = key;
        window.dispatchEvent(new CustomEvent('elera-lesson-ghost', { detail: ghost }));
    }

    _showMe() {
        const step = this._steps[this._cursor];
        const mutate = step && lessonStepMutation(step, this.session.target, physicalCircuitStore.project, {
            surface: () => physicalCircuitStore.newSurfaceId(),
            component: () => physicalCircuitStore.newComponentId(),
            wire: () => physicalCircuitStore.newWireId(),
        }, this._match);
        if (!mutate) {
            this._hint = 'Finish the earlier parts first so this wire has somewhere to go.';
            return;
        }
        physicalCircuitStore.transaction('lesson-show-me', mutate);
    }

    _skip() {
        const step = this._steps[this._cursor];
        if (!step) return;
        this._skipped.add(step.id);
        this._evaluate();
        this._goTo(this._firstOpen());
    }

    _back() {
        this._goTo(this._cursor - 1);
    }

    _forward() {
        this._goTo(this._cursor + 1);
    }

    _close() {
        this.dispatchEvent(new CustomEvent('close', { detail: { finished: this._cursor >= this._steps.length } }));
    }

    async _copyCode() {
        try {
            await navigator.clipboard.writeText(this.session.lesson.code);
            this._copied = true;
            setTimeout(() => { this._copied = false; }, 1600);
        } catch {
            this._copied = false;
        }
    }

    // The finished circuit, with built steps solid, the current one in the accent and the rest faint.
    _renderMap(all = false) {
        const states = {};
        this._steps.forEach((step, index) => {
            states[step.id] = all || this._done[index] ? 'done' : index === this._cursor ? 'current' : 'todo';
        });
        return html`<lesson-map class="map" .map=${this._map} .states=${states}></lesson-map>`;
    }

    _renderIntro() {
        const lesson = this.session.lesson;
        return html`
            <div class="scroll">
                ${this._renderMap(true)}
                <div class="card intro">
                    <p class="goal">${lesson.goal}</p>
                    <p class="note">${lesson.explanation}</p>
                    <div class="section-title">You will need</div>
                    <ul class="bom">${billOfMaterials(this.session.target).map(([label, count]) => html`<li><b>${count}×</b>${label}</li>`)}</ul>
                    <div class="section-title">You will learn</div>
                    <div class="chips">${lesson.concepts.map(concept => html`<span class="chip">${concept}</span>`)}</div>
                </div>
            </div>
            <footer><button class="btn primary wide" @click=${() => this._goTo(this._firstOpen())}>${faIcon('play')} Start building</button></footer>
        `;
    }

    _renderStep() {
        const step = this._steps[this._cursor];
        const done = this._done[this._cursor];
        const kind = stepKind(step);
        const skipped = this._skipped.has(step.id);
        const note = lessonStepNote(step, this.session.target, this.session.lesson?.notes);
        return html`
            <div class="scroll">
                ${this._renderMap()}
                ${keyed(step.id, html`<div class="card ${done ? 'success' : ''}">
                    <span class="kind"><span class="dot" style=${step.color ? `--dot:${step.color}` : ''}></span>${KIND_LABELS[kind]}</span>
                    ${done ? html`<span class="done-mark" aria-label="Done">${faIcon(skipped ? 'forward' : 'check')}</span>` : ''}
                    <h3>${step.title}</h3>
                    <p class="note">${note}</p>
                    ${this._hint && !done ? html`<div class="hint" role="status">${faIcon('lightbulb')}<span>${this._hint}</span></div>` : ''}
                    ${done
                        ? html`<div class="watch">${this._celebrate ? 'Nice! Moving on…' : skipped ? 'Skipped' : 'Done'}</div>`
                        : html`<div class="watch"><i></i>Follow the glowing outline. I'll check it as you build.</div>`}
                </div>`)}
                <button class="list-toggle" @click=${() => { this._showAll = !this._showAll; }}>
                    ${faIcon('listCheck')} ${this._showAll ? 'Hide all steps' : 'Show all steps'}
                </button>
                ${this._showAll ? html`<ol>${this._steps.map((item, index) => html`
                    <li class="${this._done[index] ? 'done' : ''} ${index === this._cursor ? 'current' : ''}">
                        <button @click=${() => this._goTo(index)}>
                            <span class="tick">${this._done[index] ? faIcon('check') : ''}</span>${item.title}
                        </button>
                    </li>`)}</ol>` : ''}
            </div>
            <footer>
                <button class="btn" ?disabled=${this._cursor === 0} @click=${this._back} aria-label="Previous step">${faIcon('arrowLeft')}</button>
                ${done
                    ? html`<button class="btn primary" @click=${this._forward}>Next ${faIcon('arrowRight')}</button>`
                    : html`
                        <button class="btn" @click=${this._skip}>${faIcon('forward')} Skip</button>
                        <button class="btn primary" @click=${this._showMe}>${faIcon('eye')} Show me</button>`}
            </footer>
        `;
    }

    _renderFinish() {
        const lesson = this.session.lesson;
        const errors = validatePhysicalProject(physicalCircuitStore.project).all.filter(item => item.severity === 'error').length;
        const minutes = Math.max(1, Math.round((Date.now() - this._startedAt) / 60000));
        return html`
            <div class="scroll">
                <div class="finish">
                    ${this._renderMap(true)}
                    <h3>${lesson ? `${lesson.title} built!` : 'Circuit rebuilt!'}</h3>
                    <p class="note">${lesson ? lesson.goal.replace(/\.$/, '') + ' is ready to go.' : `You rebuilt ${this.session.name || 'the circuit'} step by step.`}</p>
                    <div class="stats">
                        <span><b>${this._steps.length}</b>steps</span>
                        <span><b>${this.session.target.wires.length}</b>wires</span>
                        <span><b>${minutes}</b>${minutes === 1 ? 'minute' : 'minutes'}</span>
                    </div>
                    <span class="ok ${errors ? 'warn' : ''}">${faIcon(errors ? 'triangleExclamation' : 'circleCheck')}
                        ${errors ? `${errors} problem${errors === 1 ? '' : 's'} to check in the bar below` : 'No wiring problems found'}</span>
                    ${this._skipped.size ? html`<p class="note">You skipped ${this._skipped.size} step${this._skipped.size === 1 ? '' : 's'}. Use the step list to go back to them.</p>` : ''}
                </div>
                ${lesson ? html`
                    <div class="section-title">Upload the code</div>
                    <div class="code-box">
                        <div class="code-head">${lesson.id}.ino
                            <button class="btn" @click=${this._copyCode}>${faIcon(this._copied ? 'check' : 'copy')} ${this._copied ? 'Copied' : 'Copy'}</button>
                        </div>
                        <pre>${lesson.code.split('\n').map(line => html`${highlight(line)}\n`)}</pre>
                    </div>
                    <div class="section-title">On your real board</div>
                    <ol class="upload">
                        <li>Build the same circuit on a breadboard and plug the Uno in with USB.</li>
                        <li>Paste the code into the Arduino IDE.</li>
                        <li>Pick Tools › Board › Arduino Uno and your port, then press Upload.</li>
                    </ol>
                    <div class="challenge"><b>Challenge:</b> ${lesson.challenge}</div>
                ` : ''}
                <button class="list-toggle" @click=${() => { this._showAll = !this._showAll; }}>
                    ${faIcon('listCheck')} ${this._showAll ? 'Hide all steps' : 'Review all steps'}
                </button>
                ${this._showAll ? html`<ol>${this._steps.map((item, index) => html`
                    <li class="${this._done[index] ? 'done' : ''}"><button @click=${() => this._goTo(index)}>
                        <span class="tick">${this._done[index] ? faIcon('check') : ''}</span>${item.title}</button></li>`)}</ol>` : ''}
            </div>
            <footer>
                <button class="btn wide" @click=${() => this.dispatchEvent(new CustomEvent('pick-lesson'))}>${faIcon('graduation')} Next lesson</button>
                <button class="btn primary wide" @click=${this._close}>Done</button>
            </footer>
        `;
    }

    render() {
        if (!this.session) return '';
        const lesson = this.session.lesson;
        const total = this._steps.length;
        const finished = this._cursor >= total;
        const doneCount = this._done.filter(Boolean).length;
        return html`
            <header>
                <div class="top">
                    <div>
                        <h2>${lesson?.title || this.session.name || 'Your circuit'}</h2>
                        <p class="sub">${lesson ? `${lesson.level} lesson · about ${lesson.minutes} min` : 'Guided rebuild'}</p>
                    </div>
                    <button class="icon-btn" @click=${this._close} aria-label="Close guide" title="Close guide">${faIcon('xmark')}</button>
                </div>
                ${this._cursor >= 0 ? html`
                    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax=${total} aria-valuenow=${doneCount}>
                        ${this._steps.map((step, index) => html`<button class="seg ${this._done[index] ? (this._skipped.has(step.id) ? 'skipped' : 'done') : ''} ${index === this._cursor ? 'current' : ''}"
                            title=${step.title} aria-label=${`Step ${index + 1}: ${step.title}`} @click=${() => this._goTo(index)}></button>`)}
                    </div>
                    <div class="count">
                        <span>${finished ? 'All steps complete' : `Step ${this._cursor + 1} of ${total}`}</span>
                        <span>${doneCount}/${total} done</span>
                    </div>` : ''}
            </header>
            ${this._cursor < 0 ? this._renderIntro() : finished ? this._renderFinish() : this._renderStep()}
        `;
    }
}

customElements.define('lesson-guide', LessonGuide);

import { LitElement, html, css } from 'lit';
import { faIcon } from '../utils/fa-icons.js';

const TOAST_ICONS = { info: 'circleInfo', success: 'circleCheck', warning: 'triangleExclamation', error: 'circleXmark' };

// In-app replacement for window.alert/confirm: toasts for messages, a small
// modal for questions. One instance lives on <body> and is created on demand.
class AppDialogs extends LitElement {
    static properties = {
        _toasts: { state: true },
        _confirm: { state: true },
    };

    static styles = css`
        :host { font-family: var(--font-ui, 'Public Sans', sans-serif); color: var(--text); }

        .toasts {
            position: fixed; z-index: 10000; left: 50%; bottom: 52px;
            transform: translateX(-50%);
            display: grid; gap: 8px; justify-items: center;
            width: min(440px, calc(100vw - 32px));
            pointer-events: none;
        }
        .toast {
            display: grid; grid-template-columns: 3px auto 1fr auto; align-items: center; gap: 10px;
            width: 100%; padding: 0 6px 0 0; overflow: hidden;
            background: var(--panel); border: 1px solid var(--panel-border); border-radius: 6px;
            box-shadow: 0 12px 32px color-mix(in srgb, var(--ink) 75%, transparent);
            font-size: 12px; line-height: 1.45;
            pointer-events: auto;
            animation: toast-in 180ms ease-out;
        }
        .toast::before { content: ''; align-self: stretch; background: var(--tone); }
        .toast > svg { color: var(--tone); }
        .toast p { margin: 0; padding: 10px 0; }
        .toast.info { --tone: var(--accent-breadboards); }
        .toast.success { --tone: var(--accent-sensors); }
        .toast.warning { --tone: var(--accent); }
        .toast.error { --tone: var(--accent-ics); }
        .toast button {
            display: grid; place-items: center; width: 26px; height: 26px; padding: 0;
            border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer;
        }
        .toast button:hover { color: var(--text); background: var(--primary); }
        @keyframes toast-in { from { opacity: 0; transform: translateY(8px); } }

        dialog {
            width: min(380px, calc(100vw - 32px)); padding: 0;
            color: var(--text); background: var(--panel);
            border: 1px solid var(--panel-border); border-radius: 6px;
            box-shadow: 0 24px 60px color-mix(in srgb, var(--ink) 80%, transparent);
        }
        dialog[open] { animation: dialog-in 160ms ease-out; }
        dialog::backdrop { background: color-mix(in srgb, var(--ink) 65%, transparent); backdrop-filter: blur(3px); }
        @keyframes dialog-in { from { opacity: 0; transform: translateY(6px) scale(0.98); } }
        .body { display: grid; grid-template-columns: auto 1fr; gap: 12px; padding: 18px 18px 14px; }
        .body > svg { width: 20px; height: 20px; color: var(--accent); }
        .body.danger > svg { color: var(--accent-ics); }
        h2 { margin: 0 0 6px; font-size: 14px; font-weight: 600; }
        .body p { margin: 0; color: var(--text-muted); font-size: 12px; line-height: 1.55; }
        .actions {
            display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px;
            border-top: 1px solid var(--panel-border); background: color-mix(in srgb, var(--ink) 40%, var(--panel));
        }
        .actions button {
            height: 32px; padding: 0 14px; border-radius: 4px; cursor: pointer;
            border: 1px solid var(--panel-border); background: transparent; color: var(--text);
            font: 600 12px var(--font-ui, 'Public Sans', sans-serif);
            transition: background 120ms, border-color 120ms;
        }
        .actions button:hover { background: var(--primary); border-color: var(--primary-hover); }
        .actions .ok { background: var(--accent); border-color: var(--accent); color: var(--ink); }
        .actions .ok:hover { background: color-mix(in srgb, var(--accent) 85%, white); border-color: transparent; }
        .danger ~ .actions .ok { background: var(--accent-ics); border-color: var(--accent-ics); color: #fff; }
        .actions button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    `;

    constructor() {
        super();
        this._toasts = [];
        this._confirm = null;
        this._nextId = 1;
    }

    toast(message, tone = 'info', duration = 4500) {
        const id = this._nextId++;
        this._toasts = [...this._toasts, { id, message, tone }];
        setTimeout(() => this._dismiss(id), duration);
    }

    confirm(options) {
        this._confirm?.resolve(false);
        return new Promise(resolve => {
            this._confirm = { ...options, resolve };
        });
    }

    _dismiss(id) {
        this._toasts = this._toasts.filter(toast => toast.id !== id);
    }

    _answer(value) {
        const pending = this._confirm;
        if (!pending) return;
        this._confirm = null;
        this.renderRoot.querySelector('dialog')?.close();
        pending.resolve(value);
    }

    updated() {
        const dialog = this.renderRoot.querySelector('dialog');
        if (this._confirm && dialog && !dialog.open) {
            dialog.showModal();
            dialog.querySelector('.ok')?.focus();
        }
    }

    render() {
        const c = this._confirm;
        return html`
            <div class="toasts" role="status" aria-live="polite">
                ${this._toasts.map(toast => html`
                    <div class="toast ${toast.tone}">
                        ${faIcon(TOAST_ICONS[toast.tone] || 'circleInfo')}
                        <p>${toast.message}</p>
                        <button @click=${() => this._dismiss(toast.id)} aria-label="Dismiss">${faIcon('xmark')}</button>
                    </div>
                `)}
            </div>
            ${c ? html`
                <dialog aria-labelledby="confirm-title" @keydown=${event => event.stopPropagation()} @cancel=${event => { event.preventDefault(); this._answer(false); }}>
                    <div class="body ${c.danger ? 'danger' : ''}">
                        ${faIcon(c.danger ? 'triangleExclamation' : 'circleInfo')}
                        <div>
                            <h2 id="confirm-title">${c.title}</h2>
                            <p>${c.message}</p>
                        </div>
                    </div>
                    <div class="actions">
                        <button @click=${() => this._answer(false)}>${c.cancelLabel || 'Cancel'}</button>
                        <button class="ok" @click=${() => this._answer(true)}>${c.confirmLabel || 'OK'}</button>
                    </div>
                </dialog>
            ` : ''}
        `;
    }
}

customElements.define('app-dialogs', AppDialogs);

function host() {
    return document.querySelector('app-dialogs') || document.body.appendChild(document.createElement('app-dialogs'));
}

/** Show a short message. tone: 'info' | 'success' | 'warning' | 'error'. */
export function showToast(message, tone = 'info') {
    host().toast(message, tone);
}

/** Ask a yes/no question; resolves true when the user confirms. */
export function confirmDialog({ title, message, confirmLabel, cancelLabel, danger = false }) {
    return host().confirm({ title, message, confirmLabel, cancelLabel, danger });
}

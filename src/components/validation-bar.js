/**
 * Validation Bar — Displays real-time circuit errors and warnings at
 * the bottom of the canvas. Subscribes to store changes and reruns
 * the validation engine on every change.
 */

import { LitElement, html, css } from 'lit';
import { store } from '../store.js';
import { validateCircuit, SEV } from '../services/validation-engine.js';

class ValidationBar extends LitElement {
    static properties = {
        _results: { state: true },
        _collapsed: { state: true },
    };

    static styles = css `
    :host {
      display: block;
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 100;
      pointer-events: none;
    }

    .bar {
      pointer-events: all;
      background: rgba(18, 18, 31, 0.96);
      border-top: 1px solid #2a2a4a;
      max-height: 180px;
      overflow-y: auto;
      transition: max-height 0.25s ease;
    }

    .bar.collapsed {
      max-height: 0;
      border-top: none;
    }

    /* Summary strip — always visible */
    .summary {
      pointer-events: all;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 6px 16px;
      background: rgba(18, 18, 31, 0.98);
      border-top: 1px solid #2a2a4a;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
    }

    .summary:hover {
      background: rgba(30, 30, 50, 0.98);
    }

    .count {
      display: flex;
      align-items: center;
      gap: 4px;
      font-weight: 600;
    }

    .count.error { color: #EF5350; }
    .count.warning { color: #FFA726; }
    .count.info { color: #42A5F5; }
    .count.ok { color: #66BB6A; }

    .toggle-icon {
      margin-left: auto;
      color: #666;
      font-size: 14px;
      transition: transform 0.2s;
    }

    .toggle-icon.open {
      transform: rotate(180deg);
    }

    /* Individual issue rows */
    .issue {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 6px 16px;
      font-size: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      transition: background 0.15s;
    }

    .issue:hover {
      background: rgba(255,255,255,0.04);
    }

    .issue:last-child {
      border-bottom: none;
    }

    .issue-icon {
      flex-shrink: 0;
      width: 18px;
      text-align: center;
    }

    .issue-severity {
      flex-shrink: 0;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-top: 4px;
    }

    .issue-severity.error { background: #EF5350; box-shadow: 0 0 6px rgba(239,83,80,0.5); }
    .issue-severity.warning { background: #FFA726; }
    .issue-severity.info { background: #42A5F5; }

    .issue-message {
      color: #ccc;
      line-height: 1.5;
    }

    .issue-message .inst-id {
      color: #888;
      font-size: 10px;
    }

    /* Scrollbar */
    .bar::-webkit-scrollbar { width: 6px; }
    .bar::-webkit-scrollbar-track { background: transparent; }
    .bar::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
  `;

    constructor() {
        super();
        this._results = { errors: [], warnings: [], info: [], all: [] };
        this._collapsed = true;
        this._storeHandler = () => this._runValidation();
    }

    connectedCallback() {
        super.connectedCallback();
        store.addEventListener('change', this._storeHandler);
        this._runValidation();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        store.removeEventListener('change', this._storeHandler);
    }

    _runValidation() {
        this._results = validateCircuit();
    }

    _toggle() {
        this._collapsed = !this._collapsed;
    }

    render() {
            const { errors, warnings, info, all } = this._results;
            const hasIssues = all.length > 0;

            return html `
      ${hasIssues ? html`
        <div class="bar ${this._collapsed ? 'collapsed' : ''}">
          ${all.map(issue => html`
            <div class="issue">
              <div class="issue-icon">${issue.icon || '•'}</div>
              <div class="issue-severity ${issue.severity}"></div>
              <div class="issue-message">
                ${issue.message}
              </div>
            </div>
          `)}
        </div>
      ` : ''}

      <div class="summary" @click=${this._toggle}>
        ${errors.length > 0 ? html`
          <span class="count error">✕ ${errors.length} error${errors.length > 1 ? 's' : ''}</span>
        ` : ''}
        ${warnings.length > 0 ? html`
          <span class="count warning">⚠ ${warnings.length} warning${warnings.length > 1 ? 's' : ''}</span>
        ` : ''}
        ${info.length > 0 ? html`
          <span class="count info">ℹ ${info.length} info</span>
        ` : ''}
        ${all.length === 0 ? html`
          <span class="count ok">✓ No issues</span>
        ` : ''}
        ${hasIssues ? html`
          <span class="toggle-icon ${this._collapsed ? '' : 'open'}">▲</span>
        ` : ''}
      </div>
    `;
    }
}

customElements.define('validation-bar', ValidationBar);
/**
 * Validation Bar — Displays real-time circuit errors and warnings at
 * the bottom of the canvas.
 *
 * Improvements:
 *  - Debounced: listens to 'structural-change' instead of every 'change'
 *  - Auto-expands when new errors appear
 *  - Click-to-highlight: clicking an issue selects the related component
 */

import { LitElement, html, css } from 'lit';
import { store } from '../store.js';
import { validateCircuit, SEV } from '../services/validation-engine.js';
import { getComponentDef } from '../component-library.js';
import { faIcon } from '../utils/fa-icons.js';

class ValidationBar extends LitElement {
    static properties = {
        _results: { state: true },
        _collapsed: { state: true },
        _prevErrorCount: { state: true },
    };

    static styles = css`
    :host {
      display: block;
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 300;
      pointer-events: none;
    }

    .bar {
      pointer-events: all;
      background: rgba(18, 18, 31, 0.96);
      border-top: 1px solid #2a2a4a;
      max-height: 200px;
      overflow-y: auto;
      transition: max-height 0.25s ease;
      backdrop-filter: blur(8px);
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
      backdrop-filter: blur(8px);
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

    .count svg,
    .issue-icon svg,
    .toggle-icon svg {
      width: 1em;
      height: 1em;
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

    /* Save indicator */
    .save-indicator {
      margin-left: auto;
      margin-right: 8px;
      font-size: 10px;
      color: #444;
    }

    /* Individual issue rows */
    .issue {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 7px 16px;
      font-size: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      transition: background 0.15s;
      cursor: pointer;
    }

    .issue:hover {
      background: rgba(255,255,255,0.06);
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
      flex: 1;
    }

    .issue-component {
      font-size: 10px;
      color: #666;
      margin-left: 4px;
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
        this._prevErrorCount = 0;
        this._debounceTimer = null;

        // Listen to structural changes only (not every mouse move)
        this._structuralHandler = () => this._scheduleValidation();
        // Also do an initial validation after components load
        this._changeHandler = () => {
            if (!this._hasRunInitial) {
                this._hasRunInitial = true;
                this._scheduleValidation();
            }
        };
        this._hasRunInitial = false;
    }

    connectedCallback() {
        super.connectedCallback();
        store.addEventListener('structural-change', this._structuralHandler);
        store.addEventListener('change', this._changeHandler);
        this._runValidation();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        store.removeEventListener('structural-change', this._structuralHandler);
        store.removeEventListener('change', this._changeHandler);
        clearTimeout(this._debounceTimer);
    }

    _scheduleValidation() {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => this._runValidation(), 100);
    }

    _runValidation() {
        const prev = this._results;
        this._results = validateCircuit();

        // Auto-expand when errors appear for the first time
        const newErrorCount = this._results.errors.length;
        if (newErrorCount > 0 && this._prevErrorCount === 0) {
            this._collapsed = false;
        }
        // Auto-collapse when errors are all fixed
        if (newErrorCount === 0 && prev.errors.length > 0) {
            this._collapsed = true;
        }
        this._prevErrorCount = newErrorCount;
    }

    _toggle() {
        this._collapsed = !this._collapsed;
    }

    _onIssueClick(issue) {
        if (issue.instanceId) {
            store.selectInstance(issue.instanceId);
        }
    }

    _getComponentName(instanceId) {
        if (!instanceId) return '';
        const inst = store.getInstance(instanceId);
        if (!inst) return instanceId;
        const def = getComponentDef(inst.componentId);
        return def ? def.name : instanceId;
    }

    _iconForIssue(issue) {
        if (issue.icon) return issue.icon;
        if (issue.severity === SEV.ERROR) return 'circleXmark';
        if (issue.severity === SEV.WARNING) return 'triangleExclamation';
        return 'circleInfo';
    }

    render() {
        const { errors, warnings, info, all } = this._results;
        const hasIssues = all.length > 0;

        return html`
      ${hasIssues ? html`
        <div class="bar ${this._collapsed ? 'collapsed' : ''}">
          ${all.map(issue => html`
            <div class="issue" @click=${() => this._onIssueClick(issue)}>
              <div class="issue-icon">${faIcon(this._iconForIssue(issue))}</div>
              <div class="issue-severity ${issue.severity}"></div>
              <div class="issue-message">
                ${issue.message}
                ${issue.instanceId ? html`
                  <span class="issue-component">(click to highlight)</span>
                ` : ''}
              </div>
            </div>
          `)}
        </div>
      ` : ''}

      <div class="summary" @click=${this._toggle}>
        ${errors.length > 0 ? html`
          <span class="count error">${faIcon('circleXmark')} ${errors.length} error${errors.length > 1 ? 's' : ''}</span>
        ` : ''}
        ${warnings.length > 0 ? html`
          <span class="count warning">${faIcon('triangleExclamation')} ${warnings.length} warning${warnings.length > 1 ? 's' : ''}</span>
        ` : ''}
        ${info.length > 0 ? html`
          <span class="count info">${faIcon('circleInfo')} ${info.length} info</span>
        ` : ''}
        ${all.length === 0 ? html`
          <span class="count ok">${faIcon('circleCheck')} No issues</span>
        ` : ''}
        <span class="save-indicator">auto-saved</span>
        ${hasIssues ? html`
          <span class="toggle-icon ${this._collapsed ? '' : 'open'}">${faIcon('chevronUp')}</span>
        ` : ''}
      </div>
    `;
    }
}

customElements.define('validation-bar', ValidationBar);

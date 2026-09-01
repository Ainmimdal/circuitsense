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
import { physicalCircuitStore } from '../physical/circuit-store.js';
import { validatePhysicalProject, PHYSICAL_SEVERITY as SEV } from '../physical/validation.js';
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
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: 4px 4px 0 0;
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
      min-height: 34px;
      box-sizing: border-box;
      background: var(--panel);
      border-top: 1px solid var(--panel-border);
      font-size: 12px;
      font-family: var(--font-ui, 'Public Sans', sans-serif);
      cursor: pointer;
      user-select: none;
      backdrop-filter: blur(8px);
    }

    .summary:hover {
      background: var(--primary);
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
    .count.info { color: var(--text-muted); }
    .count.ok { color: var(--text); }

    .toggle-icon {
      margin-left: auto;
      color: var(--text-muted);
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
      color: var(--text-muted);
      font-family: var(--font-ui, 'Public Sans', sans-serif);
    }

    /* Individual issue rows */
    .issue {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 7px 16px;
      font-size: 12px;
      border-bottom: 1px solid var(--panel-border);
      transition: background 0.15s;
      cursor: pointer;
    }

    .issue:hover {
      background: var(--primary);
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
    .issue-severity.info { background: var(--primary-hover); }

    .issue-message {
      color: var(--text);
      line-height: 1.5;
      flex: 1;
    }

    .issue-component {
      font-size: 10px;
      color: var(--text-muted);
      margin-left: 4px;
    }

    /* Scrollbar */
    .bar::-webkit-scrollbar { width: 6px; }
    .bar::-webkit-scrollbar-track { background: transparent; }
    .bar::-webkit-scrollbar-thumb { background: var(--panel-border); border-radius: 1px; }

    @media (max-width: 900px) {
      .bar { max-height: 42vh; }
      .summary { min-height: 34px; box-sizing: border-box; padding-inline: 12px; gap: 10px; }
      .issue { min-height: 44px; box-sizing: border-box; padding: 10px 12px; }
      .save-indicator { display: none; }
    }
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
        physicalCircuitStore.addEventListener('change', this._structuralHandler);
        this._runValidation();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        physicalCircuitStore.removeEventListener('change', this._structuralHandler);
        clearTimeout(this._debounceTimer);
    }

    _scheduleValidation() {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => this._runValidation(), 100);
    }

    _runValidation() {
        const prev = this._results;
        this._results = validatePhysicalProject(physicalCircuitStore.project);

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
            window.dispatchEvent(new CustomEvent('elera-select-physical-component', { detail: { componentId: issue.instanceId } }));
        }
    }

    _getComponentName(instanceId) {
        if (!instanceId) return '';
        const inst = physicalCircuitStore.project.components.find(component => component.id === instanceId);
        if (!inst) return instanceId;
        const def = getComponentDef(inst.definitionId);
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

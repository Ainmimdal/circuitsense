import { LitElement, html, css } from 'lit';
import { store } from './store.js';

class CircuitApp extends LitElement {
    static properties = {
        _antiOverlap: { state: true },
    };

    static styles = css `
    :host {
      display: flex;
      flex-direction: column;
      width: 100vw;
      height: 100vh;
    }

    .header {
      height: 48px;
      background: #18181b; /* Zinc 900 */
      border-bottom: 1px solid #27272a; /* Zinc 800 */
      display: flex;
      align-items: center;
      padding: 0 20px;
      flex-shrink: 0;
      gap: 16px;
    }

    .logo {
      font-size: 16px;
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.3px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .logo span {
      color: #0ea5e9; /* Sky 500 */
    }

    .subtitle {
      font-size: 11px;
      color: #71717a; /* Zinc 500 */
      border-left: 1px solid #3f3f46; /* Zinc 700 */
      padding-left: 16px;
    }

    .spacer {
      flex: 1;
    }

    /* Toolbar controls on the right side of header */
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .toolbar-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 6px;
      border: 1px solid #3f3f46; /* Zinc 700 */
      background: #27272a; /* Zinc 800 */
      color: #a1a1aa; /* Zinc 400 */
      font-size: 11px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.1s ease;
      white-space: nowrap;
    }

    .toolbar-btn:hover {
      background: #3f3f46;
      color: #fafafa;
      border-color: #52525b; /* Zinc 600 */
    }

    .toolbar-btn.active {
      background: #0284c7; /* Sky 600 */
      color: #ffffff;
      border-color: #0284c7;
    }

    .toolbar-btn .icon {
      font-size: 13px;
    }

    .toolbar-divider {
      width: 1px;
      height: 20px;
      background: #3f3f46;
    }

    .toolbar-btn.danger:hover {
      background: #ef4444; /* Red 500 */
      color: #ffffff;
      border-color: #ef4444;
    }

    .main {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    component-sidebar {
      width: 240px;
      flex-shrink: 0;
    }

    .canvas-wrapper {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    circuit-canvas {
      width: 100%;
      height: 100%;
    }

    validation-bar {
      /* positioned absolute inside canvas-wrapper */
    }
  `;

    constructor() {
        super();
        this._antiOverlap = store.antiOverlap;
        this._storeHandler = () => {
            this._antiOverlap = store.antiOverlap;
        };
    }

    connectedCallback() {
        super.connectedCallback();
        store.addEventListener('change', this._storeHandler);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        store.removeEventListener('change', this._storeHandler);
    }

    _toggleAntiOverlap() {
        store.toggleAntiOverlap();
    }

    _clearProject() {
        if (confirm('Clear all components and wires? This cannot be undone.')) {
            store.clearProject();
        }
    }

    _undoAction() { store.undo(); }
    _redoAction() { store.redo(); }
    _cleanupWires() { store.cleanupWires(); }
    _resetWires() { store.resetWireRouting(); }

    render() {
        return html `
      <div class="header">
        <div class="logo">Circuit<span>Sense</span></div>
        <div class="subtitle">Intelligent Arduino Circuit Builder</div>
        <div class="spacer"></div>
        <div class="toolbar">
          <button class="toolbar-btn" @click=${this._undoAction} title="Undo (Ctrl+Z)">
            <span class="icon">↩</span>
          </button>
          <button class="toolbar-btn" @click=${this._redoAction} title="Redo (Ctrl+Y)">
            <span class="icon">↪</span>
          </button>
          <div class="toolbar-divider"></div>
          <button class="toolbar-btn" @click=${this._cleanupWires} title="Auto-route wires around components">
            <span class="icon">🔧</span>
            Clean wires
          </button>
          <button class="toolbar-btn" @click=${this._resetWires} title="Reset all wires to default routing">
            <span class="icon">↺</span>
          </button>
          <div class="toolbar-divider"></div>
          <button
            class="toolbar-btn ${this._antiOverlap ? 'active' : ''}"
            @click=${this._toggleAntiOverlap}
            title="Toggle anti-overlap: components won't stack on each other"
          >
            <span class="icon">${this._antiOverlap ? '🔒' : '🔓'}</span>
            Anti-overlap
          </button>
          <div class="toolbar-divider"></div>
          <button class="toolbar-btn danger" @click=${this._clearProject} title="Clear all">
            <span class="icon">🗑</span>
          </button>
        </div>
      </div>
      <div class="main">
        <component-sidebar></component-sidebar>
        <div class="canvas-wrapper">
          <circuit-canvas></circuit-canvas>
          <validation-bar></validation-bar>
        </div>
      </div>
    `;
    }
}

customElements.define('circuit-app', CircuitApp);
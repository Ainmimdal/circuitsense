import { LitElement, html, css } from 'lit';
import { store } from './store.js';

class CircuitApp extends LitElement {
    static properties = {
        _antiOverlap: { state: true },
        _aiOpen: { state: true },
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
      background: #18181b;
      border-bottom: 1px solid #27272a;
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
      color: #0ea5e9;
    }

    .subtitle {
      font-size: 11px;
      color: #71717a;
      border-left: 1px solid #3f3f46;
      padding-left: 16px;
    }

    .spacer {
      flex: 1;
    }

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
      border: 1px solid #3f3f46;
      background: #27272a;
      color: #a1a1aa;
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
      border-color: #52525b;
    }

    .toolbar-btn.active {
      background: #0284c7;
      color: #ffffff;
      border-color: #0284c7;
    }

    .toolbar-btn.ai-active {
      background: #6366f1;
      color: #ffffff;
      border-color: #6366f1;
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
      background: #ef4444;
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
      transition: margin-right 0.2s ease;
    }

    .canvas-wrapper.ai-open {
      margin-right: 380px;
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
        this._aiOpen = false;
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

    _toggleAi() {
        const panel = this.shadowRoot.querySelector('ai-assistant');
        if (panel) {
            panel.toggle();
            this._aiOpen = !this._aiOpen;
        }
    }

    render() {
        return html `
      <div class="header">
        <div class="logo">El<span>era</span></div>
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
          <div class="toolbar-divider"></div>
          <button
            class="toolbar-btn ${this._aiOpen ? 'ai-active' : ''}"
            @click=${this._toggleAi}
            title="Toggle AI Assistant"
          >
            <span class="icon">✨</span>
            Elera AI
          </button>
        </div>
      </div>
      <div class="main">
        <component-sidebar></component-sidebar>
        <div class="canvas-wrapper ${this._aiOpen ? 'ai-open' : ''}">
          <circuit-canvas></circuit-canvas>
          <validation-bar></validation-bar>
        </div>
      </div>
      <ai-assistant></ai-assistant>
    `;
    }
}

customElements.define('circuit-app', CircuitApp);
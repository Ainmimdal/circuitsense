import { LitElement, html, css } from 'lit';
import { store } from './store.js';
import { autoWireAll, autoLayoutAll } from './services/auto-wire-engine.js';

class CircuitApp extends LitElement {
    static properties = {
        _antiOverlap: { state: true },
        _fanOut: { state: true },
        _gridSize: { state: true },
        _aiOpen: { state: true },
        _sharpCorners: { state: true },
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

    .grid-size-select {
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid #3f3f46;
      background: #27272a;
      color: #a1a1aa;
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
    }

    .grid-size-select:hover {
      border-color: #52525b;
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
        this._fanOut = store.fanOut;
        this._gridSize = store.gridSize;
        this._aiOpen = false;
        this._sharpCorners = store.sharpCorners;
        this._storeHandler = () => {
            this._antiOverlap = store.antiOverlap;
            this._fanOut = store.fanOut;
            this._gridSize = store.gridSize;
            this._sharpCorners = store.sharpCorners;
        };
    }

    connectedCallback() {
        super.connectedCallback();
        store.addEventListener('change', this._storeHandler);
        
        this._keydownHandler = (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (document.activeElement.tagName === 'INPUT') return;
                store.deleteSelected();
            }
            if (e.key === 'r' || e.key === 'R') {
                if (document.activeElement.tagName === 'INPUT') return;
                if (store.selectedInstanceIds.size > 0) {
                    const id = [...store.selectedInstanceIds][0];
                    store.rotateInstance(id);
                }
            }
        };
        window.addEventListener('keydown', this._keydownHandler);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        store.removeEventListener('change', this._storeHandler);
        window.removeEventListener('keydown', this._keydownHandler);
    }

    _toggleAntiOverlap() {
        store.toggleAntiOverlap();
    }

    _toggleFanOut() {
        store.toggleFanOut();
    }

    _toggleSharpCorners() {
        store.toggleSharpCorners();
    }

    _setGridSize(size) {
        store.setGridSize(size);
    }

    _clearProject() {
        if (confirm('Clear all components and wires? This cannot be undone.')) {
            store.clearProject();
        }
    }

    _undoAction() { store.undo(); }
    _redoAction() { store.redo(); }
    async _cleanupWires() {
        const result = await store.cleanupWires();
        // routeAll() now returns { routed, failed, errors }
        if (result && result.routed !== undefined) {
            if (result.failed > 0) {
                alert(`Routed ${result.routed} wires, ${result.failed} failed.\n${result.errors.slice(0, 3).join('\n')}`);
            }
        }
    }
    _resetWires() { store.resetWireRouting(); }

    _autoLayoutAll() {
        const result = autoWireAll();
        if (result.total === 0) {
            alert('No components to layout. Add components with pins first.');
            return;
        }
        
        // autoWireAll may have just inserted helper components (like resistors).
        // We must wait until their <placed-component> DOM elements have mounted 
        // and registered their exact SVG pin coordinates before computing layout.
        const waitAndLayout = () => {
            const allReady = store.instances.every(inst => store.pinInfoMap.has(inst.id));
            if (allReady) {
                autoLayoutAll();
            } else {
                requestAnimationFrame(waitAndLayout);
            }
        };
        waitAndLayout();
    }

    _autoWireAll() {
        const result = autoWireAll();
        if (result.total === 0) {
            alert('No components to auto-wire. Add components with pins first.');
            return;
        }
        const msg = [
            `Auto-wired ${result.success} pins across ${result.total} components.`,
            result.errors.length > 0 ? `${result.errors.length} errors.` : '',
        ].filter(Boolean).join(' ');
        alert(msg);
    }

    _toggleAi() {
        const panel = this.shadowRoot.querySelector('ai-assistant');
        if (panel) {
            panel.toggle();
            this._aiOpen = !this._aiOpen;
        }
    }

    _exportProject() {
        const dataStr = store.exportProject();
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = 'circuit-project.json';

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    }

    _importProject() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = event => {
                const success = store.importProject(event.target.result);
                if (!success) {
                    alert('Failed to load project file. It may be corrupted or invalid.');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    _loginDummy() {
        alert("Login functionality is coming soon! (Google Auth setup planned)");
    }

    _openProjects() {
        const modal = this.shadowRoot.querySelector('projects-modal');
        if (modal) {
            modal.open = true;
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
          <button class="toolbar-btn" @click=${this._exportProject} title="Export Project to File">
            <span class="icon">💾</span>
            Export
          </button>
          <button class="toolbar-btn" @click=${this._importProject} title="Import Project from File">
            <span class="icon">📂</span>
            Import
          </button>
          <div class="toolbar-divider"></div>
          <button class="toolbar-btn" @click=${this._cleanupWires} title="Auto-route wires around components">
            <span class="icon">🔧</span>
            Clean wires
          </button>
          <button class="toolbar-btn" @click=${this._resetWires} title="Reset all wires to default routing">
            <span class="icon">↺</span>
          </button>
          <button class="toolbar-btn" @click=${this._autoWireAll} title="Auto-wire all components to Arduino">
            <span class="icon">⚡</span>
            Auto-wire all
          </button>
          <button class="toolbar-btn" @click=${this._autoLayoutAll} title="Auto-layout and wire all components">
            <span class="icon">🪄</span>
            Auto-layout
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
          <button
            class="toolbar-btn ${this._fanOut ? 'active' : ''}"
            @click=${this._toggleFanOut}
            title="Toggle wire fan-out: wires spread cleanly from header rows"
          >
            <span class="icon">📐</span>
            Fan-out
          </button>
          <button
            class="toolbar-btn ${this._sharpCorners ? 'active' : ''}"
            @click=${this._toggleSharpCorners}
            title="Toggle sharp wire corners (no rounding)"
          >
            <span class="icon">📏</span>
            Sharp
          </button>
          <div class="toolbar-divider"></div>
          <select class="grid-size-select"
            @change=${(e) => this._setGridSize(parseInt(e.target.value))}
            .value="${this._gridSize}"
            title="Grid snap size"
          >
            <option value="10">Grid 10px</option>
            <option value="20">Grid 20px</option>
            <option value="50">Grid 50px</option>
          </select>
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
          <div class="toolbar-divider"></div>
          <button class="toolbar-btn" @click=${this._openProjects} title="My Projects">
            <span class="icon">📁</span>
            My Projects
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
      <projects-modal></projects-modal>
    `;
    }
}

customElements.define('circuit-app', CircuitApp);
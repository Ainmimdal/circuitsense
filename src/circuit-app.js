import { LitElement, html, css } from 'lit';
import { store } from './store.js';
import { autoWireAll, autoLayoutAll } from './services/auto-wire-engine.js';
import { faIcon } from './utils/fa-icons.js';
import './components/component-builder-modal.js';
import './components/login-modal.js';

const MOCK_USER_STORAGE_KEY = 'elera_mock_user';
const ELERA_LOGO_URL = new URL('../diagram images/eleraLogo.svg', import.meta.url).href;

class CircuitApp extends LitElement {
    static properties = {
        _antiOverlap: { state: true },
        _fanOut: { state: true },
        _gridSize: { state: true },
        _aiOpen: { state: true },
        _sharpCorners: { state: true },
        _builderOpen: { state: true },
        _loginOpen: { state: true },
        _mockUser: { state: true },
        _settingsInitialTab: { state: true },
        _manualWireMode: { state: true },
        _manualWireSnap: { state: true },
    };

    static styles = css `
    :host {
      display: flex;
      flex-direction: column;
      width: 100vw;
      height: 100vh;
    }

    .header {
      min-height: 52px;
      background: #18181b;
      border-bottom: 1px solid #27272a;
      display: flex;
      align-items: center;
      padding: 0 12px 0 16px;
      flex-shrink: 0;
      gap: 12px;
      overflow: hidden;
    }

    .logo {
      font-size: 18px;
      font-weight: 700;
      color: #43a5ca;
      letter-spacing: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
      text-transform: lowercase;
    }

    .logo-mark {
      width: 28px;
      height: 28px;
      display: block;
      flex: 0 0 auto;
    }

    .subtitle {
      font-size: 11px;
      color: #71717a;
      border-left: 1px solid #3f3f46;
      padding-left: 12px;
      white-space: nowrap;
      flex: 0 1 auto;
    }

    .spacer {
      flex: 1;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: none;
      padding-bottom: 1px;
    }

    .toolbar::-webkit-scrollbar {
      display: none;
    }

    .toolbar-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 34px;
      height: 34px;
      padding: 0 10px;
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
      justify-content: center;
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
      height: 34px;
      padding: 0 8px;
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
      font-size: 14px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .toolbar-divider {
      width: 1px;
      height: 20px;
      background: #3f3f46;
      flex: 0 0 auto;
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
      width: 260px;
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

    @media (max-width: 1380px) {
      .subtitle {
        display: none;
      }
    }

    @media (max-width: 1050px) {
      .toolbar-btn {
        width: 34px;
        padding: 0;
        gap: 0;
        font-size: 0;
      }

      .toolbar-btn .icon {
        font-size: 15px;
      }

      .grid-size-select {
        width: 78px;
        font-size: 10px;
      }
    }

    @media (max-width: 900px) {
      .header {
        padding-left: 10px;
        gap: 8px;
      }

      .logo {
        font-size: 16px;
      }

      .logo-mark {
        width: 24px;
        height: 24px;
      }

      component-sidebar {
        width: 220px;
      }
    }
  `;

    constructor() {
        super();
        this._antiOverlap = store.antiOverlap;
        this._fanOut = store.fanOut;
        this._gridSize = store.gridSize;
        this._aiOpen = false;
        this._sharpCorners = store.sharpCorners;
        this._builderOpen = false;
        this._loginOpen = false;
        this._mockUser = this._loadMockUser();
        this._settingsInitialTab = 'account';
        this._manualWireMode = store.manualWireMode;
        this._manualWireSnap = store.manualWireSnap;
        this._storeHandler = () => {
            this._antiOverlap = store.antiOverlap;
            this._fanOut = store.fanOut;
            this._gridSize = store.gridSize;
            this._sharpCorners = store.sharpCorners;
            this._manualWireMode = store.manualWireMode;
            this._manualWireSnap = store.manualWireSnap;
        };
    }

    connectedCallback() {
        super.connectedCallback();
        store.addEventListener('change', this._storeHandler);
        
        this._keydownHandler = (e) => {
            if (store.wiringState) return;
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

    _toggleManualWireMode() {
        store.toggleManualWireMode();
    }

    _toggleManualWireSnap() {
        store.toggleManualWireSnap();
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
    _saveProject() { store._saveToStorage(); }
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
        const historyBatch = store.beginHistoryBatch();
        const result = autoWireAll();
        if (result.total === 0) {
            alert('No components to layout. Add components with pins first.');
            return;
        }
        
        // autoWireAll may have just inserted helper components (like resistors).
        // We must wait until their <placed-component> DOM elements have mounted 
        // and registered their exact SVG pin coordinates before computing layout.
        const waitAndLayout = async () => {
            const allReady = store.instances.every(inst => store.pinInfoMap.has(inst.id));
            if (allReady) {
                try {
                    await autoLayoutAll();
                } catch (error) {
                    console.error('[CircuitSense] Auto layout failed:', error);
                } finally {
                    store.squashHistorySince(historyBatch);
                }
            } else {
                requestAnimationFrame(waitAndLayout);
            }
        };
        waitAndLayout();
    }

    _autoWireAll() {
        const historyBatch = store.beginHistoryBatch();
        const result = autoWireAll();
        if (result.total === 0) {
            alert('No components to auto-wire. Add components with pins first.');
            return;
        }
        store.squashHistorySince(historyBatch);
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

    _loadMockUser() {
        try {
            return JSON.parse(localStorage.getItem(MOCK_USER_STORAGE_KEY)) || null;
        } catch {
            return null;
        }
    }

    _openLogin(tab = 'account') {
        this._settingsInitialTab = typeof tab === 'string' ? tab : 'account';
        this._loginOpen = true;
    }

    _openAiSettings() {
        this._openLogin('keys');
    }

    _closeLogin() {
        this._loginOpen = false;
    }

    _handleLogin(e) {
        this._mockUser = e.detail.user;
        localStorage.setItem(MOCK_USER_STORAGE_KEY, JSON.stringify(this._mockUser));
        this._loginOpen = false;
    }

    _handleLogout() {
        this._mockUser = null;
        localStorage.removeItem(MOCK_USER_STORAGE_KEY);
        this._loginOpen = false;
    }

    _openProjects() {
        const modal = this.shadowRoot.querySelector('projects-modal');
        if (modal) {
            modal.open = true;
        }
    }

    _openBuilder() {
        this._builderOpen = true;
    }

    _closeBuilder() {
        this._builderOpen = false;
    }

    render() {
        return html `
      <div class="header">
        <div class="logo">
          <img class="logo-mark" src=${ELERA_LOGO_URL} alt="" />
          <span>elera</span>
        </div>
        <div class="subtitle">Intelligent Arduino Circuit Builder</div>
        <div class="spacer"></div>
        <div class="toolbar">
          <button class="toolbar-btn" @click=${this._undoAction} title="Undo (Ctrl+Z)">
            <span class="icon">${faIcon('undo')}</span>
          </button>
          <button class="toolbar-btn" @click=${this._redoAction} title="Redo (Ctrl+Y)">
            <span class="icon">${faIcon('redo')}</span>
          </button>
          <div class="toolbar-divider"></div>
          <button class="toolbar-btn" @click=${this._saveProject} title="Save project locally">
            <span class="icon">${faIcon('save')}</span>
            Save
          </button>
          <button class="toolbar-btn" @click=${this._exportProject} title="Export Project to File">
            <span class="icon">${faIcon('download')}</span>
            Export
          </button>
          <button class="toolbar-btn" @click=${this._importProject} title="Import Project from File">
            <span class="icon">${faIcon('folderOpen')}</span>
            Import
          </button>
          <div class="toolbar-divider"></div>
          <button class="toolbar-btn" @click=${this._cleanupWires} title="Auto-route wires around components">
            <span class="icon">${faIcon('wrench')}</span>
            Clean
          </button>
          <button class="toolbar-btn" @click=${this._resetWires} title="Reset all wires to default routing">
            <span class="icon">${faIcon('rotateLeft')}</span>
          </button>
          <button class="toolbar-btn" @click=${this._autoWireAll} title="Auto-wire all components to Arduino">
            <span class="icon">${faIcon('bolt')}</span>
            Wire
          </button>
          <button class="toolbar-btn" @click=${this._autoLayoutAll} title="Auto-layout and wire all components">
            <span class="icon">${faIcon('wand')}</span>
            Layout
          </button>
          <div class="toolbar-divider"></div>
          <button
            class="toolbar-btn ${this._antiOverlap ? 'active' : ''}"
            @click=${this._toggleAntiOverlap}
            title="Toggle anti-overlap: components won't stack on each other"
          >
            <span class="icon">${faIcon(this._antiOverlap ? 'lock' : 'unlock')}</span>
            Overlap
          </button>
          <button
            class="toolbar-btn ${this._fanOut ? 'active' : ''}"
            @click=${this._toggleFanOut}
            title="Toggle wire fan-out: wires spread cleanly from header rows"
          >
            <span class="icon">${faIcon('shareNodes')}</span>
            Fan
          </button>
          <button
            class="toolbar-btn ${this._sharpCorners ? 'active' : ''}"
            @click=${this._toggleSharpCorners}
            title="Toggle sharp wire corners (no rounding)"
          >
            <span class="icon">${faIcon('ruler')}</span>
            Sharp
          </button>
          <button
            class="toolbar-btn ${this._manualWireMode === 'orthogonal' ? 'active' : ''}"
            @click=${this._toggleManualWireMode}
            title="Manual wire mode: ${this._manualWireMode === 'orthogonal' ? 'Orthogonal' : 'Freestyle'}"
          >
            <span class="icon">${faIcon(this._manualWireMode === 'orthogonal' ? 'ruler' : 'shuffle')}</span>
            ${this._manualWireMode === 'orthogonal' ? 'Ortho' : 'Free'}
          </button>
          <button
            class="toolbar-btn ${this._manualWireSnap ? 'active' : ''}"
            @click=${this._toggleManualWireSnap}
            title="Toggle manual wire grid snapping"
          >
            <span class="icon">${faIcon('thumbtack')}</span>
            Snap
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
            <span class="icon">${faIcon('trash')}</span>
          </button>
          <div class="toolbar-divider"></div>
          <button
            class="toolbar-btn ${this._aiOpen ? 'ai-active' : ''}"
            @click=${this._toggleAi}
            title="Toggle AI Assistant"
          >
            <span class="icon">${faIcon('wand')}</span>
            AI
          </button>
          <div class="toolbar-divider"></div>
          <button class="toolbar-btn" @click=${this._openProjects} title="My Projects">
            <span class="icon">${faIcon('folder')}</span>
            Projects
          </button>
          <button
            class="toolbar-btn ${this._mockUser ? 'active' : ''}"
            @click=${this._openLogin}
            title=${this._mockUser ? this._mockUser.name : 'Sign in'}
          >
            <span class="icon">${faIcon(this._mockUser ? 'user' : 'rightToBracket')}</span>
            ${this._mockUser ? this._mockUser.name.split(/\s+/)[0] : 'Login'}
          </button>
        </div>
      </div>
      <div class="main">
        <component-sidebar @open-component-builder=${this._openBuilder}></component-sidebar>
        <div class="canvas-wrapper ${this._aiOpen ? 'ai-open' : ''}">
          <circuit-canvas></circuit-canvas>
          <validation-bar></validation-bar>
        </div>
      </div>
      <ai-assistant @open-ai-settings=${this._openAiSettings}></ai-assistant>
      <projects-modal></projects-modal>
      <login-modal
        .open=${this._loginOpen}
        .user=${this._mockUser}
        .initialTab=${this._settingsInitialTab}
        @close=${this._closeLogin}
        @login-success=${this._handleLogin}
        @logout=${this._handleLogout}
      ></login-modal>
      <component-builder-modal
        .open=${this._builderOpen}
        @close=${this._closeBuilder}
        @component-created=${this._closeBuilder}
      ></component-builder-modal>
    `;
    }
}

customElements.define('circuit-app', CircuitApp);

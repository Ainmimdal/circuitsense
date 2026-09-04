import { LitElement, html, css } from 'lit';
import { physicalCircuitStore } from './physical/circuit-store.js';
import { autoLayoutPhysicalStore, autoWirePhysicalStore } from './physical/automation.js';
import { faIcon } from './utils/fa-icons.js';
import './components/component-builder-modal.js';
import './components/login-modal.js';

const MOCK_USER_STORAGE_KEY = 'elera_mock_user';
const ELERA_LOGO_URL = new URL('../diagram images/eleraLogo.svg', import.meta.url).href;

class CircuitApp extends LitElement {
    static properties = {
        _aiOpen: { state: true },
        _builderOpen: { state: true },
        _builderComponentId: { state: true },
        _loginOpen: { state: true },
        _mockUser: { state: true },
        _settingsInitialTab: { state: true },
        _manualWireMode: { state: true },
        _manualWireSnap: { state: true },
        _libraryOpen: { state: true },
    };

    static styles = css `
      :host {
        display: flex;
        flex-direction: column;
        width: 100vw;
        height: 100vh;
        color: var(--text);
        background: var(--ink);
      }

      .header {
        min-height: 56px;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 12px 0 15px;
        flex: 0 0 auto;
        overflow: visible;
        background: var(--panel);
        border-bottom: 1px solid var(--panel-border);
        box-shadow: inset 0 -3px 0 var(--ink);
      }

      .brand-lockup { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
      .logo {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--text);
        font-size: 18px;
        font-weight: 700;
        letter-spacing: -.5px;
      }
      .logo-mark { width: 27px; height: 27px; display: block; filter: grayscale(1) contrast(.85) brightness(1.35); }
      .subtitle {
        max-width: 150px;
        padding-left: 10px;
        border-left: 1px solid var(--panel-border);
        color: var(--text-muted);
        font-size: 10px;
        line-height: 1.2;
      }
      .spacer { flex: 1 1 auto; min-width: 12px; }

      .toolbar { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 0 1 auto; }
      .tool-cluster, .mode-group, .account-cluster { display: flex; align-items: center; gap: 4px; }
      .tool-cluster {
        padding-right: 6px;
        border-right: 1px solid var(--panel-border);
      }

      .account-cluster {
        flex: 0 0 auto;
        padding-left: 10px;
        border-left: 1px solid var(--panel-border);
      }

      .toolbar-btn, .mode-overflow summary, .action-overflow summary, .library-rail {
        min-width: 34px;
        height: 34px;
        box-sizing: border-box;
        border: 1px solid var(--panel-border);
        border-radius: 4px;
        color: var(--text);
        background: var(--panel);
        font: 600 10px/1 var(--font-ui, 'Public Sans', sans-serif);
        cursor: pointer;
      }
      .toolbar-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 0 14px;
        white-space: nowrap;
        border-radius: 4px;
      }
      .toolbar-btn.icon-only { width: 34px; min-width: 34px; padding: 0; }
      .toolbar-btn:hover, .mode-overflow summary:hover, .action-overflow summary:hover {
        color: var(--text);
        border-color: var(--primary-hover);
        background: var(--primary);
      }
      .toolbar-btn .icon { display: inline-flex; align-items: center; justify-content: center; font-size: 16px; }
      .btn-action { background: transparent; border-color: var(--panel-border); color: var(--text); }
      .btn-action:hover { background: var(--primary); border-color: var(--primary-hover); color: var(--text); }
      .btn-action:active { transform: translateY(1px); }
      .btn-toggle { background: transparent; border-color: var(--panel-border); color: var(--text-muted); }
      .btn-toggle:hover { background: var(--primary); border-color: var(--primary-hover); color: var(--text); }
      .btn-toggle.active {
        color: var(--accent-boards);
        border-color: var(--accent-boards);
        border-bottom: 2px solid var(--accent-boards);
        background: var(--panel);
      }
      .btn-toggle.active:hover {
        color: var(--accent-boards);
        border-color: var(--accent-boards);
        border-bottom-color: var(--accent-boards);
        background: var(--panel);
      }
      .toolbar-btn.ai-active { color: var(--text); border-color: var(--primary-hover); background: var(--primary); }
      .toolbar-btn.ai-active:hover { background: var(--primary-hover); }
      .toolbar-btn.danger:hover { color: var(--accent-ics); border-color: var(--accent-ics); background: transparent; }
      .mode-overflow, .action-overflow { display: none; position: relative; }
      .mode-overflow summary, .action-overflow summary { display: flex; align-items: center; gap: 7px; padding: 0 14px; list-style: none; }
      .mode-overflow summary::-webkit-details-marker, .action-overflow summary::-webkit-details-marker { display: none; }
      .mode-overflow[open] summary, .action-overflow[open] summary { color: var(--text); border-color: var(--panel-border); }
      .mode-popover {
        position: absolute;
        z-index: 500;
        top: 39px;
        right: 0;
        width: 196px;
        padding: 8px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 4px;
        box-shadow: 0 12px 32px color-mix(in srgb, var(--ink) 75%, transparent);
      }
      .mode-popover .toolbar-btn { width: 100%; }
      .action-popover { grid-template-columns: 1fr; }
      .action-popover .toolbar-btn { width: 100%; justify-content: flex-start; font-size: 10px; padding-inline: 14px; }

      .avatar {
        width: 34px;
        height: 34px;
        display: inline-grid;
        place-items: center;
        padding: 0;
        color: var(--text);
        background: transparent;
        border: 1px solid var(--panel-border);
        border-radius: 4px;
        font: 700 10px/1 var(--font-ui, 'Public Sans', sans-serif);
        cursor: pointer;
      }
      .avatar:hover { background: var(--primary); border-color: var(--primary-hover); }

      .main { position: relative; display: flex; flex: 1; min-height: 0; overflow: hidden; }
      .sidebar-shell { width: 276px; flex: 0 0 276px; min-width: 0; z-index: 40; }
      component-sidebar { width: 100%; height: 100%; }
      .canvas-wrapper { position: relative; flex: 1; min-width: 0; overflow: hidden; transition: margin-right .2s ease; }
      .canvas-wrapper.ai-open { margin-right: 380px; }
      circuit-canvas { width: 100%; height: 100%; }
      .library-rail, .sidebar-scrim { display: none; }

      @media (max-width: 1540px) {
        .subtitle { display: none; }
        .tool-cluster.secondary { display: none; }
        .mode-group { display: none; }
        .mode-overflow, .action-overflow { display: block; }
      }

      @media (max-width: 1180px) {
        .tool-cluster.circuit-actions,
        .tool-cluster.workspace { display: none; }
      }

      @media (max-width: 900px) {
        .header { min-height: 52px; padding: 0 8px; gap: 8px; }
        .logo span { display: none; }
        .logo-mark { width: 25px; height: 25px; }
        .toolbar { flex: 0 1 auto; }
        .tool-cluster.history .toolbar-btn:not(.icon-only) { display: none; }
        .account-cluster .projects-btn { display: none; }
        .canvas-wrapper.ai-open { margin-right: 0; }
        .sidebar-shell {
          position: absolute;
          inset: 0 auto 0 0;
          width: min(310px, 86vw);
          z-index: 420;
          transform: translateX(-102%);
          transition: transform .2s ease;
          box-shadow: 18px 0 40px color-mix(in srgb, var(--ink) 72%, transparent);
        }
        .sidebar-shell.open { transform: translateX(0); }
        .sidebar-scrim {
          display: block;
          position: absolute;
          inset: 0;
          z-index: 410;
          border: 0;
          background: color-mix(in srgb, var(--ink) 62%, transparent);
          opacity: 0;
          pointer-events: none;
          transition: opacity .2s ease;
        }
        .sidebar-scrim.open { opacity: 1; pointer-events: auto; }
        .library-rail {
          display: inline-flex;
          position: absolute;
          z-index: 80;
          top: 12px;
          left: 10px;
          width: 34px;
          height: 34px;
          align-items: center;
          justify-content: center;
          background: var(--panel);
          color: var(--text);
          border-color: var(--panel-border);
          border-radius: 4px;
        }
      }

      @media (pointer: coarse) {
        .toolbar-btn, .mode-overflow summary, .action-overflow summary { height: 34px; }
        .mode-popover { top: 41px; }
      }

      @media (max-width: 650px) {
        .action-overflow { display: block; }
      }
    `;

    constructor() {
        super();
        this._aiOpen = false;
        this._builderOpen = false;
        this._loginOpen = false;
        this._mockUser = this._loadMockUser();
        this._settingsInitialTab = 'account';
        this._manualWireMode = physicalCircuitStore.manualWireMode;
        this._manualWireSnap = physicalCircuitStore.manualWireSnap;
        this._libraryOpen = false;
        this._builderComponentId = null;
        this._aiSettingsHandler = () => this._openLogin('keys');
        this._settingsHandler = () => {
            this._manualWireMode = physicalCircuitStore.manualWireMode;
            this._manualWireSnap = physicalCircuitStore.manualWireSnap;
        };
    }

    connectedCallback() {
        super.connectedCallback();
        physicalCircuitStore.addEventListener('settings-change', this._settingsHandler);
        window.addEventListener('elera-open-ai-settings', this._aiSettingsHandler);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        physicalCircuitStore.removeEventListener('settings-change', this._settingsHandler);
        window.removeEventListener('elera-open-ai-settings', this._aiSettingsHandler);
    }

    _toggleManualWireMode() {
        this._manualWireMode = physicalCircuitStore.toggleManualWireMode();
    }

    _toggleManualWireSnap() {
        this._manualWireSnap = physicalCircuitStore.toggleManualWireSnap();
    }

    _clearProject() {
        if (confirm('Clear all components and wires? This cannot be undone.')) {
            physicalCircuitStore.clear();
        }
    }

    _undoAction() { physicalCircuitStore.undo(); }
    _redoAction() { physicalCircuitStore.redo(); }
    _saveProject() { physicalCircuitStore.save(); }
    async _cleanupWires() {
        physicalCircuitStore.transaction('clean-wire-routes', project => {
            for (const wire of project.wires) wire.route = { mode: 'auto', waypoints: [] };
        });
        await physicalCircuitStore.whenRoutesSettled();
    }
    _resetWires() {
        physicalCircuitStore.transaction('reset-wire-routes', project => {
            for (const wire of project.wires) wire.route = { mode: 'auto', waypoints: [] };
        });
    }

    async _autoLayoutAll() {
        if (this._layoutInProgress) return;
        this._layoutInProgress = true;
        try {
            const result = autoLayoutPhysicalStore(physicalCircuitStore);
            if (result.status !== 'success') alert(`Auto Layout could not finish: ${result.errors?.[0] || 'check the circuit components'}`);
            else await physicalCircuitStore.whenRoutesSettled();
        } catch (error) {
            console.error('[CircuitSense] Auto layout failed:', error);
        } finally {
            this._layoutInProgress = false;
        }
    }

    async _autoWireAll() {
        const result = autoWirePhysicalStore(physicalCircuitStore);
        if (result.total === 0) {
            alert('No components to auto-wire. Add components with pins first.');
            return;
        }
        if (result.status === 'failure') {
            alert(result.errors?.[0] === 'NO_ARDUINO'
                ? 'Add an Arduino or another supported controller before using Auto Wire.'
                : `Auto Wire could not finish: ${result.errors?.[0] || 'check the circuit'}`);
            return;
        }
        await physicalCircuitStore.whenRoutesSettled();
        const msg = [
            `Auto-wired ${result.success} connections across ${result.total} components without moving them.`,
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
        const dataStr = physicalCircuitStore.exportProject();
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
                try {
                    physicalCircuitStore.importProject(event.target.result);
                } catch {
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

    _openPreferences() {
        this._openLogin('preferences');
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

    _openBuilder(event) {
        this._builderComponentId = event?.detail?.componentId || null;
        this._builderOpen = true;
    }

    _closeBuilder() {
        this._builderOpen = false;
        this._builderComponentId = null;
    }

    _toggleLibrary() {
        this._libraryOpen = !this._libraryOpen;
    }

    _closeLibrary() {
        this._libraryOpen = false;
    }

    _runOverflowAction(event, action) {
        event.currentTarget.closest('details')?.removeAttribute('open');
        action.call(this);
    }

    _renderModeControls() {
        return html`
          <button class="toolbar-btn btn-toggle ${this._manualWireMode === 'orthogonal' ? 'active' : ''}"
            aria-pressed=${this._manualWireMode === 'orthogonal'} @click=${this._toggleManualWireMode}
            title="Manual wire mode: ${this._manualWireMode === 'orthogonal' ? 'Orthogonal' : 'Freestyle'}">
            <span class="icon">${faIcon(this._manualWireMode === 'orthogonal' ? 'ortho' : 'free')}</span>
            ${this._manualWireMode === 'orthogonal' ? 'Ortho' : 'Free'}
          </button>
          <button class="toolbar-btn btn-toggle ${this._manualWireSnap ? 'active' : ''}" aria-pressed=${this._manualWireSnap}
            @click=${this._toggleManualWireSnap} title="Snap manual routes to pin axes and pitch">
            <span class="icon">${faIcon('snap')}</span>Snap
          </button>
        `;
    }

    render() {
        return html `
      <header class="header">
        <div class="brand-lockup">
          <div class="logo"><img class="logo-mark" src=${ELERA_LOGO_URL} alt="" /><span>elera</span></div>
          <div class="subtitle">Arduino circuit design assistant</div>
        </div>
        <nav class="toolbar" aria-label="Editor tools">
          <div class="tool-cluster history" aria-label="History and project actions">
            <button class="toolbar-btn btn-action icon-only" @click=${this._undoAction} title="Undo (Ctrl+Z)" aria-label="Undo"><span class="icon">${faIcon('undo')}</span></button>
            <button class="toolbar-btn btn-action icon-only" @click=${this._redoAction} title="Redo (Ctrl+Y)" aria-label="Redo"><span class="icon">${faIcon('redo')}</span></button>
            <button class="toolbar-btn btn-action" @click=${this._saveProject} title="Save project"><span class="icon">${faIcon('save')}</span>Save</button>
          </div>
          <div class="tool-cluster secondary" aria-label="File actions">
            <button class="toolbar-btn btn-action" @click=${this._exportProject} title="Export project"><span class="icon">${faIcon('download')}</span>Export</button>
            <button class="toolbar-btn btn-action" @click=${this._importProject} title="Import project"><span class="icon">${faIcon('folderOpen')}</span>Import</button>
          </div>
          <div class="tool-cluster circuit-actions" aria-label="Circuit actions">
            <button class="toolbar-btn btn-action" @click=${this._cleanupWires} title="Clean wire routes"><span class="icon">${faIcon('wrench')}</span>Clean</button>
            <button class="toolbar-btn btn-action" @click=${this._resetWires} title="Return all wires to automatic routing"><span class="icon">${faIcon('rotateLeft')}</span>Reset wires</button>
            <button class="toolbar-btn btn-action" @click=${this._autoWireAll} title="Auto Wire"><span class="icon">${faIcon('bolt')}</span>Auto Wire</button>
            <button class="toolbar-btn btn-action" @click=${this._autoLayoutAll} title="Auto Layout"><span class="icon">${faIcon('wand')}</span>Auto Layout</button>
          </div>
          <div class="mode-group" aria-label="Persistent editor modes">${this._renderModeControls()}</div>
          <details class="mode-overflow">
            <summary>${faIcon('gear')} Modes</summary>
            <div class="mode-popover">${this._renderModeControls()}</div>
          </details>
          <details class="action-overflow">
            <summary>${faIcon('gear')} More</summary>
            <div class="mode-popover action-popover">
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._cleanupWires)}>${faIcon('wrench')} Clean wire routes</button>
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._autoWireAll)}>${faIcon('bolt')} Auto Wire</button>
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._autoLayoutAll)}>${faIcon('wand')} Auto Layout</button>
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._exportProject)}>${faIcon('download')} Export project</button>
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._importProject)}>${faIcon('folderOpen')} Import project</button>
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._resetWires)}>${faIcon('rotateLeft')} Reset wires</button>
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._toggleAi)}>${faIcon('wand')} AI assistant</button>
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._openProjects)}>${faIcon('folder')} Projects</button>
              <button class="toolbar-btn btn-action danger" @click=${event => this._runOverflowAction(event, this._clearProject)}>${faIcon('trash')} Clear circuit</button>
            </div>
          </details>
          <div class="tool-cluster workspace" aria-label="Workspace actions">
            <button class="toolbar-btn btn-action danger icon-only" @click=${this._clearProject} title="Delete all components" aria-label="Delete all components"><span class="icon">${faIcon('trash')}</span></button>
            <button class="toolbar-btn btn-action ${this._aiOpen ? 'ai-active' : ''}" @click=${this._toggleAi} title="AI assistant"><span class="icon">${faIcon('wand')}</span>AI</button>
          </div>
        </nav>
        <div class="spacer"></div>
        <div class="account-cluster" aria-label="Account controls">
          <button class="toolbar-btn btn-action projects-btn" @click=${this._openProjects} title="Projects"><span class="icon">${faIcon('folder')}</span>Projects</button>
          <button class="toolbar-btn btn-action icon-only" @click=${this._openPreferences} title="Preferences" aria-label="Preferences"><span class="icon">${faIcon('gear')}</span></button>
          <button class="avatar" @click=${this._openLogin} title=${this._mockUser ? this._mockUser.name : 'Account'} aria-label=${this._mockUser ? `Account: ${this._mockUser.name}` : 'Open account'}>
            ${this._mockUser
              ? this._mockUser.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
              : faIcon('user')}
          </button>
        </div>
      </header>
      <main class="main">
        <button class="library-rail" @click=${this._toggleLibrary} title="Open component library" aria-label="Open component library">${faIcon('plug')}</button>
        <button class="sidebar-scrim ${this._libraryOpen ? 'open' : ''}" @click=${this._closeLibrary} aria-label="Close component library"></button>
        <div class="sidebar-shell ${this._libraryOpen ? 'open' : ''}">
          <component-sidebar @open-component-builder=${this._openBuilder} @component-chosen=${this._closeLibrary}></component-sidebar>
        </div>
        <div class="canvas-wrapper ${this._aiOpen ? 'ai-open' : ''}">
          <circuit-canvas @edit-component-definition=${this._openBuilder}></circuit-canvas>
          <validation-bar></validation-bar>
        </div>
      </main>
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
        .componentId=${this._builderComponentId}
        @close=${this._closeBuilder}
        @component-created=${this._closeBuilder}
        @component-updated=${this._closeBuilder}
      ></component-builder-modal>
    `;
    }
}

customElements.define('circuit-app', CircuitApp);

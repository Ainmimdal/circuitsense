import { LitElement, html, css } from 'lit';
import { physicalCircuitStore } from './physical/circuit-store.js';
import { autoLayoutPhysicalStore, autoWirePhysicalStore } from './physical/automation.js';
import { accountService } from './persistence/account.js';
import { projectLibrary } from './persistence/project-library.js';
import { faIcon } from './utils/fa-icons.js';
import { confirmDialog, showToast } from './components/app-dialogs.js';
import { getLesson } from './lessons/catalog.js';
import './components/component-builder-modal.js';
import './components/login-modal.js';
import './components/lessons-modal.js';
import { buildGoalProject } from './lessons/goal-build.js';
import { billOfMaterials } from './components/lesson-guide.js';
import { decodeShareHash, encodeShareHash, MAX_SHARE_LINK_LENGTH, publishedProjectId } from './persistence/share-link.js';
import './components/code-panel.js';

const COMPLETED_LESSONS_KEY = 'elera_completed_lessons';

function loadCompletedLessons() {
    try {
        return JSON.parse(localStorage.getItem(COMPLETED_LESSONS_KEY) || '[]');
    } catch {
        return [];
    }
}

const ELERA_LOGO_URL = new URL('../diagram images/eleraLogo.svg', import.meta.url).href;

class CircuitApp extends LitElement {
    static properties = {
        _aiOpen: { state: true },
        _builderOpen: { state: true },
        _builderComponentId: { state: true },
        _loginOpen: { state: true },
        _user: { state: true },
        _syncStatus: { state: true },
        _authError: { state: true },
        _saveLabel: { state: true },
        _currentProjectName: { state: true },
        _settingsInitialTab: { state: true },
        _manualWireMode: { state: true },
        _manualWireSnap: { state: true },
        _libraryOpen: { state: true },
        _lessonsOpen: { state: true },
        _codeOpen: { state: true },
        _guideSession: { state: true },
        _completedLessons: { state: true },
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
      .avatar { overflow: hidden; }
      .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

      .main { position: relative; display: flex; flex: 1; min-height: 0; overflow: hidden; }
      .sidebar-shell { width: 276px; flex: 0 0 276px; min-width: 0; z-index: 40; }
      component-sidebar { width: 100%; height: 100%; }
      .canvas-wrapper { position: relative; flex: 1; min-width: 0; overflow: hidden; transition: margin-right .2s ease; display: flex; flex-direction: column; }
      .canvas-area { position: relative; flex: 1; min-height: 0; }
      code-panel { flex: 0 0 min(46%, 400px); }
      .canvas-wrapper.ai-open { margin-right: 380px; }
      .canvas-wrapper.guide-open { margin-right: 372px; }
      .toolbar-btn.learn { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, var(--panel-border)); }
      .toolbar-btn.learn:hover, .toolbar-btn.learn.active { color: var(--ink); background: var(--accent); border-color: var(--accent); }
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
        .canvas-wrapper.ai-open, .canvas-wrapper.guide-open { margin-right: 0; }
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
        this._user = accountService.user;
        this._syncStatus = accountService.syncStatus;
        this._authError = accountService.authError;
        this._saveLabel = 'Save';
        this._currentProjectName = '';
        this._accountHandler = () => {
            this._user = accountService.user;
            this._syncStatus = accountService.syncStatus;
            this._authError = accountService.authError;
            if (this._authError && this._authError !== this._shownAuthError) {
                this._shownAuthError = this._authError;
                this._openLogin('account');
            }
        };
        this._libraryHandler = () => this._refreshCurrentProjectName();
        this._settingsInitialTab = 'account';
        this._manualWireMode = physicalCircuitStore.manualWireMode;
        this._manualWireSnap = physicalCircuitStore.manualWireSnap;
        this._libraryOpen = false;
        this._lessonsOpen = false;
        this._codeOpen = false;
        this._guideSession = null;
        this._completedLessons = loadCompletedLessons();
        this._guideProjectHandler = event => this._startGuide({ target: event.detail.project, name: event.detail.name });
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
        window.addEventListener('elera-guide-project', this._guideProjectHandler);
        accountService.addEventListener('change', this._accountHandler);
        projectLibrary.addEventListener('change', this._libraryHandler);
        accountService.init().then(this._accountHandler);
        this._refreshCurrentProjectName();
        this._openSharedLink();
    }

    async _openSharedLink() {
        let shared = null;
        const publishedId = publishedProjectId(location.hash);
        try {
            shared = publishedId ? (await accountService.openSharedProject(publishedId))?.data : await decodeShareHash(location.hash);
            if (publishedId && !shared) showToast('This shared circuit no longer exists, or sharing is switched off here.', 'error');
        } catch {
            showToast(publishedId ? 'The shared circuit could not be loaded. Check your connection and open the link again.'
                : 'This share link is damaged or incomplete. Ask for it to be sent again.', 'error');
        }
        if (publishedId || location.hash.startsWith('#p=')) history.replaceState(null, '', location.pathname + location.search);
        if (!shared) return;
        const current = physicalCircuitStore.project;
        // A lone breadboard is the starting canvas, not work worth asking about.
        if (current.components.length && !await confirmDialog({
            title: 'Open the shared circuit?',
            message: 'It replaces the circuit on the canvas. Save yours first if you want to keep it.',
            confirmLabel: 'Open shared circuit',
            cancelLabel: 'Keep mine',
        })) return;
        try {
            physicalCircuitStore.importProject(shared);
            projectLibrary.setCurrentProjectId(null);
            this._fitCircuit();
            showToast('Shared circuit opened. It is your own copy; changes do not affect the original.', 'success');
        } catch {
            showToast('This share link could not be opened.', 'error');
        }
    }

    async _shareProject() {
        const project = physicalCircuitStore.project;
        if (!project.components.length && !project.surfaces.length) {
            showToast('Add something to the canvas first, then share it.', 'info');
            return;
        }
        let link = '';
        if (accountService.user) {
            // Signed in: publish a copy and share a short link to it.
            try {
                const id = await accountService.publishProject(this._currentProjectName, JSON.parse(physicalCircuitStore.exportProject()));
                link = `${location.origin}${location.pathname}#s=${id}`;
            } catch (error) {
                console.warn('[Elera] Publishing failed, falling back to a link that carries the circuit:', error);
            }
        }
        link ||= location.origin + location.pathname + await encodeShareHash(physicalCircuitStore.exportProject());
        if (link.length > MAX_SHARE_LINK_LENGTH) {
            showToast(accountService.cloudConfigured && !accountService.user
                ? 'This circuit is too big for a plain link. Sign in to share it with a short link, or use Export and send the file.'
                : 'This circuit is too big for a link. Use Export and send the file instead.', 'warning');
            return;
        }
        try {
            await navigator.clipboard.writeText(link);
            showToast('Link copied. Anyone who opens it gets their own copy of this circuit.', 'success');
        } catch {
            // Clipboard access can be blocked; the address bar is the fallback.
            history.replaceState(null, '', link);
            showToast('Copy the link from the address bar to share this circuit.', 'info');
        }
    }

    async _showPartsList() {
        const rows = billOfMaterials(physicalCircuitStore.project);
        if (!rows.length) {
            showToast('The canvas is empty, so there are no parts to list yet.', 'info');
            return;
        }
        if (!await confirmDialog({
            title: 'Parts you need to build this',
            message: html`${rows.map(([label, count]) => html`<b>${count} ×</b> ${label}<br>`)}`,
            confirmLabel: 'Download as spreadsheet',
            cancelLabel: 'Close',
        })) return;
        const csv = ['Quantity,Part', ...rows.map(([label, count]) => `${count},"${label.replace(/"/g, '""')}"`)].join('\r\n');
        const linkElement = document.createElement('a');
        // The BOM mark makes Excel read the Ω sign correctly.
        linkElement.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
        linkElement.download = 'parts-list.csv';
        linkElement.click();
        URL.revokeObjectURL(linkElement.href);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        physicalCircuitStore.removeEventListener('settings-change', this._settingsHandler);
        window.removeEventListener('elera-open-ai-settings', this._aiSettingsHandler);
        window.removeEventListener('elera-guide-project', this._guideProjectHandler);
        accountService.removeEventListener('change', this._accountHandler);
        projectLibrary.removeEventListener('change', this._libraryHandler);
    }

    async _refreshCurrentProjectName() {
        const id = projectLibrary.getCurrentProjectId();
        const record = id ? await projectLibrary.get(id) : null;
        this._currentProjectName = record?.name || '';
    }

    _toggleManualWireMode() {
        this._manualWireMode = physicalCircuitStore.toggleManualWireMode();
    }

    _toggleManualWireSnap() {
        this._manualWireSnap = physicalCircuitStore.toggleManualWireSnap();
    }

    async _clearProject() {
        if (await confirmDialog({
            title: 'Clear the canvas?',
            message: 'All components and wires will be removed. This cannot be undone.',
            confirmLabel: 'Clear',
            danger: true,
        })) {
            physicalCircuitStore.clear();
            projectLibrary.setCurrentProjectId(null);
        }
    }

    _undoAction() { physicalCircuitStore.undo(); }
    _redoAction() { physicalCircuitStore.redo(); }
    // Save updates the open project in the library; a circuit that was never
    // named opens the Projects dialog so the student can give it a name.
    async _saveProject() {
        physicalCircuitStore.save();
        const id = projectLibrary.getCurrentProjectId();
        const saved = id ? await projectLibrary.update(id, physicalCircuitStore.project) : null;
        if (!saved) {
            this._openProjects({ promptName: true });
            return;
        }
        this._saveLabel = 'Saved';
        clearTimeout(this._saveLabelTimer);
        this._saveLabelTimer = setTimeout(() => { this._saveLabel = 'Save'; }, 1600);
    }
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
            if (result.status !== 'success') showToast(`Auto Layout could not finish: ${result.errors?.[0] || 'check the circuit components'}`, 'warning');
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
            showToast('No components to auto-wire. Add components with pins first.', 'info');
            return;
        }
        if (result.status === 'failure') {
            showToast(result.errors?.[0] === 'NO_ARDUINO'
                ? 'Add an Arduino or another supported controller before using Auto Wire.'
                : `Auto Wire could not finish: ${result.errors?.[0] || 'check the circuit'}`, 'warning');
            return;
        }
        await physicalCircuitStore.whenRoutesSettled();
        const msg = [
            `Auto-wired ${result.success} connections across ${result.total} components without moving them.`,
            result.errors.length > 0 ? `${result.errors.length} errors.` : '',
        ].filter(Boolean).join(' ');
        showToast(msg, result.errors.length > 0 ? 'warning' : 'success');
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
                    projectLibrary.setCurrentProjectId(null);
                } catch {
                    showToast('Failed to load project file. It may be corrupted or invalid.', 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
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

    _handleSignIn() {
        accountService.signInWithGoogle();
    }

    async _handleLogout() {
        this._loginOpen = false;
        await accountService.signOut();
    }

    _handleSyncNow() {
        accountService.syncNow();
    }

    _openProjects({ promptName = false } = {}) {
        const modal = this.shadowRoot.querySelector('projects-modal');
        if (modal) {
            modal.promptName = promptName === true;
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

    _openLessons() {
        this._lessonsOpen = true;
    }

    _toggleCode() {
        this._codeOpen = !this._codeOpen;
        // The canvas gets shorter, so bring the whole circuit back into view.
        if (this._codeOpen) this._fitCircuit();
    }

    _fitCircuit() {
        const target = this._guideSession?.target || physicalCircuitStore.project;
        if (target.components.length || target.surfaces.length) {
            requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('elera-lesson-fit', { detail: structuredClone(target) })));
        }
    }

    _onStartLesson(event) {
        const { lessonId, current, goal, guided } = event.detail || {};
        this._lessonsOpen = false;
        if (goal) {
            this._buildGoal(goal, guided);
            return;
        }
        if (current) {
            this._startGuide({ target: structuredClone(physicalCircuitStore.project), name: this._currentProjectName });
            return;
        }
        const lesson = getLesson(lessonId);
        if (lesson) this._startGuide({ target: lesson.build(), lesson });
    }

    // A circuit and its code for "when this, then that": rebuilt step by step, or put straight on the canvas.
    async _buildGoal(goal, guided) {
        const built = buildGoalProject(goal);
        if (built.error) {
            showToast(built.error, 'warning');
            return;
        }
        if (guided) {
            await this._startGuide({ target: built.project, name: built.name });
            // The guide starts from an empty canvas, so the code goes in separately.
            if (this._guideSession?.target === built.project) physicalCircuitStore.setSketch(built.project.properties.sketch);
            return;
        }
        const project = physicalCircuitStore.project;
        if ((project.components.length || project.wires.length) && !(await confirmDialog({
            title: 'Replace the circuit on the canvas?',
            message: 'The new circuit takes its place, so save first if you want to keep yours.',
            confirmLabel: 'Build it',
        }))) return;
        physicalCircuitStore.importProject(built.project);
        projectLibrary.setCurrentProjectId(null);
        if (!this._codeOpen) this._toggleCode();
        else this._fitCircuit();
        showToast(`Built: ${built.name}. Press Run to try it.`, 'success');
    }

    // Clears the canvas down to the target's breadboards, then hands the
    // finished circuit to the guide panel to rebuild step by step.
    async _startGuide({ target, lesson = null, name = '' }) {
        const project = physicalCircuitStore.project;
        const hasWork = project.components.length > 0 || project.wires.length > 0;
        const subject = lesson ? `the ${lesson.title} lesson` : `a guided rebuild of ${name || 'this circuit'}`;
        if (hasWork && !(await confirmDialog({
            title: 'Clear the canvas?',
            message: `Start ${subject}? The canvas will be cleared, so save first if you want to keep what is on it.`,
            confirmLabel: 'Start',
        }))) return;
        physicalCircuitStore.clear();
        physicalCircuitStore.transaction('lesson-start', next => { next.surfaces = structuredClone(target.surfaces); });
        projectLibrary.setCurrentProjectId(null);
        this._guideSession = { target, lesson, name };
        requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('elera-lesson-fit', { detail: target })));
    }

    async _closeGuide(event) {
        const session = this._guideSession;
        // Leaving an unfinished rebuild of the student's own circuit offers it back.
        if (!session?.lesson && !event?.detail?.finished
            && await confirmDialog({
                title: 'Restore your circuit?',
                message: 'Stop the guided build and put the original circuit back on the canvas?',
                confirmLabel: 'Restore',
                cancelLabel: 'Keep canvas',
            })) {
            physicalCircuitStore.importProject(session.target);
        }
        this._guideSession = null;
        window.dispatchEvent(new CustomEvent('elera-lesson-fit', { detail: null }));
    }

    _onLessonComplete(event) {
        const lessonId = event.detail?.lessonId;
        if (!lessonId || this._completedLessons.includes(lessonId)) return;
        this._completedLessons = [...this._completedLessons, lessonId];
        try {
            localStorage.setItem(COMPLETED_LESSONS_KEY, JSON.stringify(this._completedLessons));
        } catch {
            // Progress badges are a convenience; the lesson itself still works.
        }
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
            <button class="toolbar-btn btn-action" @click=${this._saveProject} title=${this._currentProjectName ? `Save "${this._currentProjectName}"` : 'Save as a new project'}><span class="icon">${faIcon(this._saveLabel === 'Saved' ? 'check' : 'save')}</span>${this._saveLabel}</button>
          </div>
          <div class="tool-cluster secondary" aria-label="File actions">
            <button class="toolbar-btn btn-action" @click=${this._exportProject} title="Export project"><span class="icon">${faIcon('download')}</span>Export</button>
            <button class="toolbar-btn btn-action" @click=${this._importProject} title="Import project"><span class="icon">${faIcon('folderOpen')}</span>Import</button>
            <button class="toolbar-btn btn-action" @click=${this._shareProject} title="Copy a link to this circuit"><span class="icon">${faIcon('link')}</span>Share</button>
            <button class="toolbar-btn btn-action" @click=${this._showPartsList} title="List the parts this circuit needs"><span class="icon">${faIcon('listCheck')}</span>Parts</button>
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
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._openLessons)}>${faIcon('graduation')} Learn</button>
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._toggleCode)}>${faIcon('play')} Code and simulate</button>
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._cleanupWires)}>${faIcon('wrench')} Clean wire routes</button>
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._autoWireAll)}>${faIcon('bolt')} Auto Wire</button>
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._autoLayoutAll)}>${faIcon('wand')} Auto Layout</button>
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._exportProject)}>${faIcon('download')} Export project</button>
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._importProject)}>${faIcon('folderOpen')} Import project</button>
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._shareProject)}>${faIcon('link')} Share link</button>
              <button class="toolbar-btn btn-action" @click=${event => this._runOverflowAction(event, this._showPartsList)}>${faIcon('listCheck')} Parts list</button>
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
        <button class="toolbar-btn btn-action ${this._codeOpen ? 'ai-active' : ''}" @click=${this._toggleCode} aria-pressed=${this._codeOpen}
          title="Write Arduino code and run it on your circuit"><span class="icon">${faIcon('play')}</span>Code</button>
        <button class="toolbar-btn learn ${this._lessonsOpen || this._guideSession ? 'active' : ''}" @click=${this._openLessons}
          title="Lessons and guided builds"><span class="icon">${faIcon('graduation')}</span>Learn</button>
        <div class="account-cluster" aria-label="Account controls">
          <button class="toolbar-btn btn-action projects-btn" @click=${this._openProjects} title="Projects"><span class="icon">${faIcon('folder')}</span>Projects</button>
          <button class="toolbar-btn btn-action icon-only" @click=${this._openPreferences} title="Preferences" aria-label="Preferences"><span class="icon">${faIcon('gear')}</span></button>
          <button class="avatar" @click=${this._openLogin} title=${this._user ? `${this._user.name} (${this._syncStatus.message})` : 'Sign in'} aria-label=${this._user ? `Account: ${this._user.name}` : 'Sign in'}>
            ${this._user?.avatarUrl
              ? html`<img src=${this._user.avatarUrl} alt="" referrerpolicy="no-referrer" />`
              : this._user
                ? this._user.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
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
        <div class="canvas-wrapper ${this._aiOpen ? 'ai-open' : ''} ${this._guideSession ? 'guide-open' : ''}">
          <div class="canvas-area">
            <circuit-canvas .guided=${Boolean(this._guideSession)} @edit-component-definition=${this._openBuilder}></circuit-canvas>
            <validation-bar></validation-bar>
          </div>
          ${this._codeOpen ? html`<code-panel .lesson=${this._guideSession?.lesson || null} @close=${this._toggleCode}></code-panel>` : ''}
        </div>
        ${this._guideSession ? html`<lesson-guide .session=${this._guideSession} @close=${this._closeGuide}
          @pick-lesson=${this._openLessons} @lesson-complete=${this._onLessonComplete}
          @open-code=${() => { if (!this._codeOpen) this._toggleCode(); }}></lesson-guide>` : ''}
      </main>
      <lessons-modal .open=${this._lessonsOpen} .completed=${this._completedLessons}
        .canGuideCurrent=${physicalCircuitStore.project.components.length > 0}
        @close=${() => { this._lessonsOpen = false; }} @start-lesson=${this._onStartLesson}></lessons-modal>
      <ai-assistant @open-ai-settings=${this._openAiSettings}></ai-assistant>
      <projects-modal></projects-modal>
      <login-modal
        .open=${this._loginOpen}
        .user=${this._user}
        .cloudConfigured=${accountService.cloudConfigured}
        .syncStatus=${this._syncStatus}
        .authError=${this._authError}
        .initialTab=${this._settingsInitialTab}
        @close=${this._closeLogin}
        @google-sign-in=${this._handleSignIn}
        @sync-now=${this._handleSyncNow}
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

import { LitElement, html, css } from 'lit';
import { physicalCircuitStore } from '../physical/circuit-store.js';
import { normalizePersistedProject } from '../physical/model.js';
import { accountService } from '../persistence/account.js';
import { projectLibrary } from '../persistence/project-library.js';
import { faIcon } from '../utils/fa-icons.js';
import { confirmDialog, showToast } from './app-dialogs.js';

class ProjectsModal extends LitElement {
    static properties = {
        open: { type: Boolean, reflect: true },
        promptName: { type: Boolean },
        _projects: { state: true },
        _newProjectName: { state: true },
        _currentId: { state: true },
        _syncStatus: { state: true },
        _signedIn: { state: true },
    };

    static styles = css`
        :host {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.6);
            z-index: 1000;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        }

        :host([open]) {
            display: flex;
        }

        .modal {
            background: #18181b;
            border: 1px solid #27272a;
            border-radius: 12px;
            width: 500px;
            max-width: 90vw;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4);
        }

        .header {
            padding: 20px;
            border-bottom: 1px solid #27272a;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #fafafa;
        }

        .close-btn {
            background: none;
            border: none;
            color: #a1a1aa;
            cursor: pointer;
            font-size: 20px;
            line-height: 1;
            padding: 4px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .close-btn svg {
            width: 0.8em;
            height: 0.8em;
        }

        .close-btn:hover {
            color: #fafafa;
        }

        .body {
            padding: 20px;
            overflow-y: auto;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .save-section {
            display: flex;
            gap: 10px;
        }

        input {
            flex: 1;
            background: #27272a;
            border: 1px solid #3f3f46;
            border-radius: 6px;
            color: #fafafa;
            padding: 8px 12px;
            font-family: inherit;
            font-size: 14px;
        }

        input:focus {
            outline: none;
            border-color: var(--primary-hover);
        }

        button.btn-primary {
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 6px;
            padding: 8px 16px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.1s;
        }

        button.btn-primary:hover {
            background: var(--primary-hover);
        }
        
        button.btn-primary:disabled {
            background: #3f3f46;
            color: #71717a;
            cursor: not-allowed;
        }

        .projects-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .project-item {
            background: #27272a;
            border: 1px solid #3f3f46;
            border-radius: 8px;
            padding: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .project-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .project-name {
            font-weight: 600;
            color: #fafafa;
            font-size: 15px;
        }

        .project-date {
            font-size: 12px;
            color: #71717a;
        }

        .project-actions {
            display: flex;
            gap: 8px;
        }

        button.btn-action {
            background: #3f3f46;
            color: #e4e4e7;
            border: none;
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 13px;
            cursor: pointer;
        }

        button.btn-action:hover {
            background: #52525b;
        }

        button.btn-danger {
            background: transparent;
            color: #ef4444;
            border: 1px solid #ef4444;
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 13px;
            cursor: pointer;
        }

        button.btn-danger:hover {
            background: #ef4444;
            color: white;
        }

        .empty-state {
            text-align: center;
            color: #71717a;
            padding: 20px 0;
            font-size: 14px;
        }

        :host { background: color-mix(in srgb, var(--ink) 72%, transparent); font-family: var(--font-ui, 'Public Sans', sans-serif); }
        .modal { background: var(--panel); border-color: var(--panel-border); border-radius: 4px; color: var(--text); }
        .header { border-color: var(--panel-border); }
        .header h2, .project-name { color: var(--text); }
        .close-btn { width: 34px; height: 34px; padding: 0; border: 1px solid var(--panel-border); border-radius: 4px; color: var(--text-muted); }
        .close-btn:hover { color: var(--text); background: var(--primary-hover); }
        input { height: 34px; box-sizing: border-box; background: var(--panel); border-color: var(--panel-border); border-radius: 4px; color: var(--text); }
        input:focus { border-color: var(--primary-hover); outline: none; }
        button.btn-primary, button.btn-action, button.btn-danger { height: 34px; box-sizing: border-box; border-radius: 4px; padding: 0 14px; }
        button.btn-primary { background: var(--primary); border: 1px solid var(--primary); color: var(--text); }
        button.btn-primary:hover { background: var(--primary-hover); }
        button.btn-primary:disabled { background: var(--panel-border); color: var(--text-muted); }
        .project-item { background: var(--panel); border-color: var(--panel-border); border-radius: 4px; }
        .project-date, .empty-state { color: var(--text-muted); }
        button.btn-action { background: var(--primary); border: 1px solid var(--panel-border); color: var(--text); }
        button.btn-action:hover { background: var(--primary-hover); }
        .header-text { display: grid; gap: 4px; }
        .sync-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
        .sync-badge.sync-error { color: var(--accent-ics, #f87171); }
        .save-hint { margin: -10px 0 0; font-size: 12px; color: var(--text-muted); }
        .open-tag { margin-left: 8px; padding: 1px 6px; border: 1px solid var(--accent-boards, #22c55e); border-radius: 4px; color: var(--accent-boards, #22c55e); font-size: 10px; font-weight: 600; vertical-align: middle; }
        .project-item.current { border-color: var(--accent-boards, #22c55e); }
        .signin-tip { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px dashed var(--panel-border); border-radius: 4px; font-size: 12px; color: var(--text-muted); }
        .signin-tip button { flex: 0 0 auto; }
    `;

    constructor() {
        super();
        this.open = false;
        this.promptName = false;
        this._projects = [];
        this._newProjectName = '';
        this._currentId = null;
        this._syncStatus = projectLibrary.status;
        this._signedIn = Boolean(accountService.user);
        this._libraryHandler = () => {
            if (this.open) this._refreshProjects();
        };
        this._statusHandler = () => {
            this._syncStatus = projectLibrary.status;
            this._signedIn = Boolean(accountService.user);
        };
    }

    connectedCallback() {
        super.connectedCallback();
        projectLibrary.addEventListener('change', this._libraryHandler);
        projectLibrary.addEventListener('status', this._statusHandler);
        accountService.addEventListener('change', this._statusHandler);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        projectLibrary.removeEventListener('change', this._libraryHandler);
        projectLibrary.removeEventListener('status', this._statusHandler);
        accountService.removeEventListener('change', this._statusHandler);
    }

    updated(changedProperties) {
        if (changedProperties.has('open') && this.open) {
            this._statusHandler();
            this._refreshProjects();
            projectLibrary.sync();
            if (this.promptName) {
                this.updateComplete.then(() => this.renderRoot.querySelector('input')?.focus());
            }
        }
    }

    async _refreshProjects() {
        this._projects = await projectLibrary.list();
        this._currentId = projectLibrary.getCurrentProjectId();
    }

    _close() {
        this.open = false;
        this.promptName = false;
        this.dispatchEvent(new CustomEvent('close'));
    }

    _handleInput(e) {
        this._newProjectName = e.target.value;
    }

    async _saveProject() {
        const name = this._newProjectName.trim();
        if (!name) return;
        const existing = this._projects.find(project => project.name === name);
        if (existing && existing.id !== this._currentId
            && !await confirmDialog({
                title: 'Replace project?',
                message: `A project called "${name}" already exists. Replace it with the current circuit?`,
                confirmLabel: 'Replace',
                danger: true,
            })) return;
        physicalCircuitStore.save();
        const saved = await projectLibrary.saveAs(name, physicalCircuitStore.project);
        if (!saved) return;
        projectLibrary.setCurrentProjectId(saved.id);
        this._newProjectName = '';
        if (this.promptName) {
            this._close();
            return;
        }
        await this._refreshProjects();
    }

    async _loadProject(id) {
        if (!await confirmDialog({
            title: 'Open this project?',
            message: 'Changes to the circuit you have open now will be lost unless you save them first.',
            confirmLabel: 'Open',
        })) return;
        const record = await projectLibrary.get(id);
        if (!record) {
            showToast('That project could not be found. It may have been deleted on another device.', 'error');
            await this._refreshProjects();
            return;
        }
        try {
            physicalCircuitStore.importProject(normalizePersistedProject(record.data));
        } catch (error) {
            console.error('[Elera] Saved project could not be opened:', error);
            showToast('This project could not be opened. It may be damaged.', 'error');
            return;
        }
        projectLibrary.setCurrentProjectId(id);
        this._close();
    }

    async _deleteProject(project) {
        const where = this._signedIn ? ' from this device and your account' : '';
        if (!await confirmDialog({
            title: 'Delete project?',
            message: `"${project.name}" will be deleted${where}. This cannot be undone.`,
            confirmLabel: 'Delete',
            danger: true,
        })) return;
        await projectLibrary.remove(project.id);
        await this._refreshProjects();
    }

    _renderSyncBadge() {
        const status = this._syncStatus || {};
        if (!this._signedIn) {
            return html`<span class="sync-badge">${faIcon('folder')} Saved on this device</span>`;
        }
        const icon = status.state === 'synced' ? 'cloud' : status.state === 'error' ? 'triangleExclamation' : 'rotateRight';
        return html`<span class="sync-badge sync-${status.state}">${faIcon(icon)} ${status.message}</span>`;
    }

    render() {
        return html`
            <div class="modal">
                <div class="header">
                    <div class="header-text">
                        <h2>My projects</h2>
                        ${this._renderSyncBadge()}
                    </div>
                    <button class="close-btn" @click=${this._close}>${faIcon('xmark')}</button>
                </div>
                <div class="body">
                    <div class="save-section">
                        <input 
                            type="text" 
                            placeholder=${this.promptName ? 'Name this project, e.g. Traffic light' : 'New project name'} 
                            .value=${this._newProjectName}
                            @input=${this._handleInput}
                            @keydown=${(e) => e.key === 'Enter' && this._saveProject()}
                        />
                        <button class="btn-primary" ?disabled=${!this._newProjectName.trim()} @click=${this._saveProject}>
                            Save as new
                        </button>
                    </div>
                    ${this.promptName ? html`<p class="save-hint">Give your circuit a name so you can find it again later.</p>` : ''}
                    ${!this._signedIn && accountService.cloudConfigured ? html`
                        <div class="signin-tip">
                            <span>Sign in with Google to back up these projects and open them on any computer.</span>
                            <button class="btn-action" @click=${() => accountService.signInWithGoogle()}>${faIcon('google')} Sign in</button>
                        </div>
                    ` : ''}

                    <div class="projects-list">
                        ${this._projects.length === 0 ? html`
                            <div class="empty-state">No saved projects yet. Name your circuit above to save it.</div>
                        ` : ''}

                        ${this._projects.map(p => html`
                            <div class="project-item ${p.id === this._currentId ? 'current' : ''}">
                                <div class="project-info">
                                    <span class="project-name">${p.name}${p.id === this._currentId ? html`<span class="open-tag">Open now</span>` : ''}</span>
                                    <span class="project-date">Last updated ${new Date(p.updatedAt).toLocaleString()}</span>
                                </div>
                                <div class="project-actions">
                                    <button class="btn-action" @click=${() => this._loadProject(p.id)}>Open</button>
                                    <button class="btn-danger" @click=${() => this._deleteProject(p)}>Delete</button>
                                </div>
                            </div>
                        `)}
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('projects-modal', ProjectsModal);

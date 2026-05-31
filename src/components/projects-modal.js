import { LitElement, html, css } from 'lit';
import { store } from '../store.js';
import { faIcon } from '../utils/fa-icons.js';

class ProjectsModal extends LitElement {
    static properties = {
        open: { type: Boolean, reflect: true },
        _projects: { state: true },
        _newProjectName: { state: true }
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
            border-color: #0284c7;
        }

        button.btn-primary {
            background: #0284c7;
            color: white;
            border: none;
            border-radius: 6px;
            padding: 8px 16px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.1s;
        }

        button.btn-primary:hover {
            background: #0369a1;
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
    `;

    constructor() {
        super();
        this.open = false;
        this._projects = [];
        this._newProjectName = '';
        this._storeHandler = () => {
            if (this.open) {
                this._refreshProjects();
            }
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

    updated(changedProperties) {
        if (changedProperties.has('open') && this.open) {
            this._refreshProjects();
        }
    }

    _refreshProjects() {
        this._projects = store.getSavedProjects().sort((a, b) => b.updatedAt - a.updatedAt);
    }

    _close() {
        this.open = false;
        this.dispatchEvent(new CustomEvent('close'));
    }

    _handleInput(e) {
        this._newProjectName = e.target.value;
    }

    _saveProject() {
        if (!this._newProjectName.trim()) return;
        store.saveProjectToAccount(this._newProjectName.trim());
        this._newProjectName = '';
        this._refreshProjects();
    }

    _loadProject(id) {
        if (confirm('Load this project? Any unsaved changes in your current workspace will be lost.')) {
            const success = store.loadProjectFromAccount(id);
            if (success) {
                this._close();
            } else {
                alert('Failed to load project.');
            }
        }
    }

    _deleteProject(id) {
        if (confirm('Are you sure you want to delete this project? This cannot be undone.')) {
            store.deleteProjectFromAccount(id);
            this._refreshProjects();
        }
    }

    render() {
        return html`
            <div class="modal">
                <div class="header">
                    <h2>My Projects (Local Mock)</h2>
                    <button class="close-btn" @click=${this._close}>${faIcon('xmark')}</button>
                </div>
                <div class="body">
                    <div class="save-section">
                        <input 
                            type="text" 
                            placeholder="Project Name..." 
                            .value=${this._newProjectName}
                            @input=${this._handleInput}
                            @keydown=${(e) => e.key === 'Enter' && this._saveProject()}
                        />
                        <button class="btn-primary" ?disabled=${!this._newProjectName.trim()} @click=${this._saveProject}>
                            Save Project
                        </button>
                    </div>

                    <div class="projects-list">
                        ${this._projects.length === 0 ? html`
                            <div class="empty-state">No projects saved yet.</div>
                        ` : ''}

                        ${this._projects.map(p => html`
                            <div class="project-item">
                                <div class="project-info">
                                    <span class="project-name">${p.name}</span>
                                    <span class="project-date">Last updated: ${new Date(p.updatedAt).toLocaleString()}</span>
                                </div>
                                <div class="project-actions">
                                    <button class="btn-action" @click=${() => this._loadProject(p.id)}>Load</button>
                                    <button class="btn-danger" @click=${() => this._deleteProject(p.id)}>Delete</button>
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

import { LitElement, html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { componentLibrary } from '../component-library.js';
import { faIcon } from '../utils/fa-icons.js';

const DISPLAY_CATEGORIES = Object.freeze([
  { id: 'controller', label: 'Controller boards', descriptor: 'MCU · host', accent: 'var(--accent-boards)' },
  { id: 'breadboard', label: 'Breadboards', descriptor: 'prototype · connect', accent: 'var(--accent-breadboards)' },
  { id: 'sensor', label: 'Sensors', descriptor: 'sense · measure', accent: 'var(--accent-sensors)' },
  { id: 'ic', label: 'ICs', descriptor: 'logic · package', accent: 'var(--accent-ics)' },
  { id: 'input', label: 'Inputs', descriptor: 'switch · control', accent: 'var(--accent-inputs)' },
  { id: 'output', label: 'Indicators & displays', descriptor: 'show · signal', accent: 'var(--accent-displays)' },
  { id: 'actuator', label: 'Actuators', descriptor: 'drive · motion', accent: 'var(--accent-actuators)' },
  { id: 'passive', label: 'Passive parts', descriptor: 'resist · filter', accent: 'var(--accent-passives)' },
  { id: 'custom', label: 'Custom', descriptor: 'local · reusable', accent: 'var(--accent-custom)' },
]);

function displayCategory(component) {
  if (component.isBreadboard) return 'breadboard';
  if (component.isControllerBoard) return 'controller';
  if (component.visualKind === 'dip8') return component.category === 'internal' ? null : 'ic';
  return DISPLAY_CATEGORIES.some(category => category.id === component.category)
    ? component.category
    : null;
}

class ComponentSidebar extends LitElement {
  static properties = {
    _libraryVersion: { state: true },
    _searchQuery: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      box-sizing: border-box;
      overflow-y: auto;
      padding: 14px 12px 22px;
      color: var(--text);
      background: var(--panel);
      border-right: 1px solid var(--panel-border);
      font-family: var(--font-ui, 'Public Sans', sans-serif);
    }

    .library-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      margin: 0 2px 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--panel-border);
    }

    .title {
      color: var(--text);
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -.1px;
    }

    .library-ref {
      color: var(--text-muted);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: .08em;
    }

    .create-btn {
      width: 100%;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      margin-bottom: 16px;
      border: 1px solid var(--panel-border);
      border-radius: 4px;
      color: var(--text);
      background: transparent;
      font: 600 12px/1 var(--font-ui, 'Public Sans', sans-serif);
      cursor: pointer;
    }

    .search-field {
      position: relative;
      margin-bottom: 10px;
      color: var(--text-muted);
    }

    .search-field .fa-icon {
      position: absolute;
      top: 9px;
      left: 10px;
      pointer-events: none;
    }

    .search-input {
      box-sizing: border-box;
      width: 100%;
      height: 34px;
      padding: 0 10px 0 34px;
      border: 1px solid var(--panel-border);
      border-radius: 4px;
      outline: none;
      color: var(--text);
      background: var(--ink);
      font: 500 12px/1 var(--font-ui, 'Public Sans', sans-serif);
    }

    .search-input::placeholder { color: var(--text-muted); }

    .search-input:focus {
      border-color: var(--text-muted);
      box-shadow: inset 0 -1px 0 var(--text-muted);
    }

    .search-input::-webkit-search-cancel-button { display: none; }

    .create-btn:hover,
    .create-btn:focus-visible {
      background: var(--primary);
      border-color: var(--primary-hover);
      outline: none;
    }

    .category-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 16px 2px 8px;
    }

    .category-title {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 7px;
    }

    .category-accent {
      flex: 0 0 auto;
      width: 8px;
      height: 8px;
      background: var(--category-accent);
    }

    .category-name {
      min-width: 0;
      color: var(--text);
      font-size: 12px;
      font-weight: 700;
    }

    .category-ref {
      flex: 0 0 auto;
      color: var(--text-muted);
      font-size: 10px;
      font-weight: 500;
    }

    .category-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 8px;
    }

    .component-card {
      position: relative;
      box-sizing: border-box;
      width: 100%;
      height: 100px;
      min-width: 0;
      display: grid;
      grid-template-rows: 58px 22px;
      place-items: center stretch;
      padding: 8px;
      overflow: hidden;
      color: var(--text);
      background: transparent;
      border: 1px solid var(--panel-border);
      border-radius: 4px;
      cursor: grab;
      transition: background .1s ease, border-color .1s ease;
    }

    .component-card::after {
      content: '';
      position: absolute;
      left: -1px;
      right: -1px;
      bottom: -1px;
      z-index: 2;
      height: 3px;
      background: var(--category-accent);
      pointer-events: none;
    }

    .component-card:hover,
    .component-card:focus-visible {
      background: var(--primary);
      border-color: var(--primary-hover);
      outline: none;
    }

    .component-card:active {
      cursor: grabbing;
      background: var(--primary-hover);
    }

    .component-preview {
      position: relative;
      width: 100%;
      height: 58px;
      align-self: center;
      pointer-events: none;
      overflow: hidden;
    }

    .custom-preview-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }

    .dip-preview {
      position: absolute;
      left: 12px;
      right: 12px;
      top: 13px;
      height: 26px;
      display: grid;
      place-items: center;
      color: var(--text-muted);
      background: var(--ink);
      border: 1px solid var(--panel-border);
      border-radius: 2px;
      font: 9px/1 var(--font-tech, '0xProto', monospace);
    }

    .dip-preview::before,
    .dip-preview::after {
      content: '';
      position: absolute;
      left: 4px;
      right: 4px;
      height: 4px;
      background: repeating-linear-gradient(90deg, var(--text-muted) 0 3px, transparent 3px 9px);
    }

    .dip-preview::before { top: -5px; }
    .dip-preview::after { bottom: -5px; }

    .component-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      align-self: center;
      color: var(--text);
      font-size: 12px;
      font-weight: 600;
      line-height: 22px;
      text-align: center;
    }

    :host::-webkit-scrollbar { width: 6px; }
    :host::-webkit-scrollbar-track { background: transparent; }
    :host::-webkit-scrollbar-thumb { background: var(--panel-border); border-radius: 2px; }

    .empty-state {
      margin: 18px 2px;
      color: var(--text-muted);
      font-size: 12px;
      line-height: 1.5;
    }

    @media (max-width: 900px) {
      :host { padding-bottom: 28px; }
      .component-card { height: 104px; grid-template-rows: 60px 22px; }
      .component-preview { height: 60px; }
    }
  `;

  constructor() {
    super();
    this._libraryVersion = 0;
    this._searchQuery = '';
    this._customLibraryHandler = () => { this._libraryVersion++; };
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('elera-custom-components-change', this._customLibraryHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('elera-custom-components-change', this._customLibraryHandler);
  }

  render() {
    return html`
      <div class="library-header">
        <div class="title">Parts library</div>
        <div class="library-ref">LOCAL LIBRARY</div>
      </div>
      <label class="search-field">
        ${faIcon('search')}
        <input class="search-input" type="search" placeholder="Search parts"
          aria-label="Search parts"
          .value=${this._searchQuery}
          @input=${event => { this._searchQuery = event.target.value; }} />
      </label>
      <button class="create-btn" @click=${this._openBuilder}>
        ${faIcon('plus')} Create custom component
      </button>
      ${(() => {
        const query = this._searchQuery.trim().toLocaleLowerCase();
        let visibleCount = 0;
        const sections = DISPLAY_CATEGORIES.map(category => {
        const components = Object.values(componentLibrary)
          .filter(component => displayCategory(component) === category.id)
          .filter(component => !query || [
            component.name,
            component.description,
            category.label,
            category.descriptor,
          ].some(value => value?.toLocaleLowerCase().includes(query)));
        if (components.length === 0) return '';
        visibleCount += components.length;
        return html`
          <section aria-labelledby="category-${category.id}" style="--category-accent:${category.accent}">
            <div class="category-header">
              <div class="category-title">
                <div class="category-name" id="category-${category.id}">${category.label}</div>
                <span class="category-accent" aria-hidden="true"></span>
              </div>
              <div class="category-ref">${category.descriptor}</div>
            </div>
            <div class="category-grid">
              ${components.map(component => this._renderCard(component, category))}
            </div>
          </section>
        `;
        });
        return visibleCount > 0
          ? sections
          : html`<div class="empty-state">No parts match “${this._searchQuery.trim()}”.</div>`;
      })()}
    `;
  }

  _renderCard(component, category) {
    const scale = Math.min(1, 76 / component.size.width, 48 / component.size.height);
    const attrs = Object.entries(component.attrs || {}).map(([key, value]) => `${key}="${value}"`).join(' ');
    const style = `position:absolute; top:50%; left:50%; width:${component.size.width}px; height:${component.size.height}px; margin-left:-${component.size.width / 2}px; margin-top:-${component.size.height / 2}px; transform:scale(${scale}); pointer-events:none;`;
    const tagHtml = `<${component.tag} ${attrs} style="${style}"></${component.tag}>`;

    return html`
      <div class="component-card" style="--category-accent:${category.accent}"
        draggable="true" tabindex="0"
        title="${component.description} — drag onto the canvas, or click to add"
        @dragstart=${event => this._onDragStart(event, component.id)}
        @click=${() => this._onPhysicalQuickAdd(component.id)}
        @keydown=${event => event.key === 'Enter' && this._onPhysicalQuickAdd(component.id)}>
        <div class="component-preview">
          ${component.visualKind === 'dip8'
            ? html`<div class="dip-preview">DIP-8</div>`
            : component.type === 'custom'
              ? html`<img class="custom-preview-img" src=${component.imageUrl} alt="" />`
              : unsafeHTML(tagHtml)}
        </div>
        <div class="component-name">${component.name}</div>
      </div>
    `;
  }

  _openBuilder() {
    this.dispatchEvent(new CustomEvent('open-component-builder', { bubbles: true, composed: true }));
  }

  _onDragStart(event, componentId) {
    event.dataTransfer.setData('text/plain', componentId);
    event.dataTransfer.effectAllowed = 'copy';
  }

  _onPhysicalQuickAdd(componentId) {
    window.dispatchEvent(new CustomEvent('elera-add-physical-component', { detail: { componentId } }));
    this.dispatchEvent(new CustomEvent('component-chosen', {
      bubbles: true,
      composed: true,
      detail: { componentId },
    }));
  }
}

customElements.define('component-sidebar', ComponentSidebar);

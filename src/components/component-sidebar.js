import { LitElement, html, css } from 'lit';
import { componentLibrary } from '../component-library.js';
import {
  PART_LIBRARY_FILTERS,
  componentLibraryMetadata,
  componentMatchesLibraryFilter,
  componentMatchesLibrarySearch,
  groupLibraryComponentFamilies,
} from '../core/component-library-view.js';
import { faIcon } from '../utils/fa-icons.js';
import './part-preview.js';

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
  // The Fritzing contract uses the broader `board` category. Keep those
  // imported controller boards visible in Elera's Controller boards section.
  if (component.category === 'board') return 'controller';
  if (component.visualKind === 'dip8') return component.category === 'internal' ? null : 'ic';
  return DISPLAY_CATEGORIES.some(category => category.id === component.category)
    ? component.category
    : null;
}

class ComponentSidebar extends LitElement {
  static properties = {
    _libraryVersion: { state: true },
    _searchQuery: { state: true },
    _partFilter: { state: true },
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
      margin-bottom: 10px;
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

    .filter-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4px;
      margin: 0 0 14px;
    }

    .filter-chip {
      min-width: 0;
      min-height: 27px;
      padding: 0 4px;
      border: 1px solid var(--panel-border);
      border-radius: 999px;
      color: var(--text-muted);
      background: transparent;
      font: 600 10px/1 var(--font-ui, 'Public Sans', sans-serif);
      cursor: pointer;
    }

    .filter-chip:hover,
    .filter-chip:focus-visible {
      color: var(--text);
      border-color: var(--text-muted);
      outline: none;
    }

    .filter-chip[aria-pressed='true'] {
      color: var(--text);
      background: var(--primary);
      border-color: var(--primary-hover);
    }

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

    .family-group + .family-group { margin-top: 10px; }

    .family-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 0 2px 6px;
      color: var(--text-muted);
      font-size: 10px;
      font-weight: 600;
    }

    .family-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text);
      text-transform: uppercase;
      letter-spacing: .06em;
    }

    .family-count { flex: 0 0 auto; }

    .component-card {
      position: relative;
      box-sizing: border-box;
      width: 100%;
      height: 108px;
      min-width: 0;
      display: grid;
      grid-template-rows: 56px 20px 16px;
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
      height: 56px;
      align-self: center;
      pointer-events: none;
      overflow: hidden;
    }

    .component-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      align-self: center;
      color: var(--text);
      font-size: 12px;
      font-weight: 600;
      line-height: 20px;
      text-align: center;
    }

    .component-meta {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-muted);
      font-size: 9px;
      font-weight: 500;
      line-height: 14px;
      text-align: center;
    }

    .source-badge {
      position: absolute;
      top: 5px;
      right: 5px;
      z-index: 3;
      max-width: calc(100% - 10px);
      padding: 2px 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text);
      background: color-mix(in srgb, var(--panel) 88%, transparent);
      border: 1px solid var(--panel-border);
      border-radius: 2px;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: .05em;
      line-height: 1;
      text-transform: uppercase;
      white-space: nowrap;
      pointer-events: none;
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
      .component-card { height: 110px; grid-template-rows: 58px 20px 16px; }
      .component-preview { height: 58px; }
    }
  `;

  constructor() {
    super();
    this._libraryVersion = 0;
    this._searchQuery = '';
    this._partFilter = 'all';
    this._customLibraryHandler = () => { this._libraryVersion++; };
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('elera-custom-components-change', this._customLibraryHandler);
    window.addEventListener('elera-component-library-change', this._customLibraryHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('elera-custom-components-change', this._customLibraryHandler);
    window.removeEventListener('elera-component-library-change', this._customLibraryHandler);
  }

  render() {
    const catalog = Object.values(componentLibrary)
      .map(component => ({ component, category: DISPLAY_CATEGORIES.find(item => item.id === displayCategory(component)) }))
      .filter(item => item.category);
    const visible = catalog.filter(({ component, category }) =>
      componentMatchesLibraryFilter(component, this._partFilter) &&
      componentMatchesLibrarySearch(component, this._searchQuery, category));
    return html`
      <div class="library-header">
        <div class="title">Parts library</div>
        <div class="library-ref">${catalog.length} PARTS</div>
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
      <div class="filter-row" role="group" aria-label="Filter parts">
        ${PART_LIBRARY_FILTERS.map(filter => html`
          <button class="filter-chip" type="button"
            aria-pressed=${String(this._partFilter === filter.id)}
            @click=${() => { this._partFilter = filter.id; }}>${filter.label}</button>
        `)}
      </div>
      ${(() => {
        const sections = DISPLAY_CATEGORIES.map(category => {
        const components = visible
          .filter(item => item.category.id === category.id)
          .map(item => item.component);
        if (components.length === 0) return '';
        const families = groupLibraryComponentFamilies(components);
        return html`
          <section aria-labelledby="category-${category.id}" style="--category-accent:${category.accent}">
            <div class="category-header">
              <div class="category-title">
                <div class="category-name" id="category-${category.id}">${category.label}</div>
                <span class="category-accent" aria-hidden="true"></span>
              </div>
              <div class="category-ref">${category.descriptor} · ${components.length}</div>
            </div>
            ${families.map(family => html`
              <div class="family-group">
                ${family.label ? html`
                  <div class="family-header">
                    <span class="family-name">${family.label}</span>
                    <span class="family-count">${family.components.length} variants</span>
                  </div>
                ` : ''}
                <div class="category-grid">
                  ${family.components.map(component => this._renderCard(component, category))}
                </div>
              </div>
            `)}
          </section>
        `;
        });
        return visible.length > 0
          ? sections
          : html`<div class="empty-state">No parts match this search and filter.</div>`;
      })()}
    `;
  }

  _renderCard(component, category) {
    const metadata = componentLibraryMetadata(component);
    const sourceBadge = metadata.source === 'fritzing'
      ? 'Fritzing'
      : metadata.source === 'custom' ? 'My part' : '';
    const detail = [metadata.variant, metadata.technology].filter(Boolean).join(' · ') ||
      (metadata.mounting === 'breadboard' ? 'Breadboard ready' :
        metadata.mounting === 'surface' ? 'Prototype surface' : 'Jumper wired');
    return html`
      <div class="component-card" style="--category-accent:${category.accent}"
        draggable="true" tabindex="0"
        title="${component.description} — drag onto the canvas, or click to add"
        @dragstart=${event => this._onDragStart(event, component.id)}
        @click=${() => this._onPhysicalQuickAdd(component.id)}
        @keydown=${event => event.key === 'Enter' && this._onPhysicalQuickAdd(component.id)}>
        ${sourceBadge ? html`<span class="source-badge">${sourceBadge}</span>` : ''}
        <div class="component-preview">
          <elera-part-preview .componentId=${component.id}></elera-part-preview>
        </div>
        <div class="component-name">${component.name}</div>
        <div class="component-meta">${detail}</div>
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

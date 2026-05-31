import { LitElement, html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { componentLibrary, categories } from '../component-library.js';
import { faIcon } from '../utils/fa-icons.js';

class ComponentSidebar extends LitElement {
    static properties = {
        _libraryVersion: { state: true },
    };

    static styles = css `
    :host {
      display: block;
      background: #18181b; /* Zinc 900 */
      border-right: 1px solid #27272a; /* Zinc 800 */
      overflow-y: auto;
      padding: 14px 12px 18px;
    }

    .title {
      font-size: 12px;
      font-weight: 600;
      color: #fafafa;
      margin-bottom: 14px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .create-btn {
      width: 100%;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: 6px;
      border: 1px solid #0ea5e9;
      background: rgba(14, 165, 233, 0.12);
      color: #e0f2fe;
      font-size: 11px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      margin-bottom: 14px;
    }

    .create-btn:hover {
      background: rgba(14, 165, 233, 0.2);
    }

    .category-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #71717a; /* Zinc 500 */
      margin: 14px 0 7px 2px;
      font-weight: 600;
    }

    .category-label:first-of-type {
      margin-top: 0;
    }

    .category-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-bottom: 10px;
    }

    .component-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 96px;
      padding: 10px 6px 8px;
      background: #27272a; /* Zinc 800 */
      border-radius: 8px;
      cursor: grab;
      transition: all 0.1s ease;
      border: 1px solid #3f3f46; /* Zinc 700 */
      text-align: center;
    }

    .component-card:hover {
      background: #3f3f46; /* Zinc 700 */
      border-color: #52525b; /* Zinc 600 */
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }

    .component-card:active {
      cursor: grabbing;
      transform: scale(0.96);
      border-color: #0ea5e9; /* Sky 500 */
    }

    .component-preview {
      position: relative;
      width: 58px;
      height: 50px;
      margin-bottom: 7px;
      pointer-events: none;
      overflow: hidden;
    }

    .custom-preview-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }

    .component-name {
      font-size: 11px;
      font-weight: 500;
      color: #f4f4f5; /* Zinc 100 */
      line-height: 1.2;
      min-height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    @media (max-width: 900px) {
      :host {
        padding: 12px 10px;
      }

      .category-grid {
        gap: 6px;
      }

      .component-card {
        min-height: 88px;
      }

      .component-preview {
        width: 50px;
        height: 44px;
      }

      .component-name {
        font-size: 10px;
      }
    }

    :host::-webkit-scrollbar {
      width: 6px;
    }
    :host::-webkit-scrollbar-track {
      background: transparent;
    }
    :host::-webkit-scrollbar-thumb {
      background: #3f3f46;
      border-radius: 3px;
    }
  `;

    constructor() {
        super();
        this._libraryVersion = 0;
        this._customLibraryHandler = () => {
            this._libraryVersion++;
        };
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
            return html `
      <div class="title">Components</div>
      <button class="create-btn" @click=${this._openBuilder}>
        ${faIcon('plus')} Create Custom Component
      </button>
      ${categories.map(cat => {
        const comps = Object.values(componentLibrary).filter(c => c.category === cat.id);
        if (comps.length === 0) return '';
        return html`
          <div class="category-label">${cat.name}</div>
          <div class="category-grid">
            ${comps.map(comp => {
              const scale = Math.min(1, 34 / Math.max(comp.size.width, comp.size.height));
              const attrs = Object.entries(comp.attrs || {}).map(([k,v])=>`${k}="${v}"`).join(' ');
              const style = `position:absolute; top:50%; left:50%; width:${comp.size.width}px; height:${comp.size.height}px; margin-left:-${comp.size.width/2}px; margin-top:-${comp.size.height/2}px; transform: scale(${scale}); pointer-events: none;`;
              const tagHtml = `<${comp.tag} ${attrs} style="${style}"></${comp.tag}>`;

              return html`
                <div
                  class="component-card"
                  draggable="true"
                  title="${comp.description}"
                  @dragstart=${(e) => this._onDragStart(e, comp.id)}
                >
                  <div class="component-preview">
                    ${comp.type === 'custom' ? html`
                      <img class="custom-preview-img" src=${comp.imageUrl} alt=${comp.name} />
                    ` : unsafeHTML(tagHtml)}
                  </div>
                  <div class="component-name">${comp.name}</div>
                </div>
              `;
            })}
          </div>
        `;
      })}
    `; 
  }

  _openBuilder() {
    this.dispatchEvent(new CustomEvent('open-component-builder', {
      bubbles: true,
      composed: true,
    }));
  }

  _onDragStart(e, componentId) {
    e.dataTransfer.setData('text/plain', componentId);
    e.dataTransfer.effectAllowed = 'copy';
  }
}

customElements.define('component-sidebar', ComponentSidebar);

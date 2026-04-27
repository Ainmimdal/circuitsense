import { LitElement, html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { componentLibrary, categories } from '../component-library.js';

class ComponentSidebar extends LitElement {
    static styles = css `
    :host {
      display: block;
      background: #18181b; /* Zinc 900 */
      border-right: 1px solid #27272a; /* Zinc 800 */
      overflow-y: auto;
      padding: 16px 12px;
    }

    .title {
      font-size: 13px;
      font-weight: 600;
      color: #fafafa;
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .category-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #71717a; /* Zinc 500 */
      margin: 16px 0 8px 4px;
      font-weight: 600;
    }

    .category-label:first-of-type {
      margin-top: 0;
    }

    .category-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }

    .component-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 12px 6px 8px 6px;
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
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }

    .component-card:active {
      cursor: grabbing;
      transform: scale(0.96);
      border-color: #0ea5e9; /* Sky 500 */
    }

    .component-preview {
      position: relative;
      width: 60px;
      height: 60px;
      margin-bottom: 8px;
      pointer-events: none;
    }

    .component-name {
      font-size: 11px;
      font-weight: 500;
      color: #f4f4f5; /* Zinc 100 */
      line-height: 1.2;
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

    render() {
            return html `
      <div class="title">Components</div>
      ${categories.map(cat => {
        const comps = Object.values(componentLibrary).filter(c => c.category === cat.id);
        if (comps.length === 0) return '';
        return html`
          <div class="category-label">${cat.name}</div>
          <div class="category-grid">
            ${comps.map(comp => {
              const scale = Math.min(1, 50 / Math.max(comp.size.width, comp.size.height));
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
                    ${unsafeHTML(tagHtml)}
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

  _onDragStart(e, componentId) {
    e.dataTransfer.setData('text/plain', componentId);
    e.dataTransfer.effectAllowed = 'copy';
  }
}

customElements.define('component-sidebar', ComponentSidebar);
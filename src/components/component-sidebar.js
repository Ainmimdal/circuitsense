import { LitElement, html, css } from 'lit';
import { componentLibrary, categories } from '../component-library.js';

class ComponentSidebar extends LitElement {
    static styles = css `
    :host {
      display: block;
      background: #1a1a2e;
      border-right: 1px solid #2a2a4a;
      overflow-y: auto;
      padding: 16px 12px;
    }

    .title {
      font-size: 13px;
      font-weight: 700;
      color: #4FC3F7;
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .category-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #555;
      margin: 16px 0 8px 4px;
      font-weight: 600;
    }

    .category-label:first-of-type {
      margin-top: 0;
    }

    .component-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      background: #252545;
      border-radius: 8px;
      margin-bottom: 5px;
      cursor: grab;
      transition: all 0.2s ease;
      border: 1px solid transparent;
    }

    .component-card:hover {
      background: #2d2d55;
      border-color: #4FC3F7;
      transform: translateX(3px);
    }

    .component-card:active {
      cursor: grabbing;
      transform: scale(0.97);
    }

    .component-icon {
      font-size: 18px;
      width: 28px;
      text-align: center;
      flex-shrink: 0;
    }

    .component-info {
      flex: 1;
      min-width: 0;
    }

    .component-name {
      font-size: 12px;
      font-weight: 600;
      color: #e0e0e0;
    }

    .component-desc {
      font-size: 9px;
      color: #777;
      margin-top: 1px;
    }

    :host::-webkit-scrollbar {
      width: 6px;
    }
    :host::-webkit-scrollbar-track {
      background: transparent;
    }
    :host::-webkit-scrollbar-thumb {
      background: #333;
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
          ${comps.map(comp => html`
            <div
              class="component-card"
              draggable="true"
              @dragstart=${(e) => this._onDragStart(e, comp.id)}
            >
              <div class="component-icon">${comp.icon}</div>
              <div class="component-info">
                <div class="component-name">${comp.name}</div>
                <div class="component-desc">${comp.description}</div>
              </div>
            </div>
          `)}
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
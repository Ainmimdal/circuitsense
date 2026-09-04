import { LitElement, html, css } from 'lit';
import { componentLibrary } from '../component-library.js';
import { normalizeContentBounds } from '../core/image-content-bounds.js';
import { createPartVisualElement } from '../core/visual-adapter.js';

class PartPreview extends LitElement {
    static properties = {
        componentId: { type: String, attribute: 'component-id' },
    };

    static styles = css`
        :host { position: absolute; inset: 0; display: block; overflow: hidden; pointer-events: none; }
        #mount { position: absolute; inset: 0; }
        .dip-preview {
            position: absolute; left: 12px; right: 12px; top: 13px; height: 26px;
            display: grid; place-items: center; color: var(--text-muted); background: var(--ink);
            border: 1px solid var(--panel-border); border-radius: 2px;
            font: 9px/1 var(--font-tech, '0xProto', monospace);
        }
        .dip-preview::before, .dip-preview::after {
            content: ''; position: absolute; left: 4px; right: 4px; height: 4px;
            background: repeating-linear-gradient(90deg, var(--text-muted) 0 3px, transparent 3px 9px);
        }
        .dip-preview::before { top: -5px; }
        .dip-preview::after { bottom: -5px; }
    `;

    render() {
        const component = componentLibrary[this.componentId];
        return component?.visualKind === 'dip8'
            ? html`<div class="dip-preview">DIP-8</div>`
            : html`<div id="mount"></div>`;
    }

    updated() {
        const component = componentLibrary[this.componentId];
        const mount = this.renderRoot.querySelector('#mount');
        if (!component || !mount) return;
        const visual = createPartVisualElement(component);
        if (!visual) return;
        const width = Math.max(1, Number(component.size?.width || 120));
        const height = Math.max(1, Number(component.size?.height || 80));
        const content = normalizeContentBounds(component.contentBounds, { width, height });
        const scale = Math.min(1, 76 / content.width, 48 / content.height);
        const left = 38 - (content.x + content.width / 2) * scale;
        const top = 29 - (content.y + content.height / 2) * scale;
        visual.style.cssText = `position:absolute;top:${top}px;left:${left}px;width:${width}px;height:${height}px;` +
            `transform:scale(${scale});transform-origin:0 0;pointer-events:none;`;
        if (visual.tagName === 'IMG') visual.style.objectFit = 'contain';
        mount.replaceChildren(visual);
    }
}

customElements.define('elera-part-preview', PartPreview);

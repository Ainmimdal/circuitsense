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
        const place = box => {
            // Small parts are enlarged and big ones shrunk so every card shows its part at a similar size.
            const room = { width: Math.max(40, mount.clientWidth - 16), height: Math.max(30, mount.clientHeight - 8) };
            const scale = Math.min(3, room.width / box.width, room.height / box.height);
            const left = mount.clientWidth / 2 - (box.x + box.width / 2) * scale;
            const top = mount.clientHeight / 2 - (box.y + box.height / 2) * scale;
            visual.style.cssText = `position:absolute;top:${top}px;left:${left}px;width:${width}px;height:${height}px;` +
                `transform:scale(${scale});transform-origin:0 0;pointer-events:none;`;
            if (visual.tagName === 'IMG') visual.style.objectFit = 'contain';
        };
        place(content);
        mount.replaceChildren(visual);
        if (visual.tagName === 'IMG') return;
        // A Wokwi element draws at its own size, which often differs from the declared one, so measure the drawing.
        Promise.resolve(visual.updateComplete).then(() => requestAnimationFrame(() => {
            // Some elements hold a second, tiny drawing (the buzzer's music note); frame the biggest.
            const area = node => { const box = node.getBoundingClientRect(); return box.width * box.height; };
            const drawing = [...(visual.shadowRoot?.querySelectorAll('svg') || [])].sort((a, b) => area(b) - area(a))[0];
            if (!drawing || !visual.isConnected) return;
            visual.style.transform = 'none';
            const outer = visual.getBoundingClientRect(), inner = drawing.getBoundingClientRect();
            if (inner.width > 1 && inner.height > 1) place({ x: inner.left - outer.left, y: inner.top - outer.top, width: inner.width, height: inner.height });
            else place(content);
        }));
    }
}

customElements.define('elera-part-preview', PartPreview);

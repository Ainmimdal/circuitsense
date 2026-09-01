import { LitElement, html, svg, css } from 'lit';
import { BREADBOARD, breadboardHoles } from '../breadboard-model.js';

class EleraBreadboard extends LitElement {
    static styles = css`
        :host { display: block; width: 100%; height: 100%; }
        svg { width: 100%; height: 100%; display: block; overflow: visible; }
        .face { fill: url(#face); stroke: #c9cbc8; stroke-width: 1.5; }
        .trench { fill: url(#trench); stroke: #c6c7c4; }
        .hole { fill: #17191a; stroke: #b9bbb8; stroke-width: 1.4; cursor: crosshair; }
        .hole:hover { fill: #ff9800; stroke: #fff; }
        .rail { stroke-width: 2; opacity: .9; }
        text { font-family: Arial, sans-serif; fill: #555; text-anchor: middle; font-size: 5px; user-select: none; }
        .row-label { font-size: 6px; font-weight: 700; }
    `;

    get pinInfo() { return breadboardHoles; }

    render() {
        const terminals = breadboardHoles.filter(h => h.kind === 'terminal');
        const rails = breadboardHoles.filter(h => h.kind === 'rail');
        const railY = Object.fromEntries(BREADBOARD.railNames.map(name => [name, rails.find(hole => hole.name === `${name}1`).y]));
        return html`<svg viewBox="0 0 ${BREADBOARD.width} ${BREADBOARD.height}" role="img" aria-label="Elera half-size 400-point breadboard">
            <defs>
                <linearGradient id="face" x2="0" y2="1"><stop stop-color="#fffefa"/><stop offset="1" stop-color="#e8e7e1"/></linearGradient>
                <linearGradient id="trench" x2="0" y2="1"><stop stop-color="#c9cac7"/><stop offset=".5" stop-color="#eeeeea"/><stop offset="1" stop-color="#bfc1be"/></linearGradient>
            </defs>
            <rect class="face" x="4" y="4" width="322" height="206" rx="10"/>
            <line class="rail" x1="20" y1=${railY.TN - BREADBOARD.pitch} x2="310" y2=${railY.TN - BREADBOARD.pitch} stroke="var(--accent-breadboards)"/>
            <line class="rail" x1="20" y1=${railY.TP + BREADBOARD.pitch} x2="310" y2=${railY.TP + BREADBOARD.pitch} stroke="#e53935"/>
            <line class="rail" x1="20" y1=${railY.BP - BREADBOARD.pitch} x2="310" y2=${railY.BP - BREADBOARD.pitch} stroke="#e53935"/>
            <line class="rail" x1="20" y1=${railY.BN + BREADBOARD.pitch} x2="310" y2=${railY.BN + BREADBOARD.pitch} stroke="var(--accent-breadboards)"/>
            <rect class="trench" x="10" y="107" width="310" height="10" rx="3"/>
            ${['A','B','C','D','E','F','G','H','I','J'].map(row => svg`<text class="row-label" x="10" y=${breadboardHoles.find(h => h.name === `${row}1`).y + 2}>${row}</text>`)}
            ${Array.from({length: 30}, (_, i) => (i + 1) % 5 === 0 ? svg`<text x=${20 + i * 10} y="54">${i + 1}</text><text x=${20 + i * 10} y="168">${i + 1}</text>` : '')}
            <text x="12" y=${railY.TN + 2} fill="var(--accent-breadboards)">&#8722;</text><text x="12" y=${railY.TP + 2} fill="#e53935">+</text>
            <text x="12" y=${railY.BP + 2} fill="#e53935">+</text><text x="12" y=${railY.BN + 2} fill="var(--accent-breadboards)">&#8722;</text>
            ${[...terminals, ...rails].map(hole => svg`<circle class="hole" data-pin=${hole.name} data-group=${hole.group} cx=${hole.x} cy=${hole.y} r="2.5"/>`)}
        </svg>`;
    }
}

if (!customElements.get('elera-breadboard')) {
    customElements.define('elera-breadboard', EleraBreadboard);
}

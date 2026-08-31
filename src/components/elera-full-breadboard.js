import { LitElement, html, svg, css } from 'lit';
import { boardRegistry } from '../core/board-registry.js';

const board = boardRegistry['breadboard-full-830'];
const railY = Object.freeze(Object.fromEntries(['TN', 'TP', 'BP', 'BN'].map(name => [name, board.getHole(`${name}1`).y])));

/** Pin metadata consumed by placed-component and the wire renderer. */
export const fullBreadboardPinInfo = Object.freeze(board.holes.map(hole => Object.freeze({
    name: hole.id,
    x: hole.x,
    y: hole.y,
    group: hole.groupId,
    kind: hole.zone,
    connectorType: hole.connectorType,
    signals: Object.freeze(hole.zone === 'rail'
        ? [{ type: 'power', signal: hole.polarity === 'power' ? 'VCC' : 'GND' }]
        : [{ signal: 'SIGNAL' }]),
})));

const railSegments = Object.freeze([
    { x1: 15, x2: 255 },
    { x1: 395, x2: 635 },
]);

export class EleraFullBreadboard extends LitElement {
    static styles = css`
        :host { display: block; width: 100%; height: 100%; }
        svg { display: block; width: 100%; height: 100%; overflow: visible; }
        .face { fill: url(#full-face); stroke: #c9cbc8; stroke-width: 1.5; }
        .trench { fill: url(#full-trench); stroke: #c6c7c4; }
        .hole { fill: #17191a; stroke: #b9bbb8; stroke-width: 1.4; cursor: crosshair; }
        .hole:hover { fill: #ff9800; stroke: #fff; }
        .rail { stroke-width: 2; opacity: .9; }
        .rail-break { stroke: #bfc1be; stroke-width: 1; stroke-dasharray: 2 2; }
        text {
            fill: #555;
            font-family: Arial, sans-serif;
            font-size: 5px;
            text-anchor: middle;
            user-select: none;
        }
        .row-label { font-size: 6px; font-weight: 700; }
        .brand { fill: #888; font-size: 6px; letter-spacing: .5px; }
    `;

    get pinInfo() {
        return fullBreadboardPinInfo;
    }

    render() {
        const terminals = fullBreadboardPinInfo.filter(hole => hole.kind === 'terminal');
        const rails = fullBreadboardPinInfo.filter(hole => hole.kind === 'rail');
        return html`
            <svg
                viewBox="0 0 ${board.width} ${board.height}"
                role="img"
                aria-label="Elera full-size 830-point breadboard"
            >
                <defs>
                    <linearGradient id="full-face" x2="0" y2="1">
                        <stop stop-color="#fffefa" />
                        <stop offset="1" stop-color="#e8e7e1" />
                    </linearGradient>
                    <linearGradient id="full-trench" x2="0" y2="1">
                        <stop stop-color="#c9cac7" />
                        <stop offset=".5" stop-color="#eeeeea" />
                        <stop offset="1" stop-color="#bfc1be" />
                    </linearGradient>
                </defs>

                <rect
                    class="face"
                    x="4" y="4"
                    width="${board.width - 8}" height="${board.height - 8}"
                    rx="10"
                />

                ${railSegments.map(segment => svg`
                    <line class="rail" x1=${segment.x1} y1=${railY.TN - board.pitch} x2=${segment.x2} y2=${railY.TN - board.pitch} stroke="#1976d2" />
                    <line class="rail" x1=${segment.x1} y1=${railY.TP + board.pitch} x2=${segment.x2} y2=${railY.TP + board.pitch} stroke="#e53935" />
                    <line class="rail" x1=${segment.x1} y1=${railY.BP - board.pitch} x2=${segment.x2} y2=${railY.BP - board.pitch} stroke="#e53935" />
                    <line class="rail" x1=${segment.x1} y1=${railY.BN + board.pitch} x2=${segment.x2} y2=${railY.BN + board.pitch} stroke="#1976d2" />
                `)}

                <line class="rail-break" x1="325" y1="8" x2="325" y2="52" />
                <line class="rail-break" x1="325" y1="168" x2="325" y2="212" />
                <rect class="trench" x="10" y="107" width="${board.width - 20}" height="10" rx="3" />

                ${['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map(row => svg`
                    <text
                        class="row-label"
                        x="7"
                        y=${board.getHole(`${row}1`).y + 2}
                    >${row}</text>
                    <text
                        class="row-label"
                        x="643"
                        y=${board.getHole(`${row}63`).y + 2}
                    >${row}</text>
                `)}

                ${Array.from({ length: board.columns }, (_, index) => {
                    const column = index + 1;
                    if (column !== 1 && column !== board.columns && column % 5 !== 0) return '';
                    const x = board.getHole(`A${column}`).x;
                    return svg`<text x=${x} y="54">${column}</text><text x=${x} y="168">${column}</text>`;
                })}

                <text x="7" y=${railY.TN + 2} fill="#1976d2">−</text>
                <text x="7" y=${railY.TP + 2} fill="#e53935">+</text>
                <text x="7" y=${railY.BP + 2} fill="#e53935">+</text>
                <text x="7" y=${railY.BN + 2} fill="#1976d2">−</text>
                <text x="643" y=${railY.TN + 2} fill="#1976d2">−</text>
                <text x="643" y=${railY.TP + 2} fill="#e53935">+</text>
                <text x="643" y=${railY.BP + 2} fill="#e53935">+</text>
                <text x="643" y=${railY.BN + 2} fill="#1976d2">−</text>
                <text class="brand" x="325" y="113">ELERA 830</text>

                ${[...terminals, ...rails].map(hole => svg`
                    <circle
                        class="hole"
                        data-pin=${hole.name}
                        data-group=${hole.group}
                        cx=${hole.x}
                        cy=${hole.y}
                        r="2.5"
                    />
                `)}
            </svg>
        `;
    }
}

if (globalThis.customElements && !globalThis.customElements.get('elera-full-breadboard')) {
    globalThis.customElements.define('elera-full-breadboard', EleraFullBreadboard);
}

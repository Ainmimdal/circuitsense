import { LitElement, svg, css } from 'lit';

// Flat drawing of a lesson circuit from `lessonMap()`. `states` maps a step id
// to 'done' or 'current'; with no states every item is drawn as built.

const LED_COLORS = { red: '#ef5350', green: '#4caf72', yellow: '#f2c94c', blue: '#4f8fe8', white: '#f4f4f4', orange: '#f2994a' };
const PART_COLORS = { resistor: '#c9a46a', 'rgb-led': '#f4f4f4' };

function partColor(part) {
    if (part.kind === 'led') return LED_COLORS[part.color] || LED_COLORS.red;
    return PART_COLORS[part.kind] || '#b5b5b5';
}

// Black and dark jumpers vanish on the dark board, so draw them as light grey.
function wireColor(color) {
    const hex = /^#([0-9a-f]{6})$/i.exec(color || '');
    if (!hex) return '#b5b5b5';
    const value = parseInt(hex[1], 16);
    const light = 0.299 * (value >> 16) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255);
    return light < 70 ? '#9a9a9a' : color;
}

const mean = (points, key) => points.reduce((sum, point) => sum + point[key], 0) / points.length;

class LessonMap extends LitElement {
    static properties = {
        map: { attribute: false },
        states: { attribute: false },
    };

    static styles = css`
        :host { display: block; }
        svg { display: block; width: 100%; height: 100%; }
        .board { fill: #2c2c2d; }
        .hole { fill: #474749; }
        .box { fill: #2c2c2d; stroke: #474749; stroke-width: .5; }
        .box-label { fill: var(--text-muted); font: 3.4px var(--font-ui); }
        .todo { opacity: .22; }
        .pin { fill: #8a8a8a; }
        .pin-label { fill: var(--text); font: 600 3px var(--font-ui); text-anchor: middle; }
        .block { fill: #3d3d3f; stroke: #b5b5b5; stroke-width: .6; }
        .current .block { stroke: var(--accent); }
        .wire.current, .current polyline { stroke: var(--accent); }
        .current circle { fill: var(--accent); }
        .lens { fill-opacity: .85; }
        .current .board { fill: color-mix(in srgb, var(--accent) 14%, #2c2c2d); }
        .current.box { fill: color-mix(in srgb, var(--accent) 18%, #2c2c2d); stroke-width: .8; }
    `;

    _state(id) {
        if (!this.states) return '';
        return this.states[id] === 'done' ? '' : this.states[id] === 'current' ? 'current' : 'todo';
    }

    // Four-legged parts (buttons) read better as a square over their legs.
    _block(part) {
        const xs = part.points.map(point => point.x), ys = part.points.map(point => point.y);
        const x = Math.min(...xs), y = Math.min(...ys);
        return svg`<g class=${this._state(part.id)}>
            <rect class="block" x=${x} y=${y} width=${Math.max(...xs) - x} height=${Math.max(...ys) - y} rx=".6"></rect>
            ${part.points.map(point => svg`<circle cx=${point.x} cy=${point.y} r=".9" fill=${partColor(part)}></circle>`)}
        </g>`;
    }

    // Wires that leave the board run down to their own lane under it, so
    // parallel jumpers to the board pins never sit on top of each other.
    _wirePoints(wire, index) {
        const inside = point => this.map.surfaces.some(surface => point.x >= surface.x && point.x <= surface.x + surface.width
            && point.y >= surface.y && point.y <= surface.y + surface.height);
        const { from, to } = wire;
        if (inside(from) === inside(to)) return `${from.x},${from.y} ${from.x},${to.y} ${to.x},${to.y}`;
        const bottom = Math.max(...this.map.surfaces.map(surface => surface.y + surface.height));
        const lane = bottom + 2 + index * 1.6;
        return `${from.x},${from.y} ${from.x},${lane} ${to.x},${lane} ${to.x},${to.y}`;
    }

    render() {
        const map = this.map;
        if (!map) return '';
        const { x, y, width, height } = map.bounds;
        return svg`
            <svg viewBox="${x} ${y} ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Circuit layout">
                ${map.surfaces.map(surface => svg`<g class=${this._state(surface.id)}>
                    <rect class="board" x=${surface.x} y=${surface.y} width=${surface.width} height=${surface.height} rx="1.5"></rect>
                    ${surface.holes.map(hole => svg`<rect class="hole" x=${hole.x - .45} y=${hole.y - .45} width=".9" height=".9"></rect>`)}
                </g>`)}
                ${map.boxes.map(box => svg`<g>
                    <rect class="box ${this._state(box.id)}" x=${box.x} y=${box.y} width=${box.width} height=${box.height} rx="1"></rect>
                    <text class="box-label" x=${box.x + 2.5} y=${box.y + box.height - 3}>${box.label}</text>
                    ${[...(box.pins || [])].sort((a, b) => a.x - b.x).map((pin, index, pins) => {
                        // Neighbouring header pins are 2.54 mm apart, so alternate their labels between two lines.
                        const shift = pins.slice(0, index).filter(other => Math.abs(other.y - pin.y) < 1).length % 2;
                        return svg`<rect class="pin" x=${pin.x - .9} y=${pin.y - .9} width="1.8" height="1.8"></rect>
                            <text class="pin-label" x=${pin.x} y=${pin.y + 4.2 + shift * 3.2}>${pin.label}</text>`;
                    })}
                </g>`)}
                ${map.wires.map((wire, index) => svg`<polyline class="wire ${this._state(wire.id)}" fill="none"
                    points=${this._wirePoints(wire, index)}
                    stroke=${wireColor(wire.color)} stroke-width=".9" stroke-linecap="round" stroke-linejoin="round"></polyline>`)}
                ${map.parts.map(part => part.points.length > 3 && part.kind !== 'rgb-led' ? this._block(part) : svg`<g class=${this._state(part.id)}>
                    ${part.kind === 'led' || part.kind === 'rgb-led' ? svg`<circle class="lens" cx=${mean(part.points, 'x')} cy=${mean(part.points, 'y')} r="2.1" fill=${partColor(part)}></circle>` : ''}
                    <polyline points=${part.points.map(point => `${point.x},${point.y}`).join(' ')} fill="none"
                        stroke=${partColor(part)} stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></polyline>
                    ${part.points.map(point => svg`<circle cx=${point.x} cy=${point.y} r="1" fill=${partColor(part)}></circle>`)}
                </g>`)}
            </svg>
        `;
    }
}

customElements.define('lesson-map', LessonMap);

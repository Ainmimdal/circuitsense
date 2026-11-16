import { LitElement, css, html, svg } from 'lit';

// Artwork for the basic parts Wokwi does not ship: light sensor, capacitors,
// diode, transistor and DC motor. Drawn in CSS pixels with legs exactly one
// breadboard pitch (9.6 px = 2.54 mm) apart; pin positions are repeated in
// src/core/component-geometry.js.

const LEG = '#a8a8a8';
const sharedStyles = css`
    :host { display: inline-block; line-height: 0; }
    svg { display: block; overflow: visible; }
`;
const legs = (xs, from, to) => xs.map(x => svg`<path d="M${x} ${from}V${to}" stroke=${LEG} stroke-width="1.6" stroke-linecap="round" />`);

class PhotoresistorElement extends LitElement {
    static styles = sharedStyles;
    get pinInfo() { return [{ name: '1', x: 9.6, y: 46, signals: [] }, { name: '2', x: 19.2, y: 46, signals: [] }]; }
    render() {
        return html`<svg width="28.8" height="48" viewBox="0 0 28.8 48" role="img" aria-label="Photoresistor">
            ${legs([9.6, 19.2], 22, 46)}
            <circle cx="14.4" cy="13" r="12" fill="#e8dcc0" stroke="#8d7b55" stroke-width=".8" />
            <path d="M5.5 7.5h17.5v3.6H6v3.6h17v3.6H5.5" fill="none" stroke="#c0392b" stroke-width="1.5" stroke-linejoin="round" />
            <circle cx="14.4" cy="13" r="12" fill="#fff" opacity=".12" />
        </svg>`;
    }
}

class CeramicCapacitorElement extends LitElement {
    static styles = sharedStyles;
    get pinInfo() { return [{ name: '1', x: 9.6, y: 42, signals: [] }, { name: '2', x: 19.2, y: 42, signals: [] }]; }
    render() {
        return html`<svg width="28.8" height="44" viewBox="0 0 28.8 44" role="img" aria-label="Ceramic capacitor">
            ${legs([9.6, 19.2], 20, 42)}
            <ellipse cx="14.4" cy="13" rx="11.5" ry="10.5" fill="#d98a2b" stroke="#9c5d12" stroke-width=".8" />
            <ellipse cx="11" cy="9" rx="5" ry="3.4" fill="#fff" opacity=".22" />
            <text x="14.4" y="16.2" text-anchor="middle" font-family="Arial, sans-serif" font-size="7.5" font-weight="700" fill="#4a2a05">104</text>
        </svg>`;
    }
}

class ElectrolyticCapacitorElement extends LitElement {
    static styles = sharedStyles;
    get pinInfo() { return [{ name: '+', x: 9.6, y: 50, signals: [] }, { name: '-', x: 19.2, y: 50, signals: [] }]; }
    render() {
        return html`<svg width="28.8" height="52" viewBox="0 0 28.8 52" role="img" aria-label="Electrolytic capacitor">
            ${legs([9.6, 19.2], 32, 50)}
            <rect x="2.4" y="1" width="24" height="33" rx="3" fill="#1f3b73" stroke="#122449" stroke-width=".8" />
            <rect x="2.9" y="1.5" width="4" height="32" rx="2" fill="#fff" opacity=".18" />
            <!-- The pale stripe marks the negative leg, as on the real part. -->
            <rect x="18.4" y="1.4" width="6" height="32.2" fill="#c9d3e6" />
            ${[7, 15, 23].map(y => svg`<rect x="19.9" y=${y} width="3" height="1.3" fill="#1f3b73" />`)}
            <text x="9.6" y="46" text-anchor="middle" font-family="Arial, sans-serif" font-size="7" font-weight="700" fill="#e11d48">+</text>
        </svg>`;
    }
}

class DiodeElement extends LitElement {
    static styles = sharedStyles;
    get pinInfo() { return [{ name: 'A', x: 0, y: 5.76, signals: [] }, { name: 'C', x: 38.4, y: 5.76, signals: [] }]; }
    render() {
        return html`<svg width="38.4" height="11.52" viewBox="0 0 38.4 11.52" role="img" aria-label="Diode">
            <path d="M0 5.76H38.4" stroke=${LEG} stroke-width="1.6" stroke-linecap="round" />
            <rect x="10" y="1.2" width="18.4" height="9.1" rx="1.6" fill="#1c1c1c" />
            <rect x="10.4" y="1.6" width="17.6" height="2.2" rx="1" fill="#fff" opacity=".14" />
            <!-- The silver band is the cathode end: current flows toward it. -->
            <rect x="23.2" y="1.2" width="3" height="9.1" fill="#cfcfcf" />
        </svg>`;
    }
}

class TransistorElement extends LitElement {
    static styles = sharedStyles;
    get pinInfo() {
        return [{ name: 'E', x: 4.8, y: 46, signals: [] }, { name: 'B', x: 14.4, y: 46, signals: [] }, { name: 'C', x: 24, y: 46, signals: [] }];
    }
    render() {
        return html`<svg width="28.8" height="48" viewBox="0 0 28.8 48" role="img" aria-label="NPN transistor">
            <path d="M10 22L4.8 30V46M14.4 22V46M18.8 22L24 30V46" fill="none" stroke=${LEG} stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M4.4 24V9.5a10 8.5 0 0 1 20 0V24Z" fill="#1c1c1c" />
            <path d="M6 23V9.8a8.4 7 0 0 1 3.4-5.6V23Z" fill="#fff" opacity=".12" />
            <text x="14.4" y="13.5" text-anchor="middle" font-family="Arial, sans-serif" font-size="5" fill="#d4d4d4">2N</text>
            <text x="14.4" y="19.5" text-anchor="middle" font-family="Arial, sans-serif" font-size="5" fill="#d4d4d4">2222</text>
            ${[['E', 4.8], ['B', 14.4], ['C', 24]].map(([label, x]) => svg`<text x=${x + 3.2} y="42" text-anchor="middle"
                font-family="Arial, sans-serif" font-size="4.6" font-weight="700" fill="#64748b">${label}</text>`)}
        </svg>`;
    }
}

class DcMotorElement extends LitElement {
    static properties = { spinning: { type: Boolean }, reverse: { type: Boolean } };
    static styles = [sharedStyles, css`
        .rotor { transform-origin: 99px 30px; }
        .rotor.on { animation: spin .5s linear infinite; }
        .rotor.on.reverse { animation-direction: reverse; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .rotor.on { animation-duration: 3s; } }
    `];
    get pinInfo() { return [{ name: '+', x: 2, y: 18, signals: [] }, { name: '-', x: 2, y: 42, signals: [] }]; }
    render() {
        return html`<svg width="116" height="60" viewBox="0 0 116 60" role="img" aria-label="DC motor">
            <path d="M2 18H16C22 18 22 24 28 24" fill="none" stroke="#dc2626" stroke-width="2.4" stroke-linecap="round" />
            <path d="M2 42H16C22 42 22 36 28 36" fill="none" stroke="#1f2937" stroke-width="2.4" stroke-linecap="round" />
            <rect x="26" y="14" width="8" height="32" rx="2" fill="#e5e7eb" stroke="#9ca3af" stroke-width=".8" />
            <rect x="33" y="6" width="50" height="48" rx="7" fill="#b8bec7" stroke="#7b838f" stroke-width=".9" />
            <rect x="34" y="9" width="48" height="9" rx="4" fill="#fff" opacity=".35" />
            <rect x="46" y="6.4" width="10" height="47.2" fill="#7b838f" opacity=".35" />
            <rect x="82" y="22" width="6" height="16" rx="1.5" fill="#d4a94a" stroke="#9a7420" stroke-width=".7" />
            <rect x="87" y="28" width="9" height="4" fill="#9ca3af" />
            <g class="rotor ${this.spinning ? 'on' : ''} ${this.reverse ? 'reverse' : ''}">
                <circle cx="99" cy="30" r="13" fill="#f8fafc" stroke="#64748b" stroke-width="1" />
                <path d="M99 30V17.5M99 30l10.8 6.2M99 30l-10.8 6.2" stroke="#ef4444" stroke-width="3" stroke-linecap="round" />
                <circle cx="99" cy="30" r="2.6" fill="#475569" />
            </g>
        </svg>`;
    }
}

if (typeof customElements !== 'undefined') {
    for (const [tag, element] of [
        ['elera-photoresistor', PhotoresistorElement], ['elera-ceramic-capacitor', CeramicCapacitorElement],
        ['elera-electrolytic-capacitor', ElectrolyticCapacitorElement], ['elera-diode', DiodeElement],
        ['elera-transistor', TransistorElement], ['elera-dc-motor', DcMotorElement],
    ]) if (!customElements.get(tag)) customElements.define(tag, element);
}

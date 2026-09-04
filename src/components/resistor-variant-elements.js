import { LitElement, css, html } from 'lit';

const BAND_COLORS = Object.freeze({
    [-2]: '#c3c7c0', [-1]: '#f1d863', 0: '#000000', 1: '#8f4814', 2: '#fb0000',
    3: '#fc9700', 4: '#fcf800', 5: '#00b800', 6: '#0000ff', 7: '#a803d6',
    8: '#808080', 9: '#fcfcfc',
});
const BREADBOARD_PITCH_MM = 2.54;
// Five occupied hole positions means four 2.54 mm pitch intervals.
const COMPACT_DEFAULT_SPAN_MM = 4 * BREADBOARD_PITCH_MM;
const COMPACT_BODY_LEFT_MM = BREADBOARD_PITCH_MM;
const COMPACT_BODY_RIGHT_MM = 3 * BREADBOARD_PITCH_MM;
const COMPACT_RESISTOR_SVG_URL = new URL('../assets/resistor-compact.svg', import.meta.url).href;

function resistorBands(value) {
    const resistance = Math.max(0, Number.parseFloat(value) || 0);
    const exponent = resistance >= 1e10 ? 9 : resistance >= 1e9 ? 8 : resistance >= 1e8 ? 7
        : resistance >= 1e7 ? 6 : resistance >= 1e6 ? 5 : resistance >= 1e5 ? 4
            : resistance >= 1e4 ? 3 : resistance >= 1e3 ? 2 : resistance >= 1e2 ? 1
                : resistance >= 1e1 ? 0 : resistance >= 1 ? -1 : -2;
    const base = resistance === 0 ? 0 : Math.round(resistance / 10 ** exponent) % 100;
    return [BAND_COLORS[Math.floor(base / 10)], BAND_COLORS[base % 10], BAND_COLORS[exponent], '#f1d863'];
}

class ResistorVariantElement extends LitElement {
    static properties = {
        value: { type: String },
        leadSpanMm: { type: Number, attribute: 'lead-span-mm' },
    };
    static styles = css`
        :host { display: flex; width: 100%; height: 100%; }
        svg { display: block; width: 100%; height: 100%; overflow: visible; }
    `;

    constructor() {
        super();
        this.value = '220';
        this.leadSpanMm = COMPACT_DEFAULT_SPAN_MM;
    }
}

/** Wokwi-inspired axial body shortened from six breadboard pitches to four. */
class CompactResistorElement extends ResistorVariantElement {
    render() {
        const [first, second, multiplier, tolerance] = resistorBands(this.value);
        const leadSpanMm = Math.max(3 * BREADBOARD_PITCH_MM, Number(this.leadSpanMm) || COMPACT_DEFAULT_SPAN_MM);
        // Geometry lives in the standalone SVG. For alternate legal hole
        // spans, translate the body and lengthen only its two lead assets.
        const bodyOffset = (leadSpanMm - COMPACT_DEFAULT_SPAN_MM) / 2;
        return html`
            <svg viewBox=${`0 0 ${leadSpanMm} 3`} role="img" aria-label="Compact axial resistor">
                ${bodyOffset > 0 ? html`<path
                    d=${`M0 1.5H${bodyOffset}M${bodyOffset + COMPACT_DEFAULT_SPAN_MM} 1.5H${leadSpanMm}`}
                    fill="none" stroke="#aaa" stroke-width=".638" stroke-linecap="round" />` : ''}
                <image href=${COMPACT_RESISTOR_SVG_URL} x=${bodyOffset} y="0"
                    width=${COMPACT_DEFAULT_SPAN_MM} height="3" preserveAspectRatio="none" />
                <g transform=${`translate(${bodyOffset} 0)`}>
                    <rect x="2.99" y=".32" width=".5" height="2.36" fill=${first} />
                    <rect x="3.97" y=".32" width=".46" height="2.36" fill=${second} />
                    <rect x="4.95" y=".32" width=".46" height="2.36" fill=${multiplier} />
                    <rect x="6.65" y=".32" width=".5" height="2.36" fill=${tolerance} />
                </g>
            </svg>`;
    }
}

/** The same electrical resistor standing on one end for a one-pitch footprint. */
class UprightResistorElement extends ResistorVariantElement {
    render() {
        const [first, second, multiplier, tolerance] = resistorBands(this.value);
        const body = 'M3 .45C1.56.45.38 1.62.38 3.06c0 .55.17 1.05.46 1.47v5.16c-.29.42-.46.92-.46 1.47 0 1.44 1.18 2.61 2.62 2.61s2.62-1.17 2.62-2.61c0-.55-.17-1.05-.46-1.47V4.53c.29-.42.46-.92.46-1.47C5.62 1.62 4.44.45 3 .45Z';
        return html`
            <svg viewBox="0 0 12 18" role="img" aria-label="Upright resistor">
                <defs>
                    <linearGradient id="upright-resistor-shade" x1="0" y1="0" x2="1" y2="0">
                        <stop stop-color="#ffffff" stop-opacity=".42" offset="0" />
                        <stop stop-color="#323232" stop-opacity=".18" offset="1" />
                    </linearGradient>
                    <clipPath id="upright-resistor-body"><path d=${body} /></clipPath>
                </defs>
                <path d="M3 17v-3.25M9 17v-2.1c0-1.85-1.12-3.12-3.38-3.74" fill="none"
                    stroke="#aaa" stroke-width=".75" stroke-linecap="round" stroke-linejoin="round" />
                <path d=${body} fill="#d5b597" stroke="#9b7657" stroke-width=".18" />
                <path d=${body} fill="url(#upright-resistor-shade)" />
                <g clip-path="url(#upright-resistor-body)">
                    <rect x=".38" y="2.05" width="5.24" height=".82" fill=${first} />
                    <rect x=".84" y="4.58" width="4.32" height=".78" fill=${second} />
                    <rect x=".84" y="7.18" width="4.32" height=".78" fill=${multiplier} />
                    <rect x=".38" y="10.55" width="5.24" height=".82" fill=${tolerance} />
                </g>
                <circle cx="3" cy="17" r=".42" fill="#8c8c8c" />
                <circle cx="9" cy="17" r=".42" fill="#8c8c8c" />
            </svg>`;
    }
}

export const RESISTOR_PACKAGE_VISUALS = Object.freeze({
    compact: Object.freeze({
        tag: 'elera-compact-resistor',
        defaultSourceSize: Object.freeze({ width: COMPACT_DEFAULT_SPAN_MM, height: 3 }),
    }),
    upright: Object.freeze({
        tag: 'elera-upright-resistor',
        sourceSize: Object.freeze({ width: 12, height: 18 }),
        nativePins: Object.freeze({ '1': Object.freeze({ x: 3, y: 17 }), '2': Object.freeze({ x: 9, y: 17 }) }),
    }),
});

export function getResistorPackageVisual(footprint) {
    const visual = RESISTOR_PACKAGE_VISUALS[footprint?.visualVariant];
    if (!visual) return null;
    if (footprint.visualVariant !== 'compact') return visual;
    const width = Math.max(3, Number(footprint.leadSpan || 4)) * BREADBOARD_PITCH_MM;
    return {
        ...visual,
        sourceSize: Object.freeze({ width, height: 3 }),
        nativePins: Object.freeze({
            '1': Object.freeze({ x: 0, y: 1.5 }),
            '2': Object.freeze({ x: width, y: 1.5 }),
        }),
    };
}

if (typeof customElements !== 'undefined') {
    if (!customElements.get('elera-compact-resistor')) customElements.define('elera-compact-resistor', CompactResistorElement);
    if (!customElements.get('elera-upright-resistor')) customElements.define('elera-upright-resistor', UprightResistorElement);
}

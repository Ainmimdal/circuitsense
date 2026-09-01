import { svg } from 'lit';

// Compact Lucide-style outline glyphs for the editor. Every icon uses the
// same 24px grid, round joins and a 1.5px stroke.
const ICONS = Object.freeze({
    undo: svg`<path d="M9 7 4 12l5 5"/><path d="M20 17a7 7 0 0 0-7-7H4"/>`,
    redo: svg`<path d="m15 7 5 5-5 5"/><path d="M4 17a7 7 0 0 1 7-7h9"/>`,
    save: svg`<path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>`,
    download: svg`<path d="M12 3v12m-4-4 4 4 4-4"/><path d="M5 20h14"/>`,
    upload: svg`<path d="M12 15V3m-4 4 4-4 4 4"/><path d="M5 20h14"/>`,
    wrench: svg`<path d="M14.7 6.3a4 4 0 0 0-5-5l2.2 2.2-2.4 2.4-2.2-2.2a4 4 0 0 0 5 5L20 16.4a2.1 2.1 0 0 1-3 3l-7.7-7.7"/>`,
    rotateLeft: svg`<path d="M4 4v6h6"/><path d="M4.6 10A8 8 0 1 1 6 17"/>`,
    rotateRight: svg`<path d="M20 4v6h-6"/><path d="M19.4 10A8 8 0 1 0 18 17"/>`,
    bolt: svg`<path d="m13 2-8 12h7l-1 8 8-12h-7z"/>`,
    wand: svg`<path d="m4 20 11-11"/><path d="m13 7 4 4M6 3v3M4.5 4.5h3M19 15v4M17 17h4"/>`,
    overlap: svg`<rect x="3" y="6" width="11" height="11" rx="1"/><rect x="10" y="3" width="11" height="11" rx="1"/>`,
    fan: svg`<path d="M4 12h5M9 12l7-7M9 12l7 7"/><circle cx="18" cy="5" r="1.5"/><circle cx="18" cy="19" r="1.5"/>`,
    ortho: svg`<path d="M5 5v14h14"/><path d="M9 9h6v6"/>`,
    free: svg`<path d="M4 18c4-12 9 5 16-12"/>`,
    snap: svg`<path d="M6 3v7a6 6 0 0 0 12 0V3"/><path d="M6 7h4M14 7h4M9 18v3M15 18v3"/>`,
    trash: svg`<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>`,
    folder: svg`<path d="M3 6h7l2 2h9v11H3z"/>`,
    folderOpen: svg`<path d="M3 7h7l2 2h9l-2 10H3z"/><path d="M3 7v12"/>`,
    plug: svg`<path d="M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>`,
    plus: svg`<path d="M12 5v14M5 12h14"/>`,
    minus: svg`<path d="M5 12h14"/>`,
    search: svg`<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>`,
    house: svg`<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/>`,
    focus: svg`<path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4"/><circle cx="12" cy="12" r="2"/>`,
    xmark: svg`<path d="m6 6 12 12M18 6 6 18"/>`,
    check: svg`<path d="m5 12 4 4L19 6"/>`,
    triangleExclamation: svg`<path d="M12 3 2.5 20h19z"/><path d="M12 9v5M12 17h.01"/>`,
    circleInfo: svg`<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>`,
    circleCheck: svg`<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>`,
    circleXmark: svg`<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>`,
    chevronUp: svg`<path d="m6 15 6-6 6 6"/>`,
    fire: svg`<path d="M12 22c4 0 7-3 7-7 0-3-2-6-5-9 0 3-2 4-3 4 0-3-1-5-3-7 0 5-3 7-3 12 0 4 3 7 7 7z"/>`,
    shuffle: svg`<path d="M4 7h3c5 0 5 10 10 10h3M17 14l3 3-3 3M4 17h3c2 0 3-1 4-3M14 7c1-1 2-1 3-1h3M17 3l3 3-3 3"/>`,
    locationDot: svg`<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2"/>`,
    link: svg`<path d="M10 13a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-2 2"/><path d="M14 11a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l2-2"/>`,
    thumbtack: svg`<path d="m9 3 6 6M11 5l-5 5 3 3-5 7 7-5 3 3 5-5z"/>`,
    fileLines: svg`<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>`,
    gear: svg`<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>`,
    key: svg`<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M15 8l3 3M17 6l2 2"/>`,
    shield: svg`<path d="M12 3 4 6v5c0 5 3 8 8 10 5-2 8-5 8-10V6z"/>`,
    user: svg`<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>`,
    rightToBracket: svg`<path d="M10 4H5v16h5M13 8l4 4-4 4M17 12H8"/>`,
    rightFromBracket: svg`<path d="M14 4h5v16h-5M11 8l-4 4 4 4M7 12h9"/>`,
});

export function faIcon(name, className = '') {
    const content = ICONS[name] || ICONS.circleInfo;
    return svg`
      <svg class="fa-icon ${className}" viewBox="0 0 24 24" width="16" height="16"
        fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
        stroke-linejoin="round" aria-hidden="true" focusable="false">
        ${content}
      </svg>
    `;
}

/**
 * Wire Path Utility — Generates SVG cubic bezier paths for wires between pins.
 */
export function wirePath(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const offset = Math.max(30, Math.min(100, dist * 0.4));

    // Determine primary direction and create natural-looking curves
    if (Math.abs(dy) > Math.abs(dx)) {
        // More vertical — curve vertically
        const cpY1 = y1 + (dy > 0 ? offset : -offset);
        const cpY2 = y2 - (dy > 0 ? offset : -offset);
        return `M ${x1} ${y1} C ${x1} ${cpY1}, ${x2} ${cpY2}, ${x2} ${y2}`;
    } else {
        // More horizontal — curve horizontally
        const cpX1 = x1 + (dx > 0 ? offset : -offset);
        const cpX2 = x2 - (dx > 0 ? offset : -offset);
        return `M ${x1} ${y1} C ${cpX1} ${y1}, ${cpX2} ${y2}, ${x2} ${y2}`;
    }
}

/**
 * Returns a wire color based on pin signal type.
 */
export function getWireColor(signals) {
    if (!signals || signals.length === 0) return '#4CAF50'; // green for signal
    for (const sig of signals) {
        if (sig.signal === 'GND') return '#666666';
        if (sig.signal === 'VCC') return '#F44336';
    }
    return '#4CAF50';
}
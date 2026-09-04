export const LED_COLOR_PROFILES = Object.freeze({
    red: Object.freeze({ label: 'Red', forwardVoltage: 2.0 }),
    orange: Object.freeze({ label: 'Orange', forwardVoltage: 2.0 }),
    yellow: Object.freeze({ label: 'Yellow', forwardVoltage: 2.1 }),
    green: Object.freeze({ label: 'Green', forwardVoltage: 2.2 }),
    blue: Object.freeze({ label: 'Blue', forwardVoltage: 3.0 }),
    white: Object.freeze({ label: 'White', forwardVoltage: 3.0 }),
    purple: Object.freeze({ label: 'Purple', forwardVoltage: 3.0 }),
});

const COLOR_ALIASES = Object.freeze({
    '#ff0000': 'red', '#ef4444': 'red',
    '#ffa500': 'orange', '#f97316': 'orange',
    '#ffff00': 'yellow', '#eab308': 'yellow',
    '#00ff00': 'green', '#22c55e': 'green',
    '#0000ff': 'blue', '#3b82f6': 'blue',
    '#ffffff': 'white',
    '#800080': 'purple', '#a855f7': 'purple',
});

const E12 = Object.freeze([10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82]);

export function canonicalLedColor(value) {
    const normalized = String(value || 'red').trim().toLowerCase();
    return LED_COLOR_PROFILES[normalized] ? normalized : COLOR_ALIASES[normalized] || 'red';
}

function nextE12(value) {
    const target = Math.max(1, Number(value));
    for (let decade = 0.1; decade <= 100_000_000; decade *= 10) {
        for (const base of E12) {
            const candidate = base * decade;
            if (candidate >= target - 1e-9) return Math.round(candidate * 1000) / 1000;
        }
    }
    return 1_000_000_000;
}

/** Conservative 10 mA LED resistor rounded upward to a common E12 value. */
export function recommendedLedResistorOhms(color, supplyVoltage = 5) {
    const profile = LED_COLOR_PROFILES[canonicalLedColor(color)];
    const voltage = Number.isFinite(Number(supplyVoltage)) ? Number(supplyVoltage) : 5;
    const calculated = (voltage - profile.forwardVoltage) / 0.01;
    return nextE12(Math.max(100, calculated));
}

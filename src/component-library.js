/**
 * Component Library — Defines available components for the sidebar,
 * plus rich metadata for validation, auto-wiring, and code generation.
 *
 * pinMeta maps *logical* pin names → types used by the engines.
 * Types: VCC | GND | DIGITAL | ANALOG | PWM | I2C_SDA | I2C_SCL | SIGNAL
 * (actual wokwi pin names are matched at runtime via store.pinInfoMap)
 */

// ─── Pin-type constants ────────────────────────────────
export const PIN = {
    VCC: 'VCC',
    GND: 'GND',
    DIGITAL: 'DIGITAL',
    ANALOG: 'ANALOG',
    PWM: 'PWM',
    I2C_SDA: 'I2C_SDA',
    I2C_SCL: 'I2C_SCL',
    SIGNAL: 'SIGNAL',
    TRIGGER: 'TRIGGER',
    ECHO: 'ECHO',
    DATA: 'DATA',
};

/**
 * PIN_ALIASES — maps alternative pin names to canonical names.
 * Used by store.resolvePinName() so auto-wire and wiring work
 * regardless of whether a wokwi element uses VDD vs VCC, etc.
 */
export const PIN_ALIASES = {
    'VDD':  'VCC',
    'VIN':  'VCC',
    'V+':   'VCC',
    'PWR':  'VCC',
    'VSS':  'GND',
    'GND2': 'GND',
    'DGND': 'GND',
    'AGND': 'GND',
};

// ─── Arduino Uno pin catalog (used by auto-wire) ──────
export const ARDUINO_PINS = {
    digital: ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'],
    pwm: ['3', '5', '6', '9', '10', '11'],
    analog: ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'],
    i2c: { sda: 'A4', scl: 'A5' },
    power: ['5V', '3.3V'],
    ground: ['GND.1', 'GND.2', 'GND.3'],
    serial: ['0', '1'],
    maxCurrent_mA: 500,
    pinMaxCurrent_mA: 40,
};

// ─── Component definitions ─────────────────────────────
export const componentLibrary = {
    'arduino-uno': {
        id: 'arduino-uno',
        name: 'Arduino Uno',
        tag: 'wokwi-arduino-uno',
        category: 'board',
        description: 'ATmega328P microcontroller board',
        icon: 'microchip',
        attrs: {},
        size: { width: 275, height: 200 },
        currentDraw_mA: 0,
        pinMeta: {},
        isBoard: true,
        pinExitOverride: {
            '5V': 'down', '3.3V': 'down', 'GND.1': 'down', 'GND.2': 'down',
            'VIN': 'down', 'IOREF': 'down', 'RESET': 'down',
            'A0': 'down', 'A1': 'down', 'A2': 'down', 'A3': 'down', 'A4': 'down', 'A5': 'down',
            'GND.3': 'up', 'AREF': 'up',
            '0': 'up', '1': 'up', '2': 'up', '3': 'up', '4': 'up', '5': 'up', '6': 'up',
            '7': 'up', '8': 'up', '9': 'up', '10': 'up', '11': 'up', '12': 'up', '13': 'up'
        }
    },

    'led': {
        id: 'led',
        name: 'LED',
        tag: 'wokwi-led',
        category: 'output',
        description: 'Light Emitting Diode',
        icon: 'lightbulb',
        attrs: { color: 'red' },
        size: { width: 40, height: 50 },
        currentDraw_mA: 20,
        pinMeta: {
            'A': PIN.SIGNAL,
            'C': PIN.GND,
        },
        autoWire: { A: PIN.DIGITAL, C: PIN.GND },
        needsResistor: true,
        codeTemplate: 'digitalWrite(${pin}, HIGH);',
    },

    'resistor': {
        id: 'resistor',
        name: 'Resistor 220\u03A9',
        tag: 'wokwi-resistor',
        category: 'passive',
        description: '220 ohm resistor',
        icon: 'wave-square',
        attrs: { value: '220' },
        size: { width: 60, height: 10 },
        currentDraw_mA: 0,
        pinMeta: {
            '1': PIN.SIGNAL,
            '2': PIN.SIGNAL,
        },
        // Pin 1 exits left, pin 2 exits right — match the wokwi resistor leg endpoints
        pinExitOverride: {
            '1': 'left',
            '2': 'right',
        },
        isPassive: true,
    },

    'pushbutton': {
        id: 'pushbutton',
        name: 'Push Button',
        tag: 'wokwi-pushbutton',
        category: 'input',
        description: 'Momentary push button',
        icon: 'circle-dot',
        attrs: {},
        size: { width: 70, height: 50 },
        snapAnchor: { x: 25, y: 25 },
        currentDraw_mA: 0,
        pinMeta: {
            '1.l': PIN.SIGNAL,
            '2.l': PIN.SIGNAL,
            '1.r': PIN.SIGNAL,
            '2.r': PIN.SIGNAL,
        },
        autoWire: { '1.l': PIN.DIGITAL, '2.l': PIN.GND },
        needsPullup: true,
        codeTemplate: 'digitalRead(${pin})',
    },

    'buzzer': {
        id: 'buzzer',
        name: 'Buzzer',
        tag: 'wokwi-buzzer',
        category: 'output',
        description: 'Piezo buzzer',
        icon: 'volume-high',
        attrs: {},
        size: { width: 60, height: 70 },
        snapAnchor: { x: 30, y: 60 },
        currentDraw_mA: 30,
        pinMeta: {
            '1': PIN.SIGNAL,
            '2': PIN.GND,
        },
        autoWire: { '1': PIN.PWM, '2': PIN.GND },
        codeTemplate: 'tone(${pin}, 1000);',
    },

    'hc-sr04': {
        id: 'hc-sr04',
        name: 'HC-SR04',
        tag: 'wokwi-hc-sr04',
        category: 'sensor',
        description: 'Ultrasonic distance sensor',
        icon: 'satellite-dish',
        attrs: {},
        size: { width: 170, height: 90 },
        snapAnchor: { x: 65, y: 30 },
        currentDraw_mA: 15,
        pinMeta: {
            'VCC': PIN.VCC,
            'TRIG': PIN.TRIGGER,
            'ECHO': PIN.ECHO,
            'GND': PIN.GND,
        },
        autoWire: { VCC: PIN.VCC, GND: PIN.GND, TRIG: PIN.DIGITAL, ECHO: PIN.DIGITAL },
        codeTemplate: [
            'digitalWrite(trigPin, LOW); delayMicroseconds(2);',
            'digitalWrite(trigPin, HIGH); delayMicroseconds(10);',
            'digitalWrite(trigPin, LOW);',
            'long duration = pulseIn(echoPin, HIGH);',
            'float distance = duration * 0.034 / 2;',
        ].join('\n'),
    },

    'servo': {
        id: 'servo',
        name: 'Servo Motor',
        tag: 'wokwi-servo',
        category: 'actuator',
        description: 'SG90 Micro Servo',
        icon: 'gear',
        attrs: {},
        size: { width: 170, height: 80 },
        snapAnchor: { x: 50, y: 70 },
        currentDraw_mA: 200,
        pinMeta: {
            'PWM': PIN.PWM,
            'V+': PIN.VCC,
            'GND': PIN.GND,
        },
        autoWire: { 'PWM': PIN.PWM, 'V+': PIN.VCC, 'GND': PIN.GND },
        avoidPins: ['0', '1'],
        codeTemplate: 'myServo.write(90);',
    },

    'potentiometer': {
        id: 'potentiometer',
        name: 'Potentiometer',
        tag: 'wokwi-potentiometer',
        category: 'input',
        description: 'Variable resistor / knob',
        icon: 'sliders',
        attrs: {},
        size: { width: 75, height: 80 },
        snapAnchor: { x: 30, y: 50 },
        currentDraw_mA: 1,
        pinMeta: {
            'GND': PIN.GND,
            'SIG': PIN.ANALOG,
            'VCC': PIN.VCC,
        },
        autoWire: { GND: PIN.GND, SIG: PIN.ANALOG, VCC: PIN.VCC },
        codeTemplate: 'int val = analogRead(${pin});',
    },

    // ─── New components ────────────────────────────────

    'dht22': {
        id: 'dht22',
        name: 'DHT22',
        tag: 'wokwi-dht22',
        category: 'sensor',
        description: 'Temperature & humidity sensor',
        icon: 'temperature-half',
        attrs: {},
        size: { width: 60, height: 120 }, // Adjusted to prevent text overlap
        snapAnchor: { x: 30, y: 110 },
        currentDraw_mA: 2,
        pinMeta: {
            'VCC': PIN.VCC,
            'SDA': PIN.DATA,
            'NC': PIN.SIGNAL,
            'GND': PIN.GND,
        },
        autoWire: { VCC: PIN.VCC, SDA: PIN.DIGITAL, GND: PIN.GND },
        codeTemplate: 'float temp = dht.readTemperature();',
    },

    'lcd1602': {
        id: 'lcd1602',
        name: 'LCD 16\u00D72 (I2C)',
        tag: 'wokwi-lcd1602',
        category: 'output',
        description: '16\u00D72 character LCD with I2C backpack',
        icon: 'display',
        attrs: {},
        size: { width: 260, height: 80 },
        snapAnchor: { x: 130, y: 70 },
        currentDraw_mA: 25,
        pinMeta: {
            'VCC': PIN.VCC,
            'GND': PIN.GND,
            'SDA': PIN.I2C_SDA,
            'SCL': PIN.I2C_SCL,
        },
        autoWire: { VCC: PIN.VCC, GND: PIN.GND, SDA: PIN.I2C_SDA, SCL: PIN.I2C_SCL },
        codeTemplate: 'lcd.setCursor(0, 0); lcd.print("Hello!");',
    },

    'pir-motion': {
        id: 'pir-motion',
        name: 'PIR Motion',
        tag: 'wokwi-pir-motion-sensor',
        category: 'sensor',
        description: 'Passive infrared motion sensor',
        icon: 'eye',
        attrs: {},
        size: { width: 90, height: 90 }, // Adjusted to prevent bounding box cutoff
        snapAnchor: { x: 60, y: 130 },
        currentDraw_mA: 5,
        pinMeta: {
            'VCC': PIN.VCC,
            'OUT': PIN.SIGNAL,
            'GND': PIN.GND,
        },
        autoWire: { VCC: PIN.VCC, OUT: PIN.DIGITAL, GND: PIN.GND },
        codeTemplate: 'int motion = digitalRead(${pin});',
    },

    'ir-receiver': {
        id: 'ir-receiver',
        name: 'IR Receiver',
        tag: 'wokwi-ir-receiver',
        category: 'sensor',
        description: 'Infrared remote receiver (TSOP38238)',
        icon: 'mobile-screen',
        attrs: {},
        size: { width: 60, height: 90 },
        snapAnchor: { x: 25, y: 40 },
        currentDraw_mA: 5,
        pinMeta: {
            'GND': PIN.GND,
            'VCC': PIN.VCC,
            'DAT': PIN.SIGNAL,
        },
        autoWire: { GND: PIN.GND, VCC: PIN.VCC, DAT: PIN.DIGITAL },
        codeTemplate: 'if (irrecv.decode(&results)) { /* ... */ }',
    },

    'neopixel': {
        id: 'neopixel',
        name: 'NeoPixel Ring',
        tag: 'wokwi-neopixel',
        category: 'output',
        description: 'WS2812B addressable RGB LED',
        icon: 'rainbow',
        attrs: {},
        size: { width: 40, height: 40 },
        snapAnchor: { x: 20, y: 20 },
        currentDraw_mA: 60,
        pinMeta: {
            // wokwi-neopixel reports its power pin as 'VDD' — kept here as canonical
            'VDD': PIN.VCC,
            'GND': PIN.GND,
            'DIN': PIN.SIGNAL,
            'DOUT': PIN.SIGNAL,
        },
        // autoWire keys must match actual wokwi pinInfo names (VDD, not VCC)
        autoWire: { VDD: PIN.VCC, GND: PIN.GND, DIN: PIN.DIGITAL },
        codeTemplate: 'strip.setPixelColor(0, strip.Color(255, 0, 0)); strip.show();',
    },

    'slide-switch': {
        id: 'slide-switch',
        name: 'Slide Switch',
        tag: 'wokwi-slide-switch',
        category: 'input',
        description: 'SPDT slide switch',
        icon: 'shuffle',
        attrs: {},
        size: { width: 60, height: 30 },
        snapAnchor: { x: 30, y: 15 },
        currentDraw_mA: 0,
        pinMeta: {
            '1': PIN.SIGNAL,
            '2': PIN.SIGNAL,
            '3': PIN.SIGNAL,
        },
        autoWire: { '1': PIN.VCC, '2': PIN.DIGITAL, '3': PIN.GND },
        codeTemplate: 'int state = digitalRead(${pin});',
    },
};

export const categories = [
    { id: 'board', name: 'Boards' },
    { id: 'sensor', name: 'Sensors' },
    { id: 'input', name: 'Input' },
    { id: 'output', name: 'Output' },
    { id: 'actuator', name: 'Actuators' },
    { id: 'passive', name: 'Passive' },
    { id: 'custom', name: 'Custom' },
];

/**
 * Helper — get component definition for an instance
 */
const CUSTOM_COMPONENTS_KEY = 'elera_custom_components';

function _pinSignalsForType(type) {
    if (type === PIN.VCC) return [{ signal: 'VCC' }];
    if (type === PIN.GND) return [{ signal: 'GND' }];
    return [{ signal: 'SIGNAL' }];
}

function _normalizeCustomComponent(raw) {
    if (!raw || !raw.id || !raw.imageUrl || !raw.size) return null;
    const pinMeta = raw.pinMeta || {};
    const customPins = (raw.customPins || []).map(pin => {
        const type = pin.type || pinMeta[pin.name] || PIN.SIGNAL;
        return {
            name: pin.name,
            x: Number(pin.x) || 0,
            y: Number(pin.y) || 0,
            type,
            signals: pin.signals || _pinSignalsForType(type),
        };
    }).filter(pin => pin.name);

    const normalizedPinMeta = {};
    const autoWire = {};
    for (const pin of customPins) {
        normalizedPinMeta[pin.name] = pin.type || PIN.SIGNAL;
        if (pin.type && pin.type !== PIN.SIGNAL) {
            autoWire[pin.name] = pin.type;
        }
    }

    return {
        ...raw,
        type: 'custom',
        category: 'custom',
        icon: raw.icon || 'image',
        attrs: {},
        currentDraw_mA: Number(raw.currentDraw_mA) || 0,
        size: {
            width: Math.max(20, Number(raw.size.width) || 120),
            height: Math.max(20, Number(raw.size.height) || 80),
        },
        customPins,
        pinMeta: normalizedPinMeta,
        autoWire: Object.keys(autoWire).length > 0 ? autoWire : undefined,
    };
}

export function getStoredCustomComponents() {
    if (typeof localStorage === 'undefined') return [];
    try {
        const raw = localStorage.getItem(CUSTOM_COMPONENTS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.map(_normalizeCustomComponent).filter(Boolean) : [];
    } catch (e) {
        console.warn('[Elera] Failed to load custom components:', e);
        return [];
    }
}

export function registerCustomComponent(componentDef, { persist = true } = {}) {
    const normalized = _normalizeCustomComponent(componentDef);
    if (!normalized) return null;

    componentLibrary[normalized.id] = normalized;

    if (persist && typeof localStorage !== 'undefined') {
        const existing = getStoredCustomComponents().filter(comp => comp.id !== normalized.id);
        existing.push(normalized);
        localStorage.setItem(CUSTOM_COMPONENTS_KEY, JSON.stringify(existing));
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('elera-custom-components-change', {
            detail: { component: normalized },
        }));
    }

    return normalized;
}

for (const customComponent of getStoredCustomComponents()) {
    componentLibrary[customComponent.id] = customComponent;
}

export function getComponentDef(componentId) {
    return componentLibrary[componentId] || null;
}

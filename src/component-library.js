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

export const ARDUINO_NANO_PINS = {
    ...ARDUINO_PINS,
    analog: ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'],
    ground: ['GND.1', 'GND.2'],
};

export const ARDUINO_MEGA_PINS = {
    digital: Array.from({ length: 52 }, (_, index) => String(index + 2)),
    pwm: ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '44', '45', '46'],
    analog: Array.from({ length: 16 }, (_, index) => `A${index}`),
    i2c: { sda: 'SDA', scl: 'SCL' },
    power: ['5V', '3.3V'],
    ground: ['GND.1', 'GND.2', 'GND.3', 'GND.4', 'GND.5'],
    serial: ['0', '1', '14', '15', '16', '17', '18', '19'],
    maxCurrent_mA: 500,
    pinMaxCurrent_mA: 40,
};

export const NANO_RP2040_PINS = {
    digital: ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13'],
    pwm: ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12'],
    analog: ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'],
    i2c: { sda: 'A4', scl: 'A5' },
    power: ['3.3V', '5V'],
    ground: ['GND.1', 'GND.2'],
    serial: ['RX', 'TX'],
    maxCurrent_mA: 500,
    pinMaxCurrent_mA: 12,
};

export const ESP32_DEVKIT_PINS = {
    digital: ['D4', 'D13', 'D14', 'D18', 'D19', 'D21', 'D22', 'D23', 'D25', 'D26', 'D27', 'D32', 'D33'],
    pwm: ['D4', 'D13', 'D14', 'D18', 'D19', 'D21', 'D22', 'D23', 'D25', 'D26', 'D27', 'D32', 'D33'],
    analog: ['VP', 'VN', 'D34', 'D35', 'D32', 'D33'],
    i2c: { sda: 'D21', scl: 'D22' },
    power: ['3V3'],
    ground: ['GND.1', 'GND.2'],
    serial: ['RX0', 'TX0', 'RX2', 'TX2'],
    maxCurrent_mA: 500,
    pinMaxCurrent_mA: 20,
};

export const FRANZININHO_PINS = {
    digital: ['PB0', 'PB1', 'PB2', 'PB3', 'PB4'],
    pwm: ['PB0', 'PB1', 'PB4'],
    analog: ['PB5', 'PB2', 'PB4', 'PB3'],
    i2c: { sda: 'PB0', scl: 'PB2' },
    power: ['VCC.1', 'VCC.2'],
    ground: ['GND.1', 'GND.2'],
    serial: [],
    maxCurrent_mA: 500,
    pinMaxCurrent_mA: 20,
};

// ─── Component definitions ─────────────────────────────
export const componentLibrary = {
    'test-ic': {
        id: 'test-ic',
        name: 'DIP-8 Test IC',
        tag: 'div',
        category: 'passive',
        description: 'Simple test IC using the reusable standard 300-mil DIP-8 physical package',
        icon: 'microchip',
        attrs: {},
        size: { width: 56, height: 36 },
        currentDraw_mA: 0,
        pinMeta: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [String(index + 1), PIN.SIGNAL])),
        isPassive: true,
        connectorType: 'male',
        physicalOnly: true,
        physicalSupported: true,
        visualKind: 'dip8',
        breadboard: { mountable: true, required: true, footprintId: 'dip8-300mil' },
    },
    // Backward-compatible electrical definition only. Physical geometry lives
    // in the reusable dip8-300mil package, never in this component record.
    'dip8': {
        id: 'dip8', name: 'DIP-8 Test IC (legacy)', tag: 'div', category: 'internal',
        description: 'Compatibility alias for saved projects', icon: 'microchip', attrs: {},
        size: { width: 56, height: 36 }, currentDraw_mA: 0,
        pinMeta: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [String(index + 1), PIN.SIGNAL])),
        isPassive: true, connectorType: 'male', physicalOnly: true, physicalSupported: true,
        visualKind: 'dip8', breadboard: { mountable: true, required: true, footprintId: 'dip8-300mil' },
    },
    'arduino-uno': {
        id: 'arduino-uno',
        name: 'Arduino Uno',
        tag: 'wokwi-arduino-uno',
        category: 'board',
        description: 'ATmega328P microcontroller board',
        icon: 'microchip',
        attrs: {},
        size: { width: 275, height: 200 },
        snapAnchor: { x: 0, y: 0 },
        currentDraw_mA: 0,
        pinMeta: {},
        isBoard: true,
        isControllerBoard: true,
        autoWireTarget: true,
        physicalSupported: true,
        autoWirePins: ARDUINO_PINS,
        connectorType: 'female',
        breadboard: { mountable: false, reason: 'The Uno exposes female sockets and connects to a breadboard with male jumpers.' },
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
        snapAnchor: { x: 15, y: 42 },
        currentDraw_mA: 20,
        pinMeta: {
            'A': PIN.SIGNAL,
            'C': PIN.GND,
        },
        autoWire: { A: PIN.DIGITAL, C: PIN.GND },
        needsResistor: true,
        connectorType: 'male',
        breadboard: { mountable: true, required: true, footprint: { pinSpan: 1 } },
        physicalSupported: true,
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
        snapAnchor: { x: 0, y: 5.65 },
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
        connectorType: 'male',
        breadboard: { mountable: true, required: false, footprint: { pinSpan: 6 } },
    },

    'pushbutton': {
        id: 'pushbutton',
        name: 'Push Button',
        tag: 'wokwi-pushbutton-6mm',
        category: 'input',
        description: 'Momentary push button',
        icon: 'circle-dot',
        attrs: {},
        size: { width: 28.02, height: 22.68 },
        snapAnchor: { x: 0, y: 2.2 },
        currentDraw_mA: 0,
        pinMeta: {
            '1.l': PIN.SIGNAL,
            '2.l': PIN.SIGNAL,
            '1.r': PIN.SIGNAL,
            '2.r': PIN.SIGNAL,
        },
        pinGroups: [
            ['1.l', '1.r'],
            ['2.l', '2.r'],
        ],
        autoWire: { '1.l': PIN.DIGITAL, '2.l': PIN.GND },
        needsPullup: true,
        connectorType: 'male',
        breadboard: { mountable: true, required: true, footprintId: 'tactile-3x2' },
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
        connectorType: 'male',
        breadboard: { mountable: true, required: true, footprintId: 'buzzer-2.54' },
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
        connectorType: 'male',
        breadboard: { mountable: true, required: true, footprintId: 'pot-linear-3' },
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
        connectorType: 'male',
        breadboard: { mountable: true, required: true, footprintId: 'dht22-linear-4' },
        codeTemplate: 'float temp = dht.readTemperature();',
    },

    'lcd1602': {
        id: 'lcd1602',
        name: 'LCD 16\u00D72 (I2C)',
        tag: 'wokwi-lcd1602',
        category: 'output',
        description: '16\u00D72 character LCD with I2C backpack',
        icon: 'display',
        attrs: { pins: 'i2c' },
        size: { width: 302, height: 136 },
        snapAnchor: { x: 151, y: 68 },
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
        connectorType: 'male',
        breadboard: { mountable: true, required: true, footprintId: 'ir-linear-3' },
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
        connectorType: 'male',
        breadboard: { mountable: true, required: true, footprintId: 'spdt-linear-3' },
    },

    'breadboard-half': {
        id: 'breadboard-half',
        name: 'Breadboard 400',
        tag: 'elera-breadboard',
        category: 'board',
        description: 'Half-size 400-point solderless breadboard',
        icon: 'table-cells',
        attrs: {},
        size: { width: 330, height: 214 },
        currentDraw_mA: 0,
        pinMeta: {},
        isBreadboard: true,
        connectorType: 'female',
        snapAnchor: { x: 20, y: 60 },
    },
    'breadboard-full': {
        id: 'breadboard-full',
        name: 'Breadboard 830',
        tag: 'elera-full-breadboard',
        category: 'board',
        description: 'Full-size 830-point solderless breadboard',
        icon: 'table-cells',
        attrs: {},
        size: { width: 650, height: 214 },
        currentDraw_mA: 0,
        pinMeta: {},
        isBreadboard: true,
        connectorType: 'female',
        snapAnchor: { x: 15, y: 60 },
    },
};

const defineWokwiComponent = definition => {
    componentLibrary[definition.id] = {
        description: definition.name,
        icon: 'microchip',
        attrs: {},
        currentDraw_mA: 0,
        pinMeta: definition.autoWire || {},
        connectorType: definition.isBoard ? 'female' : 'male',
        ...definition,
    };
};

// Every public custom element exported by @wokwi/elements 1.9.2 that is not
// already defined above. Wokwi supplies runtime pinInfo, so every entry is
// draggable, renderable, and manually wireable without duplicating SVG data.
[
    {
        id: 'seven-segment', name: '7-Segment Display', tag: 'wokwi-7segment', category: 'output',
        size: { width: 48, height: 84 }, attrs: { digits: '1' },
        breadboard: { mountable: true, required: true, footprintId: 'seven-segment-dip-10' },
    },
    {
        id: 'analog-joystick', name: 'Analog Joystick', tag: 'wokwi-analog-joystick', category: 'input',
        size: { width: 103, height: 120 }, currentDraw_mA: 1,
        autoWire: { VCC: PIN.VCC, VERT: PIN.ANALOG, HORZ: PIN.ANALOG, SEL: PIN.DIGITAL, GND: PIN.GND },
    },
    {
        id: 'arduino-mega', name: 'Arduino Mega', tag: 'wokwi-arduino-mega', category: 'board',
        size: { width: 388, height: 192 }, isBoard: true, isControllerBoard: true, autoWireTarget: true,
        autoWirePins: ARDUINO_MEGA_PINS,
        breadboard: { mountable: false, reason: 'The Mega exposes female sockets and connects to a breadboard with male jumpers.' },
        description: 'Arduino Mega 2560 controller board with female headers',
    },
    {
        id: 'arduino-nano', name: 'Arduino Nano', tag: 'wokwi-arduino-nano', category: 'board',
        size: { width: 170, height: 68 }, isBoard: true, isControllerBoard: true, autoWireTarget: true,
        autoWirePins: ARDUINO_NANO_PINS, connectorType: 'male',
        breadboard: { mountable: true, required: false, footprintId: 'nano-30', snapTolerance: 30 },
        description: 'Compact breadboard-mountable Arduino Nano controller board',
    },
    {
        id: 'biaxial-stepper', name: 'Biaxial Stepper', tag: 'wokwi-biaxial-stepper', category: 'actuator',
        size: { width: 212, height: 255 },
    },
    {
        id: 'big-sound-sensor', name: 'Big Sound Sensor', tag: 'wokwi-big-sound-sensor', category: 'sensor',
        size: { width: 140, height: 51 }, currentDraw_mA: 5,
        autoWire: { AOUT: PIN.ANALOG, GND: PIN.GND, VCC: PIN.VCC, DOUT: PIN.DIGITAL },
    },
    {
        id: 'dip-switch-8', name: '8-Way DIP Switch', tag: 'wokwi-dip-switch-8', category: 'input',
        size: { width: 83, height: 56 },
        breadboard: { mountable: true, required: true, footprintId: 'dip-switch-16' },
    },
    {
        id: 'ds1307', name: 'DS1307 RTC', tag: 'wokwi-ds1307', category: 'sensor',
        size: { width: 98, height: 84 }, currentDraw_mA: 2,
        autoWire: { GND: PIN.GND, '5V': PIN.VCC, SDA: PIN.I2C_SDA, SCL: PIN.I2C_SCL },
    },
    {
        id: 'esp32-devkit-v1', name: 'ESP32 DevKit v1', tag: 'wokwi-esp32-devkit-v1', category: 'board',
        size: { width: 107, height: 205 }, isBoard: true, isControllerBoard: true, autoWireTarget: true,
        autoWirePins: ESP32_DEVKIT_PINS, connectorType: 'male',
        breadboard: { mountable: false, reason: 'The 30-pin board covers the accessible strips on one standard breadboard; use jumper leads or a dual-board adapter.' },
        description: '3.3V ESP32 controller; use external jumpers with a standard breadboard',
    },
    {
        id: 'flame-sensor', name: 'Flame Sensor', tag: 'wokwi-flame-sensor', category: 'sensor',
        size: { width: 200, height: 62 }, currentDraw_mA: 5,
        autoWire: { VCC: PIN.VCC, GND: PIN.GND, DOUT: PIN.DIGITAL, AOUT: PIN.ANALOG },
    },
    {
        id: 'franzininho', name: 'Franzininho', tag: 'wokwi-franzininho', category: 'board',
        size: { width: 242, height: 114 }, isBoard: true, isControllerBoard: true, autoWireTarget: true,
        autoWirePins: FRANZININHO_PINS,
        breadboard: { mountable: false, reason: 'The Wokwi element exposes female sockets, so it connects with male jumpers instead of plugging into breadboard holes.' },
        description: '5V ATtiny85 controller with female headers',
    },
    {
        id: 'gas-sensor', name: 'Gas Sensor', tag: 'wokwi-gas-sensor', category: 'sensor',
        size: { width: 137, height: 63 }, currentDraw_mA: 150,
        autoWire: { AOUT: PIN.ANALOG, DOUT: PIN.DIGITAL, GND: PIN.GND, VCC: PIN.VCC },
    },
    {
        id: 'heart-beat-sensor', name: 'Heart Beat Sensor', tag: 'wokwi-heart-beat-sensor', category: 'sensor',
        size: { width: 89, height: 80 }, currentDraw_mA: 4,
        autoWire: { GND: PIN.GND, VCC: PIN.VCC, OUT: PIN.ANALOG },
    },
    {
        id: 'hx711', name: 'HX711 Load Cell', tag: 'wokwi-hx711', category: 'sensor',
        size: { width: 580, height: 430 }, currentDraw_mA: 2,
        autoWire: { VCC: PIN.VCC, DT: PIN.DIGITAL, SCK: PIN.DIGITAL, GND: PIN.GND },
    },
    {
        id: 'ili9341', name: 'ILI9341 TFT', tag: 'wokwi-ili9341', category: 'output',
        size: { width: 176, height: 294 }, currentDraw_mA: 50,
    },
    {
        id: 'ir-remote', name: 'IR Remote', tag: 'wokwi-ir-remote', category: 'input',
        size: { width: 151, height: 316 }, isPassive: true, pinless: true,
    },
    {
        id: 'relay-dpdt', name: 'DPDT Relay', tag: 'wokwi-ks2e-m-dc5', category: 'actuator',
        size: { width: 80, height: 38 },
        breadboard: { mountable: true, required: true, footprintId: 'relay-dpdt-8' },
    },
    {
        id: 'rotary-encoder', name: 'KY-040 Encoder', tag: 'wokwi-ky-040', category: 'input',
        size: { width: 116, height: 71 }, currentDraw_mA: 10,
        autoWire: { CLK: PIN.DIGITAL, DT: PIN.DIGITAL, SW: PIN.DIGITAL, VCC: PIN.VCC, GND: PIN.GND },
    },
    {
        id: 'lcd2004', name: 'LCD 20x4 (I2C)', tag: 'wokwi-lcd2004', category: 'output',
        size: { width: 356, height: 180 }, attrs: { pins: 'i2c' }, currentDraw_mA: 30,
        autoWire: { GND: PIN.GND, VCC: PIN.VCC, SDA: PIN.I2C_SDA, SCL: PIN.I2C_SCL },
    },
    {
        id: 'led-bar-graph', name: 'LED Bar Graph', tag: 'wokwi-led-bar-graph', category: 'output',
        size: { width: 39, height: 97 }, currentDraw_mA: 200,
        breadboard: { mountable: true, required: true, footprintId: 'led-bar-dip-20' },
    },
    {
        id: 'led-ring', name: 'NeoPixel Ring 16', tag: 'wokwi-led-ring', category: 'output',
        size: { width: 142, height: 154 }, attrs: { pixels: '16' }, currentDraw_mA: 960,
        autoWire: { GND: PIN.GND, VCC: PIN.VCC, DIN: PIN.DIGITAL },
    },
    {
        id: 'membrane-keypad', name: 'Membrane Keypad', tag: 'wokwi-membrane-keypad', category: 'input',
        size: { width: 266, height: 338 },
    },
    {
        id: 'microsd-card', name: 'MicroSD Card', tag: 'wokwi-microsd-card', category: 'output',
        size: { width: 82, height: 78 }, currentDraw_mA: 50,
    },
    {
        id: 'mpu6050', name: 'MPU6050 IMU', tag: 'wokwi-mpu6050', category: 'sensor',
        size: { width: 82, height: 62 }, currentDraw_mA: 4,
        autoWire: { SDA: PIN.I2C_SDA, SCL: PIN.I2C_SCL, GND: PIN.GND, VCC: PIN.VCC },
    },
    {
        id: 'nano-rp2040-connect', name: 'Nano RP2040 Connect', tag: 'wokwi-nano-rp2040-connect', category: 'board',
        size: { width: 168, height: 68 }, isBoard: true, isControllerBoard: true, autoWireTarget: true,
        autoWirePins: NANO_RP2040_PINS, connectorType: 'male',
        breadboard: { mountable: true, required: false, footprintId: 'nano-rp2040-30', snapTolerance: 30 },
        description: '3.3V Nano-form-factor RP2040 controller, breadboard mountable',
    },
    {
        id: 'neopixel-matrix', name: 'NeoPixel Matrix 8x8', tag: 'wokwi-neopixel-matrix', category: 'output',
        size: { width: 198, height: 178 }, attrs: { rows: '8', cols: '8' }, currentDraw_mA: 3840,
        autoWire: { GND: PIN.GND, VCC: PIN.VCC, DIN: PIN.DIGITAL },
    },
    {
        id: 'ntc-temperature-sensor', name: 'NTC Temperature Sensor', tag: 'wokwi-ntc-temperature-sensor', category: 'sensor',
        size: { width: 136, height: 72 }, currentDraw_mA: 1,
        autoWire: { GND: PIN.GND, VCC: PIN.VCC, OUT: PIN.ANALOG },
    },
    {
        id: 'photoresistor-sensor', name: 'Photoresistor Sensor', tag: 'wokwi-photoresistor-sensor', category: 'sensor',
        size: { width: 174, height: 62 }, currentDraw_mA: 1,
        autoWire: { VCC: PIN.VCC, GND: PIN.GND, DO: PIN.DIGITAL, AO: PIN.ANALOG },
    },
    {
        id: 'pushbutton-large', name: 'Large Push Button', tag: 'wokwi-pushbutton', category: 'input',
        size: { width: 68, height: 46 },
        pinMeta: { '1.l': PIN.SIGNAL, '2.l': PIN.SIGNAL, '1.r': PIN.SIGNAL, '2.r': PIN.SIGNAL },
        pinGroups: [['1.l', '1.r'], ['2.l', '2.r']],
        autoWire: { '1.l': PIN.DIGITAL, '2.l': PIN.GND }, needsPullup: true,
    },
    {
        id: 'rgb-led', name: 'RGB LED', tag: 'wokwi-rgb-led', category: 'output',
        size: { width: 43, height: 73 }, currentDraw_mA: 60,
        pinMeta: { R: PIN.SIGNAL, COM: PIN.GND, G: PIN.SIGNAL, B: PIN.SIGNAL }, needsResistor: true,
        breadboard: { mountable: true, required: true, footprintId: 'rgb-led-bent-4' },
    },
    {
        id: 'rotary-dialer', name: 'Rotary Dialer', tag: 'wokwi-rotary-dialer', category: 'input',
        size: { width: 266, height: 286 },
        autoWire: { GND: PIN.GND, DIAL: PIN.DIGITAL, PULSE: PIN.DIGITAL },
    },
    {
        id: 'slide-potentiometer', name: 'Slide Potentiometer', tag: 'wokwi-slide-potentiometer', category: 'input',
        size: { width: 208, height: 110 }, currentDraw_mA: 1,
        autoWire: { VCC: PIN.VCC, SIG: PIN.ANALOG, GND: PIN.GND },
    },
    {
        id: 'small-sound-sensor', name: 'Small Sound Sensor', tag: 'wokwi-small-sound-sensor', category: 'sensor',
        size: { width: 133, height: 51 }, currentDraw_mA: 5,
        autoWire: { AOUT: PIN.ANALOG, GND: PIN.GND, VCC: PIN.VCC, DOUT: PIN.DIGITAL },
    },
    {
        id: 'ssd1306', name: 'SSD1306 OLED', tag: 'wokwi-ssd1306', category: 'output',
        size: { width: 150, height: 116 }, currentDraw_mA: 20,
        autoWire: { DATA: PIN.I2C_SDA, CLK: PIN.I2C_SCL, VIN: PIN.VCC, GND: PIN.GND },
    },
    {
        id: 'stepper-motor', name: 'Stepper Motor', tag: 'wokwi-stepper-motor', category: 'actuator',
        size: { width: 221, height: 236 },
    },
    {
        id: 'tilt-switch', name: 'Tilt Switch', tag: 'wokwi-tilt-switch', category: 'sensor',
        size: { width: 89, height: 56 }, currentDraw_mA: 1,
        autoWire: { GND: PIN.GND, VCC: PIN.VCC, OUT: PIN.DIGITAL },
    },
].forEach(defineWokwiComponent);

for (const component of Object.values(componentLibrary)) {
    if (component.isBreadboard || component.breadboard) continue;
    component.breadboard = {
        mountable: false,
        reason: component.pinless
            ? 'This visual has no electrical pins.'
            : 'This part is an external module, motor, display, socketed board, or non-2.54 mm package; connect it with jumper wires.',
    };
}

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
        breadboard: {
            mountable: false,
            reason: 'Custom visuals use jumper wires until a calibrated rigid footprint is registered.',
        },
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

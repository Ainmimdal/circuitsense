// Beginner-facing text and pin roles for every built-in part, merged into the
// component library. `description` is the one-line "what is it" shown on hover;
// `beginnerNote` is the plain-language explanation the lesson guide shows when
// the part is placed. `pinMeta` is only for parts that would otherwise have no
// pins at all: a declared pin is reported as floating until wired, so optional
// terminals (spare relay contacts, an unused LCD pin) stay undeclared.

const V = 'VCC', G = 'GND', S = 'SIGNAL', D = 'DIGITAL';
const pins = (names, role = S) => Object.fromEntries(names.map(name => [name, role]));
const range = (count, label) => Array.from({ length: count }, (_, index) => label(index + 1));

export const PART_GUIDE = {
    'test-ic': {
        name: '8-pin Chip (DIP-8)',
        description: 'A generic 8-pin chip for practising how chips sit on a breadboard.',
        beginnerNote: 'Chips straddle the gap in the middle of the breadboard so each leg gets its own strip. The notch marks the end with pin 1.',
    },
    'arduino-uno': {
        beginnerNote: 'The Arduino Uno is the brain: it runs your code, powers the circuit from its 5V and GND pins and talks to parts through its numbered pins.',
    },
    'arduino-mega': {
        beginnerNote: 'A bigger Arduino with many more pins. It works like the Uno, with 5 V pins.',
    },
    'arduino-nano': {
        beginnerNote: 'A small Arduino that plugs straight into the breadboard across the middle gap. It works like the Uno.',
    },
    'nano-rp2040-connect': {
        beginnerNote: 'A Nano-sized board with Wi-Fi. Its pins are 3.3 V, so parts that need 5 V signals may not work with it.',
    },
    'esp32-devkit-v1': {
        description: 'ESP32 Wi-Fi and Bluetooth controller board with 3.3 V pins',
        beginnerNote: 'A fast board with Wi-Fi and Bluetooth. Its pins are 3.3 V: never connect a 5 V signal to them.',
    },
    franzininho: {
        description: 'Small ATtiny85 controller board with six pins',
        beginnerNote: 'A tiny beginner board with only six usable pins, good for very small projects.',
    },
    'hc-sr04': {
        name: 'Distance Sensor', keywords: ['hc-sr04', 'ultrasonic', 'sonar'],
        simulation: { kind: 'distance', trigger: 'TRIG', echo: 'ECHO' },
        description: 'Ultrasonic distance sensor (2 cm to 4 m)',
        beginnerNote: 'Measures distance with sound, like a bat. TRIG sends a ping, and ECHO tells the Arduino how long it took to come back.',
    },
    dht22: {
        beginnerNote: 'Measures temperature and humidity and sends both as numbers on one data pin.',
    },
    lcd1602: {
        beginnerNote: 'A screen with 2 lines of 16 characters. It needs only two signal wires (SDA and SCL) plus power.',
    },
    lcd2004: {
        description: '20x4 character LCD with I2C backpack',
        beginnerNote: 'A screen with 4 lines of 20 characters. It needs only two signal wires (SDA and SCL) plus power.',
    },
    'pir-motion': {
        simulation: { kind: 'signal', action: 'wave at the motion sensor', output: 'OUT', power: 'VCC', ground: 'GND' },
        description: 'Motion sensor that detects warm moving bodies',
        beginnerNote: 'Detects people moving nearby. OUT goes HIGH for a few seconds when it sees movement.',
    },
    'ir-receiver': {
        description: 'Receiver for infrared remote control signals',
        beginnerNote: 'Reads the invisible light pulses sent by a TV-style remote control.',
    },
    neopixel: {
        beginnerNote: 'An LED that can show any colour and needs only one data pin. Many can be chained from DOUT to the next DIN.',
    },
    'led-ring': {
        description: 'Ring of 16 addressable RGB LEDs',
        beginnerNote: '16 colour LEDs in a circle, all controlled from one data pin. They can draw a lot of current at full brightness.',
    },
    'neopixel-matrix': {
        description: '8x8 grid of addressable RGB LEDs',
        beginnerNote: '64 colour LEDs in a grid, all controlled from one data pin. At full brightness it needs its own 5 V supply.',
    },
    'slide-switch': {
        beginnerNote: 'A switch that stays where you put it. The middle leg connects to the left leg or the right leg.',
    },
    'seven-segment': {
        description: 'One digit made of seven LED bars and a dot',
        beginnerNote: 'Seven LED bars (A to G) that make the digits 0 to 9. Each bar needs its own resistor; the COM pins are shared by all of them.',
    },
    'analog-joystick': {
        simulation: [
            { kind: 'dial', label: 'Joystick left-right', output: 'HORZ', power: 'VCC', ground: 'GND' },
            { kind: 'dial', label: 'Joystick up-down', output: 'VERT', power: 'VCC', ground: 'GND' },
            // Pushing the stick in joins SEL to ground; use INPUT_PULLUP to read it.
            { kind: 'signal', action: 'push the joystick in', output: 'SEL', power: 'VCC', ground: 'GND', activeLow: true, floating: true },
        ],
        description: 'Thumb joystick with two axes and a push button',
        beginnerNote: 'A game-controller stick. HORZ and VERT give a voltage for left-right and up-down; SEL is a button you press by pushing the stick in.',
    },
    'biaxial-stepper': {
        description: 'Two stepper motors on one shaft (clock or gauge movement)',
        beginnerNote: 'Two tiny stepper motors that move two hands on one shaft, like a clock. Each motor has four coil wires.',
    },
    'stepper-motor': {
        description: 'Stepper motor that turns in exact small steps',
        beginnerNote: 'A motor that moves in precise steps. It needs a driver board between it and the Arduino.',
    },
    'big-sound-sensor': {
        simulation: { kind: 'dial', label: 'Sound level', output: 'AOUT', digitalOutput: 'DOUT', power: 'VCC', ground: 'GND' },
        description: 'Microphone module with analog and digital outputs',
        beginnerNote: 'A microphone. AOUT gives the loudness as a voltage; DOUT goes HIGH when the sound passes the level set on the blue dial.',
    },
    'small-sound-sensor': {
        simulation: { kind: 'dial', label: 'Sound level', output: 'AOUT', digitalOutput: 'DOUT', power: 'VCC', ground: 'GND' },
        description: 'Small microphone module with analog and digital outputs',
        beginnerNote: 'A microphone. AOUT gives the loudness as a voltage; DOUT goes HIGH when the sound passes the level set on the blue dial.',
    },
    'dip-switch-8': {
        description: 'Eight small on/off switches in one block',
        beginnerNote: 'Eight separate switches. Each one joins the pin above it to the pin below it when switched on.',
        switchContacts: range(8, n => [`${n}a`, `${n}b`]),
    },
    ds1307: {
        description: 'Real-time clock that keeps the time with a coin battery',
        beginnerNote: 'A clock chip that remembers the date and time even when the Arduino is off.',
    },
    'flame-sensor': {
        simulation: { kind: 'dial', label: 'Flame', output: 'AOUT', digitalOutput: 'DOUT', power: 'VCC', ground: 'GND' },
        description: 'Flame detector with analog and digital outputs',
        beginnerNote: 'Sees the infrared light of a flame. AOUT gives the strength; DOUT switches when a flame is detected.',
    },
    'gas-sensor': {
        simulation: { kind: 'dial', label: 'Gas level', output: 'AOUT', digitalOutput: 'DOUT', power: 'VCC', ground: 'GND' },
        description: 'MQ-2 gas and smoke sensor module',
        beginnerNote: 'Detects smoke and flammable gas. It gets warm in use and needs a minute to settle before its readings mean anything.',
    },
    'heart-beat-sensor': {
        simulation: { kind: 'dial', label: 'Pulse signal', output: 'OUT', power: 'VCC', ground: 'GND' },
        description: 'Pulse sensor you rest a fingertip on',
        beginnerNote: 'Shines a light through your fingertip and outputs a voltage that rises and falls with your pulse.',
    },
    hx711: {
        description: 'Load cell amplifier for weighing things',
        beginnerNote: 'Reads the tiny signal from a load cell (weight sensor) and sends the weight to the Arduino as a number.',
    },
    ili9341: {
        description: '2.8 inch colour screen (SPI)',
        beginnerNote: 'A colour screen that can draw text, shapes and pictures. It uses the SPI pins and several wires.',
        pinMeta: { VCC: V, GND: G, CS: D, RST: D, 'D/C': D, MOSI: 'DATA', SCK: 'DATA', LED: S, MISO: 'DATA' },
    },
    'ir-remote': {
        description: 'Infrared remote control (pairs with the IR Receiver)',
        beginnerNote: 'A remote control. It has no wires: point it at an IR Receiver on your circuit.',
    },
    'relay-dpdt': {
        description: 'Relay: a switch operated by an electromagnet',
        beginnerNote: 'A relay lets a small signal switch a separate, bigger circuit. The coil needs more current than an Arduino pin can give, so drive it through a transistor.',
    },
    'rotary-encoder': {
        description: 'Knob that turns forever and clicks, with a push button',
        beginnerNote: 'A knob with no end stops. CLK and DT pulse as it turns so the code can count steps and direction; SW is the push button.',
    },
    'led-bar-graph': {
        description: 'Ten small LEDs in a row',
        beginnerNote: 'Ten LEDs in one block, handy for level meters. Each LED has its own + pin (A) and - pin (C) and needs its own resistor.',
    },
    'membrane-keypad': {
        description: '4x4 keypad with 16 keys',
        beginnerNote: 'Sixteen keys wired as 4 rows and 4 columns. Pressing a key joins its row pin to its column pin.',
        pinMeta: pins(['R1', 'R2', 'R3', 'R4', 'C1', 'C2', 'C3', 'C4'], D),
    },
    'microsd-card': {
        description: 'MicroSD card reader (SPI)',
        beginnerNote: 'Lets the Arduino save and read files on a memory card, for example to log sensor readings.',
    },
    mpu6050: {
        description: 'Motion sensor: accelerometer and gyroscope',
        beginnerNote: 'Senses tilt, shaking and rotation. It needs only two signal wires (SDA and SCL) plus power.',
    },
    'ntc-temperature-sensor': {
        description: 'Analog temperature sensor module',
        beginnerNote: 'Its output voltage changes with temperature. Read it with analogRead().',
    },
    'photoresistor-sensor': {
        description: 'Light sensor module with analog and digital outputs',
        beginnerNote: 'Measures brightness. AO gives the light level as a voltage; DO switches at the level set on the blue dial.',
    },
    'pushbutton-large': {
        description: 'Large 12 mm push button',
        beginnerNote: 'A big push button. It joins its two sides only while you hold it down.',
    },
    'rgb-led': {
        description: 'Red, green and blue LEDs in one package',
        beginnerNote: 'Three LEDs in one. Mix red, green and blue to make any colour. Each colour needs its own resistor; the longest leg is shared.',
    },
    'rotary-dialer': {
        description: 'Old telephone dial',
        beginnerNote: 'A dial from an old telephone. PULSE clicks once for each number as the dial spins back.',
    },
    'slide-potentiometer': {
        description: 'Slider that works like a knob',
        beginnerNote: 'A slider that gives out a voltage between 0 and 5 V depending on where you push it.',
    },
    ssd1306: {
        description: 'Small sharp OLED screen, 128x64 pixels (I2C)',
        beginnerNote: 'A tiny bright screen for text and simple graphics. It needs only two signal wires (DATA and CLK) plus power.',
    },
    'tilt-switch': {
        simulation: { kind: 'signal', action: 'tilt the sensor', output: 'OUT', power: 'VCC', ground: 'GND' },
        description: 'Switch that changes when the module is tilted',
        beginnerNote: 'A little ball inside rolls when you tilt it, switching OUT between HIGH and LOW.',
    },
    photoresistor: {
        description: 'Light sensor: its resistance drops as it gets brighter',
        beginnerNote: 'A resistor that changes with light. Pair it with a 10 k resistor between 5V and GND and read the point where they meet with analogRead(). It works either way round.',
    },
    'capacitor-ceramic': {
        description: 'Small capacitor (100 nF) for smoothing out electrical noise',
        beginnerNote: 'A capacitor stores a tiny bit of charge. This small one smooths out electrical noise and works either way round.',
    },
    'capacitor-electrolytic': {
        description: 'Larger capacitor (100 µF) that stores charge. It has a + and a - leg',
        beginnerNote: 'A bigger capacitor that steadies the power supply. It must go the right way round: the striped side is the - leg and goes toward ground.',
    },
    diode: {
        description: 'One-way valve for current (1N4007)',
        beginnerNote: 'A diode lets current flow one way only, toward the end with the silver band. Put one across a motor or relay coil to protect the circuit.',
    },
    'transistor-npn': {
        description: 'Electronic switch (2N2222): a small current controls a bigger one',
        beginnerNote: 'A transistor is a switch your code can flip. A small current into B (through a 1 k resistor) lets a bigger current flow from C to E, enough for a motor.',
    },
    'dc-motor': {
        description: 'Small motor that spins when powered',
        beginnerNote: 'A motor needs more current than an Arduino pin can give. Switch it with a transistor instead of wiring it straight to a pin.',
    },
};

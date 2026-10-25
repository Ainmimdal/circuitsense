import { createHalfBreadboardSurface } from '../physical/breadboard.js';
import { componentPinRef, createPhysicalProject, surfaceHoleRef } from '../physical/model.js';

// Preset learning projects. Each lesson is a finished schema-4 circuit that
// the guided build turns into steps, plus the story and the sketch to upload.
// Layout: half breadboard on top, Uno below it, 5 V on the bottom + rail (BP)
// and ground on the bottom - rail (BN).

const BOARD = 'breadboard-1';
const POWER = '#ef4444';
const GROUND = '#111111';

function board() {
    return createHalfBreadboardSurface({ id: BOARD, x: 30, y: 12 });
}

function uno() {
    return { id: 'uno', definitionId: 'arduino-uno', footprintId: 'free:arduino-uno', properties: {},
        placement: { type: 'free', position: { x: 42, y: 80 }, rotation: 0 } };
}

function free(id, definitionId, x, y, properties = {}) {
    return { id, definitionId, footprintId: `free:${definitionId}`, properties,
        placement: { type: 'free', position: { x, y }, rotation: 0 } };
}

function mounted(id, definitionId, footprintId, rotation, bindings, properties = {}) {
    return { id, definitionId, footprintId, properties, placement: { type: 'surface', surfaceId: BOARD, rotation, bindings } };
}

// LED with its anode on the left (rotation 180 puts A one column left of C).
function led(id, color, anodeHole, cathodeHole) {
    return mounted(id, 'led', 'led-2.54', 180, { C: cathodeHole, A: anodeHole }, { color });
}

function resistor(id, from, to, value = '220') {
    return mounted(id, 'resistor', 'axial-4', 0, { 1: from, 2: to }, { value });
}

// Straddles the centre gap: one side of the switch in each column.
function button(id, column) {
    return mounted(id, 'pushbutton', 'tactile-3x2', 90, {
        '1.l': `E${column}`, '1.r': `F${column}`, '2.l': `E${column - 2}`, '2.r': `F${column - 2}`,
    });
}

function hole(id) { return surfaceHoleRef(BOARD, id); }
function pin(componentId, pinId) { return componentPinRef(componentId, pinId); }

function wire(id, from, to, color) {
    return { id, from, to, color, route: { mode: 'auto', waypoints: [] }, properties: {} };
}

const groundRail = () => wire('w-gnd', pin('uno', 'GND.1'), hole('BN2'), GROUND);
const powerRail = () => wire('w-5v', pin('uno', '5V'), hole('BP3'), POWER);

function project(components, wires) {
    return createPhysicalProject({ surfaces: [board()], components: [uno(), ...components], wires });
}

const LESSONS = [
    {
        id: 'blink',
        title: 'Blink',
        level: 'Beginner',
        minutes: 10,
        accent: '#ef4444',
        goal: 'Make an LED flash on and off once a second.',
        summary: 'The "hello world" of electronics: your first output, a resistor and a ground path.',
        concepts: ['Digital output', 'Resistors', 'LED polarity'],
        explanation: 'Pin 13 switches between 5 V and 0 V. Current flows out of the pin, through the 220 Ω resistor that limits it, through the LED and back to ground. Without the resistor the LED would draw too much current and burn out.',
        notes: {
            r1: 'The resistor limits the current so the LED does not burn out.',
            led: 'The long leg (anode, +) goes in the resistor\'s column. LEDs only work one way round.',
            'w-sig': 'Pin 13 sends the on/off signal into the resistor.',
            'w-led-gnd': 'The LED\'s short leg (cathode) returns to ground through the - rail.',
        },
        code: `// Blink: flash the LED on pin 13
const int LED_PIN = 13;

void setup() {
  pinMode(LED_PIN, OUTPUT);   // pin 13 drives the LED
}

void loop() {
  digitalWrite(LED_PIN, HIGH); // 5 V: LED on
  delay(1000);                 // wait one second
  digitalWrite(LED_PIN, LOW);  // 0 V: LED off
  delay(1000);
}`,
        challenge: 'Change both delays to 200 to make a fast strobe.',
        build: () => project(
            [resistor('r1', 'H5', 'H9'), led('led', 'red', 'G9', 'G10')],
            [groundRail(), wire('w-led-gnd', hole('J10'), hole('BN9'), GROUND), wire('w-sig', pin('uno', '13'), hole('J5'), '#22d3ee')],
        ),
    },
    {
        id: 'button-led',
        title: 'Push to light',
        level: 'Beginner',
        minutes: 15,
        accent: '#22d3ee',
        goal: 'Light the LED only while the button is held down.',
        summary: 'Read your first input and use it to decide what the output does.',
        concepts: ['Digital input', 'Pull-up resistors', 'if / else'],
        explanation: 'The button connects pin 2 to ground when pressed. INPUT_PULLUP turns on a resistor inside the Arduino that holds the pin at 5 V the rest of the time, so the pin reads HIGH when released and LOW when pressed.',
        notes: {
            btn: 'The button straddles the middle gap so each side gets its own strips.',
            'w-btn': 'Pin 2 reads the button. The Arduino\'s internal pull-up keeps it HIGH until pressed.',
            'w-btn-gnd': 'Pressing the button connects pin 2 to ground, so it reads LOW.',
        },
        code: `// Push to light: LED on while the button is pressed
const int BUTTON_PIN = 2;
const int LED_PIN = 13;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP); // HIGH when released, LOW when pressed
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  if (digitalRead(BUTTON_PIN) == LOW) {
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(LED_PIN, LOW);
  }
}`,
        challenge: 'Make each press toggle the LED instead of holding it on.',
        build: () => project(
            [resistor('r1', 'H5', 'H9'), led('led', 'green', 'G9', 'G10'), button('btn', 22)],
            [
                groundRail(),
                wire('w-led-gnd', hole('J10'), hole('BN9'), GROUND),
                wire('w-btn-gnd', hole('J20'), hole('BN17'), GROUND),
                wire('w-sig', pin('uno', '13'), hole('J5'), '#22d3ee'),
                wire('w-btn', pin('uno', '2'), hole('J22'), '#facc15'),
            ],
        ),
    },
    {
        id: 'traffic-light',
        title: 'Traffic light',
        level: 'Beginner',
        minutes: 20,
        accent: '#facc15',
        goal: 'Cycle red, green and yellow lights like a real crossing.',
        summary: 'Three outputs, one sequence. Learn to organise timing in code.',
        concepts: ['Multiple outputs', 'Sequencing', 'Functions'],
        explanation: 'Each LED has its own pin and its own resistor, so the code can switch them independently. A helper function turns exactly one light on at a time, which keeps the loop short and readable.',
        notes: {
            'w-red': 'Pin 10 drives the red light.',
            'w-yellow': 'Pin 9 drives the yellow light.',
            'w-green': 'Pin 8 drives the green light.',
        },
        code: `// Traffic light: red, green, yellow, repeat
const int RED = 10;
const int YELLOW = 9;
const int GREEN = 8;

void show(int pin) {
  digitalWrite(RED, pin == RED);
  digitalWrite(YELLOW, pin == YELLOW);
  digitalWrite(GREEN, pin == GREEN);
}

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(YELLOW, OUTPUT);
  pinMode(GREEN, OUTPUT);
}

void loop() {
  show(RED);    delay(3000);
  show(GREEN);  delay(3000);
  show(YELLOW); delay(1000);
}`,
        challenge: 'Add a pedestrian button that shortens the green light.',
        build: () => project(
            [
                resistor('r-red', 'H1', 'H5'), led('led-red', 'red', 'G5', 'G6'),
                resistor('r-yellow', 'H9', 'H13'), led('led-yellow', 'yellow', 'G13', 'G14'),
                resistor('r-green', 'H17', 'H21'), led('led-green', 'green', 'G21', 'G22'),
            ],
            [
                groundRail(),
                wire('w-red-gnd', hole('J6'), hole('BN5'), GROUND),
                wire('w-yellow-gnd', hole('J14'), hole('BN11'), GROUND),
                wire('w-green-gnd', hole('J22'), hole('BN18'), GROUND),
                wire('w-red', pin('uno', '10'), hole('J1'), '#f87171'),
                wire('w-yellow', pin('uno', '9'), hole('J9'), '#facc15'),
                wire('w-green', pin('uno', '8'), hole('J17'), '#34d399'),
            ],
        ),
    },
    {
        id: 'knob-dimmer',
        title: 'Knob dimmer',
        level: 'Beginner',
        minutes: 20,
        accent: '#a78bfa',
        goal: 'Turn a knob to fade the LED from dark to full brightness.',
        summary: 'Your first analog input and a "fake analog" output with PWM.',
        concepts: ['analogRead', 'PWM with analogWrite', 'map()'],
        explanation: 'The potentiometer is a voltage divider: its middle pin gives anything from 0 V to 5 V as you turn it. analogRead turns that into a number from 0 to 1023. Pin 9 can then pulse very fast (PWM) so the LED looks dimmer or brighter.',
        notes: {
            pot: 'The knob\'s outer legs go to 5 V and ground. The middle leg is the output.',
            'w-pot-5v': 'One outer leg of the knob gets 5 V from the + rail.',
            'w-pot-gnd': 'The other outer leg goes to ground.',
            'w-pot-sig': 'The middle leg sends a voltage between 0 and 5 V to analog pin A0.',
            'w-sig': 'Pin 9 has a ~ mark, which means it can do PWM.',
        },
        code: `// Knob dimmer: potentiometer sets LED brightness
const int KNOB_PIN = A0;
const int LED_PIN = 9;   // ~ pins support PWM

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int reading = analogRead(KNOB_PIN);           // 0 to 1023
  int brightness = map(reading, 0, 1023, 0, 255);
  analogWrite(LED_PIN, brightness);             // 0 to 255
}`,
        challenge: 'Print the reading with Serial.println and watch it in the Serial Monitor.',
        build: () => project(
            [
                resistor('r1', 'H5', 'H9'), led('led', 'yellow', 'G9', 'G10'),
                mounted('pot', 'potentiometer', 'pot-linear-3', 0, { GND: 'G24', SIG: 'G25', VCC: 'G26' }),
            ],
            [
                powerRail(), groundRail(),
                wire('w-pot-5v', hole('J26'), hole('BP21'), POWER),
                wire('w-pot-gnd', hole('J24'), hole('BN19'), GROUND),
                wire('w-led-gnd', hole('J10'), hole('BN9'), GROUND),
                wire('w-sig', pin('uno', '9'), hole('J5'), '#22d3ee'),
                wire('w-pot-sig', pin('uno', 'A0'), hole('J25'), '#a78bfa'),
            ],
        ),
    },
    {
        id: 'doorbell',
        title: 'Doorbell',
        level: 'Beginner',
        minutes: 15,
        accent: '#fb923c',
        goal: 'Press the button to play a two-tone "ding dong".',
        summary: 'Make sound with tone() and combine it with the button you already know.',
        concepts: ['tone()', 'Frequency', 'Reusing inputs'],
        explanation: 'A piezo buzzer clicks every time its voltage changes. tone() switches pin 9 on and off hundreds of times a second, and that rate is the pitch you hear: 659 Hz is an E and 523 Hz is a C.',
        notes: {
            buzzer: 'The buzzer\'s + leg is on the left. It is polarised like an LED.',
            'w-buzz': 'Pin 9 drives the buzzer with a square wave.',
            'w-btn': 'Pin 2 reads the doorbell button.',
        },
        code: `// Doorbell: press the button for "ding dong"
const int BUTTON_PIN = 2;
const int BUZZER_PIN = 9;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
}

void loop() {
  if (digitalRead(BUTTON_PIN) == LOW) {
    tone(BUZZER_PIN, 659, 400);  // ding (E5)
    delay(450);
    tone(BUZZER_PIN, 523, 600);  // dong (C5)
    delay(800);
  }
}`,
        challenge: 'Write a short melody using an array of notes.',
        build: () => project(
            [mounted('buzzer', 'buzzer', 'buzzer-2.54', 0, { 1: 'G8', 2: 'G9' }), button('btn', 22)],
            [
                groundRail(),
                wire('w-buzz-gnd', hole('J9'), hole('BN8'), GROUND),
                wire('w-btn-gnd', hole('J20'), hole('BN17'), GROUND),
                wire('w-buzz', pin('uno', '9'), hole('J8'), '#fb923c'),
                wire('w-btn', pin('uno', '2'), hole('J22'), '#facc15'),
            ],
        ),
    },
    {
        id: 'night-light',
        title: 'Night light',
        level: 'Intermediate',
        minutes: 20,
        accent: '#38bdf8',
        goal: 'Switch the LED on automatically when the room gets dark.',
        summary: 'Read a real sensor, pick a threshold and debug with the Serial Monitor.',
        concepts: ['Sensors', 'Thresholds', 'Serial Monitor'],
        explanation: 'The light sensor module outputs a voltage on AO that falls as light gets brighter. The sketch prints each reading so you can see the numbers for your room, then lights the LED when the reading is above a threshold you choose.',
        notes: {
            ldr: 'This sensor module stays off the breadboard. Wire it straight to the rails and A0.',
            'w-ldr-5v': 'The sensor needs 5 V to run.',
            'w-ldr-gnd': 'And a ground connection.',
            'w-ldr-ao': 'AO is the analog output. It goes to A0.',
        },
        code: `// Night light: LED turns on in the dark
const int SENSOR_PIN = A0;
const int LED_PIN = 9;
int threshold = 600;   // tune this for your room

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int light = analogRead(SENSOR_PIN);
  Serial.println(light);            // open Tools > Serial Monitor
  digitalWrite(LED_PIN, light > threshold ? HIGH : LOW);
  delay(100);
}`,
        challenge: 'Fade the LED in gradually with analogWrite instead of switching it.',
        build: () => project(
            [resistor('r1', 'H5', 'H9'), led('led', 'white', 'G9', 'G10'), free('ldr', 'photoresistor-sensor', 128, 34)],
            [
                powerRail(), groundRail(),
                wire('w-ldr-5v', pin('ldr', 'VCC'), hole('BP24'), POWER),
                wire('w-ldr-gnd', pin('ldr', 'GND'), hole('BN24'), GROUND),
                wire('w-led-gnd', hole('J10'), hole('BN9'), GROUND),
                wire('w-sig', pin('uno', '9'), hole('J5'), '#22d3ee'),
                wire('w-ldr-ao', pin('ldr', 'AO'), pin('uno', 'A0'), '#38bdf8'),
            ],
        ),
    },
    {
        id: 'rgb-mixer',
        title: 'Colour mixer',
        level: 'Intermediate',
        minutes: 25,
        accent: '#f472b6',
        goal: 'Fade an RGB LED smoothly through the rainbow.',
        summary: 'Three PWM channels in one LED. Mix any colour from red, green and blue.',
        concepts: ['RGB colour', 'Common cathode', 'for loops'],
        explanation: 'An RGB LED is three LEDs in one package that share a cathode (the longest leg). Each colour gets its own resistor and PWM pin, so analogWrite can blend them.',
        notes: {
            rgb: 'The longest leg is the common cathode. It sits one row lower than the others.',
            'r-r': 'Each colour needs its own resistor, just like a single LED.',
            'w-com': 'The shared cathode returns to ground.',
        },
        code: `// Colour mixer: fade through the rainbow
const int R = 11, G = 10, B = 9;

void setColour(int r, int g, int b) {
  analogWrite(R, r);
  analogWrite(G, g);
  analogWrite(B, b);
}

void setup() {
  pinMode(R, OUTPUT);
  pinMode(G, OUTPUT);
  pinMode(B, OUTPUT);
}

void loop() {
  for (int i = 0; i < 255; i++) { setColour(255 - i, i, 0); delay(8); } // red to green
  for (int i = 0; i < 255; i++) { setColour(0, 255 - i, i); delay(8); } // green to blue
  for (int i = 0; i < 255; i++) { setColour(i, 0, 255 - i); delay(8); } // blue to red
}`,
        challenge: 'Add the knob from the dimmer lesson to choose the colour by hand.',
        build: () => project(
            [
                mounted('rgb', 'rgb-led', 'rgb-led-bent-4', 0, { R: 'H14', COM: 'I15', G: 'H16', B: 'H17' }),
                resistor('r-r', 'G10', 'G14'), resistor('r-g', 'I12', 'I16'), mounted('r-b', 'resistor', 'axial-4', 180, { 1: 'G21', 2: 'G17' }, { value: '220' }),
            ],
            [
                groundRail(),
                wire('w-com', hole('J15'), hole('BN12'), GROUND),
                wire('w-red', pin('uno', '11'), hole('F10'), '#f87171'),
                wire('w-green', pin('uno', '10'), hole('F12'), '#34d399'),
                wire('w-blue', pin('uno', '9'), hole('F21'), '#60a5fa'),
            ],
        ),
    },
    {
        id: 'servo-knob',
        title: 'Servo steering',
        level: 'Intermediate',
        minutes: 25,
        accent: '#34d399',
        goal: 'Point a servo arm wherever you turn the knob.',
        summary: 'Your first motor and your first library: real movement from a dial.',
        concepts: ['Servo library', 'Motors', 'Mapping ranges'],
        explanation: 'A hobby servo turns to an angle between 0° and 180° set by the pulses on its signal wire. The Servo library makes those pulses for you. The knob reading (0 to 1023) is mapped to an angle, so the arm follows your hand.',
        notes: {
            servo: 'The servo sits beside the board. Its three wires are signal, power and ground.',
            'w-servo-5v': 'The servo\'s red wire takes 5 V from the + rail.',
            'w-servo-gnd': 'Its brown or black wire goes to ground.',
            'w-servo-sig': 'The orange signal wire goes to PWM pin 9.',
        },
        code: `// Servo steering: the knob sets the servo angle
#include <Servo.h>

Servo arm;
const int KNOB_PIN = A0;

void setup() {
  arm.attach(9);          // servo signal on pin 9
}

void loop() {
  int reading = analogRead(KNOB_PIN);       // 0 to 1023
  int angle = map(reading, 0, 1023, 0, 180);
  arm.write(angle);
  delay(15);              // give the servo time to move
}`,
        challenge: 'Replace the knob with two buttons that step the angle left and right.',
        build: () => project(
            [
                mounted('pot', 'potentiometer', 'pot-linear-3', 0, { GND: 'G10', SIG: 'G11', VCC: 'G12' }),
                free('servo', 'servo', 128, 30),
            ],
            [
                powerRail(), groundRail(),
                wire('w-pot-5v', hole('J12'), hole('BP10'), POWER),
                wire('w-pot-gnd', hole('J10'), hole('BN8'), GROUND),
                wire('w-servo-5v', pin('servo', 'V+'), hole('BP24'), POWER),
                wire('w-servo-gnd', pin('servo', 'GND'), hole('BN24'), GROUND),
                wire('w-pot-sig', pin('uno', 'A0'), hole('J11'), '#a78bfa'),
                wire('w-servo-sig', pin('servo', 'PWM'), pin('uno', '9'), '#fb923c'),
            ],
        ),
    },
];

export function listLessons() {
    return LESSONS;
}

export function getLesson(id) {
    return LESSONS.find(lesson => lesson.id === id) || null;
}

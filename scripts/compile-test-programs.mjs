// Compiles the sketches below into test/fixtures/programs.json for
// the test/simulation-*.test.js files. Run after changing a sketch:
//
//   node scripts/compile-test-programs.mjs http://localhost:8787
//
// The compile server needs the libraries its Dockerfile installs.

import { writeFileSync } from 'node:fs';

const sketches = {
    // Drives the LCD backpack with plain Wire calls, the same bytes LiquidCrystal_I2C sends.
    lcdAndClock: `#include <Wire.h>
const byte LCD = 0x27;
void pulse(byte value) {
  Wire.beginTransmission(LCD); Wire.write(value | 0x0C); Wire.endTransmission();
  Wire.beginTransmission(LCD); Wire.write(value | 0x08); Wire.endTransmission();
}
void send(byte value, byte rs) { pulse((value & 0xF0) | rs); pulse((value << 4) | rs); }
void setup() {
  Wire.begin();
  Serial.begin(9600);
  pulse(0x30); pulse(0x30); pulse(0x30); pulse(0x20);
  send(0x28, 0); send(0x0C, 0); send(0x01, 0);
  const char *text = "Hello";
  while (*text) send(*text++, 1);
  send(0xC0, 0); send('O', 1); send('K', 1);
  Wire.beginTransmission(0x68); Wire.write(0); Wire.endTransmission();
  Wire.requestFrom(0x68, 3);
  byte seconds = Wire.read(), minutes = Wire.read(), hours = Wire.read();
  Serial.print(hours, HEX); Serial.print(':'); Serial.print(minutes, HEX); Serial.print(':'); Serial.println(seconds, HEX);
  Wire.beginTransmission(0x50);
  Serial.println(Wire.endTransmission());
}
void loop() {}`,
    oled: `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
void setup() {
  Serial.begin(9600);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.drawPixel(5, 7, SSD1306_WHITE);
  display.fillRect(100, 40, 4, 4, SSD1306_WHITE);
  display.display();
  Serial.println("done");
}
void loop() {}`,
    motion: `#include <Wire.h>
void setup() {
  Wire.begin();
  Serial.begin(9600);
}
void loop() {
  Wire.beginTransmission(0x68); Wire.write(0x3B); Wire.endTransmission(false);
  Wire.requestFrom(0x68, 2);
  int x = Wire.read() << 8 | Wire.read();
  Serial.println(x);
  delay(50);
}`,
    // 17 pixels: a 16-pixel ring with one more pixel chained after it.
    pixels: `#include <Adafruit_NeoPixel.h>
Adafruit_NeoPixel strip(17, 6, NEO_GRB + NEO_KHZ800);
void setup() {
  strip.begin();
  strip.setPixelColor(0, strip.Color(255, 0, 0));
  strip.setPixelColor(3, strip.Color(0, 0, 255));
  strip.setPixelColor(16, strip.Color(0, 255, 0));
  strip.show();
}
void loop() {}`,
    // Drives the colour screen with plain SPI calls, the same bytes Adafruit_ILI9341 sends.
    tft: `#include <SPI.h>
const int CS = 10, DC = 9;
void command(byte value) { digitalWrite(DC, LOW); SPI.transfer(value); digitalWrite(DC, HIGH); }
void window(int x0, int y0, int x1, int y1) {
  command(0x2A); SPI.transfer16(x0); SPI.transfer16(x1);
  command(0x2B); SPI.transfer16(y0); SPI.transfer16(y1);
  command(0x2C);
}
void setup() {
  pinMode(CS, OUTPUT); pinMode(DC, OUTPUT);
  SPI.begin();
  digitalWrite(CS, LOW);
  command(0x36); SPI.transfer(0x48);
  window(10, 20, 11, 21);
  for (int i = 0; i < 4; i++) SPI.transfer16(0xF800);
  window(100, 200, 100, 200);
  SPI.transfer16(0x07E0);
  digitalWrite(CS, HIGH);
  Serial.begin(9600);
  Serial.println("done");
}
void loop() {}`,
    sd: `#include <SPI.h>
#include <SD.h>
void setup() {
  Serial.begin(9600);
  if (!SD.begin(10)) { Serial.println("no card"); return; }
  File file = SD.open("log.txt", FILE_WRITE);
  file.println("hello 42");
  file.close();
  file = SD.open("log.txt");
  while (file.available()) Serial.write(file.read());
  file.close();
  Serial.println(SD.exists("log.txt") ? "saved" : "missing");
}
void loop() {}`,
    sdRead: `#include <SPI.h>
#include <SD.h>
void setup() {
  Serial.begin(9600);
  if (!SD.begin(10)) { Serial.println("no card"); return; }
  File file = SD.open("log.txt");
  if (!file) { Serial.println("no file"); return; }
  while (file.available()) Serial.write(file.read());
}
void loop() {}`,
    // Reads the DHT22 the way the DHT library does: a start pulse, then 40 timed bits.
    dht: `const int PIN = 2;
void setup() { Serial.begin(9600); }
void loop() {
  pinMode(PIN, OUTPUT); digitalWrite(PIN, LOW); delay(2); pinMode(PIN, INPUT_PULLUP);
  pulseIn(PIN, HIGH, 2000);
  byte data[5] = {0, 0, 0, 0, 0};
  for (int i = 0; i < 40; i++) data[i / 8] = data[i / 8] << 1 | (pulseIn(PIN, HIGH, 2000) > 45);
  Serial.print((data[2] << 8 | data[3]) / 10.0); Serial.print(' ');
  Serial.print((data[0] << 8 | data[1]) / 10.0); Serial.print(' ');
  Serial.println(((data[0] + data[1] + data[2] + data[3]) & 255) == data[4] ? "ok" : "bad");
  delay(200);
}`,
    // Decodes one NEC remote frame and prints its command byte.
    remote: `const int PIN = 2;
void setup() { Serial.begin(9600); }
void loop() {
  if (digitalRead(PIN) == HIGH) return;
  if (pulseIn(PIN, HIGH, 20000) < 4000) return;
  unsigned long frame = 0;
  for (int i = 0; i < 32; i++) if (pulseIn(PIN, HIGH, 5000) > 1000) frame |= 1UL << i;
  Serial.println((frame >> 16) & 255);
  delay(100);
}`,
    loadCell: `const int DATA = 3, CLOCK = 4;
void setup() { pinMode(CLOCK, OUTPUT); Serial.begin(9600); }
void loop() {
  if (digitalRead(DATA) == HIGH) return;
  long value = 0;
  for (int i = 0; i < 24; i++) { digitalWrite(CLOCK, HIGH); value = value << 1 | digitalRead(DATA); digitalWrite(CLOCK, LOW); }
  digitalWrite(CLOCK, HIGH); digitalWrite(CLOCK, LOW);
  Serial.println(value);
  delay(100);
}`,
    stepper: `#include <Stepper.h>
Stepper motor(200, 8, 9, 10, 11);
void setup() {
  Serial.begin(9600);
  motor.setSpeed(120);
  motor.step(51);
  Serial.println("done");
}
void loop() {}`,
};

const server = (process.argv[2] || '').replace(/\/$/, '');
const programs = {};
for (const [name, sketch] of Object.entries(sketches)) {
    const response = await fetch(`${server}/compile`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sketch }),
    });
    const result = await response.json();
    if (!result.hex) throw new Error(`${name}: ${result.errors || result.error}`);
    programs[name] = result.hex.replace(/\r\n/g, '\n');
}
writeFileSync(new URL('../test/fixtures/programs.json', import.meta.url), `${JSON.stringify(programs, null, 1)}\n`);
console.log(`Wrote ${Object.keys(programs).length} programs.`);

// Compiles the sketches below into test/fixtures/i2c-programs.json for
// test/simulation-i2c.test.js. Run after changing a sketch:
//
//   node scripts/compile-i2c-test-programs.mjs http://localhost:8787
//
// The compile server needs the Adafruit SSD1306 library (see its Dockerfile).

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
writeFileSync(new URL('../test/fixtures/i2c-programs.json', import.meta.url), `${JSON.stringify(programs, null, 1)}\n`);
console.log(`Wrote ${Object.keys(programs).length} programs.`);

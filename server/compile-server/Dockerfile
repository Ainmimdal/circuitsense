# Elera compile server: Node plus arduino-cli with the Uno toolchain baked in.
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Pinned so a rebuild always produces the same compiler.
ARG ARDUINO_CLI_VERSION=1.1.1
RUN curl -fsSL "https://downloads.arduino.cc/arduino-cli/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz" \
    | tar -xz -C /usr/local/bin arduino-cli

USER node
RUN arduino-cli core update-index \
    && arduino-cli core install arduino:avr@1.8.6 \
    && arduino-cli lib install Servo "LiquidCrystal I2C" "Adafruit SSD1306" RTClib "Adafruit MPU6050" "Adafruit NeoPixel" "Adafruit ILI9341" SD "DHT sensor library" IRremote "HX711 Arduino Library" Stepper

WORKDIR /app
COPY --chown=node:node server.mjs .

ENV PORT=8787
EXPOSE 8787
CMD ["node", "server.mjs"]

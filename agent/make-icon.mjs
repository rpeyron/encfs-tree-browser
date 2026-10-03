// Generates agent/icon.ico (32x32, BMP-in-ICO) matching public/favicon.svg:
// rounded indigo→blue gradient tile + white padlock + indigo keyhole.
// Run: node make-icon.mjs   (no dependencies)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const S = 32;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const C1 = hex('#4f46e5'); // indigo-600
const C2 = hex('#2563eb'); // blue-600
const KEY = hex('#4f46e5');
const R = 7; // corner radius
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const insideRound = (x, y) => {
  const nx = x < R ? R - x : x > S - 1 - R ? x - (S - 1 - R) : 0;
  const ny = y < R ? R - y : y > S - 1 - R ? y - (S - 1 - R) : 0;
  return nx * nx + ny * ny <= R * R;
};
const onRing = (x, y) => {
  const d = Math.hypot(x - 16, y - 13.5);
  return Math.abs(d - 7.5) <= 1.3;
};
const inBody = (x, y) => x >= 11 && x <= 21 && y >= 15 && y <= 25;
const inKey = (x, y) =>
  Math.hypot(x - 16, y - 19.5) <= 2.1 || (x >= 15 && x <= 16.5 && y >= 21 && y <= 23.5);

const xor = Buffer.alloc(S * S * 4);
const and = Buffer.alloc(Math.ceil(S / 8) * S, 0xff);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const inside = insideRound(x, y);
    let r, g, b;
    if (inKey(x, y) && inBody(x, y)) {
      [r, g, b] = KEY;
    } else if (inBody(x, y) || onRing(x, y)) {
      [r, g, b] = [255, 255, 255];
    } else {
      const t = (x + y) / (2 * (S - 1));
      [r, g, b] = [lerp(C1[0], C2[0], t), lerp(C1[1], C2[1], t), lerp(C1[2], C2[2], t)];
    }
    // BMP: bottom-up rows, BGRA
    const row = S - 1 - y;
    const o = (row * S + x) * 4;
    xor[o] = b;
    xor[o + 1] = g;
    xor[o + 2] = r;
    xor[o + 3] = inside ? 255 : 0;
    if (!inside) {
      const m = row * Math.ceil(S / 8) + (x >> 3);
      and[m] &= ~(0x80 >> (x & 7));
    }
  }
}

const headerSize = 40;
const andSize = and.length;
const image = Buffer.alloc(headerSize + xor.length + andSize);
image.writeUInt32LE(headerSize, 0);
image.writeInt32LE(S, 4);
image.writeInt32LE(S * 2, 8); // height * 2 (XOR + AND)
image.writeUInt16LE(1, 12);
image.writeUInt16LE(32, 14);
xor.copy(image, headerSize);
and.copy(image, headerSize + xor.length);

const entry = 16;
const icon = Buffer.alloc(6 + entry + image.length);
icon.writeUInt16LE(0, 0);
icon.writeUInt16LE(1, 2);
icon.writeUInt16LE(1, 4);
icon.writeUInt8(S, 6);
icon.writeUInt8(S, 7);
icon.writeUInt8(0, 8);
icon.writeUInt8(0, 9);
icon.writeUInt16LE(1, 10);
icon.writeUInt16LE(32, 12);
icon.writeUInt32LE(image.length, 14);
icon.writeUInt32LE(6 + entry, 18);
image.copy(icon, 6 + entry);

const out = join(dirname(fileURLToPath(import.meta.url)), 'icon.ico');
writeFileSync(out, icon);
console.log(`wrote ${out} (${icon.length} bytes)`);

// EncFS custom base64 (filename-safe) — from encfs base64.cpp
// Ascii chars: ",-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
// No '/', '+', '.' or '=' — filenames must not contain the path separator.
const B64_TO_ASCII = ',-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// Ascii2B64 table from encfs (index by ascii char code, values are 0-63)
// ascii 44 (','), 45 ('-'), 48-57 ('0'-'9'), 65-90 ('A'-'Z'), 97-122 ('a'-'z')
const ASCII_TO_B64 = (() => {
  const t = new Int8Array(128).fill(-1);
  for (let i = 0; i < 64; i++) t[B64_TO_ASCII.charCodeAt(i)] = i;
  return t;
})();

// changeBase2: convert src bits of width src2Pow to dst bits of width dst2Pow (bit-stream).
// EncFS uses it for base64(8->6) and base32(8->5). outputPartial uses trailing partial value.
export function changeBase2(
  src: Uint8Array,
  src2Pow: number,
  dst2Pow: number,
  outputPartial: boolean
): Uint8Array {
  // output size: floor(srcLen * src2Pow / dst2Pow) + (partial && remainder)
  const full = Math.floor((src.length * src2Pow) / dst2Pow);
  const hasPartial = (src.length * src2Pow) % dst2Pow !== 0;
  const dst = new Uint8Array(full + (outputPartial && hasPartial ? 1 : 0));

  let work = 0;
  let workBits = 0;
  let di = 0;
  const mask = (1 << dst2Pow) - 1;

  for (let i = 0; i < src.length; i++) {
    work |= src[i] << workBits;
    workBits += src2Pow;
    while (workBits >= dst2Pow) {
      dst[di++] = work & mask;
      work >>= dst2Pow;
      workBits -= dst2Pow;
    }
  }
  if (outputPartial && workBits > 0) {
    dst[di++] = work & mask;
  }
  return dst;
}

// B64ToAscii: map base-64 values (0-63) to the custom ascii alphabet
export function b64ToAscii(buf: Uint8Array): Uint8Array {
  const out = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = B64_TO_ASCII.charCodeAt(buf[i]);
  return out;
}

// AsciiToB64: map custom ascii chars back to base-64 values (0-63)
export function asciiToB64(buf: Uint8Array): Uint8Array {
  const out = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const v = ASCII_TO_B64[buf[i]];
    if (v < 0) throw new Error(`Invalid base64 char: ${String.fromCharCode(buf[i])}`);
    out[i] = v;
  }
  return out;
}

// Convenience for base8->base6->ascii (encode path)
export function bytesToEncfsB64(data: Uint8Array): string {
  const b64 = changeBase2(data, 8, 6, true);
  const ascii = b64ToAscii(b64);
  return String.fromCharCode(...ascii);
}

// Inverse: ascii -> base6 -> base8 (decode path)
export function encfsB64ToBytes(str: string): Uint8Array {
  const ascii = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) ascii[i] = str.charCodeAt(i);
  const b64 = asciiToB64(ascii);
  return changeBase2(b64, 6, 8, false);
}

// number of base-64 chars produced by `bytes` bytes (encfs B256ToB64Bytes)
export function b256ToB64Bytes(bytes: number): number {
  return (bytes * 8 + 5) / 6;
}
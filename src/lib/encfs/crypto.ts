// Web Crypto API wrapper for EncFS operations

export async function deriveKey(
  password: string,
  salt: Uint8Array,
  keySize: number = 32,
  iterations: number = 16
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const passwordBuffer = enc.encode(password);

  const key = await crypto.subtle.importKey('raw', passwordBuffer, 'PBKDF2', false, [
    'deriveBits',
  ]);

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      hash: 'SHA-256',
      iterations,
    },
    key,
    keySize * 8
  );

  return new Uint8Array(derived);
}

export async function aesDecrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-CBC', false, ['decrypt']);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv as BufferSource },
    cryptoKey,
    ciphertext as BufferSource
  );

  return new Uint8Array(decrypted);
}

export async function aesEncrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-CBC', false, ['encrypt']);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: iv as BufferSource },
    cryptoKey,
    plaintext as BufferSource
  );

  return new Uint8Array(encrypted);
}

export function encodeUtf8(str: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(str, 'utf-8'));
  }
  return new TextEncoder().encode(str);
}

export function decodeUtf8(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('utf-8');
  }
  return new TextDecoder().decode(bytes);
}

export function getRandomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < size; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytes;
}

export function base64Decode(str: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(str, 'base64'));
  }
  return new Uint8Array(
    atob(str)
      .split('')
      .map((c) => c.charCodeAt(0))
  );
}

export function base64Encode(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  return btoa(String.fromCharCode(...bytes));
}

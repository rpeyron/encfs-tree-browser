// Web Crypto API wrapper for EncFS operations

export async function deriveKey(
  password: string,
  salt: Uint8Array,
  keySize: number = 32,
  iterations: number = 16 // Default EncFS iterations
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const passwordBuffer = enc.encode(password);

  const key = await crypto.subtle.importKey('raw', passwordBuffer, 'PBKDF2', false, [
    'deriveBits',
  ]);

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
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
  const cryptoKey = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['decrypt']);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv },
    cryptoKey,
    ciphertext
  );

  return new Uint8Array(decrypted);
}

export async function aesEncrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt']);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    cryptoKey,
    plaintext
  );

  return new Uint8Array(encrypted);
}

export function base64Decode(str: string): Uint8Array {
  return new Uint8Array(
    atob(str)
      .split('')
      .map((c) => c.charCodeAt(0))
  );
}

export function base64Encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

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

export async function hmacSha1(
  key: Uint8Array,
  data: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, data as BufferSource);
  return new Uint8Array(sig);
}

export async function sha1(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-1', data as BufferSource);
  return new Uint8Array(digest);
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


// AES-ECB single-block (no padding). Used to build AES-CFB streams, since
// Web Crypto API exposes no CFB mode.
async function aesEcbEncryptBlock(key: Uint8Array, block: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-CBC', false, ['encrypt']);
  const zeroIv = new Uint8Array(16);
  const out = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: zeroIv }, cryptoKey, block as BufferSource);
  return new Uint8Array(out).subarray(0, 16);
}


// AES-CFB128 encryption/decryption (EncFS stream cipher)
export async function cfbEncrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const out = new Uint8Array(data.length);
  const aesKey = key.subarray(0, key.length - iv.length); // AES key portion
  let prev = iv.slice();
  for (let offset = 0; offset < data.length; offset += 16) {
    const block = data.subarray(offset, offset + 16);
    const keystream = await aesEcbEncryptBlock(aesKey, prev);
    const outBlock = new Uint8Array(block.length);
    for (let i = 0; i < block.length; i++) outBlock[i] = block[i] ^ keystream[i];
    out.set(outBlock, offset);
    prev = new Uint8Array(16);
    prev.set(outBlock);
  }
  return out;
}

export async function cfbDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const out = new Uint8Array(data.length);
  const aesKey = key.subarray(0, key.length - iv.length); // AES key portion
  let prev = iv.slice();
  for (let offset = 0; offset < data.length; offset += 16) {
    const block = data.subarray(offset, offset + 16);
    const keystream = await aesEcbEncryptBlock(aesKey, prev);
    const outBlock = new Uint8Array(block.length);
    for (let i = 0; i < block.length; i++) outBlock[i] = block[i] ^ keystream[i];
    out.set(outBlock, offset);
    prev = new Uint8Array(16);
    prev.set(block);
  }
  return out;
}

// BytesToKey implementation (SHA-1, no salt, rounds)
export async function bytesToKey(data: Uint8Array, rounds: number, keySize: number, ivSize: number): Promise<Uint8Array> {
  const total = keySize + ivSize;
  const out = new Uint8Array(total);
  let generated = 0;
  let mdBuf: Uint8Array | null = null;
  while (generated < total) {
    let m: Uint8Array;
    if (mdBuf === null) {
      m = data;
    } else {
      m = concatBytes([mdBuf, data]);
    }
    mdBuf = await sha1(m);
    for (let i = 1; i < rounds; i++) {
      mdBuf = await sha1(mdBuf);
    }
    const copyLen = Math.min(mdBuf.length, total - generated);
    out.set(mdBuf.subarray(0, copyLen), generated);
    generated += copyLen;
  }
  return out;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
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

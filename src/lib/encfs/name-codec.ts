import type { EncFSConfig } from '../../types/index';
import { deriveKey, aesDecrypt, aesEncrypt, base64Decode, base64Encode, encodeUtf8, decodeUtf8, getRandomBytes } from './crypto';
import { parseEncfsConfig } from './config-parser';

export interface CodecConfig {
  config: EncFSConfig;
  password: string;
  keyBits: Uint8Array;
}

let codecCache: Map<string, CodecConfig> = new Map();

export async function initCodec(xmlContent: string, password: string): Promise<CodecConfig> {
  const config = parseEncfsConfig(xmlContent);

  // Extract salt from the key's encoded part (first 16 bytes of the key content)
  const keyContent = base64Decode(config.key);
  const salt = keyContent.slice(0, 16);

  // Derive the key from password
  const keyBits = await deriveKey(password, salt, config.keySize / 8, 16);

  return { config, password, keyBits };
}

export async function decodeFilename(
  encoded: string,
  codec: CodecConfig
): Promise<string | null> {
  try {
    const { config, keyBits } = codec;

    if (config.nameAlg === 'Null') {
      return encoded;
    }

    // EncFS Block32 encoding: base64 encoded + encrypted
    const ciphertext = base64Decode(encoded);

    if (ciphertext.length === 0) {
      return null;
    }

    // Extract IV from the first 16 bytes of ciphertext
    const iv = ciphertext.slice(0, 16);
    const encrypted = ciphertext.slice(16);

    // Decrypt
    const decrypted = await aesDecrypt(encrypted, keyBits, iv);

    // Remove PKCS7 padding
    const paddingLength = decrypted[decrypted.length - 1];
    if (paddingLength === 0 || paddingLength > 16) {
      return null;
    }

    const plaintext = decrypted.slice(0, decrypted.length - paddingLength);
    return decodeUtf8(plaintext);
  } catch (error) {
    return null;
  }
}

export async function encodeFilename(
  decoded: string,
  codec: CodecConfig
): Promise<string | null> {
  try {
    const { config, keyBits } = codec;

    if (config.nameAlg === 'Null') {
      return decoded;
    }

    const plaintext = encodeUtf8(decoded);

    // Add PKCS7 padding
    const blockSize = 16;
    const paddingLength = blockSize - (plaintext.length % blockSize);
    const padded = new Uint8Array(plaintext.length + paddingLength);
    padded.set(plaintext);
    padded.fill(paddingLength, plaintext.length);

    // Generate random IV
    const iv = getRandomBytes(16);

    // Encrypt
    const encrypted = await aesEncrypt(padded, keyBits, iv);

    // Combine IV + encrypted and encode
    const combined = new Uint8Array(iv.length + encrypted.length);
    combined.set(iv);
    combined.set(encrypted, iv.length);

    return base64Encode(combined);
  } catch (error) {
    return null;
  }
}

export function clearCodecCache() {
  codecCache.clear();
}

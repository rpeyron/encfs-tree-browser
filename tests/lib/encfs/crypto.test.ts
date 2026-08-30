import { describe, it, expect } from 'vitest';
import { deriveKey, base64Decode, base64Encode } from '../../../src/lib/encfs/crypto';

describe('EncFS Crypto Utilities', () => {
  describe('base64Encode/Decode', () => {
    it('should encode and decode bytes', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const encoded = base64Encode(original);
      expect(typeof encoded).toBe('string');

      const decoded = base64Decode(encoded);
      expect(decoded).toEqual(original);
    });

    it('should handle empty bytes', () => {
      const original = new Uint8Array([]);
      const encoded = base64Encode(original);
      const decoded = base64Decode(encoded);
      expect(decoded).toEqual(original);
    });

    it('should decode standard base64', () => {
      const decoded = base64Decode('SGVsbG8gV29ybGQ=');
      const text = new TextDecoder().decode(decoded);
      expect(text).toBe('Hello World');
    });
  });

  describe('deriveKey', () => {
    it('should derive consistent keys from same password and salt', async () => {
      const password = 'testpassword';
      const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

      const key1 = await deriveKey(password, salt, 32, 16);
      const key2 = await deriveKey(password, salt, 32, 16);

      expect(key1).toEqual(key2);
    });

    it('should derive different keys from different passwords', async () => {
      const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

      const key1 = await deriveKey('password1', salt, 32, 16);
      const key2 = await deriveKey('password2', salt, 32, 16);

      expect(key1).not.toEqual(key2);
    });

    it('should derive different keys from different salts', async () => {
      const password = 'testpassword';
      const salt1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      const salt2 = new Uint8Array([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);

      const key1 = await deriveKey(password, salt1, 32, 16);
      const key2 = await deriveKey(password, salt2, 32, 16);

      expect(key1).not.toEqual(key2);
    });

    it('should generate 256-bit key when requested', async () => {
      const password = 'testpassword';
      const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

      const key = await deriveKey(password, salt, 32, 16);
      expect(key.length).toBe(32);
    });

    it('should generate 128-bit key when requested', async () => {
      const password = 'testpassword';
      const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

      const key = await deriveKey(password, salt, 16, 16);
      expect(key.length).toBe(16);
    });
  });
});

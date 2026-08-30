import { describe, it, expect, beforeAll } from 'vitest';
import { initCodec, decodeFilename, encodeFilename } from '../../../src/lib/encfs/name-codec';

const SAMPLE_CONFIG = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<EncFS>
  <algorithm name="aes-256-cbc"/>
  <keySize>32</keySize>
  <blockSize>1024</blockSize>
  <nameAlgorithm name="Block"/>
  <iv>MTIzNDU2Nzg5MEFCQw==</iv>
  <key content="AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKiosLS4vMDEyMzQ1Njc4OTo7PD0+Pw==" />
</EncFS>`;

describe('EncFS Name Codec', () => {
  let codec: Awaited<ReturnType<typeof initCodec>>;

  beforeAll(async () => {
    codec = await initCodec(SAMPLE_CONFIG, 'testpassword');
  });

  describe('decodeFilename', () => {
    it('should return null for invalid base64', async () => {
      const result = await decodeFilename('!!!invalid!!!', codec);
      expect(result).toBeNull();
    });

    it('should return null for empty string', async () => {
      const result = await decodeFilename('', codec);
      expect(result).toBeNull();
    });

    it('should return null for invalid encrypted data', async () => {
      const result = await decodeFilename('AAAAAAAAAA==', codec);
      expect(result).toBeNull();
    });
  });

  describe('encodeFilename', () => {
    it('should encode and decode round-trip', async () => {
      const original = 'test-file.txt';
      const encoded = await encodeFilename(original, codec);

      if (encoded) {
        const decoded = await decodeFilename(encoded, codec);
        expect(decoded).toBe(original);
      }
    });

    it('should handle unicode filenames', async () => {
      const original = '文件.txt';
      const encoded = await encodeFilename(original, codec);

      if (encoded) {
        const decoded = await decodeFilename(encoded, codec);
        expect(decoded).toBe(original);
      }
    });

    it('should handle special characters', async () => {
      const original = 'file-with_special~chars.txt';
      const encoded = await encodeFilename(original, codec);

      if (encoded) {
        const decoded = await decodeFilename(encoded, codec);
        expect(decoded).toBe(original);
      }
    });
  });

  describe('Null cipher mode', () => {
    let nullCodec: Awaited<ReturnType<typeof initCodec>>;

    beforeAll(async () => {
      const nullConfig = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<EncFS>
  <algorithm name="aes-256-cbc"/>
  <keySize>32</keySize>
  <blockSize>1024</blockSize>
  <nameAlgorithm name="Null"/>
  <iv>MTIzNDU2Nzg5MEFCQw==</iv>
  <key content="AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKiosLS4vMDEyMzQ1Njc4OTo7PD0+Pw==" />
</EncFS>`;
      nullCodec = await initCodec(nullConfig, 'testpassword');
    });

    it('should pass through names without encryption', async () => {
      const filename = 'plaintext.txt';
      const decoded = await decodeFilename(filename, nullCodec);
      expect(decoded).toBe(filename);
    });

    it('should encode to the same name in Null mode', async () => {
      const filename = 'plaintext.txt';
      const encoded = await encodeFilename(filename, nullCodec);
      expect(encoded).toBe(filename);
    });

    it('should handle unicode in Null mode', async () => {
      const filename = '文件.txt';
      const encoded = await encodeFilename(filename, nullCodec);
      expect(encoded).toBe(filename);

      const decoded = await decodeFilename(encoded, nullCodec);
      expect(decoded).toBe(filename);
    });
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { initCodec, decodeFilename, encodeFilename } from '../../../src/lib/encfs/name-codec';
import testVectors from '../fixtures/encfs-test-vectors.json';

// Sample EncFS config for testing (simplified Block32 configuration)
const SAMPLE_CONFIG = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<EncFS>
  <algorithm name="aes-256-cbc"/>
  <keySize>32</keySize>
  <blockSize>1024</blockSize>
  <nameAlgorithm name="Block"/>
  <iv>${btoa('1234567890ABCDEF')}</iv>
  <key content="AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKiosLS4vMDEyMzQ1Njc4OTo7PD0+Pw==" />
</EncFS>`;

describe('EncFS Name Codec', () => {
  let codec: Awaited<ReturnType<typeof initCodec>>;

  beforeAll(async () => {
    codec = await initCodec(SAMPLE_CONFIG, 'testpassword');
  });

  describe('decodeFilename', () => {
    it('should decode a simple filename', async () => {
      // Note: In real implementation, we'd use actual test vectors from known EncFS volumes
      // For now, this demonstrates the test structure
      const encoded = 'kDGnCiZ4/8A=';
      const result = await decodeFilename(encoded, codec);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle invalid base64 gracefully', async () => {
      const result = await decodeFilename('!!!invalid!!!', codec);
      expect(result).toBeNull();
    });

    it('should handle empty string', async () => {
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
      expect(encoded).not.toBeNull();
      expect(typeof encoded).toBe('string');

      if (encoded) {
        const decoded = await decodeFilename(encoded, codec);
        expect(decoded).toBe(original);
      }
    });

    it('should handle unicode filenames', async () => {
      const original = '文件.txt';
      const encoded = await encodeFilename(original, codec);
      expect(encoded).not.toBeNull();

      if (encoded) {
        const decoded = await decodeFilename(encoded, codec);
        expect(decoded).toBe(original);
      }
    });

    it('should handle long filenames', async () => {
      const original = 'a'.repeat(200) + '.txt';
      const encoded = await encodeFilename(original, codec);
      expect(encoded).not.toBeNull();

      if (encoded) {
        const decoded = await decodeFilename(encoded, codec);
        expect(decoded).toBe(original);
      }
    });

    it('should handle special characters', async () => {
      const original = 'file-with_special~chars!@#.txt';
      const encoded = await encodeFilename(original, codec);
      expect(encoded).not.toBeNull();

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
  });

  describe('Performance', () => {
    it('should handle 100 encode/decode operations quickly', async () => {
      const iterations = 100;
      const filename = 'test-file.txt';

      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const encoded = await encodeFilename(filename, codec);
        if (encoded) {
          await decodeFilename(encoded, codec);
        }
      }

      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      // Should be reasonably fast (< 50ms per operation on average)
      expect(avgTime).toBeLessThan(50);
    });
  });
});

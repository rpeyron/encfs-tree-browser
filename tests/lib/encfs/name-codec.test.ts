import { describe, it, expect, beforeAll } from 'vitest';
import { initCodec, decodeFilename, encodeFilename } from '../../../src/lib/encfs/name-codec';

const REAL_ENC_FS_CONFIG = `<?xml version="1.0"?>
<!DOCTYPE boost_serialization>
<boost_serialization signature="serialization::archive" version="10">
<cfg class_id="0" tracking_level="0" version="20">
	<version>20100713</version>
	<creator>EncFS 1.9.5</creator>
	<cipherAlg>
		<name>ssl/aes</name>
		<major>3</major>
		<minor>0</minor>
	</cipherAlg>
	<nameAlg>
		<name>nameio/block</name>
		<major>3</major>
		<minor>0</minor>
	</nameAlg>
	<keySize>32</keySize>
	<blockSize>1024</blockSize>
	<ivLength>16</ivLength>
	<kdfIterations>329317</kdfIterations>
	<desiredKDFDuration>500</desiredKDFDuration>
	<encodedKeySize>32</encodedKeySize>
	<encodedKeyData>WQKQqzAYh0goP0+jzGGUPZpuHNLPSZg6MHfHVW/BSYw=</encodedKeyData>
	<saltLen>20</saltLen>
	<saltData>HSMJFYOPWpj/BHGhl7S6nVPYyXU=</saltData>
</cfg>
</boost_serialization>`;

describe('Real EncFS (boost_serialization) Name Codec', () => {
  let realCodec: Awaited<ReturnType<typeof initCodec>>;

  beforeAll(async () => {
    realCodec = await initCodec(REAL_ENC_FS_CONFIG, 'testpassword');
  });

  it('should parse real EncFS config with salt', () => {
    expect(realCodec.config.salt).toBe('HSMJFYOPWpj/BHGhl7S6nVPYyXU=');
    expect(realCodec.config.nameAlg).toBe('Block');
    expect(realCodec.config.keySize).toBe(32);
  });

  it('should encode to filename-safe chars (no "/" "+" "=")', async () => {
    const encoded = await encodeFilename('test-file.txt', realCodec);
    expect(encoded).not.toBeNull();
    expect(encoded).not.toMatch(/[+/=]/);
    expect(encoded).not.toContain('/');
  });

  it('should round-trip encode/decode real EncFS', async () => {
    const original = 'my-document.pdf';
    const encoded = await encodeFilename(original, realCodec);
    expect(encoded).not.toBeNull();
    const decoded = await decodeFilename(encoded!, realCodec);
    expect(decoded).toBe(original);
  });

  it('should round-trip unicode filenames', async () => {
    const original = '报告 2026.txt';
    const encoded = await encodeFilename(original, realCodec);
    expect(encoded).not.toBeNull();
    const decoded = await decodeFilename(encoded!, realCodec);
    expect(decoded).toBe(original);
  });
});

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

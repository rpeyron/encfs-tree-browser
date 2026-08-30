import { describe, it, expect } from 'vitest';
import { parseEncfsConfig } from '../../../src/lib/encfs/config-parser';

describe('EncFS Config Parser', () => {
  const validConfig = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<EncFS>
  <algorithm name="aes-256-cbc"/>
  <keySize>32</keySize>
  <blockSize>1024</blockSize>
  <nameAlgorithm name="Block"/>
  <iv>MTIzNDU2Nzg5MEFCQw==</iv>
  <key content="AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKiosLS4vMDEyMzQ1Njc4OTo7PD0+Pw==" />
</EncFS>`;

  it('should parse valid EncFS config', () => {
    const config = parseEncfsConfig(validConfig);

    expect(config.algorithm).toBe('aes-256-cbc');
    expect(config.keySize).toBe(32);
    expect(config.blockSize).toBe(1024);
    expect(config.nameAlg).toBe('Block');
    expect(config.iv).toBe('MTIzNDU2Nzg5MEFCQw==');
    expect(config.key).toBe(
      'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKiosLS4vMDEyMzQ1Njc4OTo7PD0+Pw=='
    );
  });

  it('should handle Stream nameAlgorithm', () => {
    const streamConfig = validConfig.replace('name="Block"', 'name="Stream"');
    const config = parseEncfsConfig(streamConfig);
    expect(config.nameAlg).toBe('Stream');
  });

  it('should handle Null nameAlgorithm', () => {
    const nullConfig = validConfig.replace('name="Block"', 'name="Null"');
    const config = parseEncfsConfig(nullConfig);
    expect(config.nameAlg).toBe('Null');
  });

  it('should default to Block for unknown nameAlgorithm', () => {
    const unknownConfig = validConfig.replace('name="Block"', 'name="Unknown"');
    const config = parseEncfsConfig(unknownConfig);
    expect(config.nameAlg).toBe('Block');
  });

  it('should throw on invalid XML', () => {
    expect(() => {
      parseEncfsConfig('<invalid>not xml</broken>');
    }).toThrow('Invalid XML format');
  });

  it('should throw on missing required fields', () => {
    const incompleteConfig = `<?xml version="1.0" encoding="UTF-8"?>
<EncFS>
  <algorithm name="aes-256-cbc"/>
</EncFS>`;

    expect(() => {
      parseEncfsConfig(incompleteConfig);
    }).toThrow('Missing required EncFS config parameters');
  });

  it('should extract different key sizes', () => {
    const config256 = parseEncfsConfig(validConfig);
    expect(config256.keySize).toBe(32);

    const config128Config = validConfig.replace('<keySize>32</keySize>', '<keySize>16</keySize>');
    const config128 = parseEncfsConfig(config128Config);
    expect(config128.keySize).toBe(16);
  });
});

import { describe, it, expect } from 'vitest';
import { parseEncfsConfig } from '../../../src/lib/encfs/config-parser';

describe('EncFS Config Parser', () => {
  // Real EncFS format (boost_serialization)
  const realEncfsConfig = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<!DOCTYPE boost_serialization>
<boost_serialization signature="serialization::archive" version="7">
<cfg class_id="0" tracking_level="0" version="20">
	<version>20100713</version>
	<creator>EncFS 1.7.2</creator>
	<cipherAlg class_id="1" tracking_level="0" version="0">
		<name>ssl/aes</name>
		<major>3</major>
		<minor>0</minor>
	</cipherAlg>
	<nameAlg>
		<name>nameio/block</name>
		<major>3</major>
		<minor>0</minor>
	</nameAlg>
	<keySize>256</keySize>
	<blockSize>1024</blockSize>
	<uniqueIV>0</uniqueIV>
	<chainedNameIV>0</chainedNameIV>
	<externalIVChaining>0</externalIVChaining>
	<blockMACBytes>0</blockMACBytes>
	<blockMACRandBytes>0</blockMACRandBytes>
	<allowHoles>1</allowHoles>
	<encodedKeySize>52</encodedKeySize>
	<encodedKeyData>
3nKj/jivZPbbYEqpVOoH3vDUCB4j4r+YNmwRCkgsMqSVrPOHein3RNH7v/JhV7Be2g0ofh==
	</encodedKeyData>
	<saltLen>20</saltLen>
	<saltData>
dP587q54zX9RvPqbxE7gOOZVvmN=
	</saltData>
	<kdfIterations>56939</kdfIterations>
	<desiredKDFDuration>500</desiredKDFDuration>
</cfg>
</boost_serialization>`;

  // Simplified format for backward compatibility
  const simplifiedConfig = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<EncFS>
  <algorithm name="aes-256-cbc"/>
  <keySize>32</keySize>
  <blockSize>1024</blockSize>
  <nameAlgorithm name="Block"/>
  <iv>MTIzNDU2Nzg5MEFCQw==</iv>
  <key content="AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKiosLS4vMDEyMzQ1Njc4OTo7PD0+Pw==" />
</EncFS>`;

  describe('Real EncFS format (boost_serialization)', () => {
    it('should parse valid real EncFS config', () => {
      const config = parseEncfsConfig(realEncfsConfig);

      expect(config.algorithm).toBe('aes-256-cbc');
      expect(config.keySize).toBe(256);
      expect(config.blockSize).toBe(1024);
      expect(config.nameAlg).toBe('Block');
      expect(config.kdfIterations).toBe(56939);
      expect(config.salt).toBe('dP587q54zX9RvPqbxE7gOOZVvmN=');
      expect(config.key).toBe('3nKj/jivZPbbYEqpVOoH3vDUCB4j4r+YNmwRCkgsMqSVrPOHein3RNH7v/JhV7Be2g0ofh==');
    });

    it('should handle Stream nameAlgorithm in real format', () => {
      const streamConfig = realEncfsConfig.replace('nameio/block', 'nameio/stream');
      const config = parseEncfsConfig(streamConfig);
      expect(config.nameAlg).toBe('Stream');
    });

    it('should handle Null nameAlgorithm in real format', () => {
      const nullConfig = realEncfsConfig.replace('nameio/block', 'nameio/null');
      const config = parseEncfsConfig(nullConfig);
      expect(config.nameAlg).toBe('Null');
    });

    it('should extract keySize correctly', () => {
      const config256 = parseEncfsConfig(realEncfsConfig);
      expect(config256.keySize).toBe(256);

      const config128 = realEncfsConfig.replace('<keySize>256</keySize>', '<keySize>192</keySize>');
      const result = parseEncfsConfig(config128);
      expect(result.keySize).toBe(192);
    });
  });

  describe('Simplified format', () => {
    it('should parse simplified format config', () => {
      const config = parseEncfsConfig(simplifiedConfig);

      expect(config.algorithm).toBe('aes-256-cbc');
      expect(config.keySize).toBe(32);
      expect(config.blockSize).toBe(1024);
      expect(config.nameAlg).toBe('Block');
    });

    it('should default to 16 iterations for simplified format', () => {
      const config = parseEncfsConfig(simplifiedConfig);
      expect(config.kdfIterations).toBe(16);
    });
  });

  describe('Error handling', () => {
    it('should throw on invalid XML', () => {
      expect(() => {
        parseEncfsConfig('<invalid>not xml</broken>');
      }).toThrow('Invalid XML format');
    });

    it('should throw on missing required fields in real format', () => {
      const incompleteConfig = `<?xml version="1.0"?>
<boost_serialization>
<cfg>
  <keySize>256</keySize>
</cfg>
</boost_serialization>`;

      expect(() => {
        parseEncfsConfig(incompleteConfig);
      }).toThrow('Missing required EncFS config parameters');
    });

    it('should throw on missing required fields in simplified format', () => {
      const incompleteConfig = `<?xml version="1.0" encoding="UTF-8"?>
<EncFS>
  <algorithm name="aes-256-cbc"/>
</EncFS>`;

      expect(() => {
        parseEncfsConfig(incompleteConfig);
      }).toThrow('Missing required EncFS config parameters');
    });
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { EncfsNameCodec } from 'encfs-filename-codec';
import { detectNameMode } from '../../src/lib/mode-detect';
import realVectors from '../fixtures/encfs-real-test-vectors.json';

const nochain = realVectors.configurations.find((c) => c.name === 'direct-nochain')!;
const rootPairs = nochain.pairs.filter((p) => !p.decoded.includes('/'));

describe('detectNameMode', () => {
  let codec: EncfsNameCodec;

  beforeAll(async () => {
    codec = await EncfsNameCodec.fromV6Xml(nochain.config, realVectors.password);
  }, 300000);

  it('recognizes encoded root names', async () => {
    expect(await detectNameMode(codec, rootPairs.map((p) => p.encoded))).toBe('encoded');
  });

  it('recognizes decoded root names', async () => {
    expect(await detectNameMode(codec, rootPairs.map((p) => p.decoded))).toBe('decoded');
  });

  it('returns null when there is nothing to judge', async () => {
    expect(await detectNameMode(codec, [])).toBeNull();
  });
});

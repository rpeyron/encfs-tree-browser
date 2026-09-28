import { describe, it, expect, beforeAll } from 'vitest';
import { EncfsNameCodec } from 'encfs-filename-codec';
import { buildTreeLevel } from '../../src/lib/tree-builder';
import realVectors from '../fixtures/encfs-real-test-vectors.json';

// Real EncFS 1.9.5 config direct-chain fixture tree (nameio/block, chainedNameIV)
const directChain = realVectors.configurations.find(c => c.name === 'direct-chain')!;
const password = realVectors.password;

describe('encfs-filename-codec wiring', () => {
  let codec: EncfsNameCodec;

  beforeAll(async () => {
    codec = await EncfsNameCodec.fromV6Xml(directChain.config, password);
  }, 300000);

  it('rejects an invalid password', async () => {
    await expect(EncfsNameCodec.fromV6Xml(directChain.config, 'wrong-password')).rejects.toThrow();
  });

  it('round-trips ascii and unicode filenames', async () => {
    for (const name of ['test-file.txt', '报告 2026.txt']) {
      const { encodedName } = await codec.encryptName(name);
      expect(encodedName).not.toMatch(/[+/=]/);
      const { plaintext } = await codec.decryptName(encodedName);
      expect(new TextDecoder().decode(plaintext)).toBe(name);
    }
  });

  it('round-trips full paths with chained IVs', async () => {
    const encoded = await codec.encodePath('dir_1/subdir_1_1/file_1.txt');
    expect(await codec.decodePath(encoded)).toBe('dir_1/subdir_1_1/file_1.txt');
  });
});

describe('buildTreeLevel', () => {
  let codec: EncfsNameCodec;

  beforeAll(async () => {
    codec = await EncfsNameCodec.fromV6Xml(directChain.config, password);
  }, 300000);

  const childrenOf = (decodedPath: string) =>
    directChain.pairs.filter(p => {
      const decoded = p.decoded.split('/');
      const parent = decodedPath.split('/');
      return decoded.length === parent.length + 1 && p.decoded.startsWith(`${decodedPath}/`);
    });

  it('decodes children of an encoded directory using its chained IV', async () => {
    const pairs = childrenOf('dir_1');
    expect(pairs.length).toBeGreaterThan(0);
    const parentPath = directChain.pairs.find(p => p.decoded === 'dir_1')!.encoded;

    const nodes = await buildTreeLevel(
      pairs.map(p => ({ name: p.encoded.split('/').at(-1)!, isDir: false, size: 1, mtime: 1 })),
      codec,
      'encoded',
      parentPath,
    );

    expect(nodes.map(n => n.nameDecoded).sort()).toEqual(
      pairs.map(p => p.decoded.split('/').at(-1)!).sort(),
    );
    // Alternate name stays the raw encrypted component
    expect(nodes.map(n => n.nameEncoded)).toEqual(pairs.map(p => p.encoded.split('/').at(-1)!));
  });

  it('encodes children of a decoded directory using its chained IV', async () => {
    const pairs = childrenOf('dir_1');

    const nodes = await buildTreeLevel(
      pairs.map(p => ({ name: p.decoded.split('/').at(-1)!, isDir: false, size: 1, mtime: 1 })),
      codec,
      'decoded',
      'dir_1',
    );

    expect(nodes.map(n => n.nameEncoded).sort()).toEqual(
      pairs.map(p => p.encoded.split('/').at(-1)!).sort(),
    );
    expect(nodes.map(n => n.nameDecoded)).toEqual(pairs.map(p => p.decoded.split('/').at(-1)!));
  });

  it('keeps the raw name when a name cannot be converted', async () => {
    const nodes = await buildTreeLevel(
      [{ name: '!!!invalid!!!', isDir: false, size: 1, mtime: 1 }],
      codec,
      'encoded',
    );

    expect(nodes[0].nameDecoded).toBe('!!!invalid!!!');
  });
});

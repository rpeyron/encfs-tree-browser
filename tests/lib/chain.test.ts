import { describe, it, expect, beforeAll } from 'vitest';
import { EncfsNameCodec } from 'encfs-filename-codec';
import { convertPathThroughChain, convertLines, graftSteps, prefixIds, relPathOf, normalizeMount } from '../../src/lib/chain';
import type { TreeNode } from '../../src/types/index';
import realVectors from '../fixtures/encfs-real-test-vectors.json';

const directChain = realVectors.configurations.find((c) => c.name === 'direct-chain')!;
const password = realVectors.password;

const node = (id: string, name: string, extra: Partial<TreeNode> = {}): TreeNode => ({
  id,
  name,
  nameEncoded: name,
  nameDecoded: name,
  path: `/${name}`,
  pathEncoded: `/${name}`,
  pathDecoded: `/${name}`,
  size: 0,
  mtime: 0,
  isDir: true,
  ...extra,
});

describe('graftSteps', () => {
  it('keeps a root step at the top level and nests deeper steps at their mount point', () => {
    const forest = graftSteps([
      { mount: '/', nodes: [node('s1:/music', 'music')] },
      { mount: '/vault/sub', nodes: [node('s2:/inner', 'inner')] },
    ]);

    expect(forest.map((n) => n.name)).toEqual(['music', 'vault']);
    const vault = forest.find((n) => n.name === 'vault')!;
    expect(vault.isLoaded).toBe(true);
    const sub = vault.children![0];
    expect(sub.name).toBe('sub');
    expect(sub.children![0].id).toBe('s2:/inner');
  });

  it('grafts a deeper step into an existing real folder of another step', () => {
    const forest = graftSteps([
      { mount: '/', nodes: [node('s1:/music', 'music')] },
      { mount: '/music', nodes: [node('s2:/extra', 'extra')] },
    ]);

    expect(forest).toHaveLength(1);
    expect(forest[0].id).toBe('s1:/music');
    expect(forest[0].children!.map((n) => n.id)).toEqual(['s2:/extra']);
  });
});

describe('id helpers', () => {
  it('prefixIds makes ids unique and relPathOf recovers the dir-relative path', () => {
    const [prefixed] = prefixIds([node('/a/b', 'b', { children: [node('/a/b/c', 'c')] })], 'step-1');
    expect(prefixed.id).toBe('step-1:/a/b');
    expect(relPathOf(prefixed.id)).toBe('/a/b');
    expect(prefixed.children![0].id).toBe('step-1:/a/b/c');
  });

  it('normalizeMount collapses roots and separators', () => {
    expect(normalizeMount('/')).toBe('');
    expect(normalizeMount('a/b/')).toBe('/a/b');
    expect(normalizeMount('//x//y')).toBe('/x/y');
  });
});

describe('convertPathThroughChain (direct-chain volume)', () => {
  let codec: EncfsNameCodec;

  beforeAll(async () => {
    codec = await EncfsNameCodec.fromV6Xml(directChain.config, password);
  }, 300000);

  it('matches the codec path conversion and round-trips', async () => {
    const decoded = '/dir_1/subdir_1_1/file_1_1_1_1.txt';
    const encoded = await codec.encodePath(decoded.replace(/^\//, ''));
    expect(await convertPathThroughChain(decoded, codec, 'encode')).toBe(`/${encoded}`);
    expect(await convertPathThroughChain(`/${encoded}`, codec, 'decode')).toBe(decoded);
  });

  it('convertLines reports per-line failures without aborting the batch', async () => {
    const good = `/${directChain.pairs[0].encoded}`;
    const bad = '!!!not-encfs!!!';
    const rows = await convertLines([good, bad], codec, 'decode');
    expect(rows[0].output).toBeTruthy();
    expect(rows[0].error).toBeUndefined();
    expect(rows[1].output).toBeNull();
    expect(rows[1].error).toBeTruthy();
  });
});

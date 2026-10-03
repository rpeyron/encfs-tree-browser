import { describe, it, expect, beforeAll } from 'vitest';
import { EncfsNameCodec } from 'encfs-filename-codec';
import {
  convertPathThroughChain,
  convertLines,
  graftSteps,
  prefixIds,
  relPathOf,
  normalizeMount,
  splitParentPath,
  directoryDisplayNames,
  wrapDirectoryRoot,
} from '../../src/lib/chain';
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

  it('splitParentPath splits absolute paths (both separators)', () => {
    expect(splitParentPath('D:\\Dev\\encfs')).toEqual({ parent: 'D:/Dev', base: 'encfs' });
    expect(splitParentPath('/mnt/vol/sub')).toEqual({ parent: '/mnt/vol', base: 'sub' });
    expect(splitParentPath('D:\\')).toEqual({ parent: 'D:', base: '' });
    expect(splitParentPath('relative')).toEqual({ parent: '', base: 'relative' });
  });
});

describe('directoryDisplayNames / wrapDirectoryRoot', () => {
  let codec: EncfsNameCodec;
  const dirPair = () => realVectors.configurations.find((c) => c.name === 'direct-nochain')!.pairs.find((p) => p.decoded === 'dir_1')!;

  beforeAll(async () => {
    codec = await EncfsNameCodec.fromV6Xml(
      realVectors.configurations.find((c) => c.name === 'direct-nochain')!.config,
      realVectors.password,
    );
  }, 300000);

  it('decodes an encoded on-disk directory name', async () => {
    const pair = dirPair();
    const names = await directoryDisplayNames(codec, pair.encoded, 'encoded');
    expect(names).toEqual({ nameDecoded: 'dir_1', nameEncoded: pair.encoded });
  });

  it('encodes a decoded on-disk directory name', async () => {
    const pair = dirPair();
    const names = await directoryDisplayNames(codec, 'dir_1', 'decoded');
    expect(names).toEqual({ nameDecoded: 'dir_1', nameEncoded: pair.encoded });
  });

  it('keeps a non-volume folder name raw on both sides', async () => {
    const names = await directoryDisplayNames(codec, 'my local folder', 'encoded');
    expect(names).toEqual({ nameDecoded: 'my local folder', nameEncoded: 'my local folder' });
  });

  it('wraps children under a root row with both full paths', () => {
    const children = prefixIds([node('/child', 'child')], 'step-1');
    const [root] = wrapDirectoryRoot(children, {
      stepId: 'step-1',
      onDiskName: 'vlPAQlbHW8iyvhh4gs8eppL-',
      nameDecoded: 'dir_1',
      nameEncoded: 'vlPAQlbHW8iyvhh4gs8eppL-',
    });

    expect(root.id).toBe('step-1:');
    expect(root.nameDecoded).toBe('/dir_1');
    expect(root.nameEncoded).toBe('/vlPAQlbHW8iyvhh4gs8eppL-');
    expect(root.pathDecoded).toBe('/dir_1');
    expect(root.pathEncoded).toBe('/vlPAQlbHW8iyvhh4gs8eppL-');
    expect(root.rootDirectory).toBe(true);
    expect(root.isDir).toBe(true);
    expect(root.isLoaded).toBe(true);
    expect(root.children).toHaveLength(1);

    // parent navigation: parent id derived from the child id lands on the root row
    const childId = root.children![0].id;
    expect(childId).toBe('step-1:/child');
    expect(childId.slice(0, childId.lastIndexOf('/'))).toBe(root.id);
    expect(relPathOf(childId)).toBe('/child');
  });

  it('prefixes the root full path, encoding every prefix level on the encoded side', () => {
    const [root] = wrapDirectoryRoot([], {
      stepId: 'step-1',
      onDiskName: 'dir_1',
      nameDecoded: 'dir_1',
      nameEncoded: 'vlPAQlbHW8iyvhh4gs8eppL-',
      prefixDecoded: '/data/vault',
      prefixEncoded: '/kX9ZpQ/7hLmA2',
    });
    expect(root.nameDecoded).toBe('/data/vault/dir_1');
    expect(root.nameEncoded).toBe('/kX9ZpQ/7hLmA2/vlPAQlbHW8iyvhh4gs8eppL-');
    expect(root.pathDecoded).toBe('/data/vault/dir_1');
    expect(root.pathEncoded).toBe('/kX9ZpQ/7hLmA2/vlPAQlbHW8iyvhh4gs8eppL-');
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

import { describe, it, expect } from 'vitest';
import { flattenTree, toCsv, toJsonTree } from '../../src/lib/export';
import type { TreeNode } from '../../src/types/index';

const node = (nameDecoded: string, nameEncoded: string, extra: Partial<TreeNode> = {}): TreeNode => ({
  id: `/${nameDecoded}`,
  name: nameDecoded,
  nameDecoded,
  nameEncoded,
  path: `/${nameDecoded}`,
  pathDecoded: `/${nameDecoded}`,
  pathEncoded: `/${nameEncoded}`,
  size: 0,
  mtime: 0,
  isDir: false,
  ...extra,
});

const tree: TreeNode[] = [
  node('dir', 'enc-dir', {
    isDir: true,
    children: [node('file,with"quote', 'enc-file', { size: 42, mtime: 7 })],
  }),
  node('top.txt', 'enc-top'),
];

describe('flattenTree', () => {
  it('lists parents and children in depth-first order', () => {
    expect(flattenTree(tree).map((r) => r.nameDecoded)).toEqual([
      'dir',
      'file,with"quote',
      'top.txt',
    ]);
  });
});

describe('toCsv', () => {
  it('writes a header and quotes special cells', () => {
    const csv = toCsv(flattenTree(tree));
    const [header, ...lines] = csv.split('\n');
    expect(header).toBe(
      'type,nameEncoded,nameDecoded,pathEncoded,pathDecoded,size,mtime',
    );
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('dir,');
    expect(lines[1]).toContain('"file,with""quote"');
  });
});

describe('toJsonTree', () => {
  it('keeps the nested structure with both representations', () => {
    const json = toJsonTree(tree);
    expect(json).toHaveLength(2);
    expect(json[0].type).toBe('dir');
    expect(json[0].children).toHaveLength(1);
    expect(json[0].children![0]).toMatchObject({
      decoded: 'file,with"quote',
      encoded: 'enc-file',
      size: 42,
      mtime: 7,
    });
    expect(json[1]).not.toHaveProperty('children');
  });
});

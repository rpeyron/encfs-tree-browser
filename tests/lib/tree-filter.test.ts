import { describe, it, expect } from 'vitest';
import { filterNodes, sortTree, displayPrimaryName, flattenVisible } from '../../src/lib/tree-filter';
import type { TreeNode } from '../../src/types/index';

const node = (nameDecoded: string, nameEncoded: string, children?: TreeNode[]): TreeNode => ({
  id: `/${nameDecoded}`,
  name: nameDecoded,
  nameDecoded,
  nameEncoded,
  path: `/${nameDecoded}`,
  pathDecoded: `/${nameDecoded}`,
  pathEncoded: `/${nameEncoded}`,
  size: 0,
  mtime: 0,
  isDir: Boolean(children),
  children,
  isLoaded: true,
});

describe('filterNodes', () => {
  const tree = [
    node('dir_1', 'enc-dir1', [node('file_1', 'enc-file1')]),
    node('readme.txt', 'enc-readme'),
  ];

  it('matches both representations and keeps ancestors of matching descendants', () => {
    expect(filterNodes(tree, 'file_1', 'encoded').map((n) => n.nameDecoded)).toEqual(['dir_1']);
    expect(filterNodes(tree, 'enc-readme', 'encoded').map((n) => n.nameDecoded)).toEqual([
      'readme.txt',
    ]);
    expect(filterNodes(tree, 'nothing', 'encoded')).toEqual([]);
  });
});

describe('sortTree', () => {
  it('sorts siblings by the displayed (on-disk) primary name, recursively', () => {
    const tree = [
      node('file_b', 'zzz-b'),
      node('dir_a', 'aaa-dir', [node('zeta', 'a-zeta'), node('alpha', 'z-alpha')]),
      node('File_A', 'aaa-file'),
    ];

    // primary 'encoded' → first line = encoded (on-disk) names
    const sorted = sortTree(tree, 'encoded');
    expect(sorted.map((n) => n.nameEncoded)).toEqual(['aaa-dir', 'aaa-file', 'zzz-b']);
    expect(sorted[0].children!.map((n) => n.nameEncoded)).toEqual(['a-zeta', 'z-alpha']);

    // primary 'decoded' → first line = decoded names
    const sortedByDecoded = sortTree(tree, 'decoded');
    expect(sortedByDecoded.map((n) => n.nameDecoded)).toEqual(['dir_a', 'File_A', 'file_b']);
  });

  it('displayPrimaryName shows the on-disk side first', () => {
    const n = node('plain', 'cipher');
    expect(displayPrimaryName(n, 'encoded')).toBe('cipher');
    expect(displayPrimaryName(n, 'decoded')).toBe('plain');
  });
});

describe('flattenVisible', () => {
  it('returns rows in display order, children only when expanded', () => {
    const tree = [
      node('a', 'ea', [node('a/1', 'e1'), node('a/2', 'e2')]),
      node('b', 'eb'),
    ];

    expect(flattenVisible(tree, {}).map((n) => n.nameDecoded)).toEqual(['a', 'b']);
    expect(flattenVisible(tree, { [tree[0].id]: true }).map((n) => n.nameDecoded)).toEqual([
      'a',
      'a/1',
      'a/2',
      'b',
    ]);
  });
});

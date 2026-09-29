import type { NameMode, TreeNode } from '../types/index';

export function filterNodes(nodes: TreeNode[], query: string, primary: NameMode): TreeNode[] {
  const q = query.toLowerCase();
  const match = (n: TreeNode) => {
    const main = primary === 'encoded' ? n.nameDecoded : n.nameEncoded;
    const alt = primary === 'encoded' ? n.nameEncoded : n.nameDecoded;
    return main.toLowerCase().includes(q) || alt.toLowerCase().includes(q);
  };
  const walk = (list: TreeNode[]): TreeNode[] =>
    list.flatMap((n) => {
      if (match(n)) return [n];
      if (n.children) {
        const matching = walk(n.children);
        if (matching.length) return [{ ...n, children: matching }];
      }
      return [];
    });
  return walk(nodes);
}

/** Displayed (primary) name of a row — same rule TreeGrid uses. */
export const displayPrimaryName = (n: TreeNode, primary: NameMode): string =>
  primary === 'encoded' ? n.nameDecoded : n.nameEncoded;

/** Sort siblings alphabetically by displayed name, recursively (root and every directory). */
export function sortTree(nodes: TreeNode[], primary: NameMode): TreeNode[] {
  return [...nodes]
    .sort((a, b) =>
      displayPrimaryName(a, primary).localeCompare(displayPrimaryName(b, primary), undefined, {
        sensitivity: 'base',
      }),
    )
    .map((n) => (n.children ? { ...n, children: sortTree(n.children, primary) } : n));
}

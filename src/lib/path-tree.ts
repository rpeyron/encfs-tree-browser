import type { TreeNode } from '../types/index';

export interface PathPair {
  /** Path in decoded (plaintext) form. */
  decoded: string;
  /** Path in encoded form. */
  encoded: string;
}

const segs = (p: string) => p.split('/').filter(Boolean);

interface BuildNode {
  decoded: string;
  encoded: string;
  isDir: boolean;
  children: Map<string, BuildNode>;
}

/**
 * Build a TreeNode forest from decoded/encoded path pairs so the Convert results
 * browse exactly like a scanned volume (both representations per segment).
 */
export function buildPathTree(pairs: PathPair[]): TreeNode[] {
  const roots = new Map<string, BuildNode>();

  for (const pair of pairs) {
    const decoded = segs(pair.decoded);
    const encoded = segs(pair.encoded);
    if (decoded.length === 0 || decoded.length !== encoded.length) continue;

    let map = roots;
    decoded.forEach((segment, i) => {
      let node = map.get(segment);
      if (!node) {
        node = { decoded: segment, encoded: encoded[i], isDir: false, children: new Map() };
        map.set(segment, node);
      }
      if (i < decoded.length - 1) node.isDir = true;
      map = node.children;
    });
  }

  return toTree(roots, '', '');
}

function toTree(
  map: Map<string, BuildNode>,
  parentDecoded: string,
  parentEncoded: string,
): TreeNode[] {
  return [...map.values()].map((n) => {
    const pathDecoded = parentDecoded ? `${parentDecoded}/${n.decoded}` : `/${n.decoded}`;
    const pathEncoded = parentEncoded ? `${parentEncoded}/${n.encoded}` : `/${n.encoded}`;
    return {
      id: pathDecoded,
      name: n.decoded,
      nameDecoded: n.decoded,
      nameEncoded: n.encoded,
      path: pathDecoded,
      pathDecoded,
      pathEncoded,
      size: 0,
      mtime: 0,
      isDir: n.isDir,
      children: n.isDir ? toTree(n.children, pathDecoded, pathEncoded) : undefined,
      isLoaded: true,
    };
  });
}

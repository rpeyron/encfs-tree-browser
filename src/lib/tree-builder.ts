import type { TreeNode } from '../types/index';
import type { CodecConfig } from './encfs/name-codec';
import { decodeFilename, encodeFilename } from './encfs/name-codec';
import type { FSEntry } from './fs-scanner';

export async function buildTreeLevel(
  entries: FSEntry[],
  codec: CodecConfig,
  mode: 'encoded' | 'decoded',
  parentPath: string = ''
): Promise<TreeNode[]> {
  const nodes: TreeNode[] = [];

  for (const entry of entries) {
    const id = `${parentPath}/${entry.name}`;
    const path = parentPath ? `${parentPath}/${entry.name}` : `/${entry.name}`;

    let nameDecoded = entry.name;
    let nameEncoded = entry.name;

    if (mode === 'encoded') {
      // Input is encoded, decode to get readable name
      const decoded = await decodeFilename(entry.name, codec);
      if (decoded) {
        nameDecoded = decoded;
      } else {
        // Mark decode error but continue
        console.warn(`Failed to decode: ${entry.name}`);
      }
    } else {
      // Input is decoded, encode to get encrypted name
      const encoded = await encodeFilename(entry.name, codec);
      if (encoded) {
        nameEncoded = encoded;
      }
    }

    const node: TreeNode = {
      id,
      name: entry.name,
      nameDecoded,
      nameEncoded,
      path,
      pathDecoded: mode === 'decoded' ? path : '', // To be filled on demand
      pathEncoded: mode === 'encoded' ? path : '', // To be filled on demand
      size: entry.size,
      mtime: entry.mtime,
      isDir: entry.isDir,
      children: undefined,
      isLoaded: false,
    };

    nodes.push(node);
  }

  return nodes;
}

export function buildFullPaths(
  nodes: TreeNode[],
  parentPath: string = '',
  parentPathDecoded: string = '',
  parentPathEncoded: string = ''
): TreeNode[] {
  return nodes.map((node) => {
    const pathDecoded =
      parentPathDecoded + (parentPathDecoded ? '/' : '') + node.nameDecoded;
    const pathEncoded = parentPathEncoded + (parentPathEncoded ? '/' : '') + node.nameEncoded;

    return {
      ...node,
      path: parentPath + (parentPath ? '/' : '') + node.name,
      pathDecoded,
      pathEncoded,
      children: node.children
        ? buildFullPaths(node.children, node.path, pathDecoded, pathEncoded)
        : undefined,
    };
  });
}

export function findNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function applyMountPoint(nodes: TreeNode[], mountPoint: string): TreeNode[] {
  if (mountPoint === '/' || !mountPoint) return nodes;

  const segments = mountPoint.split('/').filter(Boolean);
  let current: TreeNode[] = nodes;

  for (const segment of segments) {
    const folder: TreeNode = {
      id: segment,
      name: segment,
      nameDecoded: segment,
      nameEncoded: segment,
      path: '/' + segment,
      pathDecoded: '/' + segment,
      pathEncoded: '/' + segment,
      size: 0,
      mtime: 0,
      isDir: true,
      children: current,
      isLoaded: true,
    };
    current = [folder];
  }

  return current;
}

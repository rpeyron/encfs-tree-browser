import type { EncfsNameCodec } from 'encfs-filename-codec';
import type { TreeNode } from '../types/index';
import type { FSEntry } from './fs-scanner';

const utf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * IV that the names of a directory's children are chained with.
 * Walks the directory's own path from the root; returns 0 when the volume
 * does not chain name IVs (or the directory is the root).
 */
async function parentDirIv(
  codec: EncfsNameCodec,
  path: string,
  mode: 'encoded' | 'decoded',
): Promise<bigint> {
  if (!codec.chainedNameIv) return 0n;
  let iv = 0n;
  for (const component of path.split('/').filter(Boolean)) {
    iv =
      mode === 'encoded'
        ? (await codec.decryptName(component, iv)).nextIv
        : (await codec.encryptName(component, iv)).nextIv;
  }
  return iv;
}

export async function buildTreeLevel(
  entries: FSEntry[],
  codec: EncfsNameCodec,
  mode: 'encoded' | 'decoded',
  parentPath: string = '',
): Promise<TreeNode[]> {
  const nodes: TreeNode[] = [];
  const dirIv = parentPath ? await parentDirIv(codec, parentPath, mode) : 0n;

  for (const entry of entries) {
    const id = `${parentPath}/${entry.name}`;
    const path = parentPath ? `${parentPath}/${entry.name}` : `/${entry.name}`;

    let nameDecoded = entry.name;
    let nameEncoded = entry.name;

    try {
      if (mode === 'encoded') {
        nameDecoded = utf8.decode((await codec.decryptName(entry.name, dirIv)).plaintext);
      } else {
        nameEncoded = (await codec.encryptName(entry.name, dirIv)).encodedName;
      }
    } catch {
      // A single bad name must not fail the scan: keep the raw name.
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
    const pathEncoded =
      parentPathEncoded + (parentPathEncoded ? '/' : '') + node.nameEncoded;

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

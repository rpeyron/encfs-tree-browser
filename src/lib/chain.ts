import type { EncfsNameCodec } from 'encfs-filename-codec';
import type { ConvertRow, NameMode, TreeNode } from '../types/index';

const utf8 = new TextDecoder('utf-8', { fatal: true });

export function normalizeMount(mountPoint: string): string {
  const segments = mountPoint.split('/').filter(Boolean);
  return segments.length ? `/${segments.join('/')}` : '';
}

/** Unique node ids across steps: `<stepId>:<path>` (path is dir-root relative). */
export function prefixIds(nodes: TreeNode[], stepId: string): TreeNode[] {
  return nodes.map((node) => ({
    ...node,
    id: `${stepId}:${node.id}`,
    stepId,
    children: node.children ? prefixIds(node.children, stepId) : node.children,
  }));
}

/** Path part of an id produced by prefixIds (dir-root relative, leading '/'). */
export function relPathOf(id: string): string {
  const idx = id.indexOf(':');
  return idx === -1 ? id : id.slice(idx + 1);
}

/**
 * Decoded/encoded names of the selected directory itself (root parent IV = 0).
 * Falls back to the raw on-disk name for both sides when it is not a volume
 * name (e.g. the local folder that holds the volume root).
 */
export async function directoryDisplayNames(
  codec: EncfsNameCodec,
  onDiskName: string,
  mode: NameMode,
): Promise<{ nameDecoded: string; nameEncoded: string }> {
  // Drive root / empty segment: nothing to convert, keep it empty.
  if (!onDiskName) return { nameDecoded: '', nameEncoded: '' };
  try {
    if (mode === 'encoded') {
      const { plaintext } = await codec.decryptName(onDiskName, 0n);
      return { nameDecoded: utf8.decode(plaintext), nameEncoded: onDiskName };
    }
    return {
      nameDecoded: onDiskName,
      nameEncoded: (await codec.encryptName(onDiskName, 0n)).encodedName,
    };
  } catch {
    return { nameDecoded: onDiskName, nameEncoded: onDiskName };
  }
}

export interface DirectoryRootMeta {
  stepId: string;
  onDiskName: string;
  nameDecoded: string;
  nameEncoded: string;
  /** Decoded prefix in front of the root (`''` or `'/pfx'`), from the mount field. */
  prefixDecoded?: string;
  /** Encoded form of the prefix (each level encoded) for the encoded column. */
  prefixEncoded?: string;
}

/**
 * Root row for the selected directory: its **complete path** (both
 * representations) on a single row, no icon/toggle handling done by TreeGrid.
 * The id is `<stepId>:` so parent navigation from `<stepId>:/child` lands here.
 */
export function wrapDirectoryRoot(children: TreeNode[], meta: DirectoryRootMeta): TreeNode[] {
  const prefixDecoded = meta.prefixDecoded ?? '';
  const prefixEncoded = meta.prefixEncoded ?? prefixDecoded;
  const pathDecoded = `${prefixDecoded}/${meta.nameDecoded}`;
  const pathEncoded = `${prefixEncoded}/${meta.nameEncoded}`;
  const wrapper: TreeNode = {
    id: `${meta.stepId}:`,
    name: meta.onDiskName,
    nameDecoded: pathDecoded,
    nameEncoded: pathEncoded,
    path: `${prefixDecoded}/${meta.onDiskName}`,
    pathDecoded,
    pathEncoded,
    size: 0,
    mtime: 0,
    isDir: true,
    children,
    isLoaded: true,
    stepId: meta.stepId,
    rootDirectory: true,
  };
  return [wrapper];
}

interface StepPart {
  mount: string;
  nodes: TreeNode[];
}

/**
 * Graft every step's tree at its mount point, sharing folders when several
 * steps attach under the same segment. Shallower mounts are inserted first so
 * deeper steps can nest inside them.
 */
export function graftSteps(parts: StepPart[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const sorted = [...parts].sort(
    (a, b) => normalizeMount(a.mount).split('/').filter(Boolean).length - normalizeMount(b.mount).split('/').filter(Boolean).length,
  );
  for (const part of sorted) {
    const segments = normalizeMount(part.mount).split('/').filter(Boolean);
    insertAt(roots, segments, part.nodes, '');
  }
  return roots;
}

function insertAt(arr: TreeNode[], segments: string[], nodes: TreeNode[], prefix: string): void {
  if (segments.length === 0) {
    arr.push(...nodes);
    return;
  }
  const [head, ...rest] = segments;
  const path = `${prefix}/${head}`;
  let folder = arr.find((n) => n.isDir && (n.name === head || n.nameEncoded === head || n.nameDecoded === head));
  if (!folder) {
    folder = {
      id: `mp:${path}`,
      name: head,
      nameEncoded: head,
      nameDecoded: head,
      path,
      pathEncoded: path,
      pathDecoded: path,
      size: 0,
      mtime: 0,
      isDir: true,
      children: [],
      isLoaded: true,
    };
    arr.push(folder);
  }
  folder.children ??= [];
  insertAt(folder.children, rest, nodes, path);
}

/**
 * Convert one full path (volume root → leaf) with the volume codec; the codec
 * re-chains IVs per component. Leading slash is preserved.
 */
export async function convertPathThroughChain(
  path: string,
  codec: EncfsNameCodec,
  direction: 'encode' | 'decode',
): Promise<string> {
  const trimmed = path.trim();
  if (!trimmed) throw new Error('Empty path');
  const leadSlash = trimmed.startsWith('/');
  const bare = trimmed.replace(/^\/+/, '');
  const result = direction === 'decode' ? await codec.decodePath(bare) : await codec.encodePath(bare);
  if (!result) throw new Error('Conversion failed');
  return leadSlash ? `/${result}` : result;
}

export async function convertLines(
  lines: string[],
  codec: EncfsNameCodec,
  direction: 'encode' | 'decode',
): Promise<ConvertRow[]> {
  return Promise.all(
    lines.map(async (line) => {
      try {
        return { input: line, output: await convertPathThroughChain(line, codec, direction) };
      } catch (err) {
        return { input: line, output: null, error: err instanceof Error ? err.message : 'Conversion failed' };
      }
    }),
  );
}

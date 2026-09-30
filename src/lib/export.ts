import type { TreeNode } from '../types/index';

export interface FlatExportRow {
  type: 'dir' | 'file';
  nameEncoded: string;
  nameDecoded: string;
  pathEncoded: string;
  pathDecoded: string;
  size: number;
  mtime: number;
}

export function flattenTree(nodes: TreeNode[]): FlatExportRow[] {
  const rows: FlatExportRow[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      rows.push({
        type: node.isDir ? 'dir' : 'file',
        nameEncoded: node.nameEncoded,
        nameDecoded: node.nameDecoded,
        pathEncoded: node.pathEncoded,
        pathDecoded: node.pathDecoded,
        size: node.size,
        mtime: node.mtime,
      });
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return rows;
}

const csvCell = (value: string | number): string => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv(rows: FlatExportRow[]): string {
  const header = 'type,nameEncoded,nameDecoded,pathEncoded,pathDecoded,size,mtime';
  const lines = rows.map((r) =>
    [r.type, r.nameEncoded, r.nameDecoded, r.pathEncoded, r.pathDecoded, r.size, r.mtime]
      .map(csvCell)
      .join(','),
  );
  return [header, ...lines].join('\n');
}

export interface JsonNode {
  name: string;
  encoded: string;
  decoded: string;
  pathEncoded: string;
  pathDecoded: string;
  type: 'dir' | 'file';
  size?: number;
  mtime?: number;
  children?: JsonNode[];
}

export function toJsonTree(nodes: TreeNode[]): JsonNode[] {
  return nodes.map((n) => ({
    name: n.nameDecoded || n.nameEncoded,
    encoded: n.nameEncoded,
    decoded: n.nameDecoded,
    pathEncoded: n.pathEncoded,
    pathDecoded: n.pathDecoded,
    type: n.isDir ? ('dir' as const) : ('file' as const),
    ...(n.isDir ? {} : { size: n.size, mtime: n.mtime }),
    ...(n.children ? { children: toJsonTree(n.children) } : {}),
  }));
}

/** Trigger a browser download; works from file:// as well. */
export function downloadFile(fileName: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

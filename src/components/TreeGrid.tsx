import React, { useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  ExpandedState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TreeNode } from '../types/index';
import { useClipboard } from '../hooks/useClipboard';

const columnHelper = createColumnHelper<TreeNode>();

interface TreeGridProps {
  nodes: TreeNode[];
  mode: 'encoded' | 'decoded';
  onExpandNode?: (nodeId: string) => Promise<void>;
  isLoading?: boolean;
}

export function TreeGrid({ nodes, mode, onExpandNode, isLoading }: TreeGridProps) {
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const { copyToClipboard } = useClipboard();
  const tableContainerRef = React.useRef<HTMLDivElement>(null);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'expander',
        header: '',
        cell: ({ row }) =>
          row.getCanExpand() ? (
            <button
              onClick={() => {
                if (!row.getIsExpanded() && onExpandNode) {
                  onExpandNode(row.original.id).catch(console.error);
                }
                row.toggleExpanded();
              }}
              className="w-6 h-6 flex items-center justify-center hover:bg-gray-200 rounded"
            >
              {row.getIsExpanded() ? '▼' : '▶'}
            </button>
          ) : (
            <div className="w-6" />
          ),
        size: 40,
      }),
      columnHelper.accessor('nameDecoded', {
        header: 'Name',
        cell: ({ row }) => (
          <div style={{ paddingLeft: `${row.depth * 20}px` }} className="flex items-center gap-2">
            <span>{row.original.isDir ? '📁' : '📄'}</span>
            <span>{mode === 'encoded' ? row.original.nameDecoded : row.original.nameEncoded}</span>
          </div>
        ),
      }),
      columnHelper.accessor('nameEncoded', {
        header: 'Alternate',
        cell: ({ row }) =>
          mode === 'encoded' ? row.original.nameEncoded : row.original.nameDecoded,
      }),
      columnHelper.accessor('size', {
        header: 'Size',
        cell: ({ getValue }) => formatSize(getValue()),
      }),
      columnHelper.accessor('mtime', {
        header: 'Modified',
        cell: ({ getValue }) => formatDate(getValue()),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex gap-1">
            <button
              onClick={() => copyToClipboard(row.original.path)}
              className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
              title="Copy main path"
            >
              📋
            </button>
            {mode === 'encoded' && (
              <button
                onClick={() => copyToClipboard(row.original.pathEncoded)}
                className="px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600"
                title="Copy encoded path"
              >
                🔒
              </button>
            )}
          </div>
        ),
      }),
    ],
    [mode, onExpandNode]
  );

  const table = useReactTable({
    data: nodes,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.children,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 40,
  });

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div ref={tableContainerRef} className="h-full overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-gray-100 sticky top-0 z-10">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="text-left px-2 py-2 border-b">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <tr
                key={row.id}
                className="border-b hover:bg-gray-50"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-2 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(ms: number): string {
  if (ms === 0) return '—';
  const date = new Date(ms);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

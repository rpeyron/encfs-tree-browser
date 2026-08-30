import { useState } from 'react';
import type { TreeNode } from '../types/index';
import { useClipboard } from '../hooks/useClipboard';

interface TreeGridProps {
  nodes: TreeNode[];
  mode: 'encoded' | 'decoded';
  onExpandNode?: (nodeId: string) => Promise<void>;
}

interface NodeState {
  [key: string]: boolean;
}

export function TreeGrid({ nodes, mode, onExpandNode }: TreeGridProps) {
  const [expanded, setExpanded] = useState<NodeState>({});
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { copyToClipboard } = useClipboard();

  const toggleNode = async (nodeId: string) => {
    setExpanded((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
    if (!expanded[nodeId] && onExpandNode) {
      await onExpandNode(nodeId).catch(console.error);
    }
  };

  const renderNode = (node: TreeNode, depth: number, isLast: boolean, prefix: string = ''): React.ReactNode => {
    const isExpanded = expanded[node.id];
    const hasChildren = node.children && node.children.length > 0;
    const isHovered = hoveredId === node.id;
    const icon = node.isDir ? '📁' : '📄';
    const name = mode === 'encoded' ? node.nameDecoded : node.nameEncoded;
    const alternate = mode === 'encoded' ? node.nameEncoded : node.nameDecoded;

    const currentPrefix = prefix + (depth === 0 ? '' : isLast ? '└── ' : '├── ');
    const nextPrefix = prefix + (depth === 0 ? '' : isLast ? '    ' : '│   ');

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-3 px-4 py-3 transition-all ${
            isHovered
              ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-400'
              : 'bg-white border-l-4 border-transparent'
          } hover:shadow-sm`}
          onMouseEnter={() => setHoveredId(node.id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          {depth > 0 && (
            <div className="w-32 flex-shrink-0 font-mono text-xs text-gray-400">
              {currentPrefix}
            </div>
          )}

          {hasChildren && depth > 0 && (
            <button
              onClick={() => toggleNode(node.id)}
              className="w-6 h-6 flex items-center justify-center text-indigo-600 hover:bg-indigo-100 rounded transition-colors flex-shrink-0"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          {!hasChildren && depth > 0 && <div className="w-6" />}

          <span className="text-xl flex-shrink-0">{icon}</span>

          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 truncate text-sm" title={name}>
              {name}
            </div>
            {alternate && (
              <div className="text-xs text-gray-500 truncate font-mono">
                {alternate}
              </div>
            )}
          </div>

          <div className="flex-shrink-0 text-right min-w-fit">
            <div className="text-sm font-medium text-gray-700">{formatSize(node.size)}</div>
            <div className="text-xs text-gray-500">{formatDate(node.mtime)}</div>
          </div>

          <button
            onClick={() => copyToClipboard(node.path)}
            className={`ml-2 px-3 py-1.5 text-xs font-medium rounded transition-all flex-shrink-0 ${
              isHovered
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title="Copy path"
          >
            📋
          </button>
        </div>

        {isExpanded && hasChildren && (
          <div className="bg-gray-50 border-l-2 border-gray-200">
            {node.children!.map((child, idx) => renderNode(child, depth + 1, idx === node.children!.length - 1, nextPrefix))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-gray-50 to-white">
      <div className="sticky top-0 z-10 bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg">
        <div className="px-6 py-4">
          <h2 className="text-lg font-bold">File Tree</h2>
          <p className="text-sm text-indigo-100">{nodes.length} items</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-2">📁</div>
              <p>No files found</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {nodes.map((node, idx) => renderNode(node, 0, idx === nodes.length - 1))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '–';
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
  if (ms === 0) return '–';
  const date = new Date(ms);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

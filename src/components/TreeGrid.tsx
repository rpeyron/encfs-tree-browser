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

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const isExpanded = expanded[node.id];
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id}>
        <div className="flex items-center border-b hover:bg-gray-50">
          <div style={{ paddingLeft: `${depth * 20}px` }} className="flex items-center gap-2 flex-1 py-2">
            {hasChildren ? (
              <button
                onClick={() => toggleNode(node.id)}
                className="w-6 h-6 flex items-center justify-center hover:bg-gray-200 rounded flex-shrink-0"
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            ) : (
              <div className="w-6 flex-shrink-0" />
            )}
            <span className="flex-shrink-0">{node.isDir ? '📁' : '📄'}</span>
            <span className="truncate" title={node.path}>
              {mode === 'encoded' ? node.nameDecoded : node.nameEncoded}
            </span>
          </div>

          <div className="px-4 py-2 text-sm text-gray-600 min-w-fit">
            {mode === 'encoded' ? node.nameEncoded : node.nameDecoded}
          </div>

          <div className="px-4 py-2 text-sm text-gray-500 min-w-20 text-right">
            {formatSize(node.size)}
          </div>

          <div className="px-4 py-2 text-sm text-gray-500 min-w-32 text-right">
            {formatDate(node.mtime)}
          </div>

          <div className="px-4 py-2">
            <button
              onClick={() => copyToClipboard(node.path)}
              className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
              title="Copy path"
            >
              📋
            </button>
          </div>
        </div>

        {isExpanded && hasChildren && (
          <div>
            {node.children!.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-auto">
      <div className="sticky top-0 z-10 bg-gray-100 border-b">
        <div className="flex items-center">
          <div className="flex-1 px-4 py-2 font-semibold">Name</div>
          <div className="px-4 py-2 font-semibold min-w-fit">Alternate</div>
          <div className="px-4 py-2 font-semibold min-w-20 text-right">Size</div>
          <div className="px-4 py-2 font-semibold min-w-32 text-right">Modified</div>
          <div className="px-4 py-2 font-semibold">Actions</div>
        </div>
      </div>
      <div className="text-sm">
        {nodes.map((node) => renderNode(node, 0))}
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
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

import type { TreeNode } from '../types/index';
import { useClipboard } from '../hooks/useClipboard';
import type React from 'react';

interface TreeGridProps {
  nodes: TreeNode[];
  primary: 'encoded' | 'decoded';
  expanded: Record<string, boolean>;
  loading: Record<string, boolean>;
  onToggleNode: (nodeId: string) => void;
}

const INDENT_PER_LEVEL = 16;

export function TreeGrid({ nodes, primary, expanded, loading, onToggleNode }: TreeGridProps) {
  const { copyToClipboard } = useClipboard();

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const isExpanded = expanded[node.id];
    const isLoading = loading[node.id];
    const canExpand = node.isDir;
    const childrenLoaded = node.children && node.children.length > 0;
    const icon = canExpand ? (isExpanded ? '📂' : '📁') : '📄';
    const name = primary === 'encoded' ? node.nameDecoded : node.nameEncoded;
    const alternate = primary === 'encoded' ? node.nameEncoded : node.nameDecoded;
    const indent = depth * INDENT_PER_LEVEL;

    return (
      <div key={node.id} className="tree-node">
        <div
          className="tree-node-row"
          style={{ paddingLeft: 12 + indent }}
        >
          {canExpand ? (
            <button
              onClick={() => onToggleNode(node.id)}
              className="tree-node-toggle"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          ) : (
            <div className="tree-node-spacer" />
          )}
          <span className="tree-node-icon">{icon}</span>
          <div className="tree-node-name">
            <div className="tree-node-name-primary" title={name}>{name}</div>
            {alternate && <div className="tree-node-name-alternate" title={alternate}>{alternate}</div>}
          </div>
          <div className="tree-node-meta">
            {node.isDir ? (
              <div className="tree-node-meta-size">{childrenLoaded ? `${node.children!.length} items` : ''}</div>
            ) : (
              <>
                <div className="tree-node-meta-size">{formatSize(node.size)}</div>
                <div className="tree-node-meta-date">{formatDate(node.mtime)}</div>
              </>
            )}
          </div>
          <div className="tree-node-copy">
            <button onClick={() => copyToClipboard(node.pathEncoded)} className="tree-node-copy-btn copy-encoded" title="Copy encoded path">📋🔒</button>
            <button onClick={() => copyToClipboard(node.pathDecoded)} className="tree-node-copy-btn copy-decoded" title="Copy decoded path">📋🔓</button>
          </div>
        </div>
        {isExpanded && (
          <div className="tree-children">
            {isLoading ? (
              <div className="tree-loading" style={{ paddingLeft: 12 + (depth + 1) * INDENT_PER_LEVEL }}>
                Loading...
              </div>
            ) : (
              childrenLoaded && node.children!.map((child) => renderNode(child, depth + 1))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="tree-grid">
      <div className="tree-grid-content">
        {nodes.length === 0 ? (
          <div className="tree-grid-empty">
            <div className="tree-grid-empty-content">
              <div className="tree-grid-empty-icon">📁</div>
              <p>No files found</p>
            </div>
          </div>
        ) : (
          <div className="tree-grid-items">
            {nodes.map((node) => renderNode(node, 0))}
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

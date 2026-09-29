import type { NameMode } from '../types/index';
import { SearchBar } from './SearchBar';

interface TreeToolbarProps {
  total: number;
  filteredCount: number;
  search: string;
  onSearch: (value: string) => void;
  primary: NameMode;
  onSwap: () => void;
  sortNames: boolean;
  onToggleSort: () => void;
  onExpandOne: () => void;
  onExpandAll: () => void;
  onCollapse: () => void;
}

export function TreeToolbar({
  total,
  filteredCount,
  search,
  onSearch,
  primary,
  onSwap,
  sortNames,
  onToggleSort,
  onExpandOne,
  onExpandAll,
  onCollapse,
}: TreeToolbarProps) {
  return (
    <div className="tree-toolbar">
      <span className="tree-toolbar-stats">
        {filteredCount} items{search ? ` (${total} total)` : ''}
      </span>
      <SearchBar value={search} onChange={onSearch} placeholder="🔍 Search..." />
      <div className="header-btn-group">
        <button
          onClick={onToggleSort}
          className={`header-btn${sortNames ? ' header-btn-active' : ''}`}
          title="Sort names alphabetically by displayed name (root and every directory)"
        >
          A→Z Sort
        </button>
        <button onClick={onExpandOne} className="header-btn" title="Show the direct children of the visible directories">
          ▾ Expand 1 level
        </button>
        <button onClick={onExpandAll} className="header-btn" title="Open every folder of the whole tree">
          ▾▾ Expand all
        </button>
        <button onClick={onCollapse} className="header-btn" title="Close every folder, keep only the top level">
          ▴ Collapse all
        </button>
        <button onClick={onSwap} className="header-btn" title="Swap encoded/decoded as primary column">
          ⇄ {primary === 'encoded' ? 'Decoded' : 'Encoded'}
        </button>
      </div>
    </div>
  );
}

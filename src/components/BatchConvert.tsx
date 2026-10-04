import { useState } from 'react';
import type { EncfsNameCodec } from 'encfs-filename-codec';
import type { ConvertRow, NameMode, TreeNode } from '../types/index';
import { convertLines } from '../lib/chain';
import { buildPathTree, type PathPair } from '../lib/path-tree';
import { filterNodes, sortTree } from '../lib/tree-filter';
import { TreeToolbar } from './TreeToolbar';
import { TreeGrid } from './TreeGrid';

interface BatchConvertProps {
  getCodec: () => Promise<EncfsNameCodec>;
  /** Sample path lists shipped with builtin configs, one per direction. */
  sampleList?: { decoded: string; encoded: string };
  /** Shared primary column (same as Browse). */
  primary: NameMode;
  onSwap: () => void;
  sortNames: boolean;
  onToggleSort: () => void;
}

export function BatchConvert({
  getCodec,
  sampleList,
  primary,
  onSwap,
  sortNames,
  onToggleSort,
}: BatchConvertProps) {
  const [input, setInput] = useState('');
  const [rows, setRows] = useState<ConvertRow[]>([]);
  const [pairs, setPairs] = useState<PathPair[]>([]);
  const [view, setView] = useState<'table' | 'tree'>('table');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dragOver, setDragOver] = useState(false);

  // Auto-detect direction from first lines
  const detectDirection = (text: string): 'encode' | 'decode' => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 5);
    if (lines.length === 0) return 'decode';
    // Encoded names often contain base64-like chars or commas (chained IV)
    const encodedPattern = /[A-Za-z0-9+/=,]{20,}/;
    const hasEncoded = lines.some(line => encodedPattern.test(line));
    return hasEncoded ? 'decode' : 'encode';
  };

  const runConvert = async (direction: 'encode' | 'decode') => {
    const lines = input
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setError('Paste names/paths (one per line) or load a file');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const codec = await getCodec();
      const result = await convertLines(lines, codec, direction);
      setRows(result);
      setExpanded({});
      setSearch('');
      setPairs(
        result.flatMap((row) => {
          if (!row.output) return [];
          return direction === 'encode'
            ? [{ decoded: row.input, encoded: row.output }]
            : [{ decoded: row.output, encoded: row.input }];
        }),
      );
    } catch (err) {
      console.error('[convert]', err);
      setRows([]);
      setPairs([]);
      setError(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File) => {
    try {
      setInput(await file.text());
      setError('');
    } catch {
      setError('Failed to read file');
    }
  };

  const copyAll = async () => {
    const outputs = rows.filter((r) => r.output).map((r) => r.output);
    await navigator.clipboard.writeText(outputs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const tree: TreeNode[] = buildPathTree(pairs);
  const matched = search ? filterNodes(tree, search, primary) : tree;
  const filtered = sortNames ? sortTree(matched, primary) : matched;

  const collectDirs = (list: TreeNode[]): TreeNode[] =>
    list.flatMap((n) => (n.isDir ? [n, ...(n.children ? collectDirs(n.children) : [])] : []));
  const setAllExpanded = (value: boolean) => {
    const all = collectDirs(tree);
    setExpanded(
      value
        ? Object.fromEntries(all.map((n) => [n.id, true]))
        : {},
    );
  };

  const onToggleNode = (id: string) => {
    setExpanded((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const loadFileBtn = (
    <label className="step-btn file-label">
      📂 Load file
      <input
        type="file"
        accept=".txt,.lst,text/plain"
        className="hidden-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
    </label>
  );

  const okCount = rows.filter((r) => r.output).length;
  const errCount = rows.length - okCount;

  return (
    <div className="batch">
      <div className="batch-controls">
        <textarea
          className={`batch-input${dragOver ? ' drag-over' : ''}${rows.length === 0 ? ' batch-input-large' : ''}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={'One name or full path per line — or drop a .txt file here\n/dir/file.txt\nplain-name.txt'}
          rows={8}
          spellCheck={false}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) await handleFile(file);
          }}
        />
        <div className="batch-actions">
          <button
            className={`${detectDirection(input) === 'encode' ? 'convert-btn' : 'step-btn'}`}
            onClick={() => void runConvert('encode')}
            disabled={busy}
          >
            🔒 Encode
          </button>
          <button
            className={`${detectDirection(input) === 'decode' ? 'convert-btn' : 'step-btn'}`}
            onClick={() => void runConvert('decode')}
            disabled={busy}
          >
            🔓 Decode
          </button>
          {loadFileBtn}
          {sampleList && (
            <>
              <button
                className="step-btn"
                onClick={() => {
                  setInput(sampleList.encoded);
                  setRows([]);
                  setPairs([]);
                  setError('');
                }}
                title="Load encoded sample list"
              >
                📄 Sample Encoded list
              </button>
              <button
                className="step-btn"
                onClick={() => {
                  setInput(sampleList.decoded);
                  setRows([]);
                  setPairs([]);
                  setError('');
                }}
                title="Load decoded sample list"
              >
                📄 Sample Decoded list
              </button>
            </>
          )}
          {rows.length > 0 && (
            <>
              <button
                className={`step-btn${view === 'table' ? ' active' : ''}`}
                onClick={() => setView('table')}
              >
                ☰ Table
              </button>
              <button
                className={`step-btn${view === 'tree' ? ' active' : ''}`}
                onClick={() => setView('tree')}
              >
                🌳 Tree
              </button>
              <button className="step-btn" onClick={copyAll}>
                {copied ? '✓ Copied' : '📋 Copy all'}
              </button>
            </>
          )}
        </div>
        {error && <p className="field-error">{error}</p>}
        {rows.length > 0 && (
          <p className="batch-stats">
            {rows.length} lines — {okCount} converted{errCount > 0 ? `, ${errCount} failed` : ''}
          </p>
        )}
      </div>

      {rows.length > 0 && view === 'table' && (
        <div className="batch-table-wrap">
          <table className="batch-table">
            <thead>
              <tr>
                <th>Input</th>
                <th>Output</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={row.error ? 'row-error' : undefined}>
                  <td className="mono">{row.input}</td>
                  <td className="mono">{row.error ? row.error : row.output}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && view === 'tree' && (
        <>
          <TreeToolbar
            total={tree.length}
            filteredCount={matched.length}
            search={search}
            onSearch={setSearch}
            primary={primary}
            onSwap={onSwap}
            sortNames={sortNames}
            onToggleSort={onToggleSort}
            onExpandOne={() => setAllExpanded(true)}
            onExpandAll={() => setAllExpanded(true)}
            onCollapse={() => setAllExpanded(false)}
            exportNodes={tree}
          />
          <div className="display-content">
            <TreeGrid
              nodes={filtered}
              primary={primary}
              expanded={expanded}
              loading={{}}
              onToggleNode={onToggleNode}
            />
          </div>
        </>
      )}
    </div>
  );
}

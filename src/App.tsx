import { useState, useRef, useEffect } from 'react';
import './styles/app.css';
import { ConfigUploader } from './components/ConfigUploader';
import { DirectoryPicker } from './components/DirectoryPicker';
import { ModeSelector } from './components/ModeSelector';
import { MountPointInput } from './components/MountPointInput';
import { SearchBar } from './components/SearchBar';
import { TreeGrid } from './components/TreeGrid';
import { EncfsNameCodec } from 'encfs-filename-codec';
import { scanDirectory } from './lib/fs-scanner';
import { buildTreeLevel, buildFullPaths, applyMountPoint, findNodeById } from './lib/tree-builder';
import type { TreeNode } from './types/index';
import { saveDirHandle, loadDirHandle } from './lib/persist-dir';


type AppState = 'setup' | 'scanning' | 'display';

interface PersistedConfig {
  configXml?: string;
  mode: 'encoded' | 'decoded';
  mountPoint: string;
  dirName?: string;
}

const STORAGE_KEY = 'encfs-tree-config';

function loadPersisted(): PersistedConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function App() {
  const persisted = loadPersisted();

  const [state, setState] = useState<AppState>('setup');
  const [error, setError] = useState('');
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [search, setSearch] = useState('');
  const [configXml, setConfigXml] = useState(persisted?.configXml && persisted.configXml !== '' ? persisted.configXml : '');
  const [password, setPassword] = useState('');
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [dirName, setDirName] = useState(persisted?.dirName ?? '');
  const [mode, setMode] = useState<'encoded' | 'decoded'>(persisted?.mode ?? 'encoded');
  const [mountPoint, setMountPoint] = useState(persisted?.mountPoint ?? '/');
  const [codec, setCodec] = useState<EncfsNameCodec | null>(null);

  // Path converter
  const [convertPath, setConvertPath] = useState('');
  const [converted, setConverted] = useState('');

  // Expand/collapse state (lifted from TreeGrid)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Restore previously saved directory handle (IndexedDB) on startup
  useEffect(() => {
    loadDirHandle().then(handle => {
      if (handle) {
        setDirHandle(handle);
        setDirName(handle.name);
      }
    });
  }, []);

  const handleConfigLoaded = (content: string) => {
    setConfigXml(content);
    setError('');
  };

  const handleDirectorySelected = (handle: FileSystemDirectoryHandle) => {
    setDirHandle(handle);
    setDirName(handle.name);
    saveDirHandle(handle);
    setError('');
  };

  const handleScanClick = async () => {
    if (!configXml || !password || !dirHandle) {
      setError('Please provide config, password, and directory');
      return;
    }
    setState('scanning');
    setError('');
    try {
      const newCodec = await EncfsNameCodec.fromV6Xml(configXml, password);
      setCodec(newCodec);
      const entries = await scanDirectory(dirHandle);
      const tree = await buildTreeLevel(entries, newCodec, mode);
      const withPaths = buildFullPaths(tree, '', '', '');
      const withMount = applyMountPoint(withPaths, mountPoint);
      setNodes(withMount);
      setState('display');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan directory');
      setState('setup');
    }
  };

  const handleExpandNode = async (nodeId: string) => {
    if (!dirHandle || !codec) return;
    try {
      const parts = nodeId.split('/').filter(p => p);
      let handle: FileSystemDirectoryHandle = dirHandle;
      for (const part of parts) {
        handle = await handle.getDirectoryHandle(part);
      }
      const entries = await scanDirectory(handle);
      const childrenTree = await buildTreeLevel(entries, codec, mode, nodeId);
      const parentNode = findNodeById(nodesRef.current, nodeId);
      const basePath = parentNode?.path || '';
      const baseDecoded = parentNode?.pathDecoded || parentNode?.path || '';
      const baseEncoded = parentNode?.pathEncoded || parentNode?.path || '';
      const withPaths = buildFullPaths(childrenTree, basePath, baseDecoded, baseEncoded);
      const withMount = applyMountPoint(withPaths, mountPoint);
      setNodes(prev => {
        const insert = (arr: TreeNode[]): TreeNode[] =>
          arr.map(n => {
            if (n.id === nodeId) return { ...n, children: withMount };
            if (n.children) return { ...n, children: insert(n.children) };
            return n;
          });
        return insert(prev);
      });
    } catch (e) {
      console.error('Failed to expand node', e);
    }
  };

  // Ensure a directory's children are loaded, loading them from disk if needed
  const ensureLoaded = async (nodeId: string): Promise<TreeNode | null> => {
    const node = findNodeById(nodesRef.current, nodeId);
    if (!node || !node.isDir) return node;
    if (node.children && node.children.length > 0) return node;
    return new Promise(resolve => {
      setLoading(prev => ({ ...prev, [nodeId]: true }));
      handleExpandNode(nodeId).finally(() => {
        setLoading(prev => ({ ...prev, [nodeId]: false }));
        const updated = findNodeById(nodesRef.current, nodeId);
        resolve(updated);
      });
    });
  };

  // Expand helpers — populate directory content on expansion
  const expandOneLevel = async () => {
    if (!codec) return;
    const dirs = nodesRef.current.filter(n => n.isDir);
    const next: Record<string, boolean> = {};
    dirs.forEach(n => { next[n.id] = true; });
    setExpanded(prev => ({ ...prev, ...next }));
    for (const n of dirs) await ensureLoaded(n.id);
  };

  const expandAll = async () => {
    if (!codec) return;
    const collectDirs = (list: TreeNode[]): TreeNode[] =>
      list.flatMap(n => n.isDir ? [n, ...(n.children ? collectDirs(n.children) : [])] : []);
    const all = collectDirs(nodesRef.current);
    const next: Record<string, boolean> = {};
    all.forEach(n => { next[n.id] = true; });
    setExpanded(prev => ({ ...prev, ...next }));
    for (const n of all) await ensureLoaded(n.id);
  };

  const collapseAll = () => setExpanded({});

  // Path converter — whole path, IV chained per component by the codec
  const handleConvert = async (direction: 'decode' | 'encode') => {
    if (!convertPath.trim()) return;
    if (!codec) {
      setConverted('Scan a directory first');
      return;
    }
    try {
      const input = convertPath.trim();
      const leadSlash = input.startsWith('/');
      const result =
        direction === 'decode' ? await codec.decodePath(input) : await codec.encodePath(input);
      setConverted(result ? (leadSlash ? '/' : '') + result : 'Conversion failed');
    } catch {
      setConverted('Conversion error');
    }
  };

  const filteredNodes = search ? filterNodes(nodes, search, mode) : nodes;

  const onToggleNode = (id: string) => {
    const willExpand = !expanded[id];
    if (willExpand) {
      const node = nodesRef.current && findNodeById(nodesRef.current, id);
      const alreadyLoaded = node && node.children && node.children.length > 0;
      if (node && node.isDir && !alreadyLoaded) {
        setLoading(prev => ({ ...prev, [id]: true }));
        handleExpandNode(id).finally(() => {
          setLoading(prev => ({ ...prev, [id]: false }));
        });
      }
      setExpanded(prev => ({ ...prev, [id]: true }));
    } else {
      setExpanded(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const isScanning = state === 'scanning';
  const hasSaved = persisted != null;

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-header-title">
          <h1>EncFS</h1>
          <span>Tree Browser</span>
        </div>
        {state === 'display' && (
          <div className="app-header-actions">
            <p className="app-header-stats">
              {filteredNodes.length} items{search ? ` (${nodes.length} total)` : ''}
            </p>
            <SearchBar value={search} onChange={setSearch} placeholder="Search..." />
            <div className="header-btn-group">
              <button onClick={() => void expandOneLevel()} className="header-btn" title="Expand first level, loading contents">▶ 1Lvl</button>
              <button onClick={() => void expandAll()} className="header-btn" title="Expand all, loading contents">⊞ All</button>
              <button onClick={collapseAll} className="header-btn" title="Collapse all">⊟ All</button>
            </div>
            <button onClick={() => { setState('setup'); setExpanded({}); }} className="header-btn back-btn">Config</button>
          </div>
        )}
        {state === 'setup' && (
          <p className="app-header-subtitle">Navigate encrypted directory trees with bidirectional filename mapping</p>
        )}
      </header>

      <main className="app-main">
        {state === 'setup' && (
          <div className="app-setup">
            <div className="app-setup-container">
              <div className="app-setup-header">
                <h2>Get Started</h2>
                <p>Configure your EncFS environment in three simple steps</p>
              </div>

              {hasSaved && (
                <div className="setup-saved">
                  <span className="setup-saved-icon">💾</span>
                  <div>
                    <p className="setup-saved-title">Saved settings restored</p>
                    <p className="setup-saved-detail">
                      {dirName ? `Directory: ${dirName}` : 'No directory saved'} · Mode: {mode} · Mount point: {mountPoint || '/'}
                    </p>
                  </div>
                </div>
              )}

              <div className="app-setup-steps">
                <div className="setup-step">
                  <div className="setup-step-number">1</div>
                  <div className="setup-step-content">
                    <h3 className="setup-step-title">Upload EncFS Config</h3>
                    <ConfigUploader onConfigLoaded={handleConfigLoaded} onError={setError} isLoading={isScanning} />
                    {configXml && (
                      <div className="setup-success">
                        <span className="setup-success-icon">✓</span>
                        <span>Configuration loaded</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="setup-step">
                  <div className="setup-step-number">2</div>
                  <div className="setup-step-content">
                    <h3 className="setup-step-title">Enter Password</h3>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your EncFS password" className="setup-password-input" disabled={isScanning} />
                    <p>Password stays in memory only, never stored</p>
                  </div>
                </div>
                <div className="setup-step">
                  <div className="setup-step-number">3</div>
                  <div className="setup-step-content">
                    <h3 className="setup-step-title">Select Directory & Configure</h3>
                    <DirectoryPicker onDirectorySelected={handleDirectorySelected} onError={setError} selectedPath={dirHandle?.name || dirName} isLoading={isScanning} />
                    <div className="setup-options">
                      <ModeSelector mode={mode} onModeChange={setMode} disabled={isScanning} />
                      <MountPointInput value={mountPoint} onChange={setMountPoint} disabled={isScanning} />
                    </div>
                  </div>
                </div>
                {error && (
                  <div className="setup-error">
                    <span className="setup-error-icon">⚠</span>
                    <div>
                      <p className="setup-error-title">Error</p>
                      <p className="setup-error-message">{error}</p>
                    </div>
                  </div>
                )}
                <button onClick={handleScanClick} disabled={!configXml || !password || !dirHandle || isScanning} className="setup-button">
                  {isScanning ? (
                    <span className="setup-button-content"><span className="setup-spinner"></span>Scanning...</span>
                  ) : 'Scan Directory'}
                </button>
              </div>
            </div>
          </div>
        )}

        {state === 'display' && (
          <div className="app-display">
            <div className="convert-bar">
              <div className="convert-row">
                <span className="convert-label">Convert path:</span>
                <input
                  type="text"
                  value={convertPath}
                  onChange={e => { setConvertPath(e.target.value); setConverted(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleConvert('decode'); }}
                  placeholder="Full path, each segment converted"
                  className="convert-input"
                />
                <button onClick={() => handleConvert('decode')} className="convert-btn">Decode</button>
                <button onClick={() => handleConvert('encode')} className="convert-btn">Encode</button>
              </div>
              {converted && (
                <div className="convert-output">
                  <div className="convert-result">
                    <span className="convert-result-text">{converted}</span>
                    <button
                      className="convert-result-copy"
                      title="Copy result"
                      onClick={() => navigator.clipboard.writeText(converted)}
                    >
                      📋
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="display-content">
              <TreeGrid
                nodes={filteredNodes}
                mode={mode}
                expanded={expanded}
                loading={loading}
                onToggleNode={onToggleNode}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function filterNodes(nodes: TreeNode[], search: string, mode: 'encoded' | 'decoded'): TreeNode[] {
  const q = search.toLowerCase();
  const filter = (node: TreeNode): TreeNode | null => {
    const name = mode === 'encoded' ? node.nameDecoded : node.nameEncoded;
    const match = name.toLowerCase().includes(q);
    const kids = node.children?.map(filter).filter(Boolean) as TreeNode[] | undefined;
    const kidMatch = (kids?.length ?? 0) > 0;
    if (match || kidMatch) return { ...node, children: kids };
    return null;
  };
  return nodes.map(filter).filter(Boolean) as TreeNode[];
}
import { useState, useRef, useEffect } from 'react';
import './styles/app.css';
import { ConfigModal } from './components/ConfigModal';
import { DirectorySetup } from './components/DirectorySetup';
import { BatchConvert } from './components/BatchConvert';
import { TreeToolbar } from './components/TreeToolbar';
import { TreeGrid } from './components/TreeGrid';
import { EncfsNameCodec } from 'encfs-filename-codec';
import { scanDirectory } from './lib/fs-scanner';
import { buildTreeLevel, buildFullPaths, findNodeById } from './lib/tree-builder';
import { graftSteps, prefixIds, relPathOf, normalizeMount } from './lib/chain';
import { filterNodes, sortTree } from './lib/tree-filter';
import { BUILTIN_CONFIGS, BUILTIN_SAMPLES, defaultStepFor } from './lib/builtin-configs';
import { hasChainedNameIv } from './lib/encfs-xml';
import {
  loadConfigs,
  saveConfigs,
  loadActiveId,
  saveActiveId,
  loadPrefs,
  savePrefs,
  loadSteps,
  saveSteps,
  deleteConfig,
  migrateLegacy,
  sanitizeForStorage,
} from './lib/config-store';
import { saveDirHandle, loadDirHandle, dirHandleKey } from './lib/persist-dir';
import type {
  AppPrefs,
  DirBindingStep,
  EncfsConfiguration,
  NameMode,
  TreeNode,
} from './types/index';

type View = 'convert' | 'browse';

const SUPPORTS_FSA = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

migrateLegacy();

async function mountNamespaces(
  codec: EncfsNameCodec,
  mount: string,
  mode: NameMode,
): Promise<{ mpDecoded: string; mpEncoded: string }> {
  if (!mount) return { mpDecoded: '', mpEncoded: '' };
  const bare = mount.replace(/^\/+/, '');
  if (mode === 'decoded') {
    try {
      return { mpDecoded: mount, mpEncoded: `/${await codec.encodePath(bare)}` };
    } catch {
      return { mpDecoded: mount, mpEncoded: mount };
    }
  }
  try {
    return { mpDecoded: `/${await codec.decodePath(bare)}`, mpEncoded: mount };
  } catch {
    return { mpDecoded: mount, mpEncoded: mount };
  }
}

function attachChildren(list: TreeNode[], id: string, children: TreeNode[]): TreeNode[] {
  return list.map((node) => {
    if (node.id === id) {
      const existing = node.children ?? [];
      const loadedIds = new Set(children.map((c) => c.id));
      return {
        ...node,
        children: [...children, ...existing.filter((e) => !loadedIds.has(e.id))],
        isLoaded: true,
      };
    }
    if (node.children) return { ...node, children: attachChildren(node.children, id, children) };
    return node;
  });
}

export function App() {
  const [view, setView] = useState<View>(() => (SUPPORTS_FSA ? 'browse' : 'convert'));
  const [configs, setConfigs] = useState<EncfsConfiguration[]>(() => [
    ...BUILTIN_CONFIGS,
    ...loadConfigs(),
  ]);
  const [activeId, setActiveId] = useState<string>(
    () => loadActiveId() ?? BUILTIN_CONFIGS[0].id,
  );
  const activeConfig = configs.find((c) => c.id === activeId) ?? null;

  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [step, setStep] = useState<DirBindingStep | null>(null);
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);

  const [codec, setCodec] = useState<EncfsNameCodec | null>(null);
  const codecKeyRef = useRef('');
  const fsaHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const nodesRef = useRef<TreeNode[]>(nodes);
  nodesRef.current = nodes;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [primary, setPrimary] = useState<NameMode>(
    () => loadPrefs().displayPrimary ?? 'encoded',
  );
  const [sortNames, setSortNames] = useState(() => loadPrefs().sortNames ?? false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const cfg = configs.find((c) => c.id === activeId);
    if (!cfg) return;
    setPassword(cfg.rememberedPassword ?? '');
    setRemember(Boolean(cfg.rememberedPassword));
    const raw = loadSteps(activeId)[0];
    // drop steps persisted by the removed listing feature
    const legacy = raw as (DirBindingStep & { source?: string }) | undefined;
    const restored = raw && legacy?.source !== 'listing' ? raw : defaultStepFor(cfg);
    if (restored !== raw) saveSteps(activeId, [restored]);
    setStep(restored);
    fsaHandleRef.current = null;
    setCodec(null);
    codecKeyRef.current = '';
    setError('');
    // configs intentionally omitted: only re-run on config switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const updateConfig = (cfg: EncfsConfiguration) => {
    setConfigs((prev) => {
      const next = prev.map((c) => (c.id === cfg.id ? cfg : c));
      saveConfigs(
        next
          .filter((c) => c.source === 'user')
          .map((c) => (c.id === cfg.id ? sanitizeForStorage(c, remember) : c)),
      );
      return next;
    });
  };

  const ensureCodec = async (): Promise<EncfsNameCodec> => {
    const key = `${activeId} ${password}`;
    if (codec && codecKeyRef.current === key) return codec;
    if (!activeConfig) throw new Error('Select a configuration first');
    if (!password) throw new Error('Enter the password');
    const built = await EncfsNameCodec.fromV6Xml(activeConfig.xml, password);
    setCodec(built);
    codecKeyRef.current = key;
    if (activeConfig.source === 'user') {
      const next = { ...activeConfig };
      if (remember && password) next.rememberedPassword = password;
      else delete next.rememberedPassword;
      updateConfig(next);
    }
    return built;
  };

  const handleStepChange = (next: DirBindingStep) => {
    setStep(next);
    if (activeId) saveSteps(activeId, [next]);
  };

  const handleDirectoryPicked = (handle: FileSystemDirectoryHandle) => {
    if (!step) return;
    fsaHandleRef.current = handle;
    handleStepChange({ ...step, dirName: handle.name });
    setError('');
    // best effort: an in-memory handle already works for this session
    if (activeId) {
      void saveDirHandle(handle, dirHandleKey(activeId, step.id)).catch(() => {});
    }
  };

  const resolveHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
    if (fsaHandleRef.current) return fsaHandleRef.current;
    if (!activeId || !step) return null;
    const handle = await loadDirHandle(dirHandleKey(activeId, step.id));
    if (handle) fsaHandleRef.current = handle;
    return handle;
  };

  const handleSelectConfig = (id: string) => {
    saveActiveId(id);
    setActiveId(id);
    setNodes([]);
    setExpanded({});
  };

  const handleAddConfig = (data: { name: string; xml: string; remember: boolean }) => {
    setRemember(data.remember);
    const cfg: EncfsConfiguration = {
      id: crypto.randomUUID(),
      name: data.name,
      xml: data.xml,
      source: 'user',
    };
    if (data.remember && password) cfg.rememberedPassword = password;
    saveConfigs([...loadConfigs(), sanitizeForStorage(cfg, data.remember)]);
    setConfigs((prev) => [...prev, cfg]);
    saveActiveId(cfg.id);
    setActiveId(cfg.id);
    setModal(null);
  };

  const handleEditConfig = (data: { name: string; xml: string | null; remember: boolean }) => {
    if (!activeConfig || activeConfig.source !== 'user') return;
    setRemember(data.remember);
    const xml = data.xml ?? activeConfig.xml;
    const next: EncfsConfiguration = { ...activeConfig, name: data.name, xml };
    if (data.remember && password) next.rememberedPassword = password;
    else delete next.rememberedPassword;
    updateConfig(next);
    if (data.xml) {
      setCodec(null);
      codecKeyRef.current = '';
      setNodes([]);
    }
    setModal(null);
  };

  const handleDeleteConfig = (id: string) => {
    deleteConfig(id);
    setConfigs((prev) => prev.filter((c) => c.id !== id));
    const fallback = BUILTIN_CONFIGS[0].id;
    saveActiveId(fallback);
    setActiveId(fallback);
    setModal(null);
  };

  const handleScanClick = async () => {
    if (!step) {
      setError('Select a directory first');
      return;
    }
    setScanning(true);
    setError('');
    try {
      const c = await ensureCodec();
      const handle = await resolveHandle();
      if (!handle) throw new Error('Directory missing — select it again');
      const mount = normalizeMount(step.mountPoint);
      const entries = await scanDirectory(handle);
      const tree = await buildTreeLevel(entries, c, step.mode, '', mount);
      const { mpDecoded, mpEncoded } = await mountNamespaces(c, mount, step.mode);
      const withPaths = buildFullPaths(tree, mount, mpDecoded, mpEncoded);
      setNodes(graftSteps([{ mount, nodes: prefixIds(withPaths, step.id) }]));
      setExpanded({});
      setLoading({});
      const prefs: AppPrefs = loadPrefs();
      if (!prefs.displayPrimary) setPrimary(step.mode);
      setView('browse');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan directory');
    } finally {
      setScanning(false);
    }
  };

  const handleExpandNode = async (nodeId: string) => {
    const node = findNodeById(nodesRef.current, nodeId);
    if (!node || !step || node.stepId !== step.id) return;
    try {
      const c = await ensureCodec();
      const relPath = relPathOf(nodeId);
      const handle = await resolveHandle();
      if (!handle) throw new Error('Directory missing — select it again');
      let target = handle;
      for (const part of relPath.split('/').filter(Boolean)) {
        target = await target.getDirectoryHandle(part);
      }
      const entries = await scanDirectory(target);
      const loaded = await buildTreeLevel(entries, c, step.mode, relPath, node.path);
      const withPaths = buildFullPaths(loaded, node.path, node.pathDecoded, node.pathEncoded);
      setNodes((prev) => attachChildren(prev, nodeId, prefixIds(withPaths, step.id)));
    } catch (err) {
      console.error('Failed to expand node', err);
    }
  };

  const ensureLoaded = async (nodeId: string): Promise<TreeNode | null> => {
    const node = findNodeById(nodesRef.current, nodeId);
    if (!node || !node.isDir || node.isLoaded) return node;
    setLoading((prev) => ({ ...prev, [nodeId]: true }));
    try {
      await handleExpandNode(nodeId);
    } finally {
      setLoading((prev) => ({ ...prev, [nodeId]: false }));
    }
    return findNodeById(nodesRef.current, nodeId);
  };

  const expandOneLevel = async () => {
    const dirs = nodesRef.current.filter((n) => n.isDir);
    setExpanded((prev) => ({ ...prev, ...Object.fromEntries(dirs.map((n) => [n.id, true])) }));
    for (const n of dirs) await ensureLoaded(n.id);
  };

  const expandAll = async () => {
    const collectDirs = (list: TreeNode[]): TreeNode[] =>
      list.flatMap((n) =>
        n.isDir ? [n, ...(n.children ? collectDirs(n.children) : [])] : [],
      );
    const all = collectDirs(nodesRef.current);
    setExpanded((prev) => ({ ...prev, ...Object.fromEntries(all.map((n) => [n.id, true])) }));
    for (const n of all) await ensureLoaded(n.id);
  };

  const collapseAll = () => setExpanded({});

  const swapPrimary = () => {
    const next: NameMode = primary === 'encoded' ? 'decoded' : 'encoded';
    setPrimary(next);
    savePrefs({ ...loadPrefs(), displayPrimary: next });
  };

  const toggleSort = () => {
    setSortNames((v) => {
      const next = !v;
      savePrefs({ ...loadPrefs(), sortNames: next });
      return next;
    });
  };

  const onToggleNode = (id: string) => {
    const willExpand = !expanded[id];
    if (willExpand) {
      const node = findNodeById(nodesRef.current, id);
      if (node && node.isDir && !node.isLoaded) void ensureLoaded(id);
      setExpanded((prev) => ({ ...prev, [id]: true }));
    } else {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const filteredNodes = search ? filterNodes(nodes, search, primary) : nodes;
  const visibleNodes = sortNames ? sortTree(filteredNodes, primary) : filteredNodes;
  const canScan = Boolean(activeConfig && password && step?.dirName && !scanning);
  const chained = activeConfig ? hasChainedNameIv(activeConfig.xml) : false;
  const sampleList = activeConfig ? BUILTIN_SAMPLES[activeConfig.id] : undefined;

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-header-title">
          <h1>EncFS</h1>
          <span>Tree Browser</span>
        </div>
        <nav className="app-tabs">
          <button
            className={`app-tab${view === 'convert' ? ' app-tab-active' : ''}`}
            onClick={() => setView('convert')}
          >
            ⚡ Convert
          </button>
          {SUPPORTS_FSA && (
            <button
              className={`app-tab${view === 'browse' ? ' app-tab-active' : ''}`}
              onClick={() => setView('browse')}
            >
              🌳 Browse
            </button>
          )}
        </nav>
        {view === 'browse' && step && (
          <div className="header-dir">
            <DirectorySetup
              step={step}
              chained={chained}
              onDirectory={(h) => void handleDirectoryPicked(h)}
              onChange={handleStepChange}
              onError={setError}
              disabled={scanning}
            />
            <button onClick={() => void handleScanClick()} disabled={!canScan} className="setup-button scan-button">
              {scanning ? (
                <span className="setup-button-content">
                  <span className="setup-spinner"></span>Scanning...
                </span>
              ) : (
                '🔍 Scan'
              )}
            </button>
          </div>
        )}
        <div className="config-cluster">
          <select
            className="config-select"
            value={activeConfig?.id ?? ''}
            onChange={(e) => {
              if (e.target.value === '__add__') setModal('add');
              else handleSelectConfig(e.target.value);
            }}
            title="Active configuration"
          >
            {[
              ...configs.filter((c) => c.source === 'user'),
              ...configs.filter((c) => c.source === 'builtin'),
            ].map((cfg) => (
              <option key={cfg.id} value={cfg.id}>
                {cfg.name}
                {cfg.source === 'builtin' ? ' (sample)' : ''}
              </option>
            ))}
            <option value="__add__">➕ Add configuration…</option>
          </select>
          <button
            className="icon-btn"
            title={
              activeConfig?.source === 'user'
                ? 'Edit configuration'
                : 'Sample configs are read-only'
            }
            disabled={activeConfig?.source !== 'user'}
            onClick={() => setModal('edit')}
          >
            {activeConfig?.source === 'user' ? '✏️' : '🔒'}
          </button>
          <input
            type="password"
            className="config-password"
            placeholder="🔑 Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            title="EncFS password for the selected configuration"
          />
        </div>
      </header>

      <main className="app-main">
        {view === 'convert' && (
          <BatchConvert
            getCodec={ensureCodec}
            sampleList={sampleList}
            primary={primary}
            onSwap={swapPrimary}
            sortNames={sortNames}
            onToggleSort={toggleSort}
          />
        )}

        {view === 'browse' && (
          <div className="app-display">
            {error && (
              <div className="setup-error tree-error">
                <span className="setup-error-icon">⚠</span>
                <div className="setup-error-content">
                  <p className="setup-error-message">{error}</p>
                </div>
              </div>
            )}

            {nodes.length === 0 ? (
              <div className="tree-grid-empty">
                <div className="tree-grid-empty-content">
                  <div className="tree-grid-empty-icon">🔒</div>
                  <p>No tree loaded yet</p>
                  <p className="tree-grid-empty-hint">
                    Pick an EncFS directory above and hit Scan — or convert name lists in the Convert tab
                  </p>
                </div>
              </div>
            ) : (
              <>
                <TreeToolbar
                  total={nodes.length}
                  filteredCount={filteredNodes.length}
                  search={search}
                  onSearch={setSearch}
                  primary={primary}
                  onSwap={swapPrimary}
                  sortNames={sortNames}
                  onToggleSort={toggleSort}
                  onExpandOne={() => void expandOneLevel()}
                  onExpandAll={() => void expandAll()}
                  onCollapse={collapseAll}
                />
                <div className="display-content">
                  <TreeGrid
                    nodes={visibleNodes}
                    primary={primary}
                    expanded={expanded}
                    loading={loading}
                    onToggleNode={onToggleNode}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {modal === 'add' && (
        <ConfigModal
          mode="add"
          config={null}
          remember={remember}
          onSave={(d) => d.xml && handleAddConfig({ name: d.name, xml: d.xml, remember: d.remember })}
          onDelete={() => {}}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'edit' && activeConfig && (
        <ConfigModal
          mode="edit"
          config={activeConfig}
          remember={remember}
          onSave={handleEditConfig}
          onDelete={() => handleDeleteConfig(activeConfig.id)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

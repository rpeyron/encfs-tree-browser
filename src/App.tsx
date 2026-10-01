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
import { graftSteps, prefixIds, relPathOf, normalizeMount, directoryDisplayNames, wrapDirectoryRoot } from './lib/chain';
import { filterNodes, sortTree, flattenVisible } from './lib/tree-filter';
import { detectNameMode } from './lib/mode-detect';
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

/** The mount field is typed as a decoded path; derive its encoded form (every level, chained IVs). */
async function prefixNamespaces(
  codec: EncfsNameCodec,
  mount: string,
): Promise<{ decoded: string; encoded: string }> {
  if (!mount) return { decoded: '', encoded: '' };
  try {
    return { decoded: mount, encoded: `/${await codec.encodePath(mount.replace(/^\/+/, ''))}` };
  } catch {
    return { decoded: mount, encoded: mount };
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
  const [activeId, setActiveId] = useState<string>(() => loadActiveId() ?? '');
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const applyDetectedMode = (stepId: string, mode: NameMode) => {
    setStep((prev) => {
      if (!prev || prev.id !== stepId) return prev;
      const next = { ...prev, mode };
      if (activeId) saveSteps(activeId, [next]);
      return next;
    });
  };

  /** Detect the mode over the directory root after a pick; silent when codec/password unavailable. */
  const detectModeFor = async (handle: FileSystemDirectoryHandle, stepId: string) => {
    try {
      const c = await ensureCodec();
      const entries = await scanDirectory(handle);
      const mode = await detectNameMode(c, entries.map((e) => e.name));
      if (mode) applyDetectedMode(stepId, mode);
      const names = await directoryDisplayNames(c, handle.name, mode ?? 'encoded');
      console.log('[directory] selection', {
        name: handle.name,
        detectedMode: mode ?? '(unchanged)',
        fullPathDecoded: `/${names.nameDecoded}`,
        fullPathEncoded: `/${names.nameEncoded}`,
        entries: entries.length,
      });
    } catch (err) {
      // no codec/password yet — keep the current mode, user picks manually
      console.log('[directory] selection (mode not detected)', {
        name: handle.name,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleDirectoryPicked = (handle: FileSystemDirectoryHandle) => {
    if (!step) {
      setError('Select a configuration first');
      return;
    }
    console.log('[directory] picked', { name: handle.name, stepId: step.id });
    fsaHandleRef.current = handle;
    handleStepChange({ ...step, dirName: handle.name });
    setError('');
    // best effort: an in-memory handle already works for this session
    if (activeId) {
      void saveDirHandle(handle, dirHandleKey(activeId, step.id)).catch(() => {});
    }
    void detectModeFor(handle, step.id);
  };

  const resolveHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
    if (fsaHandleRef.current) return fsaHandleRef.current;
    if (!activeId || !step) return null;
    const handle = await loadDirHandle(dirHandleKey(activeId, step.id));
    if (handle) fsaHandleRef.current = handle;
    return handle;
  };

  const handleSelectConfig = (id: string) => {
    if (!id) return;
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
    setActiveId('');
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
      const isChained = activeConfig ? hasChainedNameIv(activeConfig.xml) : false;
      // Chained volume with a mount point: the mount path (synthetic graft) is the
      // only root shown. Otherwise the root row is the selected directory itself,
      // its full path optionally prefixed by the mount field.
      const useGraft = isChained && mount !== '';
      const pre = await prefixNamespaces(c, mount);
      // On-disk namespace of the mount for the chained IV walk (dir mode decides
      // whether the mount must be encoded or is already plain).
      const ivBase = useGraft ? (step.mode === 'encoded' ? pre.encoded : pre.decoded) : '';
      const entries = await scanDirectory(handle);
      const tree = await buildTreeLevel(entries, c, step.mode, '', ivBase);
      let rootNodes: TreeNode[];
      if (!useGraft) {
        const names = await directoryDisplayNames(c, step.dirName, step.mode);
        const wrapperDecoded = `${pre.decoded}/${names.nameDecoded}`;
        const wrapperEncoded = `${pre.encoded}/${names.nameEncoded}`;
        const withPaths = buildFullPaths(tree, '', wrapperDecoded, wrapperEncoded);
        rootNodes = wrapDirectoryRoot(prefixIds(withPaths, step.id), {
          stepId: step.id,
          onDiskName: step.dirName,
          ...names,
          prefixDecoded: pre.decoded,
          prefixEncoded: pre.encoded,
        });
      } else {
        rootNodes = prefixIds(buildFullPaths(tree, ivBase, pre.decoded, pre.encoded), step.id);
      }
      setNodes(graftSteps([{ mount: useGraft ? mount : '', nodes: rootNodes }]));
      // Keep children visible right after the scan: pre-expand the root row when present
      setExpanded(useGraft ? {} : { [`${step.id}:`]: true });
      setLoading({});
      const prefs: AppPrefs = loadPrefs();
      if (!prefs.displayPrimary) setPrimary(step.mode);
      setView('browse');
    } catch (err) {
      console.error('[scan] failed', err);
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
    const current = findNodeById(nodesRef.current, id);
    if (current?.rootDirectory) return; // root row stays open
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

  // Keyboard navigation — kept in a ref so the listener attaches once per view.
  const kbRef = useRef({ visibleNodes, expanded, selectedId, primary, search, onToggleNode: (_id: string) => {}, setSelectedId });
  kbRef.current = {
    visibleNodes,
    expanded,
    selectedId,
    primary,
    search,
    onToggleNode,
    setSelectedId,
  };

  useEffect(() => {
    if (view !== 'browse') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const kb = kbRef.current;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.tree-toolbar .search-input')?.focus();
        return;
      }

      if (event.key === 'Escape') {
        kb.setSelectedId(null);
        if (kb.search) setSearch('');
        if (tag === 'INPUT') (target as HTMLInputElement).blur();
        return;
      }
      if (typing || kb.visibleNodes.length === 0) return;

      if (mod && event.key.toLowerCase() === 'c') {
        if (!kb.selectedId) return;
        const node = findNodeById(kb.visibleNodes, kb.selectedId);
        if (node) {
          event.preventDefault();
          void navigator.clipboard.writeText(kb.primary === 'encoded' ? node.pathDecoded : node.pathEncoded);
        }
        return;
      }

      const flat = flattenVisible(kb.visibleNodes, kb.expanded);
      const idx = flat.findIndex((n) => n.id === kb.selectedId);
      const focusRow = (id: string) => {
        kb.setSelectedId(id);
        requestAnimationFrame(() => {
          document
            .querySelector(`[data-node-id="${id}"]`)
            ?.scrollIntoView({ block: 'nearest' });
        });
      };

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          const next = idx < 0 ? flat[0] : flat[Math.min(idx + 1, flat.length - 1)];
          if (next) focusRow(next.id);
          break;
        }
        case 'ArrowUp': {
          event.preventDefault();
          if (idx > 0) focusRow(flat[idx - 1].id);
          break;
        }
        case 'ArrowRight': {
          if (idx < 0) {
            if (flat[0]) focusRow(flat[0].id);
            break;
          }
          const node = flat[idx];
          event.preventDefault();
          const isOpen = node.rootDirectory || kb.expanded[node.id];
          if (node.isDir && !isOpen) kb.onToggleNode(node.id);
          else if (node.isDir && node.children?.[0]) focusRow(node.children[0].id);
          break;
        }
        case 'ArrowLeft': {
          if (idx < 0) break;
          event.preventDefault();
          const node = flat[idx];
          if (node.isDir && !node.rootDirectory && kb.expanded[node.id]) kb.onToggleNode(node.id);
          else {
            const parentId = node.id.slice(0, node.id.lastIndexOf('/'));
            if (parentId.includes(':') && parentId !== node.id) focusRow(parentId);
          }
          break;
        }
        case 'Enter':
        case ' ': {
          if (tag === 'BUTTON' || idx < 0) return;
          const node = flat[idx];
          if (node.isDir) {
            event.preventDefault();
            kb.onToggleNode(node.id);
          }
          break;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const sampleList = activeConfig ? BUILTIN_SAMPLES[activeConfig.id] : undefined;

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-header-title">
          <h1>EncFS</h1>
          <span>Tree Browser</span>
        </div>
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
            <option value="" disabled hidden>
              Select or add configuration…
            </option>
            {[
              ...configs.filter((c) => c.source === 'user'),
              ...configs.filter((c) => c.source === 'builtin'),
            ].map((cfg) => (
              <option key={cfg.id} value={cfg.id}>
                {cfg.name}
                {cfg.source === 'builtin'
                  ? cfg.id.startsWith('builtin-conf-')
                    ? ' (conf)'
                    : ' (sample)'
                  : ''}
              </option>
            ))}
            <option value="__add__">➕ Add configuration…</option>
          </select>
          <button
            className="icon-btn"
            title={
              activeConfig?.source === 'user'
                ? 'Edit configuration'
                : activeConfig
                  ? 'Sample configs are read-only'
                  : 'Select a configuration first'
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
            disabled={!activeConfig}
            title="EncFS password for the selected configuration"
          />
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
                  <ol className="tree-grid-empty-steps">
                    <li>Pick a <strong>configuration</strong> in the header (password beside it)</li>
                    <li>
                      <strong>📂 Select directory…</strong> — in the picker press{' '}
                      <strong>Ctrl+L / Alt+D</strong> to type any path (hidden folders too);
                      the mode is auto-detected
                    </li>
                    <li>
                      Optionally set a <strong>mount prefix</strong> (decoded path shown in
                      front of the root), then <strong>🔍 Scan</strong>
                    </li>
                    <li>Or convert name lists in the <strong>Convert</strong> tab</li>
                  </ol>
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
                  exportNodes={nodes}
                />
                <div className="display-content">
                  <TreeGrid
                    nodes={visibleNodes}
                    primary={primary}
                    expanded={expanded}
                    loading={loading}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
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

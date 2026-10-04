import { useState, useRef, useEffect } from 'react';
import './styles/app.css';
import { ConfigModal } from './components/ConfigModal';
import { DirectorySetup } from './components/DirectorySetup';
import { BatchConvert } from './components/BatchConvert';
import { TreeToolbar } from './components/TreeToolbar';
import { TreeGrid } from './components/TreeGrid';
import { EncfsNameCodec } from 'encfs-filename-codec';
import { scanDirectory, type FSEntry } from './lib/fs-scanner';
import { probeAgent, agentList, joinAgentPath, shutdownAgent, type AgentInfo } from './lib/agent-client';
import { buildTreeLevel, buildFullPaths, findNodeById } from './lib/tree-builder';
import { graftSteps, prefixIds, relPathOf, normalizeMount, directoryDisplayNames, wrapDirectoryRoot, splitParentPath } from './lib/chain';
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
  const [agent, setAgent] = useState<AgentInfo | null>(null);

  const [view, setView] = useState<View>(() => (SUPPORTS_FSA ? 'browse' : 'convert'));
  const [configs, setConfigs] = useState<EncfsConfiguration[]>(() => {
    console.log(`[encfs-tree-browser] v${import.meta.env.VITE_APP_VERSION || 'dev'} loaded`);
    return [
      ...BUILTIN_CONFIGS,
      ...loadConfigs(),
    ];
  });
  const [activeId, setActiveId] = useState<string>(() => loadActiveId() ?? '');
  const activeConfig = configs.find((c) => c.id === activeId) ?? null;

  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [step, setStep] = useState<DirBindingStep | null>(null);
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);

  const [codec, setCodec] = useState<EncfsNameCodec | null>(null);
  const codecKeyRef = useRef('');
  const fsaHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  // Probe the local agent (same origin when served by it, else 8765-8785).
  useEffect(() => {
    let alive = true;
    void probeAgent()
      .then((info) => {
        if (alive) {
          setAgent(info);
          if (info) {
            console.log('[agent] detected', { base: info.base || '(same origin)', roots: info.roots });
          }
        }
      })
      .catch((err) => {
        if (alive) {
          console.error('[agent] probe failed:', err);
          setAgent(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [view]);

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
    const legacy = raw as unknown as { source?: string } | undefined;
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

  /** Primary display always follows the on-disk side; persisted for reloads. */
  const persistPrimary = (mode: NameMode) => {
    setPrimary(mode);
    savePrefs({ ...loadPrefs(), displayPrimary: mode });
  };

  const handleStepChange = (next: DirBindingStep) => {
    // Manual mode toggle: primary follows the on-disk representation.
    if (step && next.mode !== step.mode) persistPrimary(next.mode);
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
    persistPrimary(mode);
  };

  /**
   * Shared detection flow (FSA and agent): load the root entries, detect the
   * mode, apply it and log both full paths. Entry/API failures go to onError;
   * codec/password problems stay silent (the auto-scan surfaces those).
   */
  const detectFromEntries = async (
    stepId: string,
    loadEntries: () => Promise<FSEntry[]>,
    display: { rawPath: string; parent: string; base: string },
    onError?: (message: string) => void,
  ): Promise<NameMode | null> => {
    let entries: FSEntry[];
    try {
      entries = await loadEntries();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read the directory';
      console.log('[directory] load failed', { name: display.rawPath, error: message });
      onError?.(message);
      return null;
    }
    try {
      const c = await ensureCodec();
      const mode = await detectNameMode(c, entries.map((e) => e.name));
      if (mode) applyDetectedMode(stepId, mode);
      const names = await directoryDisplayNames(c, display.base, mode ?? 'encoded');
      console.log('[directory] selection', {
        name: display.rawPath,
        detectedMode: mode ?? '(unchanged)',
        fullPathDecoded: `${display.parent}/${names.nameDecoded}`,
        fullPathEncoded: `${display.parent}/${names.nameEncoded}`,
        entries: entries.length,
      });
      return mode;
    } catch (err) {
      // no codec/password yet — keep the current mode, user picks manually
      console.log('[directory] selection (mode not detected)', {
        name: display.rawPath,
        reason: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  };

  const handleDirectoryPicked = (handle: FileSystemDirectoryHandle) => {
    if (!step) {
      setError('Select a configuration first');
      return;
    }
    console.log('[directory] picked', { name: handle.name, stepId: step.id });
    fsaHandleRef.current = handle;
    const picked: DirBindingStep = { ...step, source: 'fsa', dirName: handle.name };
    handleStepChange(picked);
    setError('');
    // best effort: an in-memory handle already works for this session
    if (activeId) {
      void saveDirHandle(handle, dirHandleKey(activeId, picked.id)).catch(() => { });
    }
    // auto chain: detect the mode, then scan (skipped until a password is available)
    void (async () => {
      const mode = await detectFromEntries(
        picked.id,
        () => scanDirectory(handle),
        { rawPath: handle.name, parent: '', base: handle.name },
        setError,
      );
      if (activeConfig && password) {
        await runScan({ ...picked, mode: mode ?? picked.mode });
      }
    })();
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

  /** Agent path loaded (Browse → 🖥 Load path): sets step, auto-detects the mode. */
  const handleAgentPathLoaded = async (path: string) => {
    if (!step) {
      setError('Select a configuration first');
      return;
    }
    if (!agent) {
      setError('Local agent not reachable — start encfs-agent.exe');
      return;
    }
    console.log('[directory] agent path', { path, stepId: step.id });
    const loaded: DirBindingStep = { ...step, source: 'agent', dirName: path };
    handleStepChange(loaded);
    setError('');
    const { parent, base } = splitParentPath(path);
    const mode = await detectFromEntries(
      loaded.id,
      () => agentList(agent.base, path),
      { rawPath: path, parent, base },
      setError,
    );
    // auto chain: detect the mode, then scan (skipped until a password is available)
    if (activeConfig && password) {
      await runScan({ ...loaded, mode: mode ?? loaded.mode });
    }
  };

  /** Back to the exact state of a cold start without an agent. */
  const resetToFreshStep = () => {
    const cfg = configs.find((c) => c.id === activeId);
    if (cfg) {
      const fresh = defaultStepFor(cfg);
      saveSteps(activeId, [fresh]);
      setStep(fresh);
      // Same as the mount effect on a fresh page load with this config:
      setPassword(cfg.rememberedPassword ?? '');
      setRemember(Boolean(cfg.rememberedPassword));
    } else {
      setStep(null);
      setPassword('');
      setRemember(false);
    }
    fsaHandleRef.current = null;
    setNodes([]);
    setExpanded({});
    setSelectedId(null);
    setSearch('');
    setCodec(null);
    codecKeyRef.current = '';
    setError('');
  };

  /** Leaving agent mode (shutdown or agent gone): identical to a cold start without it. */
  const enterNonAgentMode = (reason: string) => {
    console.log(`[agent] ${reason} — back to the browser picker`);
    setAgent(null);
    if (step?.source === 'agent') resetToFreshStep();
  };

  const handleStopAgent = async () => {
    if (!agent) return;
    const ok = await shutdownAgent(agent.base);
    if (!ok) {
      setError('Shutdown request failed — is the agent still running?');
      return;
    }
    enterNonAgentMode('stopped');
  };

  /**
   * Scan an explicit step — directory picks pass the fresh step (auto-chain:
   * selection → mode detection → scan); the Scan button passes the current state.
   */
  const runScan = async (scanStep: DirBindingStep | null) => {
    if (!scanStep) {
      setError('Select a folder first');
      return;
    }
    const step = scanStep;
    setScanning(true);
    setError('');
    try {
      const c = await ensureCodec();
      const viaAgent = step.source === 'agent';
      const mount = normalizeMount(step.mountPoint);
      const isChained = activeConfig ? hasChainedNameIv(activeConfig.xml) : false;
      // Chained volume with a mount point: the mount path (synthetic graft) is the
      // only root shown. Otherwise the root row is the selected directory itself,
      // its full path optionally prefixed by the mount field.
      const useGraft = isChained && mount !== '' && !viaAgent;
      const pre = await prefixNamespaces(c, mount);
      // On-disk namespace of the mount for the chained IV walk (dir mode decides
      // whether the mount must be encoded or is already plain).
      const ivBase = useGraft ? (step.mode === 'encoded' ? pre.encoded : pre.decoded) : '';

      let entries: FSEntry[];
      if (viaAgent) {
        if (!agent) throw new Error('Local agent not reachable — start encfs-agent.exe');
        entries = await agentList(agent.base, step.dirName);
      } else {
        const handle = await resolveHandle();
        if (!handle) throw new Error('Directory missing — select it again');
        entries = await scanDirectory(handle);
      }

      const tree = await buildTreeLevel(entries, c, step.mode, '', ivBase);
      let rootNodes: TreeNode[];
      if (!useGraft) {
        let names: { nameDecoded: string; nameEncoded: string };
        let prefixDec: string;
        let prefixEnc: string;
        let onDiskName: string;
        if (viaAgent) {
          // Agent path is absolute: parent part is outside the volume (kept raw in
          // both representations), only the final segment is a volume name.
          const split = splitParentPath(step.dirName);
          names = await directoryDisplayNames(c, split.base, step.mode);
          prefixDec = split.parent;
          prefixEnc = split.parent;
          onDiskName = split.base;
        } else {
          names = await directoryDisplayNames(c, step.dirName, step.mode);
          prefixDec = pre.decoded;
          prefixEnc = pre.encoded;
          onDiskName = step.dirName;
        }
        const wrapperDecoded = `${prefixDec}/${names.nameDecoded}`;
        const wrapperEncoded = `${prefixEnc}/${names.nameEncoded}`;
        const withPaths = buildFullPaths(tree, '', wrapperDecoded, wrapperEncoded);
        rootNodes = wrapDirectoryRoot(prefixIds(withPaths, step.id), {
          stepId: step.id,
          onDiskName,
          ...names,
          prefixDecoded: prefixDec,
          prefixEncoded: prefixEnc,
        });
        console.log('[scan] root row (full path)', {
          pathDecoded: wrapperDecoded,
          pathEncoded: wrapperEncoded,
          source: viaAgent ? 'agent' : 'fsa',
          mode: step.mode,
          entries: entries.length,
        });
      } else {
        rootNodes = prefixIds(buildFullPaths(tree, ivBase, pre.decoded, pre.encoded), step.id);
        console.log('[scan] mount root (chained)', {
          mountDecoded: pre.decoded,
          mountEncoded: pre.encoded,
          mode: step.mode,
          entries: entries.length,
        });
      }
      setNodes(graftSteps([{ mount: useGraft ? mount : '', nodes: rootNodes }]));
      // Keep children visible right after the scan: pre-expand the root row when present
      setExpanded(useGraft ? {} : { [`${step.id}:`]: true });
      setLoading({});
      // Fresh directory: primary = on-disk representation (matches the mode).
      persistPrimary(step.mode);
      setView('browse');
    } catch (err) {
      console.error('[scan] failed', err);
      setError(err instanceof Error ? err.message : 'Failed to scan directory');
    } finally {
      setScanning(false);
    }
  };

  const handleScanClick = () => runScan(step);

  const handleExpandNode = async (nodeId: string) => {
    const node = findNodeById(nodesRef.current, nodeId);
    if (!node || !step || node.stepId !== step.id) return;
    try {
      const c = await ensureCodec();
      const relPath = relPathOf(nodeId);
      let entries: FSEntry[];
      if (step.source === 'agent') {
        if (!agent) throw new Error('Local agent not reachable — start encfs-agent.exe');
        entries = await agentList(agent.base, joinAgentPath(step.dirName, relPath));
      } else {
        const handle = await resolveHandle();
        if (!handle) throw new Error('Directory missing — select it again');
        let target = handle;
        for (const part of relPath.split('/').filter(Boolean)) {
          target = await target.getDirectoryHandle(part);
        }
        entries = await scanDirectory(target);
      }
      const loaded = await buildTreeLevel(entries, c, step.mode, relPath, node.path);
      const withPaths = buildFullPaths(loaded, node.path, node.pathDecoded, node.pathEncoded);
      setNodes((prev) => attachChildren(prev, nodeId, prefixIds(withPaths, step.id)));
    } catch (err) {
      console.error('Failed to expand node', err);
      setError(err instanceof Error ? err.message : 'Failed to load this folder');
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
    // Reveal one more depth: expand the visible dirs that are still collapsed
    // (with the root row wrapper, level-1 dirs are children of the wrapper).
    const visible = flattenVisible(nodesRef.current, expanded);
    const dirs = visible.filter((n) => n.isDir && !expanded[n.id]);
    if (dirs.length === 0) return;
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
    persistPrimary(primary === 'encoded' ? 'decoded' : 'encoded');
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

  /**
   * Tab switch: entering Browse re-detects the local agent (it may have been
   * started/stopped meanwhile); if it no longer answers, fall back to the
   * browser picker and clear any agent-backed directory.
   */
  const handleViewChange = (next: View) => {
    setView(next);
    if (next !== 'browse') return;
    void probeAgent()
      .then((info) => {
        if (info) {
          if (!agent) {
            console.log('[agent] detected', { base: info.base || '(same origin)', roots: info.roots });
          }
          setAgent(info);
          return;
        }
        if (agent) enterNonAgentMode('no longer answering');
      })
      .catch((err) => {
        console.error('[agent] probe failed:', err);
        if (agent) enterNonAgentMode('probe error');
      });
  };

  // Keyboard navigation — kept in a ref so the listener attaches once per view.
  const kbRef = useRef({ visibleNodes, expanded, selectedId, primary, search, onToggleNode: (_id: string) => { }, setSelectedId });
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
          <a href="https://github.com/rpeyron/encfs-tree-browser" target="_blank" rel="noopener noreferrer">
        <div className="app-header-title">
            <h1>EncFS</h1>
            <span>Tree Browser</span>
        </div>
          </a>
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
        {!activeConfig || !password ? (
          <div className="app-prompt">
            {!activeConfig ? '👆 Select a configuration' : '🔑 Enter password'}
          </div>
        ) : (
          <nav className="app-tabs">
            <button
              className={`app-tab${view === 'convert' ? ' app-tab-active' : ''}`}
              onClick={() => handleViewChange('convert')}
            >
              ⚡ Convert
            </button>
            {(SUPPORTS_FSA || agent) && (
              <button
                className={`app-tab${view === 'browse' ? ' app-tab-active' : ''}`}
                onClick={() => handleViewChange('browse')}
              >
                🌳 Browse
              </button>
            )}
          </nav>
        )}
        {activeConfig && password && view === 'browse' && (
          <div className="header-dir">
            <DirectorySetup
              step={step ?? { id: crypto.randomUUID(), label: '', mode: 'encoded', mountPoint: '', dirName: '', source: 'fsa' as const }}
              agent={agent}
              onDirectory={(h) => void handleDirectoryPicked(h)}
              onAgentPath={(p) => void handleAgentPathLoaded(p)}
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
            {agent && (
              <button
                type="button"
                className="stop-agent-btn"
                onClick={() => void handleStopAgent()}
                disabled={scanning}
                title="Stop the local agent (shutdown) and switch back to the browser picker"
              >
                ⏹ Stop
              </button>
            )}
          </div>
        )}
      </header>

      <main className="app-main">

        {(!activeConfig || !password || (view == 'browse' && nodes.length === 0)) && (
          <div className="tree-grid-empty">
            <div className="tree-grid-empty-content">
              <div className="tree-grid-empty-icon">🔒</div>
              <p>No tree loaded yet</p>
              <ol className="tree-grid-empty-steps">
                <li>Select a <strong>configuration</strong> (top left)</li>
                <li>
                  {agent ? (
                    <>Browse directories via the <strong>local agent</strong>, then <strong>🔍 Scan</strong></>
                  ) : SUPPORTS_FSA ? (
                    <>Pick a <strong>directory</strong> (File System Access), then <strong>🔍 Scan</strong></>
                  ) : (
                    <>Use the <strong>⚡ Convert</strong> tab to decode file names</>
                  )}
                </li>
                {(agent || SUPPORTS_FSA) && (
                  <li>Or convert a list of names in the <strong>⚡ Convert</strong> tab</li>
                )}
              </ol>

              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-slate-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
                  <a href="https://github.com/rpeyron/encfs-tree-browser" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-indigo-600)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                    encfs-tree-browser
                  </a>
                  {' • '}
                  <a href="https://github.com/vgough/encfs" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-indigo-600)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                    encfs
                  </a>
                </div>
              </div>
            </div>

          </div>

        )}


        {activeConfig && password && view === 'convert' && (
          <BatchConvert
            getCodec={ensureCodec}
            sampleList={sampleList}
            primary={primary}
            onSwap={swapPrimary}
            sortNames={sortNames}
            onToggleSort={toggleSort}
          />
        )}

        {activeConfig && password && view === 'browse' && (
          <div className="app-display">
            {error && (
              <div className="setup-error tree-error">
                <span className="setup-error-icon">⚠</span>
                <div className="setup-error-content">
                  <p className="setup-error-message">{error}</p>
                </div>
              </div>
            )}

            {(activeConfig && password && nodes.length !== 0) &&
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
            }
          </div>
        )}       
      </main>

      {modal === 'add' && (
        <ConfigModal
          mode="add"
          config={null}
          remember={remember}
          onSave={(d) => d.xml && handleAddConfig({ name: d.name, xml: d.xml, remember: d.remember })}
          onDelete={() => { }}
          onClose={() => setModal(null)}
        />
      )}
      {
        modal === 'edit' && activeConfig && (
          <ConfigModal
            mode="edit"
            config={activeConfig}
            remember={remember}
            onSave={handleEditConfig}
            onDelete={() => handleDeleteConfig(activeConfig.id)}
            onClose={() => setModal(null)}
          />
        )
      }
    </div >
  );
}

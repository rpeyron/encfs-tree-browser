import { useState } from 'react';
import './styles/app.css';
import { ConfigUploader } from './components/ConfigUploader';
import { DirectoryPicker } from './components/DirectoryPicker';
import { ModeSelector } from './components/ModeSelector';
import { MountPointInput } from './components/MountPointInput';
import { SearchBar } from './components/SearchBar';
import { TreeGrid } from './components/TreeGrid';
import { initCodec } from './lib/encfs/name-codec';
import { scanDirectory } from './lib/fs-scanner';
import { buildTreeLevel, buildFullPaths, applyMountPoint } from './lib/tree-builder';
import type { TreeNode } from './types/index';
import type { CodecConfig } from './lib/encfs/name-codec';

type AppState = 'setup' | 'scanning' | 'display';

export function App() {
  const [state, setState] = useState<AppState>('setup');
  const [error, setError] = useState<string>('');
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [search, setSearch] = useState('');
  const [configXml, setConfigXml] = useState('');
  const [password, setPassword] = useState('');
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [mode, setMode] = useState<'encoded' | 'decoded'>('encoded');
  const [mountPoint, setMountPoint] = useState('/');
  const [codec, setCodec] = useState<CodecConfig | null>(null);

  const handleConfigLoaded = (content: string) => {
    setConfigXml(content);
    setError('');
  };

  const handleDirectorySelected = (handle: FileSystemDirectoryHandle) => {
    setDirHandle(handle);
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
      const newCodec = await initCodec(configXml, password);
      setCodec(newCodec);

      const entries = await scanDirectory(dirHandle, {
        onProgress: () => {},
      });

      const tree = await buildTreeLevel(entries, newCodec, mode);
      const withPaths = buildFullPaths(tree, '', '', '');
      const withMountPoint = applyMountPoint(withPaths, mountPoint);

      setNodes(withMountPoint);
      setState('display');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan directory');
      setState('setup');
    }
  };

  const handleExpandNode = async (nodeId: string) => {
    console.log('Expand node:', nodeId);
  };

  const filteredNodes = search
    ? filterNodes(nodes, search, mode)
    : nodes;

  const isScanning = state === 'scanning';

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-header-title">
          <h1>EncFS</h1>
          <span>Tree Browser</span>
        </div>
        <p className="app-header-subtitle">Navigate encrypted directory trees with bidirectional filename mapping</p>
      </header>

      <main className="app-main">
        {state === 'setup' && (
          <div className="app-setup">
            <div className="app-setup-container">
              <div className="app-setup-header">
                <h2>Get Started</h2>
                <p>Configure your EncFS environment in four simple steps</p>
              </div>

              <div className="app-setup-steps">
                <div className="setup-step">
                  <div className="setup-step-number">1</div>
                  <div className="setup-step-content">
                    <h3 className="setup-step-title">Upload EncFS Config</h3>
                    <ConfigUploader
                      onConfigLoaded={handleConfigLoaded}
                      onError={setError}
                      isLoading={isScanning}
                    />
                    {configXml && (
                      <div className="setup-success">
                        <span className="setup-success-icon">✓</span>
                        <span>Configuration loaded successfully</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="setup-step">
                  <div className="setup-step-number">2</div>
                  <div className="setup-step-content">
                    <h3 className="setup-step-title">Enter Password</h3>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your EncFS password"
                      className="setup-password-input"
                      disabled={isScanning}
                    />
                    <p>Your password is kept in memory only and never stored</p>
                  </div>
                </div>

                <div className="setup-step">
                  <div className="setup-step-number">3</div>
                  <div className="setup-step-content">
                    <h3 className="setup-step-title">Select Directory</h3>
                    <DirectoryPicker
                      onDirectorySelected={handleDirectorySelected}
                      onError={setError}
                      selectedPath={dirHandle?.name}
                      isLoading={isScanning}
                    />
                  </div>
                </div>

                <div className="setup-step">
                  <div className="setup-step-number">4</div>
                  <div className="setup-step-content">
                    <h3 className="setup-step-title">Configure Options</h3>
                    <div className="setup-options">
                      <ModeSelector
                        mode={mode}
                        onModeChange={setMode}
                        disabled={isScanning}
                      />
                      <MountPointInput
                        value={mountPoint}
                        onChange={setMountPoint}
                        disabled={isScanning}
                      />
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

                <button
                  onClick={handleScanClick}
                  disabled={!configXml || !password || !dirHandle || isScanning}
                  className="setup-button"
                >
                  {isScanning ? (
                    <span className="setup-button-content">
                      <span className="setup-spinner"></span>
                      Scanning directory...
                    </span>
                  ) : (
                    'Scan Directory'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {state === 'display' && (
          <div className="app-display">
            <div className="display-header">
              <div className="display-header-top">
                <div className="display-header-title">
                  <h2>File Tree</h2>
                  <p>
                    {filteredNodes.length} items
                    {search && ` (filtered from ${nodes.length})`}
                  </p>
                </div>
                <button
                  onClick={() => setState('setup')}
                  className="display-back-button"
                >
                  ← Back to Setup
                </button>
              </div>
              <SearchBar value={search} onChange={setSearch} placeholder="Search files and directories..." />
            </div>
            <div className="display-content">
              {codec && (
                <TreeGrid
                  nodes={filteredNodes}
                  mode={mode}
                  onExpandNode={handleExpandNode}
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function filterNodes(nodes: TreeNode[], search: string, mode: 'encoded' | 'decoded'): TreeNode[] {
  const lowerSearch = search.toLowerCase();

  const matches = (node: TreeNode): boolean => {
    const nameToSearch = mode === 'encoded' ? node.nameDecoded : node.nameEncoded;
    const nameMatches = nameToSearch.toLowerCase().includes(lowerSearch);
    const childMatches = node.children?.some(matches);
    return nameMatches || !!childMatches;
  };

  const filter = (node: TreeNode): TreeNode | null => {
    const nameToSearch = mode === 'encoded' ? node.nameDecoded : node.nameEncoded;
    const nameMatches = nameToSearch.toLowerCase().includes(lowerSearch);

    const filteredChildren = node.children?.map(n => filter(n)).filter(Boolean) as TreeNode[] | undefined;
    const hasMatchingChildren = (filteredChildren?.length ?? 0) > 0;

    if (nameMatches || hasMatchingChildren) {
      return { ...node, children: filteredChildren };
    }

    return null;
  };

  return nodes.map(n => filter(n)).filter(Boolean) as TreeNode[];
}

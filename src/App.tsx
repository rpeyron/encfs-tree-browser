import React, { useState } from 'react';
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

  // Config state
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
      // Initialize codec
      const newCodec = await initCodec(configXml, password);
      setCodec(newCodec);

      // Scan directory
      const entries = await scanDirectory(dirHandle, {
        onProgress: (count) => {
          // Could update progress here
        },
      });

      // Build tree
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
    // TODO: Implement lazy loading of children on expand
    console.log('Expand node:', nodeId);
  };

  const filteredNodes = search
    ? filterNodes(nodes, search, mode)
    : nodes;

  return (
    <div className="h-screen bg-white flex flex-col">
      <header className="bg-gray-50 border-b px-6 py-4">
        <h1 className="text-2xl font-bold">EncFS Tree Browser</h1>
        <p className="text-sm text-gray-600">View encrypted and decrypted filenames side-by-side</p>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden">
        {state === 'setup' && (
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-2xl space-y-6">
              <section>
                <h2 className="text-lg font-semibold mb-3">1. Upload EncFS Config</h2>
                <ConfigUploader
                  onConfigLoaded={handleConfigLoaded}
                  onError={setError}
                  isLoading={state === 'scanning'}
                />
                {configXml && <p className="text-sm text-green-600 mt-2">✓ Config loaded</p>}
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">2. Enter Password</h2>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="EncFS password"
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  disabled={state === 'scanning'}
                />
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">3. Select Directory</h2>
                <DirectoryPicker
                  onDirectorySelected={handleDirectorySelected}
                  onError={setError}
                  selectedPath={dirHandle?.name}
                  isLoading={state === 'scanning'}
                />
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-3">4. Configure</h2>
                <div className="space-y-4">
                  <ModeSelector
                    mode={mode}
                    onModeChange={setMode}
                    disabled={state === 'scanning'}
                  />
                  <MountPointInput
                    value={mountPoint}
                    onChange={setMountPoint}
                    disabled={state === 'scanning'}
                  />
                </div>
              </section>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
                  {error}
                </div>
              )}

              <button
                onClick={handleScanClick}
                disabled={!configXml || !password || !dirHandle || state === 'scanning'}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {state === 'scanning' ? 'Scanning...' : 'Scan Directory'}
              </button>
            </div>
          </div>
        )}

        {state === 'display' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="border-b px-6 py-4 space-y-2">
              <SearchBar value={search} onChange={setSearch} placeholder="Search files..." />
              <div className="flex justify-between items-center text-sm text-gray-600">
                <span>
                  {filteredNodes.length} items
                  {search && ` (filtered from ${nodes.length})`}
                </span>
                <button
                  onClick={() => setState('setup')}
                  className="px-3 py-1 text-blue-600 hover:bg-blue-50 rounded"
                >
                  Back to Setup
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
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
  return nodes.filter((node) => {
    const nameToSearch = mode === 'encoded' ? node.nameDecoded : node.nameEncoded;
    return nameToSearch.toLowerCase().includes(lowerSearch);
  });
}

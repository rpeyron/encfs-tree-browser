import { useEffect, useState } from 'react';
import type { DirBindingStep } from '../types/index';
import { agentList, joinAgentPath, type AgentInfo } from '../lib/agent-client';

interface AgentExplorerProps {
  agent: AgentInfo;
  step: DirBindingStep | null;
  /** Load the chosen directory (absolute path) through the existing agent flow. */
  onChoose: (path: string) => void;
}

const parentOf = (path: string): string => {
  const stripped = path.replace(/[/\\]+[^/\\]+$/, '');
  return stripped === path ? '' : stripped;
};

/**
 * In-page disk explorer served by the local agent: pick any directory by
 * navigating (drives → subfolders), or type any absolute/UNC path directly.
 */
export function AgentExplorer({ agent, step, onChoose }: AgentExplorerProps) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState('');
  const [draft, setDraft] = useState('');
  const [dirs, setDirs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Debounce draft changes
  useEffect(() => {
    if (!draft || draft === path) return;
    const timer = setTimeout(() => void load(draft), 800);
    return () => clearTimeout(timer);
  }, [draft]);

  const initialPath = (): string => {
    if (step?.source === 'agent' && step.dirName) {
      const parent = parentOf(step.dirName);
      if (parent) return parent;
    }
    return agent.roots[0]?.path ?? '';
  };

  const load = async (target: string) => {
    const wanted = target.trim();
    if (!wanted) return;
    setLoading(true);
    try {
      const entries = await agentList(agent.base, wanted);
      setPath(wanted);
      setDraft(wanted);
      setDirs(entries.filter((e) => e.isDir).map((e) => e.name));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot read directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load(initialPath());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parent = parentOf(path);
  const roots = agent.roots;

  return (
    <div className="agent-explorer-wrap">
      <button
        type="button"
        className="step-btn"
        onClick={() => setOpen((v) => !v)}
        title={
          step?.source === 'agent' && step.dirName
            ? step.dirName
            : 'Browse the whole disk through the local agent (any folder, incl. mounted/network)'
        }
      >
        {open
          ? '✕ Close'
          : step?.source === 'agent' && step.dirName
            ? `🖥 ${step.dirName}`
            : '📂 Browse disk…'}
      </button>

      {open && (
        <div className="agent-explorer">
          <div className="agent-explorer-bar">
            <select
              className="step-select"
              value={roots.find((r) => r.path === path)?.path ?? ''}
              onChange={(e) => e.target.value && void load(e.target.value)}
              title="Drives / mount points (label shown when the OS reports one)"
            >
              <option value="" disabled>
                🖥 Drive…
              </option>
              {roots.map((root) => (
                <option key={root.path} value={root.path}>
                  {root.label ? `${root.path} — ${root.label}` : root.path}
                </option>
              ))}
            </select>
            <input
              type="text"
              className="step-path agent-explorer-path"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void load(draft);
              }}
              placeholder="Type any path (UNC/mounts ok)"
              spellCheck={false}
            />
            <button
              type="button"
              className="step-btn"
              onClick={() => parent && void load(parent)}
              disabled={!parent || parent === path || loading}
              title="Parent directory"
            >
              ⬆
            </button>
          </div>

          <div className="agent-explorer-list">
            {loading && <div className="agent-explorer-note">Loading…</div>}
            {!loading && dirs.length === 0 && !error && (
              <div className="agent-explorer-note">No subfolders</div>
            )}
            {!loading &&
              dirs.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="agent-explorer-item"
                  onClick={() => void load(joinAgentPath(path, `/${name}`))}
                  title={`Open ${name}`}
                >
                  📁 {name}
                </button>
              ))}
          </div>

          {error && <p className="field-error">{error}</p>}

          <button
            type="button"
            className="convert-btn agent-explorer-choose"
            onClick={() => {
              if (!path) return;
              onChoose(path);
              setOpen(false);
            }}
            disabled={!path || loading}
            title="Use this directory in the tree"
          >
            ⬇ Use this directory ({path || '…'})
          </button>
        </div>
      )}
    </div>
  );
}

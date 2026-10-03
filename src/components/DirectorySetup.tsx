import type { DirBindingStep, NameMode } from '../types/index';
import { DirectoryPicker } from './DirectoryPicker';
import { AgentExplorer } from './AgentExplorer';
import type { AgentInfo } from '../lib/agent-client';

interface DirectorySetupProps {
  step: DirBindingStep;
  /** Local agent info when reachable (Rust exe or PowerShell twin). */
  agent: AgentInfo | null;
  onDirectory: (handle: FileSystemDirectoryHandle) => void;
  /** Absolute path chosen in the agent explorer. */
  onAgentPath: (path: string) => void;
  onChange: (step: DirBindingStep) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}

export function DirectorySetup({
  step,
  agent,
  onDirectory,
  onAgentPath,
  onChange,
  onError,
  disabled,
}: DirectorySetupProps) {
  const isAgent = step.source === 'agent';

  // Full path of the selected folder itself (mount prefix lives in the tree).
  const selectedPath = isAgent
    ? step.dirName
    : step.dirName
      ? `/${step.dirName}`
      : '';

  return (
    <div className="dir-bar">
      <div className="dir-bar-source">
        {agent ? (
          <AgentExplorer agent={agent} step={step} onChoose={onAgentPath} />
        ) : (
          <DirectoryPicker
            onDirectorySelected={onDirectory}
            onError={onError}
            isLoading={disabled}
            label={step.dirName ? `📁 ${selectedPath}` : '📂 Select folder…'}
            title={step.dirName ? selectedPath : 'Select the folder to display'}
          />
        )}
      </div>
      <button
        type="button"
        className="mode-toggle"
        onClick={() =>
          onChange({ ...step, mode: (step.mode === 'encoded' ? 'decoded' : 'encoded') as NameMode })
        }
        disabled={disabled}
        title="Toggle what is on disk: encoded ↔ decoded"
      >
        {step.mode === 'encoded' ? '🔒 Encoded' : '🔓 Decoded'} ⇄
      </button>
      {!isAgent && (
        <input
          type="text"
          className="step-mount"
          value={step.mountPoint}
          onChange={(e) => onChange({ ...step, mountPoint: e.target.value })}
          placeholder="/ (root)"
          disabled={disabled}
          title="Prefix in front of the tree root (decoded path). On chainedNameIV volumes with a mount set, the root shows only the mount path."
        />
      )}
    </div>
  );
}

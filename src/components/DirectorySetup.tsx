import type { DirBindingStep, NameMode } from '../types/index';
import { DirectoryPicker } from './DirectoryPicker';

interface DirectorySetupProps {
  step: DirBindingStep;
  onDirectory: (handle: FileSystemDirectoryHandle) => void;
  onChange: (step: DirBindingStep) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}

export function DirectorySetup({
  step,
  onDirectory,
  onChange,
  onError,
  disabled,
}: DirectorySetupProps) {
  // Full path of the selected folder itself (no mount prefix — that shows in the tree).
  const selectedPath = step.dirName ? `/${step.dirName}` : '';

  return (
    <div className="dir-bar">
      <div className="dir-bar-source">
        <DirectoryPicker
          onDirectorySelected={onDirectory}
          onError={onError}
          isLoading={disabled}
          label="📂 Select directory…"
          title={
            'Select a folder — in the native picker press Ctrl+L (or Alt+D) and paste\n' +
            'any path, including hidden folders.'
          }
        />
        {step.dirName ? (
          <span className="step-dirname" title={selectedPath}>📁 {selectedPath}</span>
        ) : (
          <span className="dir-bar-hint">
            Ctrl+L / Alt+D → paste any path (hidden folders too)
          </span>
        )}
      </div>
      <select
        className="step-select"
        value={step.mode}
        onChange={(e) => onChange({ ...step, mode: e.target.value as NameMode })}
        disabled={disabled}
        title="What is on disk for this directory"
      >
        <option value="encoded">🔒 Encoded</option>
        <option value="decoded">🔓 Decoded</option>
      </select>
      <input
        type="text"
        className="step-mount"
        value={step.mountPoint}
        onChange={(e) => onChange({ ...step, mountPoint: e.target.value })}
        placeholder="/ (root)"
        disabled={disabled}
        title="Prefix in front of the tree root (on-disk namespace). On chainedNameIV volumes with a mount set, the root shows only the mount path."
      />
    </div>
  );
}

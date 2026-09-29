import type { DirBindingStep, NameMode } from '../types/index';
import { DirectoryPicker } from './DirectoryPicker';

interface DirectorySetupProps {
  step: DirBindingStep;
  /** Mount point input only matters for chainedNameIV volumes. */
  chained: boolean;
  onDirectory: (handle: FileSystemDirectoryHandle) => void;
  onChange: (step: DirBindingStep) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}

export function DirectorySetup({
  step,
  chained,
  onDirectory,
  onChange,
  onError,
  disabled,
}: DirectorySetupProps) {
  return (
    <div className="dir-bar">
      <div className="dir-bar-source">
        <DirectoryPicker
          onDirectorySelected={onDirectory}
          onError={onError}
          isLoading={disabled}
          label="📂 Select directory…"
        />
        {step.dirName ? (
          <span className="step-dirname">📁 {step.dirName}</span>
        ) : (
          <span className="dir-bar-hint">pick the EncFS directory to display</span>
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
      {chained && (
        <input
          type="text"
          className="step-mount"
          value={step.mountPoint}
          onChange={(e) => onChange({ ...step, mountPoint: e.target.value })}
          placeholder="/ (root)"
          disabled={disabled}
          title="Where this directory connects in the tree (on-disk namespace)"
        />
      )}
    </div>
  );
}

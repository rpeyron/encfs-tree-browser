interface DirectoryPickerProps {
  onDirectorySelected: (handle: FileSystemDirectoryHandle) => void;
  onError: (error: string) => void;
  selectedPath?: string;
  isLoading?: boolean;
  label?: string;
  title?: string;
}

export function DirectoryPicker({
  onDirectorySelected,
  onError,
  selectedPath,
  isLoading,
  label = 'Select directory',
  title,
}: DirectoryPickerProps) {
  const handlePickDirectory = async () => {
    try {
      const handle = await window.showDirectoryPicker();
      onDirectorySelected(handle);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      onError(
        error instanceof Error
          ? error.message
          : 'Directory picker unavailable — use a listing file instead',
      );
    }
  };

  return (
    <>
      <button type="button" className="step-btn" onClick={handlePickDirectory} disabled={isLoading} title={title}>
        {label}
      </button>
      {selectedPath && <span className="step-dirname" title={selectedPath}>📁 {selectedPath}</span>}
    </>
  );
}

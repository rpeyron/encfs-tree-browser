interface DirectoryPickerProps {
  onDirectorySelected: (handle: FileSystemDirectoryHandle) => void;
  onError: (error: string) => void;
  isLoading?: boolean;
  label?: string;
  title?: string;
}

export function DirectoryPicker({
  onDirectorySelected,
  onError,
  isLoading,
  label = 'Select folder',
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
          : 'Directory picker unavailable — start the local agent or use another browser',
      );
    }
  };

  return (
    <button type="button" className="step-btn" onClick={handlePickDirectory} disabled={isLoading} title={title}>
      {label}
    </button>
  );
}

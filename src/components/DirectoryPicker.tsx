interface DirectoryPickerProps {
  onDirectorySelected: (handle: FileSystemDirectoryHandle) => void;
  onError: (error: string) => void;
  selectedPath?: string;
  isLoading?: boolean;
}

export function DirectoryPicker({
  onDirectorySelected,
  onError,
  selectedPath,
  isLoading,
}: DirectoryPickerProps) {
  const handlePickDirectory = async () => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      onDirectorySelected(dirHandle);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return; // User cancelled
      }
      onError(error instanceof Error ? error.message : 'Failed to select directory');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handlePickDirectory}
        disabled={isLoading}
        className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg font-medium shadow-sm hover:shadow-md hover:from-indigo-700 hover:to-blue-700 disabled:from-slate-400 disabled:to-slate-400 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-200"
      >
        {isLoading ? 'Scanning...' : 'Select Directory'}
      </button>
      {selectedPath && (
        <div className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
          <span className="text-lg">📁</span>
          <span className="truncate">{selectedPath}</span>
        </div>
      )}
    </div>
  );
}

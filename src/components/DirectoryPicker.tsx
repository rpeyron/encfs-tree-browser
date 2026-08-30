import React, { useState } from 'react';

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
      const dirHandle = await window.showDirectoryPicker();
      onDirectorySelected(dirHandle);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return; // User cancelled
      }
      onError(error instanceof Error ? error.message : 'Failed to select directory');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handlePickDirectory}
        disabled={isLoading}
        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
      >
        {isLoading ? 'Scanning...' : 'Select Directory'}
      </button>
      {selectedPath && <p className="text-sm text-gray-600">Selected: {selectedPath}</p>}
    </div>
  );
}

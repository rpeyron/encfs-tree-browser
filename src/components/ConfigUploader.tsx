import React, { useRef } from 'react';

interface ConfigUploaderProps {
  onConfigLoaded: (content: string) => void;
  onError: (error: string) => void;
  isLoading?: boolean;
}

export function ConfigUploader({ onConfigLoaded, onError, isLoading }: ConfigUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      onConfigLoaded(content);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to read file');
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.add('border-blue-500', 'bg-blue-50');
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      onConfigLoaded(content);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to read file');
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center transition-colors"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".xml"
        onChange={handleFileChange}
        className="hidden"
        disabled={isLoading}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isLoading}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {isLoading ? 'Loading...' : 'Upload .encfs6.xml'}
      </button>
      <p className="text-sm text-gray-600 mt-2">or drag and drop</p>
    </div>
  );
}

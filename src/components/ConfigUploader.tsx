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
      className="border-2 border-dashed border-indigo-300 rounded-lg p-8 text-center transition-all hover:border-indigo-500 hover:bg-indigo-50"
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
        className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg font-medium shadow-sm hover:shadow-md hover:from-indigo-700 hover:to-blue-700 disabled:from-slate-400 disabled:to-slate-400 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-200"
      >
        {isLoading ? 'Loading...' : 'Upload .encfs6.xml'}
      </button>
      <p className="text-sm text-slate-600 mt-3">or drag and drop your config file here</p>
    </div>
  );
}

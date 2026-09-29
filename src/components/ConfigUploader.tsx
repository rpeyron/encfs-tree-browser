import { useRef } from 'react';
import type { ChangeEvent, DragEvent } from 'react';

interface ConfigUploaderProps {
  onConfigLoaded: (content: string) => void;
  onError: (error: string) => void;
  isLoading?: boolean;
  compact?: boolean;
}

export function ConfigUploader({ onConfigLoaded, onError, isLoading, compact }: ConfigUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readFile = async (file: File) => {
    try {
      onConfigLoaded(await file.text());
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to read file');
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await readFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.remove('uploader-drop-active');
    const file = e.dataTransfer.files?.[0];
    if (file) await readFile(file);
  };

  const trigger = (
    <button
      type="button"
      className="step-btn"
      onClick={() => fileInputRef.current?.click()}
      disabled={isLoading}
    >
      {isLoading ? 'Loading…' : compact ? 'Choose .encfs6.xml' : 'Upload .encfs6.xml'}
    </button>
  );

  if (compact) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml"
          onChange={handleFileChange}
          className="hidden-input"
          disabled={isLoading}
        />
        {trigger}
      </>
    );
  }

  return (
    <div
      className="uploader-drop"
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.classList.add('uploader-drop-active');
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('uploader-drop-active');
      }}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".xml"
        onChange={handleFileChange}
        className="hidden-input"
        disabled={isLoading}
      />
      {trigger}
      <p className="uploader-hint">or drag and drop your config file here</p>
    </div>
  );
}

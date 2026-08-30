import React from 'react';

interface MountPointInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function MountPointInput({ value, onChange, disabled }: MountPointInputProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">
        Mount Point (where this directory connects in EncFS tree)
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="/ (root)"
        className="px-3 py-2 border border-gray-300 rounded disabled:opacity-50"
      />
      <p className="text-xs text-gray-600">
        Example: /Music for the Music folder, /Documents/Private for nested folders
      </p>
    </div>
  );
}

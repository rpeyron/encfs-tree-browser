import React from 'react';

interface ModeInputProps {
  mode: 'encoded' | 'decoded';
  onModeChange: (mode: 'encoded' | 'decoded') => void;
  disabled?: boolean;
}

export function ModeSelector({ mode, onModeChange, disabled }: ModeInputProps) {
  return (
    <div className="flex items-center gap-4">
      <label>
        <input
          type="radio"
          name="mode"
          value="encoded"
          checked={mode === 'encoded'}
          onChange={(e) => onModeChange(e.target.value as 'encoded' | 'decoded')}
          disabled={disabled}
          className="mr-2"
        />
        Directory is encoded (encrypted names)
      </label>
      <label>
        <input
          type="radio"
          name="mode"
          value="decoded"
          checked={mode === 'decoded'}
          onChange={(e) => onModeChange(e.target.value as 'encoded' | 'decoded')}
          disabled={disabled}
          className="mr-2"
        />
        Directory is decoded (plain names)
      </label>
    </div>
  );
}

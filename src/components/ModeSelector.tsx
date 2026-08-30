interface ModeInputProps {
  mode: 'encoded' | 'decoded';
  onModeChange: (mode: 'encoded' | 'decoded') => void;
  disabled?: boolean;
}

export function ModeSelector({ mode, onModeChange, disabled }: ModeInputProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-slate-700">Display mode</p>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-colors">
          <input
            type="radio"
            name="mode"
            value="encoded"
            checked={mode === 'encoded'}
            onChange={(e) => onModeChange(e.target.value as 'encoded' | 'decoded')}
            disabled={disabled}
            className="w-4 h-4 text-indigo-600 cursor-pointer disabled:cursor-not-allowed"
          />
          <span className="text-slate-700">Directory is encoded (encrypted names)</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-colors">
          <input
            type="radio"
            name="mode"
            value="decoded"
            checked={mode === 'decoded'}
            onChange={(e) => onModeChange(e.target.value as 'encoded' | 'decoded')}
            disabled={disabled}
            className="w-4 h-4 text-indigo-600 cursor-pointer disabled:cursor-not-allowed"
          />
          <span className="text-slate-700">Directory is decoded (plain names)</span>
        </label>
      </div>
    </div>
  );
}

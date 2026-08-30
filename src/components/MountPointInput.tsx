interface MountPointInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function MountPointInput({ value, onChange, disabled }: MountPointInputProps) {
  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-medium text-slate-700">
        Mount Point
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="/ (root)"
        className="px-4 py-3 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50 disabled:cursor-not-allowed"
      />
      <p className="text-xs text-slate-600">
        Where this directory connects in the EncFS tree. Example: /Music or /Documents/Private
      </p>
    </div>
  );
}

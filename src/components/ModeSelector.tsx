interface ModeInputProps {
  mode: 'encoded' | 'decoded';
  onModeChange: (mode: 'encoded' | 'decoded') => void;
  disabled?: boolean;
}


export function ModeSelector({ mode, onModeChange, disabled }: ModeInputProps) {
  const options: Array<{ value: 'encoded' | 'decoded'; title: string; desc: string; icon: string }> = [
    { value: 'encoded', title: 'Encoded', desc: 'Encrypted names', icon: '🔒' },
    { value: 'decoded', title: 'Decoded', desc: 'Plain names', icon: '🔓' },
  ];

  return (
    <div className="mode-selector">
      <p className="mode-selector-label">Directory layout</p>
      <div className="mode-selector-options">
        {options.map(opt => {
          const active = mode === opt.value;
          return (
            <label
              key={opt.value}
              className={`mode-card${active ? ' mode-card-active' : ''}`}
            >
              <input
                type="radio"
                name="mode"
                value={opt.value}
                checked={active}
                onChange={() => onModeChange(opt.value)}
                disabled={disabled}
                className="mode-card-input"
              />
              <span className="mode-card-icon">{opt.icon}</span>
              <span className="mode-card-body">
                <span className="mode-card-title">{opt.title}</span>
                <span className="mode-card-desc">{opt.desc}</span>
              </span>
              <span className="mode-card-check">{active ? '✓' : ''}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
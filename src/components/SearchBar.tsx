interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search files...',
  disabled,
}: SearchBarProps) {
  return (
    <div className="search-bar">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="search-input"
      />
      {value && (
        <button className="search-clear" onClick={() => onChange('')} title="Clear">
          ×
        </button>
      )}
    </div>
  );
}

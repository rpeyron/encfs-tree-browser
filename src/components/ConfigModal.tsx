import { useEffect, useState } from 'react';
import type { EncfsConfiguration } from '../types/index';
import { ConfigUploader } from './ConfigUploader';

interface ConfigModalProps {
  mode: 'add' | 'edit';
  config: EncfsConfiguration | null;
  remember: boolean;
  onSave: (data: { name: string; xml: string | null; remember: boolean }) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ConfigModal({ mode, config, remember, onSave, onDelete, onClose }: ConfigModalProps) {
  const [name, setName] = useState(config?.name ?? '');
  const [xml, setXml] = useState<string | null>(null);
  const [rememberBox, setRememberBox] = useState(remember);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = () => {
    if (!name.trim()) {
      setError('A name is required');
      return;
    }
    if (mode === 'add' && !xml) {
      setError('A .encfs6.xml file is required');
      return;
    }
    onSave({ name: name.trim(), xml, remember: rememberBox });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'add' ? 'Add configuration' : 'Edit configuration'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 className="modal-title">
            {mode === 'add' ? '➕ Add configuration' : '✏️ Edit configuration'}
          </h3>
          <button className="icon-btn" onClick={onClose} title="Close">✕</button>
        </div>

        <label className="modal-field">
          <span>Name</span>
          <input
            type="text"
            className="modal-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My volume"
            autoFocus
          />
        </label>

        <div className="modal-field">
          <span>.encfs6.xml {mode === 'edit' && '(leave unchanged to keep current)'}</span>
          <div className="modal-xml">
            <ConfigUploader compact onConfigLoaded={setXml} onError={setError} />
            {xml && <span className="config-xml-ok">✓ new xml loaded</span>}
            {!xml && mode === 'edit' && config && (
              <span className="modal-xml-current">current config kept</span>
            )}
          </div>
        </div>

        <label className="modal-remember" title="Store the password in localStorage (cleartext) for this configuration">
          <input
            type="checkbox"
            checked={rememberBox}
            onChange={(e) => setRememberBox(e.target.checked)}
          />
          Remember password
        </label>

        {error && <p className="field-error">{error}</p>}

        <div className="modal-actions">
          {mode === 'edit' && config && (
            <button className="step-btn danger modal-delete" onClick={onDelete}>
              🗑 Delete
            </button>
          )}
          <div className="modal-actions-right">
            <button className="step-btn" onClick={onClose}>Cancel</button>
            <button className="convert-btn" onClick={save}>💾 Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

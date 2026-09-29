import type { AppPrefs, DirBindingStep, EncfsConfiguration, NameMode } from '../types/index';

export const KEYS = {
  configs: 'encfs-tree-configs',
  activeId: 'encfs-tree-active-config',
  prefs: 'encfs-tree-prefs',
  steps: (configId: string) => `encfs-tree-steps:${configId}`,
  legacy: 'encfs-tree-config',
} as const;

export const BUILTIN_IDS = ['builtin-direct-nochain', 'builtin-direct-chain'] as const;

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function readJson<T>(key: string, store?: Storage): T | null {
  const s = store ?? storage();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown, store?: Storage): void {
  const s = store ?? storage();
  if (!s) return;
  s.setItem(key, JSON.stringify(value));
}

/** Drop the remembered password unless the user opted in on save. */
export function sanitizeForStorage(cfg: EncfsConfiguration, remember: boolean): EncfsConfiguration {
  if (remember) return cfg;
  const { rememberedPassword: _omitted, ...rest } = cfg;
  return rest;
}

export function loadConfigs(store?: Storage): EncfsConfiguration[] {
  return readJson<EncfsConfiguration[]>(KEYS.configs, store) ?? [];
}

export function saveConfigs(configs: EncfsConfiguration[], store?: Storage): void {
  writeJson(KEYS.configs, configs, store);
}

export function loadActiveId(store?: Storage): string | null {
  const s = store ?? storage();
  return s?.getItem(KEYS.activeId) ?? null;
}

export function saveActiveId(id: string, store?: Storage): void {
  const s = store ?? storage();
  s?.setItem(KEYS.activeId, id);
}

export function loadPrefs(store?: Storage): AppPrefs {
  return readJson<AppPrefs>(KEYS.prefs, store) ?? {};
}

export function savePrefs(prefs: AppPrefs, store?: Storage): void {
  writeJson(KEYS.prefs, prefs, store);
}

export function loadSteps(configId: string, store?: Storage): DirBindingStep[] {
  return readJson<DirBindingStep[]>(KEYS.steps(configId), store) ?? [];
}

export function saveSteps(configId: string, steps: DirBindingStep[], store?: Storage): void {
  writeJson(KEYS.steps(configId), steps, store);
}

export function deleteConfig(id: string, store?: Storage): void {
  saveConfigs(loadConfigs(store).filter(c => c.id !== id), store);
  const s = store ?? storage();
  s?.removeItem(KEYS.steps(id));
  if (loadActiveId(store) === id) s?.removeItem(KEYS.activeId);
}

interface LegacyConfig {
  configXml?: string;
  mode?: NameMode;
  mountPoint?: string;
  dirName?: string;
}

/**
 * Fold the pre-rework single-config key into the new store (once), so early
 * users keep their uploaded xml. Returns the migrated config id, or null.
 */
export function migrateLegacy(store?: Storage): string | null {
  const legacy = readJson<LegacyConfig>(KEYS.legacy, store);
  if (!legacy?.configXml) return null;
  const s = store ?? storage();
  s?.removeItem(KEYS.legacy);
  if (loadConfigs(store).length > 0) return null;

  const config: EncfsConfiguration = {
    id: crypto.randomUUID(),
    name: 'Migrated config',
    xml: legacy.configXml,
    source: 'user',
  };
  saveConfigs([config], store);
  const step: DirBindingStep = {
    id: crypto.randomUUID(),
    label: legacy.dirName || 'Directory',
    mountPoint: legacy.mountPoint || '/',
    mode: legacy.mode ?? 'encoded',
    dirName: legacy.dirName ?? '',
  };
  saveSteps(config.id, [step], store);
  saveActiveId(config.id, store);
  return config.id;
}

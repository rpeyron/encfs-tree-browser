import { describe, it, expect } from 'vitest';
import {
  KEYS,
  sanitizeForStorage,
  loadConfigs,
  saveConfigs,
  loadActiveId,
  saveActiveId,
  loadSteps,
  saveSteps,
  deleteConfig,
  migrateLegacy,
} from '../../src/lib/config-store';
import type { DirBindingStep, EncfsConfiguration } from '../../src/types/index';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

const cfg = (overrides: Partial<EncfsConfiguration> = {}): EncfsConfiguration => ({
  id: 'cfg-1',
  name: 'My volume',
  xml: '<boost_serialization/>',
  source: 'user',
  ...overrides,
});

const step = (overrides: Partial<DirBindingStep> = {}): DirBindingStep => ({
  id: 'step-1',
  label: 'Data',
  mountPoint: '/',
  mode: 'encoded',
  dirName: 'data',
  ...overrides,
});

describe('sanitizeForStorage', () => {
  it('strips the remembered password unless opted in', () => {
    const withPwd = cfg({ rememberedPassword: 'secret' });
    expect(sanitizeForStorage(withPwd, false)).not.toHaveProperty('rememberedPassword');
    expect(sanitizeForStorage(withPwd, true).rememberedPassword).toBe('secret');
  });
});

describe('config & steps store', () => {
  it('round-trips configs and per-config steps', () => {
    const store = new MemoryStorage();
    saveConfigs([cfg()], store);
    expect(loadConfigs(store)).toEqual([cfg()]);

    saveSteps('cfg-1', [step()], store);
    expect(loadSteps('cfg-1', store)).toEqual([step()]);
    expect(loadSteps('other', store)).toEqual([]);
  });

  it('persists and clears the active id', () => {
    const store = new MemoryStorage();
    saveActiveId('cfg-1', store);
    expect(loadActiveId(store)).toBe('cfg-1');
    store.removeItem(KEYS.activeId);
    expect(loadActiveId(store)).toBeNull();
  });

  it('deleteConfig removes the config, its steps and the active id', () => {
    const store = new MemoryStorage();
    saveConfigs([cfg(), cfg({ id: 'cfg-2', name: 'Other' })], store);
    saveSteps('cfg-1', [step()], store);
    saveActiveId('cfg-1', store);

    deleteConfig('cfg-1', store);
    expect(loadConfigs(store).map((c) => c.id)).toEqual(['cfg-2']);
    expect(loadSteps('cfg-1', store)).toEqual([]);
    expect(loadActiveId(store)).toBeNull();
  });
});

describe('migrateLegacy', () => {
  it('folds the old single-config key into config + one step', () => {
    const store = new MemoryStorage();
    store.setItem(
      KEYS.legacy,
      JSON.stringify({ configXml: '<xml/>', mode: 'decoded', mountPoint: '/Music', dirName: 'enc' }),
    );

    const id = migrateLegacy(store);
    expect(id).toBeTruthy();
    expect(store.getItem(KEYS.legacy)).toBeNull();

    const configs = loadConfigs(store);
    expect(configs).toHaveLength(1);
    expect(configs[0].xml).toBe('<xml/>');
    const steps = loadSteps(id!, store);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ mode: 'decoded', mountPoint: '/Music', dirName: 'enc' });
    expect(loadActiveId(store)).toBe(id);
  });

  it('is a no-op when nothing was migrated before', () => {
    const store = new MemoryStorage();
    expect(migrateLegacy(store)).toBeNull();
    expect(loadConfigs(store)).toEqual([]);
  });
});

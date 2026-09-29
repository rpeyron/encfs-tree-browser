import nochainXml from '../assets/configs/direct-nochain.encfs6.xml?raw';
import chainXml from '../assets/configs/direct-chain.encfs6.xml?raw';
import nochainSamples from '../assets/configs/direct-nochain.samples.txt?raw';
import chainSamples from '../assets/configs/direct-chain.samples.txt?raw';
import nochainSamplesEncoded from '../assets/configs/direct-nochain.samples-encoded.txt?raw';
import chainSamplesEncoded from '../assets/configs/direct-chain.samples-encoded.txt?raw';
import type { DirBindingStep, EncfsConfiguration } from '../types/index';

/**
 * Drop `conf/xxxx.encfs6.xml` files at the project root: each one becomes a
 * built-in configuration named `xxxx` (conf/ is gitignored).
 */
const confFiles = import.meta.glob('../../conf/*.encfs6.xml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const confConfigs: EncfsConfiguration[] = Object.entries(confFiles)
  .map(([path, xml]) => {
    const fileName = path.split('/').pop() ?? path;
    const name = fileName.replace(/\.encfs6\.xml$/, '');
    return {
      id: `builtin-conf-${name}`,
      name,
      xml,
      source: 'builtin' as const,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

/** Bundled sample volumes (EncFS 1.9.5 fixtures, password: test). */
const SAMPLE_CONFIGS: EncfsConfiguration[] = [
  {
    id: 'builtin-direct-nochain',
    name: 'Sample: direct-nochain',
    xml: nochainXml,
    source: 'builtin',
    rememberedPassword: 'test',
  },
  {
    id: 'builtin-direct-chain',
    name: 'Sample: direct-chain (chained IV)',
    xml: chainXml,
    source: 'builtin',
    rememberedPassword: 'test',
  },
];

/** conf/ dropped configs first, then fixtures samples — both after user configs in the dropdown. */
export const BUILTIN_CONFIGS: EncfsConfiguration[] = [...confConfigs, ...SAMPLE_CONFIGS];

/** Sample path lists shipped with the built-ins, loadable in the Convert tab (per direction). */
export const BUILTIN_SAMPLES: Record<string, { decoded: string; encoded: string }> = {
  'builtin-direct-nochain': { decoded: nochainSamples, encoded: nochainSamplesEncoded },
  'builtin-direct-chain': { decoded: chainSamples, encoded: chainSamplesEncoded },
};

/** The directory setup a config starts with: an empty directory to pick. */
export function defaultStepFor(_config: EncfsConfiguration): DirBindingStep {
  return {
    id: crypto.randomUUID(),
    label: 'Directory',
    mountPoint: '/',
    mode: 'encoded',
    dirName: '',
  };
}

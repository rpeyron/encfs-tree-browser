import type { EncfsNameCodec } from 'encfs-filename-codec';
import type { NameMode } from '../types/index';

const SAMPLE_SIZE = 24;
const ENCODED_RATIO = 0.6;
const utf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Guess whether root-level names are EncFS-encoded: try to decode each name and
 * require a faithful re-encode round-trip (garbage plaintext or a bad MAC fails).
 * Returns null when there is nothing to judge.
 */
export async function detectNameMode(
  codec: EncfsNameCodec,
  names: string[],
): Promise<NameMode | null> {
  const sample = names.filter(Boolean).slice(0, SAMPLE_SIZE);
  if (sample.length === 0) return null;

  let ok = 0;
  for (const name of sample) {
    try {
      const { plaintext } = await codec.decryptName(name, 0n);
      const text = utf8.decode(plaintext);
      if ((await codec.encryptName(text, 0n)).encodedName === name) ok += 1;
    } catch {
      // not decodable as an encoded name
    }
  }
  return ok / sample.length >= ENCODED_RATIO ? 'encoded' : 'decoded';
}

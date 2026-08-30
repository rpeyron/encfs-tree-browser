import type { EncFSConfig } from '../types/index';

export function parseEncfsConfig(xmlContent: string): EncFSConfig {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'application/xml');

  if (doc.documentElement.nodeName === 'parsererror') {
    throw new Error('Invalid XML format');
  }

  const root = doc.documentElement;

  const algorithm = root.querySelector('algorithm')?.getAttribute('name') || '';
  const keySize = parseInt(root.querySelector('keySize')?.textContent || '0', 10);
  const blockSize = parseInt(root.querySelector('blockSize')?.textContent || '0', 10);
  const nameAlgorithm = root.querySelector('nameAlgorithm')?.getAttribute('name') || '';
  const iv = root.querySelector('iv')?.textContent || '';
  const key = root.querySelector('key')?.getAttribute('content') || '';

  if (!algorithm || !keySize || !blockSize) {
    throw new Error('Missing required EncFS config parameters');
  }

  return {
    algorithm,
    keySize,
    blockSize,
    nameAlg: (nameAlgorithm === 'Block' || nameAlgorithm === 'Stream' || nameAlgorithm === 'Null')
      ? nameAlgorithm
      : 'Block',
    iv,
    key,
  };
}

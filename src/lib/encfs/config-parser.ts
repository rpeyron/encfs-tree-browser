import type { EncFSConfig } from '../../types/index';

export function parseEncfsConfig(xmlContent: string): EncFSConfig {
  // Validate basic XML structure
  if (!xmlContent.includes('<EncFS>') || !xmlContent.includes('</EncFS>')) {
    throw new Error('Invalid XML format');
  }

  const getTextContent = (tag: string): string => {
    const match = xmlContent.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
    return match ? match[1] : '';
  };

  const getAttribute = (tag: string, attr: string): string => {
    const match = xmlContent.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*>`));
    return match ? match[1] : '';
  };

  const algorithm = getAttribute('algorithm', 'name');
  const keySize = parseInt(getTextContent('keySize'), 10);
  const blockSize = parseInt(getTextContent('blockSize'), 10);
  const nameAlgorithm = getAttribute('nameAlgorithm', 'name');
  const iv = getTextContent('iv');
  const key = getAttribute('key', 'content');

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

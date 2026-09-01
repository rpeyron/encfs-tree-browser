import type { EncFSConfig } from '../../types/index';

export function parseEncfsConfig(xmlContent: string): EncFSConfig {
  if (xmlContent.includes('boost_serialization')) {
    return parseBoostSerializationFormat(xmlContent);
  } else if (xmlContent.includes('EncFS')) {
    return parseSimplifiedFormat(xmlContent);
  }
  throw new Error('Invalid XML format');
}

function parseBoostSerializationFormat(xmlContent: string): EncFSConfig {
  const getTextContent = (tag: string): string => {
    const regex = new RegExp(`<${tag}[^>]*>\\s*([\\s\\S]*?)\\s*</${tag}>`, 'i');
    const match = xmlContent.match(regex);
    return match ? match[1].trim() : '';
  };

  const getNestedTextContent = (parent: string, child: string): string => {
    const regex = new RegExp(`<${parent}[^>]*>[\\s\\S]*?<${child}[^>]*>\\s*([\\s\\S]*?)\\s*</${child}>`, 'i');
    const match = xmlContent.match(regex);
    return match ? match[1].trim() : '';
  };

  const cipherAlg = getNestedTextContent('cipherAlg', 'name');
  const nameAlg = getNestedTextContent('nameAlg', 'name');
  const keySize = parseInt(getTextContent('keySize'), 10);
  const blockSize = parseInt(getTextContent('blockSize'), 10);
  const ivLength = parseInt(getTextContent('ivLength'), 10) || 16;
  const saltData = getTextContent('saltData');
  const encodedKeyData = getTextContent('encodedKeyData');
  const kdfIterations = parseInt(getTextContent('kdfIterations'), 10) || 16;

  if (!cipherAlg || !keySize || !blockSize || !saltData || !encodedKeyData) {
    throw new Error('Missing required EncFS config parameters');
  }

  let algorithm = 'aes-256-cbc';
  if (keySize === 256) algorithm = 'aes-256-cbc';
  else if (keySize === 192) algorithm = 'aes-192-cbc';

  let nameAlgorithm: 'Block' | 'Stream' | 'Null' = 'Block';
  if (nameAlg.toLowerCase().includes('stream')) nameAlgorithm = 'Stream';
  else if (nameAlg.toLowerCase().includes('null')) nameAlgorithm = 'Null';

  return {
    algorithm,
    keySize,
    blockSize,
    nameAlg: nameAlgorithm,
    iv: '',
    key: encodedKeyData,
    salt: saltData,
    ivLength,
    kdfIterations,
    encodedKeyData,
  };
}

function parseSimplifiedFormat(xmlContent: string): EncFSConfig {
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
    ivLength: 16,
    key,
    salt: '',
    kdfIterations: 16,
  };
}

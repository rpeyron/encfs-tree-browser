// EncFS configuration types
export interface EncFSConfig {
  algorithm: string;
  keySize: number;
  blockSize: number;
  nameAlg: 'Block' | 'Stream' | 'Null';
  iv: string;
  key: string;
  salt: string;
  kdfIterations: number;
}

// File tree node
export interface TreeNode {
  id: string;
  name: string;
  nameEncoded: string;
  nameDecoded: string;
  path: string;
  pathEncoded: string;
  pathDecoded: string;
  size: number;
  mtime: number;
  isDir: boolean;
  children?: TreeNode[];
  isLoaded?: boolean;
  error?: string;
}

// Scan result
export interface ScanResult {
  nodes: TreeNode[];
  totalFiles: number;
  totalDirs: number;
  totalSize: number;
  errors: Array<{ path: string; error: string }>;
}


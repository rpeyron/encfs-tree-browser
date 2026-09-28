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
}

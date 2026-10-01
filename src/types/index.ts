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
  /** Owning directory step (multi-directory sessions); absent on synthetic mount folders until grafted */
  stepId?: string;
  /** Root row for the selected directory: full path, no icon, no toggle, always open. */
  rootDirectory?: boolean;
}

export type NameMode = 'encoded' | 'decoded';

/** Dropdown entity: EncFS crypto only (one xml + one password). */
export interface EncfsConfiguration {
  id: string;
  name: string;
  xml: string;
  source: 'builtin' | 'user';
  /** Present only when the user opted in to remember it (cleartext, localStorage). */
  rememberedPassword?: string;
}

/** Directory attachment point — separate from EncfsConfiguration, persisted per config id. */
export interface DirBindingStep {
  id: string;
  label: string;
  /** Where this directory connects in the tree ('/' = root). Expressed in the directory's on-disk namespace. */
  mountPoint: string;
  /** What is on disk for this directory. */
  mode: NameMode;
  dirName: string;
}

export interface AppPrefs {
  displayPrimary?: NameMode;
  sortNames?: boolean;
}

export interface ConvertRow {
  input: string;
  output: string | null;
  error?: string;
}

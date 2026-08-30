// Scan local directory using File System Access API

export interface FSEntry {
  name: string;
  isDir: boolean;
  size: number;
  mtime: number;
}

export interface ScanOptions {
  maxDepth?: number;
  onProgress?: (count: number) => void;
}

export async function scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
  options: ScanOptions = {}
): Promise<FSEntry[]> {
  const entries: FSEntry[] = [];
  const { onProgress } = options;

  for await (const [name, handle] of dirHandle.entries()) {
    try {
      if (handle.kind === 'directory') {
        entries.push({
          name,
          isDir: true,
          size: 0,
          mtime: 0,
        });
      } else {
        const file = await (handle as FileSystemFileHandle).getFile();
        entries.push({
          name,
          isDir: false,
          size: file.size,
          mtime: file.lastModified,
        });
      }

      onProgress?.(entries.length);
    } catch (error) {
      // Skip entries we can't access (permission denied, etc.)
      console.warn(`Failed to read entry: ${name}`, error);
    }
  }

  return entries;
}

export async function scanDirectoryRecursive(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string = '',
  options: ScanOptions = {}
): Promise<Map<string, FSEntry[]>> {
  const result = new Map<string, FSEntry[]>();
  const { maxDepth = Infinity, onProgress } = options;

  const scan = async (handle: FileSystemDirectoryHandle, path: string, depth: number) => {
    if (depth > maxDepth) return;

    const entries = await scanDirectory(handle, { onProgress });
    result.set(path || '/', entries);

    for (const entry of entries) {
      if (entry.isDir && depth < maxDepth) {
        try {
          const childHandle = await handle.getDirectoryHandle(entry.name);
          const childPath = path ? `${path}/${entry.name}` : entry.name;
          await scan(childHandle, childPath, depth + 1);
        } catch (error) {
          console.warn(`Failed to scan subdirectory: ${entry.name}`, error);
        }
      }
    }
  };

  await scan(dirHandle, basePath, 0);
  return result;
}

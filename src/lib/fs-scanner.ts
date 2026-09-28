// Scan local directory using File System Access API

export interface FSEntry {
  name: string;
  isDir: boolean;
  size: number;
  mtime: number;
}

export async function scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
): Promise<FSEntry[]> {
  const entries: FSEntry[] = [];

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
    } catch (error) {
      // Skip entries we can't access (permission denied, etc.)
      console.warn(`Failed to read entry: ${name}`, error);
    }
  }

  return entries;
}

// Persist FileSystemDirectoryHandle via IndexedDB
const LEGACY_KEY = 'dir';

export const dirHandleKey = (configId: string, stepId: string): string =>
  `dir:${configId}:${stepId}`;

export function saveDirHandle(handle: FileSystemDirectoryHandle, key: string = LEGACY_KEY): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('encfs-db', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('handles');
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('handles', 'readwrite');
      try {
        tx.objectStore('handles').put(handle, key);
      } catch (err) {
        db.close();
        reject(err);
        return;
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

export function loadDirHandle(key: string = LEGACY_KEY): Promise<FileSystemDirectoryHandle | null> {
  return new Promise(resolve => {
    const request = indexedDB.open('encfs-db', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('handles');
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('handles', 'readonly');
      const getReq = tx.objectStore('handles').get(key);
      getReq.onsuccess = async () => {
        const handle = getReq.result as FileSystemDirectoryHandle | undefined;
        if (handle) {
          const withPerm = handle as FileSystemDirectoryHandle & {
            requestPermission?: (desc: { mode: 'read' }) => Promise<PermissionState>;
          };
          const result = withPerm.requestPermission
            ? await withPerm.requestPermission({ mode: 'read' })
            : 'granted';
          resolve(result === 'granted' ? handle : null);
        } else {
          resolve(null);
        }
        db.close();
      };
      getReq.onerror = () => resolve(null);
    };
    request.onerror = () => resolve(null);
  });
}

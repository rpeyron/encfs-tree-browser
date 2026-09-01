// Persist FileSystemDirectoryHandle via IndexedDB
export function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('encfs-db', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('handles');
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, 'dir');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

export function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  return new Promise(resolve => {
    const request = indexedDB.open('encfs-db', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('handles');
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('handles', 'readonly');
      const getReq = tx.objectStore('handles').get('dir');
      getReq.onsuccess = async () => {
        const handle = getReq.result as FileSystemDirectoryHandle;
        if (handle) {
          // request permission if needed
          const perm = (handle as any).requestPermission?.({ mode: 'read' });
          if (perm) {
            const result = await perm;
            resolve(result === 'granted' ? handle : null);
          } else {
            resolve(handle);
          }
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

import { type Project, validateProject } from './model';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('apartment-studio', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('projects');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error)
  })
}
export async function saveProject(p: Project) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put(p, 'current');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
export async function loadProject(): Promise<Project | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction('projects').objectStore('projects').get('current');
      req.onsuccess = () => {
        try {
          resolve(req.result ? validateProject(req.result) : null)
        } catch (e) {
          reject(e)
        }
      };
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}
export async function importPhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type))
    throw Error('Выберите JPEG, PNG или WebP.');
  if (file.size > 15 * 1024 * 1024)
    throw Error('Фото должно быть меньше 15 МБ.');
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw Error('Не удалось прочитать фото. Выберите исправный файл JPEG, PNG или WebP.');
  }
  if (bmp.width * bmp.height > 80_000_000) {
    bmp.close();
    throw Error('Слишком большое разрешение фото.');
  }
  const ratio = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * ratio);
  canvas.height = Math.round(bmp.height * ratio);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL('image/jpeg', .86)
}

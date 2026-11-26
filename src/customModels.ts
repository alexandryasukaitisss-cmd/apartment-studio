import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { id } from './model';

const DB_NAME = 'apartment-studio-glb-v1';
const STORE_NAME = 'models';
const MAX_MODEL_BYTES = 15 * 1024 * 1024;
const memoryFallback = new Map<string, ArrayBuffer>();

function openModelDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveCustomModel(file: File): Promise<{ assetId: string; name: string; bytes: number }> {
  if (!/\.(glb|gltf)$/i.test(file.name)) {
    throw Error('Поддерживаются только 3D-модели в формате .glb или .gltf.');
  }
  if (file.size <= 0 || file.size > MAX_MODEL_BYTES) {
    throw Error('Размер 3D-модели должен быть до 15 МБ.');
  }
  const buffer = await file.arrayBuffer();
  const assetId = `glb-${id()}`;
  memoryFallback.set(assetId, buffer);
  const db = await openModelDb();
  if (db) {
    await new Promise<void>(resolve => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(buffer, assetId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
  return { assetId, name: file.name.replace(/\.(glb|gltf)$/i, '').slice(0, 60), bytes: file.size };
}

export async function loadCustomModelBuffer(assetId: string): Promise<ArrayBuffer | null> {
  const cached = memoryFallback.get(assetId);
  if (cached) return cached;
  const db = await openModelDb();
  if (!db) return null;
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(assetId);
    req.onsuccess = () => {
      const buf = req.result instanceof ArrayBuffer ? req.result : null;
      if (buf) memoryFallback.set(assetId, buf);
      resolve(buf);
    };
    req.onerror = () => resolve(null);
  });
}

export function attachCustomGlbToFurnitureGroup(
  container: THREE.Group,
  assetId: string,
  furnitureId: string,
  roomId: string,
  width: number,
  height: number,
  depth: number,
  elevation: number,
  onLoaded?: () => void,
): { cancel: () => void } {
  let cancelled = false;
  void loadCustomModelBuffer(assetId).then(buffer => {
    if (cancelled || !buffer) return;
    const loader = new GLTFLoader();
    loader.parse(buffer.slice(0), '', gltf => {
      if (cancelled) return;
      const model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model, true);
      const size = bounds.getSize(new THREE.Vector3());
      if (size.x < 1e-5 || size.y < 1e-5 || size.z < 1e-5) return;
      const center = bounds.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -bounds.min.y, -center.z);
      const normalized = new THREE.Group();
      normalized.add(model);
      normalized.scale.set(width / size.x, height / size.y, depth / size.z);
      normalized.position.y = elevation;
      normalized.traverse(o => {
        o.userData.furnitureId = furnitureId;
        o.userData.roomId = roomId;
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      // Replace fallback placeholder children safely.
      for (const child of [...container.children]) {
        container.remove(child);
      }
      container.add(normalized);
      onLoaded?.();
    }, () => {
      // Keep fallback envelope if GLB fails to parse.
    });
  });
  return { cancel: () => { cancelled = true; } };
}

import * as THREE from 'three';
import type { Material } from './model';

// Keep generated previews bounded during repeated colour/size editing. Each
// renderer texture remains owned and disposed by the Scene that requested it.
const cache = new Map<string, string>();
const bumpCache = new Map<string, string>();

export function materialImage(m: Material): string {
  if (m.image) return m.image;
  const key = `${m.pattern}:${m.color}:${m.width}:${m.height}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  const aspect = m.width / m.height;
  canvas.width = Math.max(64, Math.round(aspect < 1 ? 512 * aspect : 512));
  canvas.height = Math.max(64, Math.round(aspect < 1 ? 512 : 512 / aspect));
  const ctx = canvas.getContext('2d')!, w = canvas.width, h = canvas.height;
  ctx.fillStyle = m.color;
  ctx.fillRect(0, 0, w, h);
  let seed = 127;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const edges = (jointMetres: number, color: string) => {
    const x = w * jointMetres / m.width / 2, y = h * jointMetres / m.height / 2;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, x, h); ctx.fillRect(w - x, 0, x, h);
    ctx.fillRect(0, 0, w, y); ctx.fillRect(0, h - y, w, y);
  };
  if (m.pattern === 'wood') {
    for (let i = 0; i < 220; i++) {
      const x = rand() * w, phase = rand() * Math.PI * 2, amplitude = w * (.006 + rand() * .02);
      ctx.strokeStyle = `rgba(${rand() > .52 ? '48,35,21' : '255,249,237'},${.018 + rand() * .052})`;
      ctx.lineWidth = .25 + rand() * .55;
      ctx.beginPath();
      for (let j = 0; j <= 40; j++) {
        const t = j / 40, px = x + Math.sin(t * Math.PI * 2 + phase) * amplitude +
          Math.sin(t * Math.PI * 4 + phase) * amplitude * .25;
        if (j === 0) ctx.moveTo(px, 0); else ctx.lineTo(px, t * h);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = `rgba(${i % 2 ? '255,249,237' : '48,35,21'},${rand() * .025})`;
      ctx.fillRect(rand() * w, rand() * h, .35 + rand() * .55, 1 + rand() * 4);
    }
    edges(.0007, 'rgba(48,35,21,.20)');
  } else if (m.pattern === 'stone' || m.pattern === 'tile') {
    for (let i = 0; i < 3800; i++) {
      ctx.fillStyle = `rgba(${i % 2 ? '255,254,247' : '77,73,64'},${rand() * (m.pattern === 'tile' ? .045 : .065)})`;
      const size = .35 + rand() * 1.15;
      ctx.fillRect(rand() * w, rand() * h, size, size);
    }
    if (m.pattern === 'stone') {
      for (let i = 0; i < 24; i++) {
        const x = rand() * w, y = rand() * h;
        ctx.strokeStyle = 'rgba(87,80,69,.022)';
        ctx.lineWidth = .45 + rand() * .7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + w * .08, y + h * .06, x - w * .04, y + h * .14, x + w * .13, y + h * .20);
        ctx.stroke();
      }
    } else {
      edges(.002, 'rgba(213,210,198,.72)');
      edges(.00045, 'rgba(67,65,56,.08)');
    }
  }
  const url = canvas.toDataURL();
  cache.set(key, url);
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  return url;
}

export function materialBumpImage(m: Material): string | null {
  if (m.pattern === 'image' || m.pattern === 'plain' || typeof document === 'undefined') return null;
  const key = `bump:${m.pattern}:${m.width}:${m.height}`;
  const cached = bumpCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  const aspect = m.width / m.height;
  canvas.width = Math.max(64, Math.round(aspect < 1 ? 256 * aspect : 256));
  canvas.height = Math.max(64, Math.round(aspect < 1 ? 256 : 256 / aspect));
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#c8c8c8';
  ctx.fillRect(0, 0, w, h);
  let seed = 313;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  if (m.pattern === 'wood') {
    for (let i = 0; i < 90; i++) {
      const x = rand() * w;
      ctx.strokeStyle = rand() > .5 ? 'rgba(255,255,255,.16)' : 'rgba(60,60,60,.18)';
      ctx.lineWidth = .6 + rand() * 1.1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (rand() - .5) * 4, h);
      ctx.stroke();
    }
    const sx = Math.max(1, w * .0014 / m.width);
    const sy = Math.max(1, h * .0014 / m.height);
    ctx.fillStyle = '#404040';
    ctx.fillRect(0, 0, sx, h); ctx.fillRect(w - sx, 0, sx, h);
    ctx.fillRect(0, 0, w, sy); ctx.fillRect(0, h - sy, w, sy);
  } else if (m.pattern === 'tile') {
    const sx = Math.max(1.5, w * .0025 / m.width);
    const sy = Math.max(1.5, h * .0025 / m.height);
    ctx.fillStyle = '#252525';
    ctx.fillRect(0, 0, sx, h); ctx.fillRect(w - sx, 0, sx, h);
    ctx.fillRect(0, 0, w, sy); ctx.fillRect(0, h - sy, w, sy);
  } else if (m.pattern === 'stone') {
    for (let i = 0; i < 900; i++) {
      const v = Math.round(145 + (rand() - .5) * 90);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(rand() * w, rand() * h, 1.5, 1.5);
    }
  }
  const url = canvas.toDataURL();
  bumpCache.set(key, url);
  if (bumpCache.size > 48) bumpCache.delete(bumpCache.keys().next().value!);
  return url;
}

export function surfaceMaterial(m: Material, w: number, h: number, maxAnisotropy = 8, onReady?: () => void): THREE.MeshStandardMaterial {
  let notify = onReady;
  const loader = new THREE.TextureLoader();
  const texture = loader.load(materialImage(m), () => {
    notify?.();
  });
  const disposed = () => { notify = undefined; texture.removeEventListener('dispose', disposed); };
  texture.addEventListener('dispose', disposed);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(w / m.width, h / m.height);
  texture.center.set(.5, .5);
  texture.rotation = m.rotation * Math.PI / 180;
  texture.anisotropy = Math.min(8, maxAnisotropy);

  const bumpUrl = materialBumpImage(m);
  let bumpMap: THREE.Texture | undefined;
  if (bumpUrl) {
    bumpMap = loader.load(bumpUrl, () => { notify?.(); });
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(w / m.width, h / m.height);
    bumpMap.center.set(.5, .5);
    bumpMap.rotation = m.rotation * Math.PI / 180;
    bumpMap.anisotropy = Math.min(4, maxAnisotropy);
  }
  const bumpScale = m.pattern === 'tile' ? .012 : m.pattern === 'wood' ? .007 : .005;
  return new THREE.MeshStandardMaterial({
    map: texture,
    ...(bumpMap ? { bumpMap, bumpScale } : {}),
    roughness: m.roughness,
    envMapIntensity: .45,
    color: m.pattern === 'image' ? m.color : '#ffffff',
    side: THREE.DoubleSide,
  });
}

import { createPublicFetcher, ImportError } from './network.mjs';
import { extractProduct } from './extract.mjs';

// Validate raster signatures and dimensions before embedding an image locally.
// Animated GIF/WebP are deliberately excluded from finish/furniture previews.
export function rasterDimensions(data, mime) {
  let width, height;
  if (mime === 'image/png' && data.length >= 33 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    data.toString('ascii', 12, 16) === 'IHDR') {
    width = data.readUInt32BE(16); height = data.readUInt32BE(20);
  } else if (mime === 'image/jpeg' && data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 3 < data.length) {
      if (data[offset++] !== 0xff) break;
      while (data[offset] === 0xff) offset++;
      const marker = data[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > data.length) break;
      const length = data.readUInt16BE(offset);
      if (length < 2 || offset + length > data.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) {
        height = data.readUInt16BE(offset + 3); width = data.readUInt16BE(offset + 5); break;
      }
      offset += length;
    }
  } else if (mime === 'image/webp' && data.length >= 30 && data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP') {
    const kind = data.toString('ascii', 12, 16);
    if (kind === 'VP8X' && !(data[20] & 2)) {
      width = 1 + data.readUIntLE(24, 3); height = 1 + data.readUIntLE(27, 3);
    } else if (kind === 'VP8L' && data[20] === 0x2f) {
      const bits = data.readUInt32LE(21);
      width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (kind === 'VP8 ' && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) {
      width = data.readUInt16LE(26) & 0x3fff; height = data.readUInt16LE(28) & 0x3fff;
    }
  }
  if (!width || !height || width > 8192 || height > 8192 || width * height > 24_000_000) {
    throw new ImportError('INVALID_IMAGE', 'Фото имеет неподдерживаемый формат, анимацию или слишком большие размеры.');
  }
  return { width, height };
}

function decodeHtml(page) {
  const header = String(page.headers?.['content-type'] ?? '');
  const early = page.body.subarray(0, 4096).toString('latin1');
  const charset = header.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ??
    early.match(/<meta\b[^>]*charset\s*=\s*["']?([\w-]+)/i)?.[1] ?? 'utf-8';
  try { return new TextDecoder(charset).decode(page.body); }
  catch { throw new ImportError('UNSUPPORTED_CHARSET', 'Кодировка страницы не поддерживается.'); }
}

export function createProductImporter({ fetchPublic = createPublicFetcher(), timeoutMs = 20_000 } = {}) {
  return async function importProduct(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const page = await fetchPublic(url, { kind: 'html', signal: controller.signal });
      const { result, candidateImage } = extractProduct(decodeHtml(page), page.url);
      if (candidateImage) {
        try {
          const image = await fetchPublic(candidateImage, { kind: 'image', signal: controller.signal });
          rasterDimensions(image.body, image.contentType);
          result.image = { dataUrl: `data:${image.contentType};base64,${image.body.toString('base64')}`, sourceUrl: image.url };
        } catch (error) {
          result.warnings.push(error instanceof ImportError ? `Фото не импортировано: ${error.message}`
            : 'Фото не импортировано. Можно загрузить его вручную.');
        }
      }
      return result;
    } finally { clearTimeout(timer); }
  };
}

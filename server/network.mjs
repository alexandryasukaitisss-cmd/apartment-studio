import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class ImportError extends Error {
  constructor(code, message, status = 422) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
    this.status = status;
  }
}

const fail = (code, message, status) => new ImportError(code, message, status);

// Conservative allow-list: IPv4 unicast outside special-use ranges; IPv6
// global unicast only, excluding transition and documentation assignments.
export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (family !== 6 || address.includes('%')) return false;
  const halves = address.toLowerCase().split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const parts = halves.length === 2
    ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
    : left;
  if (parts.length !== 8 || parts.some(part => !/^[0-9a-f]{1,4}$/.test(part))) return false;
  const words = parts.map(part => parseInt(part, 16));
  return words[0] >= 0x2000 && words[0] <= 0x3fff &&
    !(words[0] === 0x2001 && (words[1] <= 0x1ff || words[1] === 0xdb8)) &&
    words[0] !== 0x2002 && words[0] !== 0x3ffe && words[0] !== 0x3fff;
}

export function parsePublicUrl(input) {
  if (typeof input !== 'string' || input.length > 2048 || /[\u0000-\u0020\u007f]/.test(input)) {
    throw fail('INVALID_URL', 'Введите полный публичный HTTP или HTTPS адрес.', 400);
  }
  let url;
  try { url = new URL(input); } catch { throw fail('INVALID_URL', 'Некорректный адрес товара.', 400); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw fail('INVALID_URL', 'Разрешены только HTTP/HTTPS адреса без логина и пароля.', 400);
  }
  if (url.port) throw fail('BLOCKED_URL', 'Разрешены только стандартные HTTP/HTTPS порты.', 400);
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host || host.includes('%') || (!isIP(host) && (
    !host.includes('.') || !/^[a-z0-9.-]+$/.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|arpa|test|invalid|example|onion)$/.test(host)
  )) || (isIP(host) && !isPublicAddress(host))) {
    throw fail('BLOCKED_URL', 'Локальные, частные и зарезервированные адреса запрещены.', 400);
  }
  url.hash = '';
  return url;
}

function aborted(signal) {
  if (signal.aborted) throw fail('TIMEOUT', 'Сайт не ответил вовремя. Попробуйте другой адрес.', 504);
}

function withSignal(promise, signal) {
  aborted(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(fail('TIMEOUT', 'Сайт не ответил вовремя. Попробуйте другой адрес.', 504));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

// Address validation and the actual connection share this pinned lookup. No
// keep-alive agent or second DNS lookup can silently change the destination.
export function pinnedLookup(address, family) {
  return (_hostname, options, callback) => {
    if (typeof options === 'function') { callback = options; options = {}; }
    if (options?.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

export function networkRequest(url, destination, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(fail('TIMEOUT', 'Загрузка превысила допустимое время.', 504)); return; }
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(url, {
      method: 'GET', agent: false, family: destination.family,
      lookup: pinnedLookup(destination.address, destination.family),
      headers: {
        'User-Agent': 'ApartmentStudio-LocalProductImporter/1.0',
        Accept: 'text/html,application/xhtml+xml,image/png,image/jpeg,image/webp,image/gif',
        'Accept-Encoding': 'identity',
      },
    });
    const onAbort = () => request.destroy(fail('TIMEOUT', 'Загрузка превысила допустимое время.', 504));
    signal.addEventListener('abort', onAbort, { once: true });
    request.on('error', reject);
    let responded = false;
    request.on('response', response => {
      responded = true;
      response.on('close', () => signal.removeEventListener('abort', onAbort));
      resolve({ status: response.statusCode, headers: response.headers, body: response,
        destroy: () => response.destroy() });
    });
    request.on('close', () => { if (!responded) signal.removeEventListener('abort', onAbort); });
    request.end();
  });
}

export function createPublicFetcher({ lookup = dnsLookup, request = networkRequest, maxRedirects = 4 } = {}) {
  return async function fetchPublic(input, { kind = 'html', maxBytes = kind === 'html' ? 2_000_000 : 4_000_000,
    timeoutMs = 12_000, signal: parentSignal } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onParentAbort = () => controller.abort();
    parentSignal?.addEventListener('abort', onParentAbort, { once: true });
    if (parentSignal?.aborted) controller.abort();
    const signal = controller.signal;
    let response;
    try {
      let url = parsePublicUrl(input);
      for (let redirects = 0; ; redirects++) {
        aborted(signal);
        const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
        const family = isIP(hostname);
        const addresses = family ? [{ address: hostname, family }]
          : await withSignal(lookup(hostname, { all: true, verbatim: true }), signal);
        if (!Array.isArray(addresses) || !addresses.length || addresses.some(value =>
          !isPublicAddress(value.address) || isIP(value.address) !== value.family)) {
          throw fail('BLOCKED_URL', 'Сайт использует локальный или зарезервированный сетевой адрес.', 400);
        }
        aborted(signal);
        response = await withSignal(request(url, addresses[0], signal), signal);
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          response.destroy?.();
          if (redirects >= maxRedirects) throw fail('REDIRECT_LIMIT', 'Слишком много перенаправлений.');
          const location = response.headers.location;
          if (typeof location !== 'string') throw fail('INVALID_REDIRECT', 'Сайт вернул некорректное перенаправление.');
          let next;
          try { next = new URL(location, url).href; } catch { throw fail('INVALID_REDIRECT', 'Сайт вернул некорректное перенаправление.'); }
          url = parsePublicUrl(next);
          continue;
        }
        if (response.status < 200 || response.status >= 300) {
          throw fail('REMOTE_STATUS', `Сайт отказал в загрузке (HTTP ${response.status}). Возможно, он требует вход или блокирует автоматический импорт.`);
        }
        const contentType = String(response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        const allowed = kind === 'html' ? ['text/html', 'application/xhtml+xml']
          : ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowed.includes(contentType)) throw fail('UNSUPPORTED_CONTENT', kind === 'html'
          ? 'Адрес должен вести на HTML страницу товара.' : 'Изображение должно быть JPEG, PNG, WebP или GIF.');
        if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
          throw fail('UNSUPPORTED_ENCODING', 'Сайт вернул неподдерживаемое сжатие данных.');
        }
        const declared = Number(response.headers['content-length']);
        if (Number.isFinite(declared) && declared > maxBytes) throw fail('TOO_LARGE', 'Страница или изображение слишком большого размера.');
        const chunks = [];
        let bytes = 0;
        const iterator = response.body[Symbol.asyncIterator]();
        for (;;) {
          const item = await withSignal(iterator.next(), signal);
          if (item.done) break;
          const chunk = item.value;
          aborted(signal);
          const data = Buffer.from(chunk);
          bytes += data.length;
          if (bytes > maxBytes) throw fail('TOO_LARGE', 'Страница или изображение слишком большого размера.');
          chunks.push(data);
        }
        return { url: url.href, contentType, body: Buffer.concat(chunks), headers: response.headers };
      }
    } catch (error) {
      if (signal.aborted) throw fail('TIMEOUT', 'Загрузка превысила допустимое время.', 504);
      if (error instanceof ImportError) throw error;
      throw fail('FETCH_FAILED', 'Не удалось загрузить публичную страницу. Сайт может блокировать импорт или требовать вход.', 502);
    } finally {
      response?.destroy?.();
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', onParentAbort);
    }
  };
}

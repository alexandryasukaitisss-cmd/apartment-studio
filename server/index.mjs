import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProductImporter } from './import-product.mjs';
import { ImportError } from './network.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const DEFAULT_DIST = fileURLToPath(new URL('../dist', import.meta.url));

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers['content-type'] ?? '')) {
    throw new ImportError('JSON_REQUIRED', 'Запрос должен содержать JSON.', 415);
  }
  if (Number(request.headers['content-length']) > 4096) throw new ImportError('BODY_TOO_LARGE', 'Запрос слишком большой.', 413);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 4096) throw new ImportError('BODY_TOO_LARGE', 'Запрос слишком большой.', 413);
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || Array.isArray(body) || typeof body.url !== 'string') throw new Error();
    return body;
  } catch { throw new ImportError('INVALID_JSON', 'Передайте JSON объект с адресом товара в поле url.', 400); }
}

export function createLocalServer({ importProduct = createProductImporter(), distDir = DEFAULT_DIST,
  devOrigins = [], maxConcurrent = 3 } = {}) {
  let active = 0;
  const server = http.createServer({ requestTimeout: 15_000, headersTimeout: 10_000,
    connectionsCheckingInterval: 1000 }, async (request, response) => {
    try {
      const port = server.address()?.port;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
      const host = request.headers.host?.toLowerCase();
      if (!hosts.includes(host)) throw new ImportError('INVALID_HOST', 'Недопустимый адрес локального сервиса.', 403);
      const origin = request.headers.origin;
      if (origin && origin !== `http://${host}` && !devOrigins.includes(origin)) {
        throw new ImportError('FOREIGN_ORIGIN', 'Запросы с другого сайта запрещены.', 403);
      }
      const fetchSite = request.headers['sec-fetch-site'];
      if (!origin && fetchSite === 'cross-site') throw new ImportError('FOREIGN_ORIGIN', 'Запросы с другого сайта запрещены.', 403);
      let pathname;
      try { pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname); }
      catch { throw new ImportError('INVALID_PATH', 'Некорректный путь запроса.', 400); }
      if (pathname === '/api/health') {
        if (request.method !== 'GET') return json(response, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Используйте GET.' });
        return json(response, 200, { service: 'personal.apartmentstudio', protocolVersion: 1,
          instance: process.env.APARTMENT_HOST_INSTANCE ?? null });
      }
      if (pathname.startsWith('/api/')) {
        if (pathname !== '/api/import-product') return json(response, 404, { error: 'NOT_FOUND', message: 'Метод не найден.' });
        if (request.method !== 'POST') return json(response, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Используйте POST.' });
        if (active >= maxConcurrent) return json(response, 429, { error: 'BUSY', message: 'Дождитесь завершения предыдущего импорта.' });
        active++;
        try {
          const body = await readJson(request);
          json(response, 200, await importProduct(body.url));
        } finally { active--; }
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) return json(response, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Метод запрещён.' });
      if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part === '..' || part === '.')) {
        throw new ImportError('INVALID_PATH', 'Некорректный путь запроса.', 400);
      }
      const root = await realpath(distDir).catch(() => null);
      if (!root) return json(response, 503, { error: 'BUILD_REQUIRED', message: 'Сначала выполните npm run build в apartment-studio.' });
      let target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!target.startsWith(root + path.sep)) throw new ImportError('INVALID_PATH', 'Некорректный путь запроса.', 400);
      target = await realpath(target).catch(() => null);
      if (!target || !target.startsWith(root + path.sep)) return json(response, 404, { error: 'NOT_FOUND', message: 'Файл не найден.' });
      const info = await stat(target);
      if (!info.isFile()) return json(response, 404, { error: 'NOT_FOUND', message: 'Файл не найден.' });
      const content = await readFile(target);
      response.writeHead(200, { 'Content-Type': MIME[path.extname(target)] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache',
        'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      const known = error instanceof ImportError;
      if (!response.headersSent) json(response, known ? error.status : 500,
        { error: known ? error.code : 'SERVER_ERROR', message: known ? error.message : 'Не удалось выполнить запрос.' });
      else response.end();
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT ?? 4317);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535.');
  const devOrigins = process.env.NODE_ENV === 'production' ? []
    : ['http://127.0.0.1:5173', 'http://localhost:5173'];
  const server = createLocalServer({ devOrigins });
  server.listen(port, '127.0.0.1', () => console.log(`Apartment Studio: http://127.0.0.1:${port}`));
  server.on('error', () => { console.error('Unable to start local server. Check whether PORT is already in use.'); process.exitCode = 1; });
}

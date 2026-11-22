import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createLocalServer } from './index.mjs';
import { ImportError } from './network.mjs';

async function start(t, options = {}) {
  const server = createLocalServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

test('POST JSON API accepts own origin, denies foreign callers and sanitizes failures', async t => {
  const { url } = await start(t, { importProduct: async value => {
    if (value === 'known') throw new ImportError('BLOCKED_URL', 'Адрес запрещён.', 400);
    if (value === 'secret') throw new Error('/Users/private/.ssh');
    return { title: 'Sofa', url: value, image: null, dimensions: {}, warnings: [], evidence: [] };
  } });
  const post = (headers = {}, body = { url: 'https://shop.public/' }) => fetch(`${url}/api/import-product`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  const success = await post({ Origin: url }); assert.equal(success.status, 200);
  assert.equal((await success.json()).title, 'Sofa'); assert.equal(success.headers.get('access-control-allow-origin'), null);
  assert.equal((await post({ Origin: 'https://attacker.public' })).status, 403);
  assert.equal((await post({ Origin: 'null' })).status, 403);
  assert.equal((await post({ 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await post({ 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post({}, { nope: 1 })).status, 400);
  assert.equal((await post({}, { url: 'x'.repeat(5000) })).status, 413);
  assert.equal((await post({}, { url: 'known' })).status, 400);
  const unknown = await post({}, { url: 'secret' }); assert.equal(unknown.status, 500);
  assert.deepEqual(await unknown.json(), { error: 'SERVER_ERROR', message: 'Не удалось выполнить запрос.' });
  assert.equal((await fetch(`${url}/api/import-product`)).status, 405);
  assert.equal((await fetch(`${url}/api/other`)).status, 404);
});

test('forged Host is rejected before any import or file read', async t => {
  const { server } = await start(t, { importProduct: async () => { throw new Error('should never run'); } });
  const status = await new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: server.address().port, path: '/api/import-product',
      method: 'POST', headers: { Host: 'attacker.public', 'Content-Type': 'application/json' } }, response => {
      response.resume(); resolve(response.statusCode);
    });
    request.on('error', reject); request.end('{"url":"https://shop.public/"}');
  });
  assert.equal(status, 403);
});

test('production static files stay inside dist, including encoded traversal and symlinks', async t => {
  const temp = await mkdtemp(path.join(tmpdir(), 'apartment-server-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const dist = path.join(temp, 'dist'); await mkdir(dist);
  await writeFile(path.join(dist, 'index.html'), '<h1>Studio</h1>');
  await writeFile(path.join(dist, 'app.js'), 'export const x=1;');
  await writeFile(path.join(temp, 'secret.txt'), 'private');
  await symlink(path.join(temp, 'secret.txt'), path.join(dist, 'escape.txt'));
  const { url } = await start(t, { distDir: dist });
  const index = await fetch(url); assert.equal(index.status, 200); assert.equal(await index.text(), '<h1>Studio</h1>');
  const js = await fetch(`${url}/app.js`); assert.match(js.headers.get('content-type'), /javascript/);
  const head = await fetch(url, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  for (const target of ['/escape.txt', '/%2e%2e%2fsecret.txt', '/%5c..%5csecret.txt', '/%00secret.txt', '/missing']) {
    const response = await fetch(`${url}${target}`);
    assert.ok(response.status >= 400, target); assert.ok(!(await response.text()).includes('private'), target);
  }
  assert.equal((await fetch(`${url}/app.js`, { method: 'POST' })).status, 405);
});

test('missing build explains the local launch requirement', async t => {
  const { url } = await start(t, { distDir: '/not-a-real-dist-directory' });
  const response = await fetch(url); assert.equal(response.status, 503);
  assert.match((await response.json()).message, /npm run build/);
});

test('concurrent imports are bounded and the slot is released after failure', async t => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let started;
  const began = new Promise(resolve => { started = resolve; });
  const { url } = await start(t, { maxConcurrent: 1, importProduct: async () => {
    started(); await pending; throw new ImportError('REMOTE_STATUS', 'Сайт заблокировал импорт.');
  } });
  const post = () => fetch(`${url}/api/import-product`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://shop.public/' }) });
  const first = post(); await began;
  assert.equal((await post()).status, 429);
  release(); assert.equal((await first).status, 422);
  assert.equal((await post()).status, 422);
});

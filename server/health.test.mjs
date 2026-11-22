import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createLocalServer } from './index.mjs';

// Exercise the actual request handler without listening on any port.
async function request({ method = 'GET', headers = {}, instance } = {}) {
  const previous = process.env.APARTMENT_HOST_INSTANCE;
  if (instance === undefined) delete process.env.APARTMENT_HOST_INSTANCE;
  else process.env.APARTMENT_HOST_INSTANCE = instance;
  const server = createLocalServer({ importProduct: () => { throw new Error('health must not import'); } });
  server.address = () => ({ port: 4318 });
  try {
    return await new Promise(resolve => {
      const req = Readable.from([]);
      Object.assign(req, { url: '/api/health', method, headers: { host: '127.0.0.1:4318', ...headers } });
      const res = {
        headersSent: false,
        writeHead(status, responseHeaders) { this.status = status; this.headers = responseHeaders; this.headersSent = true; },
        end(body) { resolve({ status: this.status, headers: this.headers, body: JSON.parse(body) }); },
      };
      server.emit('request', req, res);
    });
  } finally {
    if (previous === undefined) delete process.env.APARTMENT_HOST_INSTANCE;
    else process.env.APARTMENT_HOST_INSTANCE = previous;
  }
}

test('health identifies the native service and current instance without launching a server', async () => {
  const response = await request({ instance: 'own-child' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { service: 'personal.apartmentstudio', protocolVersion: 1, instance: 'own-child' });
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal((await request()).body.instance, null);
});

test('health preserves host/origin protection and denies non-GET methods', async () => {
  assert.equal((await request({ headers: { host: 'foreign.invalid' } })).status, 403);
  assert.equal((await request({ headers: { origin: 'https://foreign.invalid' } })).status, 403);
  assert.equal((await request({ headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await request({ method: 'POST' })).status, 405);
  assert.equal((await request({ method: 'HEAD' })).status, 405);
});

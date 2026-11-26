import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { access, constants, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  A2UI_VERSION, APARTMENT_CATALOG_ID, ALLOWED_AGENT_FUNCTIONS, SUPPORTED_PROVIDERS,
  buildA2UIPrompt, detectProviders, extractAndNormalizeA2UI, runCliAgent,
} from './agent-providers.mjs';

const execFileAsync = promisify(execFile);
const cli = fileURLToPath(new URL('./agent-cli.mjs', import.meta.url));
const model = 'provider/model:v2#fast';
const prompt = 'Аудит; $(literal) "quotes"';
const context = { name: 'Квартира', roomCount: 7 };
const fullPrompt = buildA2UIPrompt(prompt, context);

function surface(surfaceId = 'apartment') {
  return {
    version: '1.0',
    createSurface: {
      surfaceId, catalogId: APARTMENT_CATALOG_ID,
      components: [{ id: 'root', component: 'Text', text: 'Готово' }],
      dataModel: {},
    },
  };
}

const raw = JSON.stringify(surface());

async function scratch(t) {
  const dir = await mkdtemp(join(tmpdir(), 'apartment-agent-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function fakeSpawn(callback) {
  return (bin, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = signal => {
      queueMicrotask(() => child.emit('close', null, signal));
      return true;
    };
    setImmediate(async () => {
      try {
        await callback({ bin, args, options, child });
      } catch (error) {
        child.emit('error', error);
      }
    });
    return child;
  };
}

const detected = (id, extras = {}) => ({ id, available: true, command: `/mock/bin/${id}`, ...extras });

test('detectProviders searches PATH before the extra local directories and flags missing Node', async t => {
  const home = await scratch(t);
  const pathBin = join(home, 'path-bin');
  const localBin = join(home, '.local', 'bin');
  const opencodeBin = join(home, '.opencode', 'bin');
  await Promise.all([pathBin, localBin, opencodeBin].map(dir => mkdir(dir, { recursive: true })));
  const codex = join(pathBin, 'codex');
  const opencode = join(opencodeBin, 'opencode');
  const gemini = join(localBin, 'gemini');
  await Promise.all([
    writeFile(codex, '#!/bin/sh\n', { mode: 0o700 }),
    writeFile(join(localBin, 'codex'), '#!/bin/sh\n', { mode: 0o700 }),
    writeFile(opencode, `#!${process.execPath}\n`, { mode: 0o700 }),
    writeFile(gemini, `#!${join(home, 'missing', 'node')}\nconsole.log("hi");\n`, { mode: 0o700 }),
  ]);
  const env = { HOME: home, PATH: pathBin };
  const entries = await detectProviders({ env });
  assert.deepEqual(entries.map(p => p.id), ['codex', 'claude', 'opencode', 'gemini', 'ollama']);
  assert.deepEqual(entries.find(p => p.id === 'gemini'), {
    id: 'gemini', name: 'Gemini', available: true, command: gemini, runnableViaNode: true,
  });
  assert.equal(entries.find(p => p.id === 'opencode').command, opencode);
  assert.equal(entries.find(p => p.id === 'opencode').runnableViaNode, undefined);
  assert.equal(entries.find(p => p.id === 'codex').command, codex);
  const lookup = [];
  const mocked = await detectProviders({ env, whichFn(id, searchEnv) {
    lookup.push(id);
    assert.deepEqual(searchEnv.PATH.split(delimiter), [pathBin, localBin, opencodeBin, '/opt/homebrew/bin', '/usr/local/bin']);
    return id === 'gemini' ? gemini : null;
  } });
  assert.deepEqual(lookup, SUPPORTED_PROVIDERS);
  assert.equal(mocked[0].available, false);
  assert.equal(mocked[0].command, null);
  assert.equal(mocked.find(p => p.id === 'gemini').runnableViaNode, true);
});

test('buildA2UIPrompt describes the catalog, function arguments, and bounded JSON context', () => {
  assert.match(fullPrompt, /strict A2UI v1\.0 JSON/);
  assert.match(fullPrompt, /Column, Row, Card, Text, Badge, Divider, Metric, Button, StylePresetCard, AuditFixCard, FurnitureCard, StagePreviewBar/);
  for (const name of ALLOWED_AGENT_FUNCTIONS) assert.ok(fullPrompt.includes(`- ${name}: {`));
  assert.ok(fullPrompt.includes('- setStorageNote: { key: string, value: string }'));
  assert.ok(fullPrompt.includes(JSON.stringify(context)));
  assert.ok(fullPrompt.endsWith(JSON.stringify(prompt)));
  const oversized = buildA2UIPrompt(prompt, { name: '"\\😀'.repeat(20_000) });
  const [, serialized] = oversized.match(/Apartment context JSON:\n([\s\S]*?)\nUser request JSON string:/);
  assert.ok(serialized.length <= 16_000);
  assert.equal(JSON.parse(serialized).truncated, true);
  assert.ok(JSON.parse(serialized).preview.startsWith('{"name":'));
});

test('extracts raw JSON, an array, a fenced block, and balanced JSON mixed with logs', () => {
  const quoted = surface();
  quoted.createSurface.components[0].text = 'Nested } [ and "quote" \\';
  const quotedRaw = JSON.stringify(quoted, null, 2);
  for (const input of [
    quotedRaw,
    JSON.stringify([quoted]),
    `Answer:\n\`\`\`json\n${quotedRaw}\n\`\`\`\nComplete.`,
    `Prefix [INFO] {not JSON}\n${quotedRaw}\nsuffix {}`,
    `Unbalanced log {\n\`\`\`json\n${quotedRaw}\n\`\`\``,
  ]) assert.deepEqual(extractAndNormalizeA2UI(input), [quoted]);
});

test('normalizes JSONL and applies updates only to surfaces created in the batch', () => {
  const messages = [
    surface(),
    { version: '1.0', updateComponents: { surfaceId: 'apartment', components: [{ id: 'label', component: 'Text', text: 'Updated' }] } },
    { version: '1.0', updateDataModel: { surfaceId: 'apartment', path: '/status', value: 'ready' } },
    surface('second'),
    { version: '1.0', deleteSurface: { surfaceId: 'second' } },
  ];
  const bad = { version: '1.0', updateDataModel: { surfaceId: 'absent', path: '/status', value: null } };
  assert.deepEqual(extractAndNormalizeA2UI([bad, ...messages].map(value => JSON.stringify(value)).join('\n')), messages);
});

test('filters forbidden components, functions, catalogs, unsafe keys and RPC envelopes', () => {
  const bad = id => ({ id, component: 'Button', label: 'No', action: { callAgentFunction: { name: 'execShell' } } });
  const result = extractAndNormalizeA2UI(JSON.stringify([
    { version: '1.0', createSurface: {
      surfaceId: 'project', catalogId: 'other', dataModel: JSON.parse('{"__proto__":{"polluted":true},"name":"test"}'),
      components: [
        { id: 'root', component: 'Column', children: ['external', 'button', 'button2', 'safe', 'standard', 'bad-alias', 'bad-binding'] },
        { id: 'external', component: 'WebView' },
        bad('button'),
        { ...bad('button2'), action: { functionCall: { '@call': 'openUrl' } } },
        { id: 'safe', component: 'Button', '@catalogId': 'other', action: { callAgentFunction: { name: 'focusRoom', args: { roomId: 'bed1' } } } },
        { id: 'standard', component: 'Button', action: { functionCall: { '@call': 'openCompare' } } },
        { id: 'bad-alias', component: 'Button', action: { callAgentFunction: { name: 'focusRoom', '@call': 'execShell' } } },
        { id: 'bad-binding', component: 'Text', text: { '@call': 'execShell' } },
      ],
    } },
    { version: '1.0', updateDataModel: { surfaceId: 'project', path: '/__proto__/polluted', value: true } },
    { version: '1.0', callAgentFunction: { name: 'execShell' } },
    { version: '1.0', callRendererFunction: { callFunction: { '@call': 'execShell' } } },
  ]));
  assert.equal(result.length, 1);
  const { createSurface } = result[0];
  assert.equal(createSurface.catalogId, APARTMENT_CATALOG_ID);
  assert.deepEqual(createSurface.dataModel, { name: 'test' });
  assert.deepEqual(createSurface.components.map(c => c.id), ['root', 'button', 'button2', 'safe', 'standard', 'bad-alias', 'bad-binding']);
  assert.deepEqual(createSurface.components[0].children, ['button', 'button2', 'safe', 'standard', 'bad-alias', 'bad-binding']);
  assert.deepEqual(createSurface.components[3].action, { callAgentFunction: { name: 'focusRoom', args: { roomId: 'bed1' } } });
  assert.deepEqual(createSurface.components[4].action, { callAgentFunction: { name: 'openCompare' } });
  assert.ok(!/execShell|WebView|openUrl|@catalogId/.test(JSON.stringify(result)));
});

test('normalizes missing surface metadata and a basic-catalog Card child for Apartment Studio', () => {
  const [message] = extractAndNormalizeA2UI(JSON.stringify({ version: A2UI_VERSION, createSurface: {
    components: [{ id: 'root', component: 'Card', child: 'text' }, { id: 'text', component: 'Text', text: 'OK' }],
  } }));
  const payload = message.createSurface;
  assert.ok(payload.surfaceId);
  assert.equal(payload.catalogId, APARTMENT_CATALOG_ID);
  assert.deepEqual(payload.components[0], { id: 'root', component: 'Card', children: ['text'] });
  assert.deepEqual(payload.dataModel, {});
});

test('prevents poisoned data model values and pointers from reaching string bindings', () => {
  const message = surface();
  message.createSurface.components[0].text = { '@path': '/label' };
  message.createSurface.dataModel = { label: { toString: null, valueOf: null }, safe: 'keep' };
  const update = { version: '1.0', updateDataModel: { surfaceId: 'apartment', path: '/label/toString', value: null } };
  const [normalized, ...others] = extractAndNormalizeA2UI(JSON.stringify([message, update]));
  assert.deepEqual(normalized.createSurface.dataModel, { label: {}, safe: 'keep' });
  assert.equal(String(normalized.createSurface.dataModel.label), '[object Object]');
  assert.deepEqual(others, []);
});

test('ignores cyclic component updates and wraps plain text, wrong versions and broken root trees', () => {
  const cyclic = { id: 'root', component: 'Card', children: ['root'] };
  const invalid = [
    ['\x1b[32m  Обычный текст  \x1b[0m', 'Обычный текст'],
    ['\x1b]0;terminal title\x07text\u0000', 'text'],
    [' ', 'No response from the agent.'],
    ...[
      { ...surface(), version: 'v1.0' },
      { version: '1.0', createSurface: { surfaceId: 'missing', components: [] } },
      { version: '1.0', createSurface: { surfaceId: 'bad-root', components: [{ id: 'root', component: 'Iframe' }] } },
      { version: '1.0', createSurface: { surfaceId: 'cyclic', components: [cyclic] } },
    ].map(value => [JSON.stringify(value), JSON.stringify(value)]),
  ];
  for (const [input, cleaned] of invalid) {
    const [message] = extractAndNormalizeA2UI(input, { fallbackTitle: 'Test response' });
    assert.equal(message.version, A2UI_VERSION);
    assert.equal(message.createSurface.catalogId, APARTMENT_CATALOG_ID);
    assert.deepEqual(message.createSurface.components, [
      { id: 'root', component: 'Column', children: ['response'] },
      { id: 'response', component: 'Card', children: ['response-text'] },
      { id: 'response-text', component: 'Text', text: cleaned },
    ]);
    assert.equal(message.createSurface.dataModel.title, 'Test response');
  }
  assert.deepEqual(extractAndNormalizeA2UI(JSON.stringify([
    surface(), { version: '1.0', updateComponents: { surfaceId: 'apartment', components: [cyclic] } },
  ])), [surface()]);
});

test('codex uses exact shell-free arguments, reads the output file and removes the temporary directory', async () => {
  let out;
  const result = await runCliAgent({
    provider: 'codex', prompt, model, context, detectFn: () => [detected('codex')],
    spawnFn: fakeSpawn(async ({ bin, args, options, child }) => {
      out = args[6];
      assert.equal(bin, '/mock/bin/codex');
      assert.equal(options.shell, false);
      assert.deepEqual(args, ['exec', '--skip-git-repo-check', '--ephemeral', '-m', model, '-o', out, fullPrompt]);
      assert.match(out, /apartment-codex-.+\/response\.json$/);
      await writeFile(out, raw);
      child.stdout.write('progress text');
      child.emit('close', 0);
    }),
  });
  assert.deepEqual(result.messages, [surface()]);
  assert.equal(result.rawText, raw);
  assert.equal(result.provider, 'codex');
  assert.equal(result.model, model);
  assert.ok(result.elapsedMs >= 0);
  await assert.rejects(access(dirname(out)), { code: 'ENOENT' });
});

test('codex reports CLI failure and removes its output directory on failure', async () => {
  let out;
  await assert.rejects(runCliAgent({
    provider: 'codex', prompt, detectFn: () => [detected('codex')],
    spawnFn: fakeSpawn(async ({ args, child }) => {
      out = args[4];
      await writeFile(out, raw);
      child.stderr.write('not authenticated');
      child.emit('close', 1);
    }),
  }), /codex exited with code 1: not authenticated/);
  await assert.rejects(access(dirname(out)), { code: 'ENOENT' });
});

test('codex bounds the final-answer file and removes it when the limit is exceeded', async () => {
  let out;
  await assert.rejects(runCliAgent({
    provider: 'codex', prompt, detectFn: () => [detected('codex')],
    spawnFn: fakeSpawn(async ({ args, child }) => {
      out = args[4];
      await writeFile(out, Buffer.alloc(1024 * 1024 + 1));
      child.emit('close', 0);
    }),
  }), /output exceeded 1 MiB/);
  await assert.rejects(access(dirname(out)), { code: 'ENOENT' });
});

for (const [id, args, viaNode] of [
  ['claude', ['-p', '--output-format', 'text', '--no-session-persistence', '--model', model, fullPrompt]],
  ['opencode', ['run', '-m', model, fullPrompt]],
  ['gemini', ['/mock/bin/gemini', '-m', model, '-p', fullPrompt], true],
]) {
  test(`${id} invokes the expected binary with exact shell-free arguments`, async () => {
    const result = await runCliAgent({
      provider: id, prompt, model, context, detectFn: () => [detected(id, { runnableViaNode: viaNode })],
      spawnFn: fakeSpawn(({ bin, args: actual, options, child }) => {
        assert.equal(bin, viaNode ? process.execPath : `/mock/bin/${id}`);
        assert.deepEqual(actual, args);
        assert.equal(options.shell, false);
        const payload = Buffer.from(raw);
        const split = payload.indexOf(Buffer.from('Г')) + 1;
        child.stdout.write(payload.subarray(0, split));
        child.stdout.write(payload.subarray(split));
        child.emit('close', 0);
      }),
    });
    assert.equal(result.rawText, raw);
    assert.equal(result.provider, id);
    assert.equal(result.model, model);
    assert.deepEqual(result.messages, [surface()]);
  });
}

test('ollama posts only to loopback, uses the selected or default model, and normalizes its response', async () => {
  for (const selection of [undefined, model]) {
    const result = await runCliAgent({
      provider: 'ollama', prompt, model: selection, context,
      spawnFn: () => assert.fail('Ollama must not spawn a CLI'),
      fetchFn: async (url, options) => {
        assert.equal(url, 'http://127.0.0.1:11434/api/generate');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers['Content-Type'], 'application/json');
        assert.equal(options.redirect, 'error');
        assert.ok(options.signal instanceof AbortSignal);
        assert.deepEqual(JSON.parse(options.body), { model: selection ?? 'llama3.2', prompt: fullPrompt, stream: false });
        return Response.json({ response: raw });
      },
    });
    assert.equal(result.provider, 'ollama');
    assert.equal(result.model, selection ?? 'default');
    assert.equal(result.rawText, raw);
    assert.deepEqual(result.messages, [surface()]);
  }
});

test('ollama rejects HTTP failures, malformed output, oversize output and request timeout', async () => {
  const options = { provider: 'ollama', prompt };
  await assert.rejects(runCliAgent({ ...options, fetchFn: async () => new Response('error', { status: 503 }) }), /HTTP 503/);
  await assert.rejects(runCliAgent({ ...options, fetchFn: async () => Response.json({ other: 'value' }) }), /missing response text/);
  await assert.rejects(runCliAgent({
    ...options,
    fetchFn: async () => new Response(new Uint8Array(1024 * 1024 + 1)),
  }), /output exceeded 1 MiB/);
  await assert.rejects(runCliAgent({
    ...options, timeoutMs: 20,
    fetchFn: (_url, { signal }) => new Promise((resolve, reject) => {
      const keepAlive = setTimeout(() => resolve(Response.json({ response: raw })), 2000);
      signal.addEventListener('abort', () => {
        clearTimeout(keepAlive);
        reject(signal.reason);
      }, { once: true });
    }),
  }), { name: 'TimeoutError' });
});

test('auto follows provider priority, not detection order, and fails when none are available', async () => {
  const detectFn = () => [detected('gemini'), detected('claude'), { id: 'codex', available: false }];
  const result = await runCliAgent({
    prompt, context, detectFn,
    spawnFn: fakeSpawn(({ bin, args, options, child }) => {
      assert.equal(bin, '/mock/bin/claude');
      assert.deepEqual(args, ['-p', '--output-format', 'text', '--no-session-persistence', fullPrompt]);
      assert.equal(options.shell, false);
      child.stdout.write(raw);
      child.emit('close', 0);
    }),
  });
  assert.equal(result.provider, 'claude');
  assert.equal(result.model, 'default');
  assert.deepEqual(result.messages, [surface()]);
  await assert.rejects(runCliAgent({ prompt, detectFn: () => [] }), /No supported CLI provider/);
  await assert.rejects(runCliAgent({ provider: 'claude', prompt, detectFn: () => [] }), /Provider claude is unavailable/);
});

test('rejects invalid provider, model, prompt and timeout before doing I/O', async () => {
  const detectFn = () => assert.fail('Must validate before provider discovery');
  for (const provider of ['offline', 'invalid', 'codex; true']) {
    await assert.rejects(runCliAgent({ prompt, provider, detectFn }), /Invalid provider/);
  }
  for (const model of ['gpt; touch file', 'gpt$(command)', 'gpt\n', '--shell', '', 'a'.repeat(121), null]) {
    await assert.rejects(runCliAgent({ prompt, model, detectFn }), /Invalid model/);
  }
  for (const prompt of [undefined, 123, '   ', 'test\0', 'a'.repeat(8001)]) {
    await assert.rejects(runCliAgent({ prompt, detectFn }), /Invalid prompt/);
  }
  for (const timeoutMs of [0, -1, Infinity, 3.5, 2_147_483_648]) {
    await assert.rejects(runCliAgent({ prompt, detectFn, timeoutMs }), /Invalid timeoutMs/);
  }
});

test('timeouts send SIGTERM, then SIGKILL when the process does not close', async () => {
  for (const respondsToTerm of [true, false]) {
    const signals = [];
    await assert.rejects(runCliAgent({
      provider: 'gemini', prompt, timeoutMs: 30, detectFn: () => [detected('gemini')],
      spawnFn: fakeSpawn(({ child }) => {
        child.kill = signal => {
          signals.push(signal);
          if (respondsToTerm) queueMicrotask(() => child.emit('close', null, signal));
          return true;
        };
      }),
    }), /gemini timed out after 30 ms/);
    assert.deepEqual(signals, respondsToTerm ? ['SIGTERM'] : ['SIGTERM', 'SIGKILL']);
  }
});

test('bounds the combined stdout and stderr in bytes', async () => {
  await assert.rejects(runCliAgent({
    provider: 'opencode', prompt, detectFn: () => [detected('opencode')],
    spawnFn: fakeSpawn(({ child }) => {
      child.stdout.write('Я'.repeat(300_000));
      child.stderr.write('Я'.repeat(300_000));
    }),
  }), /opencode output exceeded 1 MiB/);
});

test('CLI is executable and supports help, JSON discovery and deterministic offline output', async () => {
  await access(cli, constants.X_OK);
  assert.match((await execFileAsync(cli, ['--help'])).stdout, /Usage:.*agent-cli\.mjs/);
  const list = JSON.parse((await execFileAsync(process.execPath, [cli, '--list-providers', '--json'])).stdout);
  assert.deepEqual(list.map(provider => provider.id), SUPPORTED_PROVIDERS);
  assert.ok(list.every(provider => typeof provider.available === 'boolean'));
  const args = [cli, '--provider', 'offline', '--prompt', 'Аудит', '--json'];
  const { stdout, stderr } = await execFileAsync(process.execPath, args);
  assert.equal(stderr, '');
  const [message] = JSON.parse(stdout);
  assert.equal(message.version, '1.0');
  assert.equal(message.createSurface.catalogId, APARTMENT_CATALOG_ID);
  assert.equal(message.createSurface.components[0].id, 'root');
  assert.match(message.createSurface.components[2].text, /Аудит/);
  assert.equal((await execFileAsync(process.execPath, args)).stdout, stdout);
});

test('CLI reads stdin, summarizes only needed fields of the active project, and writes --out', async t => {
  const dir = await scratch(t);
  const project = join(dir, 'project.json');
  const out = join(dir, 'answer.json');
  await writeFile(project, JSON.stringify({
    version: 1, name: 'Квартира', scale: 1.5, ceilingHeight: 2.75, activeVariantId: 'active',
    rooms: [{ id: 'bed1', name: 'Спальня', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]] }],
    variants: [
      { id: 'unused', name: 'Omitted' },
      { id: 'active', name: 'Новый', furniture: [{ secret: 'not sent' }, {}], electrical: { points: [{}] },
        doorStyle: 'hidden', skirtingColor: '#123456', skirtingHeight: 0.11 },
    ],
  }));
  const run = execFileAsync(process.execPath, [
    cli, '--provider', 'offline', '--project', project, '--out', out, '--json',
  ]);
  run.child.stdin.end('Аудит из stdin');
  const { stdout } = await run;
  assert.equal(await readFile(out, 'utf8'), stdout);
  const [message] = JSON.parse(stdout);
  assert.match(message.createSurface.components[2].text, /Аудит из stdin/);
  assert.deepEqual(message.createSurface.dataModel.project, {
    name: 'Квартира', roomCount: 1, rooms: [{ id: 'bed1', name: 'Спальня', areaM2: 27 }],
    ceilingHeight: 2.75, activeVariantName: 'Новый', furnitureCount: 2, electricalCount: 1,
    doorStyle: 'hidden', skirting: { color: '#123456', height: 0.11 },
  });
});


test('local server exposes /api/agent/providers and /api/agent/a2ui with host/origin protection', async () => {
  const { createLocalServer } = await import('./index.mjs');
  const server = createLocalServer({
    listAgentProviders: async () => [{ id: 'codex', name: 'Codex CLI', available: true, command: '/usr/local/bin/codex' }],
    runAgent: async payload => ({
      provider: payload.provider === 'auto' ? 'codex' : payload.provider,
      model: payload.model || 'default',
      elapsedMs: 12,
      messages: [{ version: '1.0', createSurface: { surfaceId: 'http-test', catalogId: APARTMENT_CATALOG_ID, components: [{ id: 'root', component: 'Text', text: payload.prompt }], dataModel: {} } }],
      rawText: payload.prompt,
    }),
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    const provRes = await fetch(`${base}/api/agent/providers`);
    assert.equal(provRes.status, 200);
    const provJson = await provRes.json();
    assert.equal(provJson.providers[0].id, 'codex');

    const badOrigin = await fetch(`${base}/api/agent/a2ui`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ provider: 'codex', prompt: 'Hi' }),
    });
    assert.equal(badOrigin.status, 403);

    const okRes = await fetch(`${base}/api/agent/a2ui`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'auto', prompt: 'Проведи аудит', context: { rooms: [] } }),
    });
    assert.equal(okRes.status, 200);
    const okJson = await okRes.json();
    assert.equal(okJson.provider, 'codex');
    assert.equal(okJson.messages[0].version, '1.0');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

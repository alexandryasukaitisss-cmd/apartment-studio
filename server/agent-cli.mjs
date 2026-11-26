#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  SUPPORTED_PROVIDERS, createTextSurface, detectProviders, runCliAgent, validateAgentRequest,
} from './agent-providers.mjs';

const providers = ['auto', ...SUPPORTED_PROVIDERS, 'offline'];

const usage = `Usage: agent-cli.mjs [options]

  --list-providers       List detected CLI binaries (combine with --json for JSON)
  --provider <name>      ${providers.join(' | ')}
                         Default: auto. Offline does not call a model.
  --model <model>        Model override for the selected provider
  --prompt <text>        Request text; reads stdin when omitted
  --project <file>       Use a summary of an Apartment Studio project JSON export
  --json                 Print the A2UI 1.0 message array without status text
  --out <file>           Write the same message array to a file
  -h, --help             Show this help

Example:
  node server/agent-cli.mjs --provider offline --prompt 'Аудит' --json`;

function roomArea(polygon, scale) {
  if (!Array.isArray(polygon) || polygon.length < 3 || !polygon.every(point =>
    Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))) {
    throw new Error('Invalid project: each room needs a polygon');
  }
  const twiceArea = polygon.reduce((sum, [x, z], i) => {
    const [nextX, nextZ] = polygon[(i + 1) % polygon.length];
    return sum + x * nextZ - nextX * z;
  }, 0);
  return Number((Math.abs(twiceArea) / 2 * scale ** 2).toFixed(2));
}

async function readProjectContext(path) {
  const project = JSON.parse(await readFile(path, 'utf8'));
  if (project?.version !== 1 || typeof project.name !== 'string' || !Number.isFinite(project.ceilingHeight)
      || !Number.isFinite(project.scale) || project.scale <= 0 || !Array.isArray(project.rooms) || !Array.isArray(project.variants)) {
    throw new Error('Invalid project: expected an Apartment Studio version 1 export');
  }
  const variant = project.variants.find(item => item?.id === project.activeVariantId);
  if (typeof variant?.name !== 'string' || !Array.isArray(variant.furniture) || !Array.isArray(variant.electrical?.points)) {
    throw new Error('Invalid project: missing active variant, furniture, or electrical points');
  }
  return {
    name: project.name,
    roomCount: project.rooms.length,
    rooms: project.rooms.map(room => {
      if (typeof room?.id !== 'string' || typeof room.name !== 'string') throw new Error('Invalid project: missing room ID or name');
      return { id: room.id, name: room.name, areaM2: roomArea(room.polygon, project.scale) };
    }),
    ceilingHeight: project.ceilingHeight,
    activeVariantName: variant.name,
    furnitureCount: variant.furniture.length,
    electricalCount: variant.electrical.points.length,
    doorStyle: variant.doorStyle ?? 'framed',
    skirting: { color: variant.skirtingColor ?? '#ede9e0', height: variant.skirtingHeight ?? 0.08 },
  };
}

async function readPrompt() {
  if (process.stdin.isTTY) throw new Error('Supply --prompt or pipe a request on stdin');
  let prompt = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    prompt += chunk;
    if (prompt.length > 8000) throw new Error('Invalid prompt: stdin exceeds 8000 characters');
  }
  return prompt;
}

async function main() {
  const { values } = parseArgs({ options: {
    'list-providers': { type: 'boolean' },
    provider: { type: 'string', default: 'auto' },
    model: { type: 'string' },
    prompt: { type: 'string' },
    project: { type: 'string' },
    json: { type: 'boolean' },
    out: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  } });

  if (values.help) {
    console.log(usage);
    return;
  }
  if (values['list-providers']) {
    const detected = await detectProviders();
    if (values.json) console.log(JSON.stringify(detected, null, 2));
    else for (const { name, command, runnableViaNode } of detected) {
      console.log(`${name}: ${command ?? 'not found'}${runnableViaNode ? ' (uses running Node)' : ''}`);
    }
    return;
  }

  const { provider, model } = values;
  const prompt = values.prompt ?? await readPrompt();
  validateAgentRequest(provider === 'offline' ? 'auto' : provider, model, prompt);
  const context = values.project === undefined ? {} : await readProjectContext(values.project);
  let result;
  if (provider === 'offline') {
    const message = createTextSurface(`Offline mode: no model was run.\n\n${prompt.trim()}`, { surfaceId: 'offline' });
    if (values.project !== undefined) message.createSurface.dataModel.project = context;
    result = { provider, model: 'none', elapsedMs: 0, messages: [message] };
  } else {
    result = await runCliAgent({ provider, model, prompt, context });
  }

  const json = JSON.stringify(result.messages, null, 2);
  if (values.out !== undefined) await writeFile(values.out, `${json}\n`, 'utf8');
  if (values.json) console.log(json);
  else {
    console.log(`${result.provider} (${result.model}, ${result.elapsedMs} ms): ${result.messages.length} A2UI message(s)`);
    console.log(values.out === undefined ? json : `Wrote ${values.out}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(`agent-cli: ${error.message}`);
  process.exitCode = 1;
}

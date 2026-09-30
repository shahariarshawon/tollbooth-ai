/**
 * Sends a chat completion through a running gateway and shows what came back.
 *
 *   pnpm gateway:test
 *   pnpm gateway:test -- --model gpt-4o-mini --prompt "Say hi in five words"
 *   TOLLBOOTH_API_KEY=tb_... pnpm gateway:test -- --url https://gateway.example.com
 *
 * Without TOLLBOOTH_API_KEY it issues a development key for the seeded TechCorp project (needs the
 * database from `pnpm db:seed`), uses it, and revokes it again. The key exists only in this process.
 */
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { createHash, randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: process.env['GATEWAY_URL'] ?? 'http://localhost:3000' },
    model: { type: 'string', default: 'gpt-4o-mini' },
    prompt: { type: 'string', default: 'Reply with one short sentence about toll booths.' },
  },
  allowPositionals: false,
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
});

const baseUrl = String(values.url).replace(/\/$/, '');
const prisma = new PrismaClient();
const DEV_KEY_NAME = 'Gateway test script';

const line = (label: string, value: unknown) =>
  console.log(`  ${label.padEnd(14)} ${String(value)}`);

/** Issues (or re-keys) a development key. Only its hash is stored. */
async function issueDevKey(): Promise<{ raw: string; id: string }> {
  const project = await prisma.project.findFirst({
    where: { name: 'Customer Support AI', tenant: { slug: 'techcorp-ai' } },
  });
  if (!project) throw new Error('Seeded project not found. Run `pnpm db:seed` first.');

  const raw = `tb_dev_${randomBytes(24).toString('hex')}`;
  const data = {
    keyHash: createHash('sha256').update(raw).digest('hex'),
    keyPrefix: raw.slice(0, 11),
    permissions: ['chat:completions'],
    status: 'ACTIVE' as const,
  };
  const existing = await prisma.apiKey.findFirst({
    where: { projectId: project.id, name: DEV_KEY_NAME },
  });
  const key = existing
    ? await prisma.apiKey.update({ where: { id: existing.id }, data })
    : await prisma.apiKey.create({
        data: { ...data, name: DEV_KEY_NAME, tenantId: project.tenantId, projectId: project.id },
      });
  return { raw, id: key.id };
}

async function main(): Promise<number> {
  const provided = process.env['TOLLBOOTH_API_KEY'];
  const issued = provided ? null : await issueDevKey();
  const apiKey = provided ?? issued!.raw;

  console.log(`Gateway: ${baseUrl}`);
  const health = await axios
    .get(`${baseUrl}/health`, { validateStatus: () => true })
    .catch(() => null);
  if (!health || health.status !== 200) {
    console.error(
      'The gateway is not reachable. Start it with: pnpm --filter @tollbooth/gateway dev',
    );
    return 1;
  }

  // The real request.
  const started = performance.now();
  const response = await axios.post(
    `${baseUrl}/v1/chat/completions`,
    { model: values.model, messages: [{ role: 'user', content: values.prompt }], temperature: 0.7 },
    { headers: { Authorization: `Bearer ${apiKey}` }, validateStatus: () => true },
  );
  const clientLatency = Math.round(performance.now() - started);

  console.log('\nRequest');
  line('model', values.model);
  line('prompt', values.prompt);
  console.log('\nResponse');
  line('status', response.status);
  line('request id', response.headers['x-request-id']);
  let exitCode = 0;
  if (response.status === 200) {
    const { choices, usage, model } = response.data as {
      choices: { message: { content: string } }[];
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model: string;
    };
    line('served by', model);
    line('reply', JSON.stringify(choices[0]?.message.content));
    console.log('\nTokens');
    line('input', usage.prompt_tokens);
    line('output', usage.completion_tokens);
    line('total', usage.total_tokens);
    console.log('\nLatency');
    line('round trip', `${clientLatency} ms (as seen by this script)`);
  } else {
    console.log(JSON.stringify(response.data, null, 2));
    exitCode = 1;
  }

  // What the gateway recorded for this call.
  const keyRow = issued
    ? { id: issued.id }
    : await prisma.apiKey.findUnique({
        where: { keyHash: createHash('sha256').update(apiKey).digest('hex') },
        select: { id: true },
      });
  const record = keyRow
    ? await prisma.aiRequest.findFirst({
        where: { apiKeyId: keyRow.id },
        orderBy: { createdAt: 'desc' },
      })
    : null;
  console.log('\nSaved request record');
  if (record) {
    line('status', record.status);
    line('provider', record.provider);
    line(
      'tokens',
      `${record.requestTokens} in / ${record.responseTokens} out / ${record.totalTokens} total`,
    );
    line('latency', `${record.latencyMs} ms (gateway, to provider response)`);
    if (record.errorMessage) line('error', record.errorMessage);
  } else {
    console.log('  none found');
  }

  // Quick negative checks that prove the guardrails are on.
  console.log('\nChecks');
  const badKey = await axios.post(
    `${baseUrl}/v1/chat/completions`,
    { model: values.model, messages: [{ role: 'user', content: 'hi' }] },
    {
      headers: { Authorization: 'Bearer tb_not_a_real_key_0123456789abcdef' },
      validateStatus: () => true,
    },
  );
  line('invalid key', `${badKey.status} ${badKey.status === 401 ? 'ok' : 'UNEXPECTED'}`);
  const badModel = await axios.post(
    `${baseUrl}/v1/chat/completions`,
    { model: 'unknown-model', messages: [{ role: 'user', content: 'hi' }] },
    { headers: { Authorization: `Bearer ${apiKey}` }, validateStatus: () => true },
  );
  line('unknown model', `${badModel.status} ${badModel.status === 400 ? 'ok' : 'UNEXPECTED'}`);

  if (issued) await prisma.apiKey.update({ where: { id: issued.id }, data: { status: 'REVOKED' } });
  return exitCode;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import { hash } from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient, ProviderType } from '@prisma/client';

const prisma = new PrismaClient();

// Development-only credential shared by the seeded users. Never use it outside local environments.
const DEV_PASSWORD = 'ChangeMe123!';

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

async function seedProviders() {
  const definitions = [
    { name: 'OpenAI', type: ProviderType.OPENAI },
    { name: 'Anthropic', type: ProviderType.ANTHROPIC },
    { name: 'Google', type: ProviderType.GOOGLE },
  ];
  const providers = new Map<ProviderType, string>();
  for (const definition of definitions) {
    const provider = await prisma.aiProvider.upsert({
      where: { name: definition.name },
      update: {},
      create: definition,
    });
    providers.set(provider.type, provider.id);
  }
  return providers;
}

async function seedModels(providers: Map<ProviderType, string>) {
  // Prices are USD per 1,000,000 tokens and are development values, not a price list.
  const models = [
    { type: ProviderType.OPENAI, modelName: 'gpt-4', input: '30.00', output: '60.00' },
    { type: ProviderType.OPENAI, modelName: 'gpt-4o', input: '2.50', output: '10.00' },
    { type: ProviderType.OPENAI, modelName: 'gpt-4o-mini', input: '0.15', output: '0.60' },
    {
      type: ProviderType.ANTHROPIC,
      modelName: 'claude-sonnet-4-5',
      input: '3.00',
      output: '15.00',
    },
  ];
  for (const model of models) {
    const providerId = providers.get(model.type);
    if (!providerId) throw new Error(`Provider ${model.type} was not seeded`);
    await prisma.aiModel.upsert({
      where: { providerId_modelName: { providerId, modelName: model.modelName } },
      update: {},
      create: {
        providerId,
        modelName: model.modelName,
        inputTokenPrice: model.input,
        outputTokenPrice: model.output,
      },
    });
  }
}

async function seedTenant() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'techcorp-ai' },
    update: {},
    create: { companyName: 'TechCorp AI', slug: 'techcorp-ai', plan: 'STARTUP' },
  });

  const users = [
    { email: 'admin@techcorp.com', firstName: 'Ada', lastName: 'Admin', role: 'TENANT_ADMIN' },
    { email: 'developer@techcorp.com', firstName: 'Dev', lastName: 'Eloper', role: 'DEVELOPER' },
  ] as const;
  const passwordHash = await hashPassword(DEV_PASSWORD);
  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      // Re-seeding resets the development password, which also migrates older hash formats.
      update: { passwordHash },
      create: { ...user, tenantId: tenant.id, status: 'ACTIVE', passwordHash },
    });
  }

  return prisma.project.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Customer Support AI' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Customer Support AI',
      description: 'Support chatbot for TechCorp customers',
    },
  });
}

async function seedApiKey(project: { id: string; tenantId: string }) {
  const name = 'Development key';
  const existing = await prisma.apiKey.findFirst({ where: { projectId: project.id, name } });
  if (existing) {
    console.log('Development API key already exists; its raw value is not recoverable.');
    return;
  }

  const rawKey = `tb_dev_${randomBytes(24).toString('hex')}`;
  await prisma.apiKey.create({
    data: {
      tenantId: project.tenantId,
      projectId: project.id,
      name,
      keyHash: hashApiKey(rawKey),
      keyPrefix: rawKey.slice(0, 11),
      permissions: ['chat:completions'],
      rateLimit: 60,
    },
  });
  console.log(`Development API key (shown once, only its hash is stored): ${rawKey}`);
}

async function main() {
  const providers = await seedProviders();
  await seedModels(providers);
  const project = await seedTenant();
  await seedApiKey(project);
  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

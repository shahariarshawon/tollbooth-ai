import type { PrismaClient } from '@prisma/client';
import { ProviderType } from '@prisma/client';

/**
 * Reference data every deployment needs: the provider and model catalogue the gateway routes with,
 * and the billing plans. Safe to run in production, and safe to run again:
 *
 * - it only creates what is missing and never overwrites a row, so a provider an operator switched
 *   on, a tier they chose or a plan they edited survives a re-run;
 * - it creates no tenants, users or credentials of any kind.
 */

/**
 * Gemini is the active provider. OpenAI and Anthropic stay in the catalogue, implemented in the gateway
 * and ready to switch on, but DISABLED: the router will not send them traffic until their status is
 * set to ACTIVE (and their API key is configured).
 *
 * `configuration.tier` says whether the provider account is billed: "free" (a Google AI Studio key on
 * the free plan costs nothing) or "paid".
 */
const PROVIDERS = [
  { name: 'Google Gemini', type: ProviderType.GOOGLE, status: 'ACTIVE', tier: 'free' },
  { name: 'OpenAI', type: ProviderType.OPENAI, status: 'DISABLED', tier: 'paid' },
  { name: 'Anthropic', type: ProviderType.ANTHROPIC, status: 'DISABLED', tier: 'paid' },
] as const;

/**
 * USD per 1,000,000 tokens, at paid-tier rates. These are starting values: check them against each
 * provider's current price list before relying on them for money.
 */
const MODELS = [
  { type: ProviderType.GOOGLE, modelName: 'gemini-2.0-flash', input: '0.10', output: '0.40' },
  { type: ProviderType.GOOGLE, modelName: 'gemini-2.0-flash-lite', input: '0.075', output: '0.30' },
  { type: ProviderType.GOOGLE, modelName: 'gemini-2.5-flash', input: '0.30', output: '2.50' },
  { type: ProviderType.GOOGLE, modelName: 'gemini-2.5-pro', input: '1.25', output: '10.00' },
  { type: ProviderType.OPENAI, modelName: 'gpt-4', input: '30.00', output: '60.00' },
  { type: ProviderType.OPENAI, modelName: 'gpt-4o', input: '2.50', output: '10.00' },
  { type: ProviderType.OPENAI, modelName: 'gpt-4o-mini', input: '0.15', output: '0.60' },
  { type: ProviderType.ANTHROPIC, modelName: 'claude-sonnet-4-5', input: '3.00', output: '15.00' },
] as const;

const PLANS = [
  {
    name: 'Free Tier',
    code: 'FREE',
    description: 'Ideal for evaluation and experimenting with LLM APIs.',
    monthlyPrice: '0.00',
    monthlyBudgetLimit: '25.00',
    dailyBudgetLimit: '5.00',
    requestsPerMinute: 30,
    requestsPerDay: 1000,
    tokensPerMinute: 50000,
    tokensPerDay: 500000,
    features: ['Gemini Flash access', 'Community support', 'Basic rate limiting'],
  },
  {
    name: 'Startup',
    code: 'STARTUP',
    description: 'For growing teams building production AI features.',
    monthlyPrice: '49.00',
    monthlyBudgetLimit: '250.00',
    dailyBudgetLimit: '25.00',
    requestsPerMinute: 120,
    requestsPerDay: 20000,
    tokensPerMinute: 250000,
    tokensPerDay: 5000000,
    features: [
      'All Gemini & OpenAI models',
      'Team management',
      'Cost & budget alerts',
      'Audit logs',
    ],
  },
  {
    name: 'Business',
    code: 'BUSINESS',
    description: 'High throughput, multi-team governance and custom limits.',
    monthlyPrice: '199.00',
    monthlyBudgetLimit: '1000.00',
    dailyBudgetLimit: '100.00',
    requestsPerMinute: 600,
    requestsPerDay: 100000,
    tokensPerMinute: 1000000,
    tokensPerDay: 25000000,
    features: [
      'Multi-provider routing',
      'Advanced RBAC & teams',
      'Real-time telemetry',
      'Priority support',
    ],
  },
  {
    name: 'Enterprise',
    code: 'ENTERPRISE',
    description: 'Dedicated infrastructure, custom SLAs, and custom limits.',
    monthlyPrice: '799.00',
    monthlyBudgetLimit: '5000.00',
    dailyBudgetLimit: '500.00',
    requestsPerMinute: 2400,
    requestsPerDay: 1000000,
    tokensPerMinute: 5000000,
    tokensPerDay: 100000000,
    features: [
      'Custom provider keys',
      'Dedicated Redis cluster',
      'Custom legal terms',
      '24/7 dedicated support',
    ],
  },
] as const;

async function seedProviders(prisma: PrismaClient): Promise<Map<ProviderType, string>> {
  // Databases seeded before Gemini became the primary provider have a row called "Google".
  const legacy = await prisma.aiProvider.findUnique({ where: { name: 'Google' } });
  if (legacy && !(await prisma.aiProvider.findUnique({ where: { name: 'Google Gemini' } }))) {
    await prisma.aiProvider.update({ where: { id: legacy.id }, data: { name: 'Google Gemini' } });
  }

  const ids = new Map<ProviderType, string>();
  for (const definition of PROVIDERS) {
    const provider = await prisma.aiProvider.upsert({
      where: { name: definition.name },
      update: {},
      create: {
        name: definition.name,
        type: definition.type,
        status: definition.status,
        configuration: { tier: definition.tier },
      },
    });
    ids.set(provider.type, provider.id);
  }
  return ids;
}

async function seedModels(prisma: PrismaClient, providers: Map<ProviderType, string>) {
  for (const model of MODELS) {
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

async function seedBillingPlans(prisma: PrismaClient) {
  for (const { features, ...plan } of PLANS) {
    await prisma.billingPlan.upsert({
      where: { code: plan.code },
      update: {},
      create: { ...plan, features: [...features] },
    });
  }
}

export async function seedReferenceData(prisma: PrismaClient): Promise<void> {
  const providers = await seedProviders(prisma);
  await seedModels(prisma, providers);
  await seedBillingPlans(prisma);
  console.log('Reference data ready: providers, models and billing plans.');
}

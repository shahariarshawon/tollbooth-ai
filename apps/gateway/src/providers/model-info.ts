import type { ModelInfo, ProviderId } from './provider.interface';

/**
 * Limits of the models the gateway knows about, so it can refuse an impossible request (a prompt longer
 * than the context window, a max_tokens above what the model can produce) without a round trip.
 *
 * A model missing from this table is not an error: its limits are simply not checked locally and the
 * provider decides. Keep entries to numbers published by the providers; prices are deliberately absent,
 * they live in the `ai_models` table so they can change without a deploy.
 */
const MODELS: Record<ProviderId, Record<string, Omit<ModelInfo, 'name'>>> = {
  gemini: {
    'gemini-2.0-flash': { contextWindow: 1_048_576, maxOutputTokens: 8_192 },
    'gemini-2.0-flash-lite': { contextWindow: 1_048_576, maxOutputTokens: 8_192 },
    'gemini-2.5-flash': { contextWindow: 1_048_576, maxOutputTokens: 65_536 },
    'gemini-2.5-pro': { contextWindow: 1_048_576, maxOutputTokens: 65_536 },
    'gemini-1.5-flash': { contextWindow: 1_048_576, maxOutputTokens: 8_192 },
    'gemini-1.5-pro': { contextWindow: 2_097_152, maxOutputTokens: 8_192 },
  },
  openai: {
    'gpt-4': { contextWindow: 8_192, maxOutputTokens: 8_192 },
    'gpt-4o': { contextWindow: 128_000, maxOutputTokens: 16_384 },
    'gpt-4o-mini': { contextWindow: 128_000, maxOutputTokens: 16_384 },
  },
  anthropic: {
    'claude-sonnet-4-5': { contextWindow: 200_000, maxOutputTokens: 64_000 },
  },
};

export function lookupModelInfo(provider: ProviderId, model: string): ModelInfo | undefined {
  const known = MODELS[provider][model];
  return known ? { name: model, ...known } : undefined;
}

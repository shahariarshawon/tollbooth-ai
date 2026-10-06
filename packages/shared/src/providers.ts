/** The gateway's name for a provider, used in routing, metrics and Redis keys. */
export type ProviderId = 'gemini' | 'openai' | 'anthropic';

/** `ProviderType` is the database enum; `ProviderId` is what the gateway and its keys call the same provider. */
export const PROVIDER_ID_BY_TYPE = {
  GOOGLE: 'gemini',
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
} as const satisfies Record<string, ProviderId>;

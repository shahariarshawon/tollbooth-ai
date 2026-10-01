import { Module } from '@nestjs/common';
import { TokensModule } from '../tokens/tokens.module';
import { AnthropicProvider } from './anthropic.provider';
import { GeminiProvider } from './gemini.provider';
import { OpenAIProvider } from './openai.provider';
import { AI_PROVIDERS } from './provider.interface';
import { ProviderRouter } from './provider.router';

@Module({
  imports: [TokensModule],
  providers: [
    GeminiProvider,
    OpenAIProvider,
    AnthropicProvider,
    // Register new providers here; the router picks them up by `type`. Whether one actually serves
    // traffic is decided by its row in ai_providers and by whether its API key is set.
    {
      provide: AI_PROVIDERS,
      useFactory: (
        gemini: GeminiProvider,
        openai: OpenAIProvider,
        anthropic: AnthropicProvider,
      ) => [gemini, openai, anthropic],
      inject: [GeminiProvider, OpenAIProvider, AnthropicProvider],
    },
    ProviderRouter,
  ],
  exports: [ProviderRouter],
})
export class ProvidersModule {}

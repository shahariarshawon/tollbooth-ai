import { Module } from '@nestjs/common';
import { OpenAIProvider } from './openai.provider';
import { AI_PROVIDERS } from './provider.interface';
import { ProviderService } from './provider.service';

@Module({
  providers: [
    OpenAIProvider,
    // Register new providers here; ProviderService picks them up by `type`.
    {
      provide: AI_PROVIDERS,
      useFactory: (openai: OpenAIProvider) => [openai],
      inject: [OpenAIProvider],
    },
    ProviderService,
  ],
  exports: [ProviderService],
})
export class ProvidersModule {}

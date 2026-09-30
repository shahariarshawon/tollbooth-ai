import { Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { getEncoding } from 'js-tiktoken';
import type { Tiktoken, TiktokenEncoding } from 'js-tiktoken';
import type { ChatMessage } from '../providers/provider.interface';

// Per-message overhead of the OpenAI chat format: <|start|>{role}\n{content}<|end|>\n, plus three
// tokens that prime the assistant reply. These match OpenAI published counting guidance.
const TOKENS_PER_MESSAGE = 3;
const REPLY_PRIMING = 3;

// Newer OpenAI model families use the o200k vocabulary; gpt-4, gpt-3.5 and unknown names use cl100k.
const O200K_FAMILIES = /^(gpt-4o|gpt-4\.1|gpt-5|o\d)/;

/**
 * Counts tokens with OpenAI tokenizers. Providers report exact usage and that is what gets recorded
 * when available; these counts are the fallback (provider gave no usage) and the input estimate kept
 * when a call fails before any usage exists.
 */
@Injectable()
export class TokenCounter implements OnModuleInit {
  private readonly encoders = new Map<TiktokenEncoding, Tiktoken>();

  /** Loading a vocabulary takes about half a second, so do it at startup, not on the first request. */
  onModuleInit(): void {
    this.encoderFor('gpt-4');
    this.encoderFor('gpt-4o');
  }

  countMessages(model: string, messages: ChatMessage[]): number {
    const encoder = this.encoderFor(model);
    let total = REPLY_PRIMING;
    for (const message of messages) {
      total += TOKENS_PER_MESSAGE;
      total += encoder.encode(message.role).length + encoder.encode(message.content).length;
      // A name replaces the role in the wire format, so it costs its length minus the role token.
      if (message.name) total += encoder.encode(message.name).length - 1;
    }
    return total;
  }

  countText(model: string, text: string): number {
    return text ? this.encoderFor(model).encode(text).length : 0;
  }

  private encoderFor(model: string): Tiktoken {
    const name: TiktokenEncoding = O200K_FAMILIES.test(model) ? 'o200k_base' : 'cl100k_base';
    let encoder = this.encoders.get(name);
    if (!encoder) {
      // Building an encoder loads a large vocabulary, so each one is created once and reused.
      encoder = getEncoding(name);
      this.encoders.set(name, encoder);
    }
    return encoder;
  }
}

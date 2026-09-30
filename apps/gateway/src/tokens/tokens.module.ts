import { Module } from '@nestjs/common';
import { TokenCounter } from './token-counter.service';

@Module({ providers: [TokenCounter], exports: [TokenCounter] })
export class TokensModule {}

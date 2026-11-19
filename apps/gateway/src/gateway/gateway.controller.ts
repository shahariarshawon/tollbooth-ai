import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiKeyGuard } from '../api-key/api-key.guard';
import { RequireKeyPermission } from '../api-key/require-key-permission.decorator';
import { BudgetGuard } from '../budget/budget.guard';
import type { GatewayRequest } from '../common/types/gateway-request';
import { ChatCompletionRequestDto } from '../dto/chat-completion.dto';
import type { ChatCompletionResponse } from '../dto/chat-completion.response';
import { SecurityGuard } from '../security/security.guard';
import { RateLimitGuard } from '../traffic/rate-limit.guard';
import { GatewayService } from './gateway.service';

/** The OpenAI-compatible surface. Point an OpenAI client at this base URL and it works unchanged. */
@Controller('v1')
@UseGuards(ApiKeyGuard, RateLimitGuard, BudgetGuard, SecurityGuard)
export class GatewayController {
  constructor(private readonly gateway: GatewayService) {}

  @Post('chat/completions')
  @HttpCode(HttpStatus.OK)
  @RequireKeyPermission('chat:completions')
  async chatCompletions(
    @Body() dto: ChatCompletionRequestDto,
    @Req() request: GatewayRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ChatCompletionResponse | void> {
    const context = { requestId: request.id, auth: request.auth! };

    if (dto.stream === true) {
      await this.gateway.streamChatCompletion(context, dto, request, response);
      return;
    }

    return this.gateway.createChatCompletion(context, dto);
  }
}

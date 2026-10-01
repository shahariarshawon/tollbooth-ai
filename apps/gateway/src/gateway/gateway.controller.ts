import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../api-key/api-key.guard';
import { BudgetGuard } from '../budget/budget.guard';
import { RequireKeyPermission } from '../api-key/require-key-permission.decorator';
import { SecurityGuard } from '../security/security.guard';
import type { GatewayRequest } from '../common/types/gateway-request';
import { ChatCompletionRequestDto } from '../dto/chat-completion.dto';
import type { ChatCompletionResponse } from '../dto/chat-completion.response';
import { RateLimitGuard } from '../traffic/rate-limit.guard';
import { GatewayService } from './gateway.service';

/** The OpenAI-compatible surface. Point an OpenAI client at this base URL and it works unchanged. */
@Controller('v1')
// Order matters: identify the caller, then count the request, then check the budget, then check the
// content (Phase 9) — each step only runs once everything cheaper and more fundamental has passed.
@UseGuards(ApiKeyGuard, RateLimitGuard, BudgetGuard, SecurityGuard)
export class GatewayController {
  constructor(private readonly gateway: GatewayService) {}

  @Post('chat/completions')
  @HttpCode(HttpStatus.OK)
  @RequireKeyPermission('chat:completions')
  chatCompletions(
    @Body() dto: ChatCompletionRequestDto,
    @Req() request: GatewayRequest,
  ): Promise<ChatCompletionResponse> {
    // `auth` is always set: the guard rejects the request before this runs otherwise.
    return this.gateway.createChatCompletion({ requestId: request.id, auth: request.auth! }, dto);
  }
}

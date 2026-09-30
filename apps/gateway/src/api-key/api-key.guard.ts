import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GatewayErrors } from '../common/errors/gateway.exception';
import type { GatewayRequest } from '../common/types/gateway-request';
import { ApiKeyService } from './api-key.service';
import { KEY_PERMISSION_METADATA } from './require-key-permission.decorator';

/**
 * Pipeline steps 1 to 3: validate the API key, identify the tenant and project it belongs to, and
 * check the key may use this endpoint. On success the identity is attached as `request.auth`.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GatewayRequest>();

    const header = request.headers.authorization;
    if (!header) throw GatewayErrors.missingApiKey();
    const [scheme, token, ...extra] = header.trim().split(/\s+/);
    if (scheme?.toLowerCase() !== 'bearer' || !token || extra.length > 0) {
      throw GatewayErrors.invalidApiKey();
    }

    const auth = await this.apiKeys.authenticate(token);

    const required = this.reflector.getAllAndOverride<string | undefined>(KEY_PERMISSION_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !auth.permissions.includes(required)) {
      throw GatewayErrors.keyPermissionDenied(required);
    }

    request.auth = auth;
    return true;
  }
}

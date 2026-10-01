import { HttpStatus } from '@nestjs/common';
import { GatewayException } from '../common/errors/gateway.exception';

/** 503. The AI Security Service could not be reached and the gateway is set to fail closed. */
export class SecurityServiceUnavailableException extends GatewayException {
  constructor() {
    super(HttpStatus.SERVICE_UNAVAILABLE, {
      message:
        'The content safety check could not be completed right now. Please try again shortly.',
      type: 'api_error',
      code: 'security_service_unavailable',
    });
  }
}

import { SetMetadata } from '@nestjs/common';

export const KEY_PERMISSION_METADATA = 'requiredKeyPermission';

/** The scope an API key must hold to call a route, for example "chat:completions". */
export const RequireKeyPermission = (permission: string) =>
  SetMetadata(KEY_PERMISSION_METADATA, permission);

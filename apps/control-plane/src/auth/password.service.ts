import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config.module';

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.config.BCRYPT_ROUNDS);
  }

  /**
   * Checks a password. When there is no stored hash (unknown user) it still performs a full bcrypt
   * comparison against a throwaway hash, so response time does not reveal whether an email exists.
   */
  async verify(plain: string, hash: string | undefined): Promise<boolean> {
    if (hash === undefined) {
      this.dummyHash ??= this.hash('timing-equalisation-only');
      await bcrypt.compare(plain, await this.dummyHash);
      return false;
    }
    return bcrypt.compare(plain, hash);
  }
}

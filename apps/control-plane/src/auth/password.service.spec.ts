import type { AppConfig } from '../config/config.module';
import { PasswordService } from './password.service';

const service = new PasswordService({ BCRYPT_ROUNDS: 10 } as AppConfig);

describe('PasswordService', () => {
  it('never stores the plain password: output is a bcrypt hash', async () => {
    const hash = await service.hash('Correct-Horse-1');
    expect(hash).not.toContain('Correct-Horse-1');
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
  });

  it('salts: hashing the same password twice gives different hashes', async () => {
    const [a, b] = await Promise.all([
      service.hash('Same-Password-1'),
      service.hash('Same-Password-1'),
    ]);
    expect(a).not.toBe(b);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await service.hash('Right-Password-1');
    await expect(service.verify('Right-Password-1', hash)).resolves.toBe(true);
    await expect(service.verify('Wrong-Password-1', hash)).resolves.toBe(false);
  });

  it('rejects when there is no stored hash (unknown user) without throwing', async () => {
    await expect(service.verify('Whatever-Password-1', undefined)).resolves.toBe(false);
  });
});

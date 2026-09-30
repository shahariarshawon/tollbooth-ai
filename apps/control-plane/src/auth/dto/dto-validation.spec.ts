import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

const valid = {
  email: 'Ada@Example.com ',
  password: 'Sup3rSecret',
  firstName: 'Ada',
  lastName: 'Lovelace',
  companyName: 'Analytical Engines',
  tenantSlug: 'analytical-engines',
};

async function errorsFor(overrides: Record<string, unknown>) {
  const dto = plainToInstance(RegisterDto, { ...valid, ...overrides });
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

describe('RegisterDto', () => {
  it('accepts valid input and normalises the email', async () => {
    const dto = plainToInstance(RegisterDto, valid);
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.email).toBe('ada@example.com');
  });

  it.each([
    ['too short', 'Ab1'],
    ['no uppercase', 'lowercase123'],
    ['no lowercase', 'UPPERCASE123'],
    ['no number', 'NoNumbersHere'],
    ['over bcrypt limit', 'Aa1' + 'x'.repeat(80)],
  ])('rejects a password that is %s', async (_label, password) => {
    const errors = await errorsFor({ password });
    expect(errors.map((e) => e.property)).toContain('password');
  });

  it('does not echo the submitted password in the error message', async () => {
    const errors = await errorsFor({ password: 'weak' });
    expect(JSON.stringify(errors.map((e) => e.constraints))).not.toContain('weak"');
  });

  it.each(['Bad Slug', '-leading', 'trailing-', 'a', 'has_underscore'])(
    'rejects tenant slug %j',
    async (tenantSlug) => {
      const errors = await errorsFor({ tenantSlug });
      expect(errors.map((e) => e.property)).toContain('tenantSlug');
    },
  );

  it('lowercases the tenant slug rather than rejecting it', async () => {
    const dto = plainToInstance(RegisterDto, { ...valid, tenantSlug: ' Acme-Corp ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.tenantSlug).toBe('acme-corp');
  });

  it('rejects unknown fields, which blocks attempts to set role or status', async () => {
    const errors = await errorsFor({ role: 'SUPER_ADMIN' });
    expect(errors.map((e) => e.property)).toContain('role');
  });
});

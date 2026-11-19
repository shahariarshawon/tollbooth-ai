import { isModelPermitted, normalizeModelIdentifier } from './model-authorization';

describe('Model Authorization (F03 security fix)', () => {
  describe('normalizeModelIdentifier', () => {
    it('normalizes letter case and trims whitespace', () => {
      expect(normalizeModelIdentifier('  GPT-4O  ')).toBe('gpt-4o');
      expect(normalizeModelIdentifier('Gemini-2.0-Flash')).toBe('gemini-2.0-flash');
    });

    it('resolves explicit aliases from MODEL_ALIASES', () => {
      expect(normalizeModelIdentifier('models/gemini-2.0-flash')).toBe('gemini-2.0-flash');
      expect(normalizeModelIdentifier('models/gemini-2.0-flash-lite')).toBe(
        'gemini-2.0-flash-lite',
      );
      expect(normalizeModelIdentifier('models/gemini-1.5-pro')).toBe('gemini-1.5-pro');
      expect(normalizeModelIdentifier('MODELS/GEMINI-2.0-FLASH')).toBe('gemini-2.0-flash');
    });

    it('does not alias unreviewed or arbitrary model strings', () => {
      expect(normalizeModelIdentifier('custom/gpt-4o')).toBe('custom/gpt-4o');
      expect(normalizeModelIdentifier('unknown-prefix/gemini-2.0-flash')).toBe(
        'unknown-prefix/gemini-2.0-flash',
      );
    });

    it('handles empty or non-string values safely', () => {
      expect(normalizeModelIdentifier('')).toBe('');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(normalizeModelIdentifier(null as any)).toBe('');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(normalizeModelIdentifier(undefined as any)).toBe('');
    });
  });

  describe('isModelPermitted - policy semantics and exact matching', () => {
    describe('unrestricted policy (null, undefined, or empty array)', () => {
      it('permits any model when allowedModels is null', () => {
        expect(isModelPermitted('gpt-4o', null)).toBe(true);
        expect(isModelPermitted('gemini-2.0-flash', null)).toBe(true);
      });

      it('permits any model when allowedModels is undefined', () => {
        expect(isModelPermitted('gpt-4o', undefined)).toBe(true);
        expect(isModelPermitted('gemini-2.0-flash-lite', undefined)).toBe(true);
      });

      it('permits any model when allowedModels is empty array []', () => {
        expect(isModelPermitted('gpt-4o', [])).toBe(true);
        expect(isModelPermitted('claude-sonnet-4-5', [])).toBe(true);
      });
    });

    describe('positive authorization: explicitly allowed models succeed', () => {
      it('authorizes exact match regardless of case/whitespace', () => {
        expect(isModelPermitted('gpt-4o', ['gpt-4o'])).toBe(true);
        expect(isModelPermitted('GPT-4O', ['gpt-4o'])).toBe(true);
        expect(isModelPermitted('  gpt-4o  ', ['GPT-4O'])).toBe(true);
        expect(isModelPermitted('gemini-2.0-flash', ['gemini-2.0-flash', 'gpt-4o'])).toBe(true);
      });

      it('authorizes explicitly configured alias against canonical allowed model', () => {
        expect(isModelPermitted('models/gemini-2.0-flash', ['gemini-2.0-flash'])).toBe(true);
        expect(isModelPermitted('gemini-2.0-flash', ['models/gemini-2.0-flash'])).toBe(true);
      });
    });

    describe('negative authorization: elimination of unsafe substring matches', () => {
      it('denies gpt-4o-mini when only gpt-4o is allowed (previously allowed by substring)', () => {
        expect(isModelPermitted('gpt-4o-mini', ['gpt-4o'])).toBe(false);
      });

      it('denies gpt-4o when only gpt-4o-mini is allowed (previously allowed by substring)', () => {
        expect(isModelPermitted('gpt-4o', ['gpt-4o-mini'])).toBe(false);
      });

      it('denies gemini-2.0-flash-lite when only gemini-2.0-flash is allowed', () => {
        expect(isModelPermitted('gemini-2.0-flash-lite', ['gemini-2.0-flash'])).toBe(false);
      });

      it('denies gemini-2.0-flash when only gemini-2.0-flash-lite is allowed', () => {
        expect(isModelPermitted('gemini-2.0-flash', ['gemini-2.0-flash-lite'])).toBe(false);
      });

      it('shorter prefix does not authorize longer identifier (e.g., gpt-4 does not authorize gpt-4o)', () => {
        expect(isModelPermitted('gpt-4o', ['gpt-4'])).toBe(false);
        expect(isModelPermitted('gpt-4-turbo', ['gpt-4'])).toBe(false);
      });

      it('longer identifier does not authorize shorter prefix (e.g., gpt-4o does not authorize gpt-4)', () => {
        expect(isModelPermitted('gpt-4', ['gpt-4o'])).toBe(false);
      });

      it('rejects unknown model identifiers under restricted policy', () => {
        expect(isModelPermitted('unknown-vendor-model-99', ['gpt-4o', 'gemini-2.0-flash'])).toBe(
          false,
        );
      });

      it('rejects unknown or invalid aliases', () => {
        expect(isModelPermitted('unsupported/gemini-2.0-flash', ['gemini-2.0-flash'])).toBe(false);
      });

      it('handles empty requested model safely without throwing', () => {
        expect(isModelPermitted('', ['gpt-4o'])).toBe(false);
      });
    });

    describe('tenant and API-key policy isolation', () => {
      const tenantA_allowed = ['gpt-4o'];
      const tenantB_allowed = ['gemini-2.0-flash'];
      const tenantC_unrestricted: string[] = [];

      it('maintains strict model isolation between different tenants and keys', () => {
        // Tenant A key trying to use Gemini (only permitted for Tenant B)
        expect(isModelPermitted('gemini-2.0-flash', tenantA_allowed)).toBe(false);
        expect(isModelPermitted('gpt-4o', tenantA_allowed)).toBe(true);

        // Tenant B key trying to use gpt-4o
        expect(isModelPermitted('gpt-4o', tenantB_allowed)).toBe(false);
        expect(isModelPermitted('gemini-2.0-flash', tenantB_allowed)).toBe(true);

        // Tenant C key with unrestricted permissions
        expect(isModelPermitted('gpt-4o', tenantC_unrestricted)).toBe(true);
        expect(isModelPermitted('gemini-2.0-flash', tenantC_unrestricted)).toBe(true);
      });
    });
  });
});

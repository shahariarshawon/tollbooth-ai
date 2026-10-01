import { asObject, errorForStatus } from './provider-http';

describe('errorForStatus', () => {
  it.each([400, 413, 422])(
    'treats %i as the caller request being refused and keeps the wording',
    (status) => {
      expect(errorForStatus(status, 'temperature is out of range')).toMatchObject({
        kind: 'bad_request',
        message: 'temperature is out of range',
      });
    },
  );

  it('supplies a message when the provider gave none', () => {
    expect(errorForStatus(400, undefined).message).toMatch(/rejected/i);
  });

  it.each([401, 403])(
    'treats %i as our credentials being rejected, and never forwards the text',
    (status) => {
      const error = errorForStatus(status, 'Incorrect API key provided: sk-SECRET');
      expect(error.kind).toBe('auth');
      expect(error.message).not.toContain('SECRET');
    },
  );

  it('treats 404 as our catalogue disagreeing with the provider, not the caller fault', () => {
    expect(errorForStatus(404, 'models/x is not found').kind).toBe('unavailable');
  });

  it('maps timeouts and rate limits', () => {
    expect(errorForStatus(408, undefined).kind).toBe('timeout');
    expect(errorForStatus(429, 'quota').kind).toBe('rate_limited');
  });

  it.each([500, 502, 503, 504, 529, 418])(
    'treats %i as the provider being unavailable',
    (status) => {
      expect(errorForStatus(status, 'oops').kind).toBe('unavailable');
    },
  );
});

describe('asObject', () => {
  it('returns plain objects only', () => {
    expect(asObject({ a: 1 })).toEqual({ a: 1 });
    expect(asObject([1])).toBeUndefined();
    expect(asObject(null)).toBeUndefined();
    expect(asObject('x')).toBeUndefined();
  });
});

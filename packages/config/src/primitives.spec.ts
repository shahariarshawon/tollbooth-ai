import { durationToSeconds, resolvePort } from './primitives';

describe('durationToSeconds', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['12h', 43200],
    ['7d', 604800],
  ])('converts %s', (input, expected) => {
    expect(durationToSeconds(input)).toBe(expected);
  });

  it('throws on invalid input', () => {
    expect(() => durationToSeconds('7 days')).toThrow();
  });
});

describe('resolvePort', () => {
  it('takes the own port, then the shared port, then the default', () => {
    expect(resolvePort(1, 2, 3)).toBe(1);
    expect(resolvePort(undefined, 2, 3)).toBe(2);
    expect(resolvePort(undefined, undefined, 3)).toBe(3);
  });
});

import { describe, expect, it } from 'vitest';
import { isValidNif } from './nif.js';

describe('isValidNif', () => {
  it.each(['123456789', '999999990', '500000000'])('accepts %s (right check digit)', (nif) => {
    expect(isValidNif(nif)).toBe(true);
  });

  it.each([
    '123456780',   // wrong check digit
    '12345678',    // too short
    '1234567890',  // too long
    '12345678A',
    'PT123456789', // no country prefix
    '',
  ])('rejects %j', (nif) => {
    expect(isValidNif(nif)).toBe(false);
  });

  it('rejects things that are not text', () => {
    expect(isValidNif(123456789)).toBe(false);
    expect(isValidNif(undefined)).toBe(false);
  });
});

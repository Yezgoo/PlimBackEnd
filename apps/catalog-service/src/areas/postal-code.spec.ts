import { describe, expect, it } from 'vitest';
import { parsePostalCode } from './postal-code.js';

describe('parsePostalCode', () => {
  it.each([
    ['3000-123', { cp4: '3000', formatted: '3000-123' }],
    ['3000123', { cp4: '3000', formatted: '3000-123' }],
    ['3000 123', { cp4: '3000', formatted: '3000-123' }],
    ['  3030-290 ', { cp4: '3030', formatted: '3030-290' }],
    ['3000', { cp4: '3000', formatted: '3000' }],
  ])('accepts %j', (input, expected) => {
    expect(parsePostalCode(input)).toEqual(expected);
  });

  it.each(['', '300', '3000-12', '3000-1234', 'abcd-123', '30001', 'Coimbra'])('rejects %j', (input) => {
    expect(parsePostalCode(input)).toBeNull();
  });
});

export type ParsedPostalCode = {
  cp4: string;       // "3000": what decides the municipality
  formatted: string; // "3000-123", or "3000" when only 4 digits were given
};

// Accepts what people actually type: "3000-123", "3000 123", "3000123" or just "3000".
// Returns null for anything that isn't a Portuguese postal code.
export function parsePostalCode(input: string): ParsedPostalCode | null {
  const match = /^(\d{4})(?:[-\s]?(\d{3}))?$/.exec(input.trim());
  if (!match) return null;
  const [, cp4, cp3] = match;
  return { cp4, formatted: cp3 ? `${cp4}-${cp3}` : cp4 };
}

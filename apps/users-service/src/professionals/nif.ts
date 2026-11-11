import { registerDecorator, type ValidationOptions } from 'class-validator';

// A Portuguese NIF has 9 digits; the last one is a check digit computed from the other 8.
// Checking it catches typos before they reach invoices.
export function isValidNif(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{9}$/.test(value)) return false;

  const digits = [...value].map(Number);
  // weights 9, 8, 7, ... 2 for the first 8 digits
  const sum = digits.slice(0, 8).reduce((total, digit, index) => total + digit * (9 - index), 0);
  const remainder = sum % 11;
  const checkDigit = remainder < 2 ? 0 : 11 - remainder;

  return checkDigit === digits[8];
}

// Usage in a DTO:  @IsNif() nif!: string;
export function IsNif(options?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'isNif',
      target: target.constructor,
      propertyName,
      options: { message: 'nif must be a valid Portuguese NIF (9 digits)', ...options },
      validator: { validate: isValidNif },
    });
  };
}

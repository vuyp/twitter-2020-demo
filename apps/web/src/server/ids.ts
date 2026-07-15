export function asId(value: bigint | number | string): string {
  return String(value);
}

export function parseBigIntId(value: string, resource = 'identifier'): bigint {
  if (!/^\d+$/.test(value)) throw new TypeError(`Invalid ${resource}`);
  return BigInt(value);
}

export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

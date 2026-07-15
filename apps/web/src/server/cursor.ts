import { ApiError } from './errors';

export type CursorValue = {
  id: string;
  at: string;
  score?: number;
};

export function encodeCursor(value: CursorValue): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor(value: string | undefined): CursorValue | undefined {
  if (!value) return undefined;
  try {
    const decoded = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<CursorValue>;
    if (typeof decoded.id !== 'string' || typeof decoded.at !== 'string') throw new Error('shape');
    if (Number.isNaN(Date.parse(decoded.at))) throw new Error('date');
    return {
      id: decoded.id,
      at: decoded.at,
      ...(typeof decoded.score === 'number' ? { score: decoded.score } : {}),
    };
  } catch {
    throw new ApiError(400, 'invalid_cursor', 'The pagination cursor is invalid or expired');
  }
}

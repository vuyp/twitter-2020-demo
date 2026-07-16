import { describe, expect, it } from 'vitest';
import { userFacingError } from './use-api';

describe('userFacingError', () => {
  it.each([
    [{ detail: 'The request origin is not trusted' }, 403, 'csrf_rejected'],
    [{ message: 'Invalid origin' }, 403, 'ORIGIN_NOT_ALLOWED'],
    [{ title: 'Internal Server Error' }, 500, undefined],
  ])('does not expose infrastructure failures', (problem, status, code) => {
    expect(userFacingError(problem, status, code)).toBe(
      'Something went wrong, but don’t fret — let’s give it another shot.',
    );
  });

  it('preserves useful validation feedback', () => {
    expect(userFacingError({ detail: 'Your password must have at least 8 characters.' }, 400)).toBe(
      'Your password must have at least 8 characters.',
    );
  });
});

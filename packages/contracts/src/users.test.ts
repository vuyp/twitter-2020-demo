import { describe, expect, it } from 'vitest';
import { onboardingInputSchema, updateProfileInputSchema } from './users';

describe('birth date validation', () => {
  it('rejects dates that match ISO syntax but do not exist on the calendar', () => {
    expect(
      onboardingInputSchema.safeParse({
        handle: 'calendar_test',
        name: 'Calendar Test',
        birthDate: '1994-02-31',
      }).success,
    ).toBe(false);
    expect(updateProfileInputSchema.safeParse({ birthDate: '2023-02-29' }).success).toBe(false);
  });

  it('accepts a valid leap day', () => {
    expect(updateProfileInputSchema.safeParse({ birthDate: '2000-02-29' }).success).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { isValidTweetText, weightedTweetLength } from './text';

describe('2020 Tweet text weighting', () => {
  it('counts Latin text at one unit and rejects text past 280', () => {
    expect(weightedTweetLength('a'.repeat(280))).toBe(280);
    expect(isValidTweetText('a'.repeat(280))).toBe(true);
    expect(isValidTweetText('a'.repeat(281))).toBe(false);
  });

  it('counts CJK and emoji code points at two units', () => {
    expect(weightedTweetLength('界'.repeat(140))).toBe(280);
    expect(weightedTweetLength('😀')).toBe(2);
    expect(isValidTweetText('界'.repeat(141))).toBe(false);
  });

  it('normalizes each URL to the 2020 fixed 23-character weight', () => {
    expect(weightedTweetLength('https://example.com/a/very/long/path')).toBe(23);
    expect(weightedTweetLength('Read https://t.co/x now')).toBe(32);
  });

  it('rejects otherwise empty Tweets', () => {
    expect(isValidTweetText('   \n')).toBe(false);
  });
});

const URL_PATTERN = /https?:\/\/[^\s]+/giu;

/**
 * Twitter's 2020 weighted length model: URLs are always 23 characters, most
 * Latin/common punctuation code points have weight 1, and other code points
 * (including CJK and emoji) have weight 2.
 */
export function weightedTweetLength(input: string): number {
  let weighted = 0;
  let cursor = 0;

  for (const match of input.matchAll(URL_PATTERN)) {
    const start = match.index;
    weighted += weightedSegmentLength(input.slice(cursor, start));
    weighted += 23;
    cursor = start + match[0].length;
  }

  return weighted + weightedSegmentLength(input.slice(cursor));
}

function weightedSegmentLength(value: string): number {
  let result = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const isSingleWeight =
      codePoint <= 0x10ff ||
      (codePoint >= 0x2000 && codePoint <= 0x200d) ||
      (codePoint >= 0x2010 && codePoint <= 0x201f) ||
      (codePoint >= 0x2032 && codePoint <= 0x2037);
    result += isSingleWeight ? 1 : 2;
  }
  return result;
}

export function isValidTweetText(input: string): boolean {
  return input.trim().length > 0 && weightedTweetLength(input) <= 280;
}

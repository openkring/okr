import { describe, expect, it } from 'vitest';
import { EDITOR_LINK_PATTERN } from './editor-link.util';

// Mirrors Angular's Validators.pattern(string): prepends '^' and appends '$' only, no group.
function angularPattern(pattern: string): RegExp {
  let regexStr = '';
  if (pattern.charAt(0) !== '^') regexStr += '^';
  regexStr += pattern;
  if (pattern.charAt(pattern.length - 1) !== '$') regexStr += '$';
  return new RegExp(regexStr);
}

describe('EDITOR_LINK_PATTERN', () => {
  const re = angularPattern(EDITOR_LINK_PATTERN);

  it.each(['/vorstand', '/termine?cat=regatta', 'https://seeclub.org', 'mailto:a@b.ch',
    'https://www.seeclub.org/path?x=1#a', 'http://example.ch/', 'https://example.swiss'])('accepts %s', (v) => {
    expect(re.test(v)).toBe(true);
  });

  it.each(['javascript:alert(1)', 'vorstand', '/a b', 'x/vorstand', '//evil.com', '/\\evil.com'])('rejects %s', (v) => {
    expect(re.test(v)).toBe(false);
  });
});

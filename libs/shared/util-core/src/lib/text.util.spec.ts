import { shortenText } from './text.util';

describe('text.util', () => {

  // shortenText
  it('returns all words when under the limit', () => {
    expect(shortenText('one two three', 5)).toEqual('one two three');
  });
  it('truncates to numberOfWords and appends an ellipsis', () => {
    expect(shortenText('one two three four', 2)).toEqual('one two…');
  });
  it('trims surrounding whitespace', () => {
    expect(shortenText('  one two  ', 5)).toEqual('one two');
  });
  it('strips HTML tags when isHtml is true', () => {
    expect(shortenText('<p>one two three</p>', 2, true)).toEqual('one two…');
  });
  it('keeps HTML markup as text when isHtml is false', () => {
    // Not asked to strip: the raw markup is treated as plain text words.
    expect(shortenText('<b>one</b> two', 5, false)).toEqual('<b>one</b> two');
  });
  it('neutralizes an unterminated tag in HTML input (no raw "<" leaks through)', () => {
    const result = shortenText('<img src=x onerror=alert(1)', 5, true);
    expect(result).not.toContain('<');
  });
});

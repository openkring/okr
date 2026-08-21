import { describe, expect, it } from 'vitest';
import { parseDiaryMarkdown } from './diary-parse';
import { renderDiaryMarkdown } from './diary-render';
import { DIARY_FIXTURES } from './fixtures/diary-fixtures';

describe('diary round trip', () => {
  for (const fixture of DIARY_FIXTURES) {
    it(`reproduces "${fixture.name}" byte for byte`, () => {
      expect(renderDiaryMarkdown(parseDiaryMarkdown(fixture.text))).toBe(fixture.text);
    });
  }

  it('reproduces a file that has no frontmatter at all', () => {
    const text = 'no frontmatter here\n\njust text\n';
    expect(renderDiaryMarkdown(parseDiaryMarkdown(text))).toBe(text);
  });
});

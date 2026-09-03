import { describe, expect, it } from 'vitest';
import { driveFolderUrl, renderDiaryHtml } from './diary-html.util';

describe('renderDiaryHtml', () => {
  it('renders markdown', () => {
    expect(renderDiaryHtml('# Hi\n\nsome *text*').html).toContain('<em>text</em>');
  });
  it('removes markdown images and counts them', () => {
    const out = renderDiaryHtml('a\n\n![](x.jpg)\n\nb');
    expect(out.imageCount).toBe(1);
    expect(out.html).not.toContain('<img');
  });
  it('removes raw <img> tags and counts them', () => {
    const out = renderDiaryHtml('<img src="a.jpg" width="300">\n<img src="b.jpg">');
    expect(out.imageCount).toBe(2);
    expect(out.html).not.toContain('<img');
  });
  it('drops the placeholder comment', () => {
    expect(renderDiaryHtml('T\n\n<!-- Platzhalter: x -->').html).not.toContain('Platzhalter');
  });
  it('is safe on empty input', () => expect(renderDiaryHtml('')).toEqual({ html: '', imageCount: 0 }));
});

describe('driveFolderUrl', () => {
  it('links the folder', () => expect(driveFolderUrl('abc')).toBe('https://drive.google.com/drive/folders/abc'));
  it('is empty without an id', () => expect(driveFolderUrl('')).toBe(''));
});

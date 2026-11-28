import { describe, expect, it } from 'vitest';
import { mailDrawnHtml } from './mail-drawn-html.util';

describe('mailDrawnHtml', () => {
  it('leaves a text without colour or indent as it is', () => {
    expect(mailDrawnHtml('<p>Hallo <strong>du</strong></p>')).toBe('<p>Hallo <strong>du</strong></p>');
    expect(mailDrawnHtml('')).toBe('');
  });

  it('turns a colour span into <font color>', () => {
    expect(mailDrawnHtml('<p>a <span style="color:#ff0000;">rot</span> b</p>')).toBe('<p>a <font color="#ff0000">rot</font> b</p>');
  });

  it('keeps the rest of the span inside the font', () => {
    expect(mailDrawnHtml('<p><span style="color: blue; background-color: yellow;">x</span></p>'))
      .toBe('<p><font color="blue"><span style="background-color: yellow;">x</span></font></p>');
  });

  it('leaves a colour <font> cannot read as it is', () => {
    expect(mailDrawnHtml('<p><span style="color:rgb(1, 2, 3);">x</span></p>')).toBe('<p><span style="color:rgb(1, 2, 3);">x</span></p>');
    expect(mailDrawnHtml('<p><span style="color:url(x);">x</span></p>')).toBe('<p><span style="color:url(x);">x</span></p>');
  });

  it('marks an indented block with its class', () => {
    expect(mailDrawnHtml('<p style="margin-left:80px" data-indent="2">x</p>')).toBe('<p style="margin-left:80px" data-indent="2" class="rte-indent-2">x</p>');
  });

  it('ignores an indent out of range', () => {
    expect(mailDrawnHtml('<p data-indent="99">x</p>')).toBe('<p data-indent="99">x</p>');
  });
});


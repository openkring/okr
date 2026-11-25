import { describe, expect, it } from 'vitest';

import { ARTICLE_BLOCK_TYPES, MAIL_BLOCK_TYPES, type EventsBlock, type MailBlock } from './section.model';

describe('mail blocks', () => {
  it('the article blocks do not contain the events block', () => {
    expect(ARTICLE_BLOCK_TYPES).not.toContain('events');
  });
  it('the mail blocks are the article blocks plus events', () => {
    expect([...MAIL_BLOCK_TYPES]).toEqual([...ARTICLE_BLOCK_TYPES, 'events']);
  });
  it('an events block is a mail block', () => {
    const block: EventsBlock = { id: 'e1', type: 'events', calendarKey: 'c1', maxEvents: 5 };
    const asMail: MailBlock = block;
    expect(asMail.type).toBe('events');
  });
});

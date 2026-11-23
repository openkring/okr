import { describe, expect, it } from 'vitest';

import { FEATURE_BLOCKS } from './feature-blocks';
import { isWidgetVisible, WIDGET_BLOCKS, widgetBlockOf, widgetKeyOf } from './dashboard-widgets.util';

const allOn = () => true;
const allOff = () => false;
const without = (off: string) => (block: string) => block !== off;

describe('WIDGET_BLOCKS', () => {
  it('names only blocks of the catalogue', () => {
    const ids = FEATURE_BLOCKS.map(block => block.id);
    for (const block of Object.values(WIDGET_BLOCKS)) {
      expect(ids).toContain(block);
    }
  });

  it('maps the types of spec §8.2 and nothing else', () => {
    expect(WIDGET_BLOCKS).toEqual({ events: 'calevent', invitations: 'calevent', tasks: 'task', messages: 'chat' });
  });
});

describe('widgetBlockOf', () => {
  it('returns the owning block', () => {
    expect(widgetBlockOf('tasks')).toBe('task');
  });

  it('returns undefined for a type without a block', () => {
    expect(widgetBlockOf('news')).toBeUndefined();
    expect(widgetBlockOf('notices')).toBeUndefined();
    expect(widgetBlockOf('')).toBeUndefined();
  });

  it('is not fooled by inherited property names', () => {
    expect(widgetBlockOf('constructor')).toBeUndefined();
    expect(widgetBlockOf('toString')).toBeUndefined();
  });
});

describe('widgetKeyOf', () => {
  it('strips the suffix of the tenant copy', () => {
    expect(widgetKeyOf('d-news_scs', 'scs')).toBe('d-news');
  });

  it('keeps a shared key', () => {
    expect(widgetKeyOf('d-news', 'scs')).toBe('d-news');
  });

  it('keeps the copy of another tenant', () => {
    expect(widgetKeyOf('d-news_scs', 'bka')).toBe('d-news_scs');
  });

  it('strips only the end of the key', () => {
    expect(widgetKeyOf('a_scs_b', 'scs')).toBe('a_scs_b');
  });

  it('keeps the key while the tenant is unknown', () => {
    expect(widgetKeyOf('d-news_', '')).toBe('d-news_');
  });
});

describe('isWidgetVisible', () => {
  const news = { okey: 'd-news', type: 'news' };
  const newsCopy = { okey: 'd-news_scs', type: 'news' };
  const messages = { okey: 'd-messages', type: 'messages' };

  it('hides a hidden key', () => {
    expect(isWidgetVisible(news, 'scs', ['d-news'], allOn)).toBe(false);
  });

  it('hides the tenant copy of a hidden key', () => {
    expect(isWidgetVisible(newsCopy, 'scs', ['d-news'], allOn)).toBe(false);
  });

  it('hides the shared widget when the stored key carries the tenant suffix', () => {
    expect(isWidgetVisible(news, 'scs', ['d-news_scs'], allOn)).toBe(false);
  });

  it('normalizes both sides for a page key that itself ends in the tenant', () => {
    const section = { okey: 'news_scs', type: 'news' };
    expect(isWidgetVisible(section, 'scs', ['news_scs'], allOn)).toBe(false);
    expect(isWidgetVisible(section, 'scs', ['news'], allOn)).toBe(false);
  });

  it('does not hide the copy of another tenant', () => {
    expect(isWidgetVisible(newsCopy, 'bka', ['d-news'], allOn)).toBe(true);
  });

  it('hides messages while chat is off', () => {
    expect(isWidgetVisible(messages, 'scs', [], without('chat'))).toBe(false);
    expect(isWidgetVisible(messages, 'scs', [], without('task'))).toBe(true);
  });

  it('hides a hidden widget although its block is on', () => {
    expect(isWidgetVisible(messages, 'scs', ['d-messages'], allOn)).toBe(false);
  });

  it('shows news with every block off', () => {
    expect(isWidgetVisible(news, 'scs', [], allOff)).toBe(true);
  });

  it('treats undefined, null and [] as nothing hidden', () => {
    for (const hidden of [undefined, null, []]) {
      expect(isWidgetVisible(news, 'scs', hidden, allOn)).toBe(true);
    }
  });
});

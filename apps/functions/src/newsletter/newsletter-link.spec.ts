import { describe, expect, it } from 'vitest';
import { signMailing, verifyMailing } from '../calendar/answer-link';
import {
  newsletterConfirmUrl,
  newsletterFunctionUrl,
  newsletterUnsubscribeUrl,
  verifyNewsletterConfirm,
  verifyNewsletterUnsubscribe,
} from './newsletter-link';

const SECRET = 'test-secret';
const BASE = 'https://example.test/fn';

describe('newsletter links', () => {
  it('round-trips the confirm link', () => {
    const url = new URL(newsletterConfirmUrl(BASE, 'sig1', SECRET));
    expect(url.searchParams.get('s')).toBe('sig1');
    expect(verifyNewsletterConfirm('sig1', url.searchParams.get('h') ?? '', SECRET)).toBe(true);
  });

  it('round-trips the unsubscribe link', () => {
    const url = new URL(newsletterUnsubscribeUrl(BASE, 'p1', 'g1', SECRET));
    expect(url.searchParams.get('p')).toBe('p1');
    expect(url.searchParams.get('g')).toBe('g1');
    expect(verifyNewsletterUnsubscribe('p1', 'g1', url.searchParams.get('h') ?? '', SECRET)).toBe(true);
  });

  it('url-encodes the values', () => {
    const url = new URL(newsletterUnsubscribeUrl(BASE, 'a&b', 'g=1', SECRET));
    expect(url.searchParams.get('p')).toBe('a&b');
    expect(url.searchParams.get('g')).toBe('g=1');
  });

  it('keeps the scopes apart', () => {
    const confirm = new URL(newsletterConfirmUrl(BASE, 'k', SECRET)).searchParams.get('h') ?? '';
    const unsub = new URL(newsletterUnsubscribeUrl(BASE, 'k', '', SECRET)).searchParams.get('h') ?? '';
    expect(verifyNewsletterUnsubscribe('k', '', confirm, SECRET)).toBe(false);
    expect(verifyNewsletterConfirm('k', unsub, SECRET)).toBe(false);
    expect(verifyMailing('k', '', confirm, SECRET)).toBe(false);
    expect(verifyNewsletterConfirm('k', signMailing('k', '', SECRET), SECRET)).toBe(false);
  });

  it('rejects a changed key or secret', () => {
    const h = new URL(newsletterUnsubscribeUrl(BASE, 'p1', 'g1', SECRET)).searchParams.get('h') ?? '';
    expect(verifyNewsletterUnsubscribe('p1', 'g2', h, SECRET)).toBe(false);
    expect(verifyNewsletterUnsubscribe('p2', 'g1', h, SECRET)).toBe(false);
    expect(verifyNewsletterUnsubscribe('p1', 'g1', h, 'other')).toBe(false);
  });

  it('returns false, never throws, on malformed signatures', () => {
    for (const bad of ['', 'x', '!!!', 'a'.repeat(200), '%%']) {
      expect(verifyNewsletterConfirm('k', bad, SECRET)).toBe(false);
      expect(verifyNewsletterUnsubscribe('p', 'g', bad, SECRET)).toBe(false);
    }
  });

  it('builds the function url', () => {
    expect(newsletterFunctionUrl('proj', 'newsletterConfirm')).toBe('https://europe-west6-proj.cloudfunctions.net/newsletterConfirm');
  });
});

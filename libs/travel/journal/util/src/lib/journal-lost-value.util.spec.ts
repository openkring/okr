import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { JOURNAL_I18N_KEYS, JournalI18n } from './journal-i18n';
import { lostValueText } from './journal-lost-value.util';

// every label reads as its key, so the assertions show which label was picked
const t = Object.fromEntries(Object.keys(JOURNAL_I18N_KEYS).map((k) => [k, signal(k)])) as unknown as JournalI18n;

describe('lostValueText', () => {
  it('uses form labels, never field names', () => {
    expect(lostValueText('placeName', 'Oslo', t)).toEqual({ field: 'footprint_form_place_label', value: 'Oslo' });
    expect(lostValueText('title', 'Hafen', t).field).toBe('footprint_form_title_label');
    expect(lostValueText('time', '09:30', t)).toEqual({ field: 'footprint_form_time_label', value: '09:30' });
  });
  it('formats a date as dd.mm.yyyy', () => {
    expect(lostValueText('date', '20261029', t).value).toBe('29.10.2026');
  });
  it('maps publishState and transport to their labels', () => {
    expect(lostValueText('publishState', 'draft', t).value).toBe('story_draft');
    expect(lostValueText('publishState', 'published', t).value).toBe('story_published');
    expect(lostValueText('transport', 'ship', t)).toEqual({ field: 'transport_label', value: 'transport_ship' });
    expect(lostValueText('transport', 'warp', t).value).toBe('–');
  });
  it('shows latitude and longitude as Position rounded to 4 decimals', () => {
    expect(lostValueText('latitude', 59.913868123, t)).toEqual({ field: 'footprint_position', value: '59.9139' });
    expect(lostValueText('longitude', 10.7522, t).field).toBe('footprint_position');
  });
  it('shows empty values as a dash', () => {
    expect(lostValueText('title', '', t).value).toBe('–');
    expect(lostValueText('date', undefined, t).value).toBe('–');
    expect(lostValueText('latitude', null, t).value).toBe('–');
  });
});

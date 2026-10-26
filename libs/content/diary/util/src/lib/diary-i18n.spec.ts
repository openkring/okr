import { describe, expect, it } from 'vitest';
import { DIARY_I18N_KEYS, DiaryI18n, diaryTrackModeLabel } from './diary-i18n';

describe('diaryTrackModeLabel', () => {
  const i18n = (values: Partial<Record<keyof typeof DIARY_I18N_KEYS, string>>) =>
    Object.fromEntries(Object.keys(DIARY_I18N_KEYS).map(k => [k, () => values[k as keyof typeof DIARY_I18N_KEYS] ?? ''])) as unknown as DiaryI18n;
  it('takes the label from the diary scope', () => expect(diaryTrackModeLabel(i18n({ track_mode_row: 'Rudern' }), 'row')).toBe('Rudern'));
  it('falls back to the mode while the scope is not loaded', () => expect(diaryTrackModeLabel(i18n({}), 'bike')).toBe('bike'));
  it('has a key for every transport mode in the diary scope', () => {
    for (const m of ['plane', 'ship', 'bus', 'train', 'car', 'bike', 'foot', 'row', 'ski', 'motorbike']) {
      expect(DIARY_I18N_KEYS[`track_mode_${m}` as keyof typeof DIARY_I18N_KEYS]).toBe(`@content/diary/feature.track.mode.${m}`);
    }
  });
});

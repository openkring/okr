import { describe, expect, it } from 'vitest';
import { DEFAULT_DIARY_WEATHER } from '@okr/shared-models';
import { diaryWeatherLine, hasDiaryWeather } from './diary-weather.util';

describe('hasDiaryWeather', () => {
  it('needs a known code', () => {
    expect(hasDiaryWeather(DEFAULT_DIARY_WEATHER)).toBe(false);
    expect(hasDiaryWeather({ ...DEFAULT_DIARY_WEATHER, code: 0 })).toBe(true);
  });
});

describe('diaryWeatherLine', () => {
  it('formats range and precipitation, rounded', () => {
    expect(diaryWeatherLine({ code: 61, min: 19.6, max: 27.9, precip: 34.6, sunrise: '06:12', sunset: '20:31' }))
      .toBe('20–28 °C, 35 mm');
  });
  it('is empty without a code', () => expect(diaryWeatherLine(DEFAULT_DIARY_WEATHER)).toBe(''));
});

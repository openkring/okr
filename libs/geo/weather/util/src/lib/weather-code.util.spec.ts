import { describe, expect, it } from 'vitest';
import { WeatherIconName, weatherCodeToIcon } from './weather-code.util';

describe('weatherCodeToIcon', () => {
  it('maps clear sky to the day/night variant', () => {
    expect(weatherCodeToIcon(0, true)).toBe('sunny');
    expect(weatherCodeToIcon(0, false)).toBe('clear-night');
  });

  it('maps mainly clear and partly cloudy to partly-cloudy, overcast to cloudy', () => {
    expect(weatherCodeToIcon(1)).toBe('partly-cloudy');
    expect(weatherCodeToIcon(2)).toBe('partly-cloudy');
    expect(weatherCodeToIcon(2, false)).toBe('partly-cloudy-night');
    // overcast has no night variant — a fully clouded sky looks the same either way
    expect(weatherCodeToIcon(3)).toBe('cloudy');
    expect(weatherCodeToIcon(3, false)).toBe('cloudy');
  });

  it('maps fog', () => {
    expect(weatherCodeToIcon(45)).toBe('fog');
    expect(weatherCodeToIcon(48)).toBe('fog');
  });

  it('maps drizzle, rain and rain showers to rain', () => {
    for (const c of [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]) {
      expect(weatherCodeToIcon(c), `code ${c}`).toBe('rain');
    }
  });

  it('maps snow fall, snow grains and snow showers to snow', () => {
    for (const c of [71, 73, 75, 77, 85, 86]) {
      expect(weatherCodeToIcon(c), `code ${c}`).toBe('snow');
    }
  });

  it('maps thunderstorm with and without hail', () => {
    for (const c of [95, 96, 99]) {
      expect(weatherCodeToIcon(c), `code ${c}`).toBe('thunderstorm');
    }
  });

  it('falls back to cloudy for an unknown code instead of guessing a condition', () => {
    expect(weatherCodeToIcon(4)).toBe('cloudy');
    expect(weatherCodeToIcon(42)).toBe('cloudy');
    expect(weatherCodeToIcon(-1)).toBe('cloudy');
  });

  it('never returns `windy` — wind must not override the WMO code', () => {
    // Decided 2026-08-29: the icon follows the code alone; wind is shown as a number in
    // forecast_detail / hourly_detail. windy.svg stays in the set but is not reachable here.
    // Guards against someone quietly reintroducing a gust threshold.
    const returned = new Set<WeatherIconName>();
    for (let code = -5; code <= 120; code++) {
      returned.add(weatherCodeToIcon(code, true));
      returned.add(weatherCodeToIcon(code, false));
    }
    expect(returned.has('windy')).toBe(false);
  });
});

import { DiaryWeather } from '@okr/shared-models';

/** `code` is the one field only Open-Meteo can supply; -1 means the day has no measured weather. */
export function hasDiaryWeather(weather: DiaryWeather | undefined): boolean {
  return (weather?.code ?? -1) >= 0;
}

/** The display line the spec computes and never stores: '20–28 °C, 35 mm'. The icon is rendered separately from `code`. */
export function diaryWeatherLine(weather: DiaryWeather | undefined): string {
  if (!weather || !hasDiaryWeather(weather)) return '';
  return `${Math.round(weather.min)}–${Math.round(weather.max)} °C, ${Math.round(weather.precip)} mm`;
}

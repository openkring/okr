import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { isDiaryCalendarDay } from '@okr/content-diary-util';
import type { DiaryWeather } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, getTodayStr } from '@okr/shared-util-core';
import { checkAppCheckToken } from '@okr/shared-util-functions';

import { chooseWeatherApi, fetchWeatherRange, mergeWeather } from './weather';

export interface DiaryWeatherRequest {
  date: string;
  latitude: number;
  longitude: number;
}

/** Pure core, testable without the callable wrapper. Throws on a non-day date; null when the API has no row. */
export async function weatherForDay(request: DiaryWeatherRequest, today: string): Promise<DiaryWeather | null> {
  if (!isDiaryCalendarDay(request.date)) {
    throw new HttpsError('invalid-argument', 'date must be a calendar day (scope day)');
  }
  if (!Number.isFinite(request.latitude) || !Number.isFinite(request.longitude)) {
    throw new HttpsError('invalid-argument', 'latitude/longitude required');
  }
  // measured, never guessed (spec): a future date has no measurement yet, and open-meteo would
  // answer with a forecast — lexicographic comparison is correct on the yyyyMMdd StoreDate format.
  if (request.date > today) return null;
  const isoDate = convertDateFormatToString(request.date, DateFormat.StoreDate, DateFormat.IsoDate);
  const rows = await fetchWeatherRange({
    latitude: request.latitude, longitude: request.longitude,
    startDate: isoDate, endDate: isoDate,
    api: chooseWeatherApi(request.date, today),
  });
  const row = rows.get(request.date);
  if (!row || row.code === undefined) return null;
  return mergeWeather({}, row);
}

/**
 * Measured weather for ONE day at ONE coordinate, for an entry written or repaired in the app.
 * Never guesses: a missing answer is `null`, and the store keeps the entry a draft (spec:
 * "Antwortet Open-Meteo nicht, bleibt der Eintrag draft"). Any signed-in user may call it — the
 * request carries no diary and no personal data, only a date and a coordinate.
 */
export const fetchDiaryWeather = onCall<DiaryWeatherRequest, Promise<DiaryWeather | null>>(
  { region: 'europe-west6', memory: '256MiB', timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    checkAppCheckToken(request, 'fetchDiaryWeather');
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'sign in first');
    return await weatherForDay(request.data, getTodayStr(DateFormat.StoreDate));
  },
);

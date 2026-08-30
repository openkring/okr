import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import * as admin from 'firebase-admin';

import { LocationDoc, OpenMeteoResponse, WEATHER_TAG, buildWeatherDocs, hasWeatherTag, hoursSince, toStoreDate } from './weather.util';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/** Fallback when a tenant's app-config does not set `weatherIntervalHours`. */
const DEFAULT_INTERVAL_HOURS = 4;

/** Days of forecast to keep per location. */
const FORECAST_DAYS = 7;

const DAILY_FIELDS = [
  'weather_code', 'temperature_2m_min', 'temperature_2m_max',
  'precipitation_sum', 'precipitation_probability_max',
  'wind_speed_10m_max', 'wind_gusts_10m_max', 'sunshine_duration', 'sunrise', 'sunset',
].join(',');

const HOURLY_FIELDS = [
  'weather_code', 'is_day', 'temperature_2m', 'precipitation', 'precipitation_probability',
  'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'sunshine_duration',
].join(',');

/**
 * Fetches the forecast for every weather-tagged location and writes one document per
 * location and day.
 *
 * Runs hourly and skips locations fetched more recently than the configured interval, so
 * `app-config.weatherIntervalHours` is changeable without a redeploy — a cron expression
 * would not be. A location shared by two tenants is fetched once.
 */
export const scheduledWeatherFetch = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'Europe/Zurich',
    region: 'europe-west6',
    memory: '256MiB',
    timeoutSeconds: 300,
  },
  async () => {
    const db = admin.firestore();
    const now = new Date();

    // The shortest interval any tenant configured wins: one fetch serves them all, so
    // fetching too often for one tenant is cheaper than serving another stale data.
    const configs = await db.collection('app-config').get();
    const intervals = configs.docs
      .map((d) => Number(d.data()?.['weatherIntervalHours']))
      .filter((n) => Number.isFinite(n) && n > 0);
    const intervalHours = intervals.length ? Math.min(...intervals) : DEFAULT_INTERVAL_HOURS;

    const locationsSnap = await db.collection('locations')
      .where('isArchived', '==', false).get();
    const locations = locationsSnap.docs
      .map((d) => ({ ...(d.data() as LocationDoc), okey: d.id }))
      .filter((l) => hasWeatherTag(l.tags))
      .filter((l) => Number.isFinite(l.latitude) && Number.isFinite(l.longitude));

    if (!locations.length) {
      logger.info(`scheduledWeatherFetch: no locations tagged ${WEATHER_TAG}`);
      return;
    }

    let fetched = 0;
    let skipped = 0;

    for (const location of locations) {
      const todayRef = db.collection('weather').doc(`${location.okey}-${toStoreDate(now)}`);
      const existing = await todayRef.get();
      const age = hoursSince(existing.data()?.['fetchedAt'] as string | undefined, now);
      if (age < intervalHours) { skipped++; continue; }

      try {
        const { data } = await axios.get<OpenMeteoResponse>(OPEN_METEO_URL, {
          params: {
            latitude: location.latitude,
            longitude: location.longitude,
            daily: DAILY_FIELDS,
            hourly: HOURLY_FIELDS,
            timezone: 'Europe/Zurich',
            forecast_days: FORECAST_DAYS,
          },
          timeout: 20_000,
        });

        const batch = db.batch();
        for (const doc of buildWeatherDocs(location, data, now)) {
          batch.set(db.collection('weather').doc(doc['okey'] as string), doc, { merge: true });
        }
        await batch.commit();
        fetched++;
      } catch (error) {
        // One bad location must not cost the others their update. The previous documents stay
        // readable and the widgets surface their age, which beats blanking the page.
        logger.error(`scheduledWeatherFetch: ${location.name} (${location.okey}) failed`, error);
      }
    }

    logger.info(`scheduledWeatherFetch: ${fetched} fetched, ${skipped} still fresh, interval ${intervalHours}h`);
  }
);

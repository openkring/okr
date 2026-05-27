import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import * as admin from 'firebase-admin';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

const SNB_CSV_URL = 'https://data.snb.ch/api/cube/devkum/data/CSV/de';

interface SnbRow {
  date: string;
  currency: string;
  rate: number;
}

async function parseSnbCsv(csvText: string): Promise<SnbRow[]> {
  const lines = csvText.split('\n');
  const rows: SnbRow[] = [];
  for (const line of lines) {
    const parts = line.split(';');
    if (parts.length < 3) continue;
    const date = parts[0]?.trim();
    const currency = parts[1]?.trim();
    const rateStr = parts[2]?.trim().replace(',', '.');
    if (!date || !currency || !rateStr || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const rate = parseFloat(rateStr);
    if (isNaN(rate)) continue;
    rows.push({ date, currency, rate });
  }
  return rows;
}

export const fetchSnbRatesScheduled = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'Europe/Zurich',
    region: 'europe-west6',
    memory: '256MiB',
  },
  async () => {
    logger.info('fetchSnbRates: fetching from SNB');
    const response = await axios.get<string>(SNB_CSV_URL, { responseType: 'text' });
    const rows = await parseSnbCsv(response.data);
    const db = admin.firestore();
    let batch = db.batch();
    let count = 0;
    let batchCount = 0;
    for (const row of rows) {
      const storeDate = convertDateFormatToString(row.date, DateFormat.IsoDate, DateFormat.StoreDate);
      const bkey = `CHF-${row.currency}-${storeDate}-snb`;
      const ref = db.collection('exchange-rates').doc(bkey);
      batch.set(ref, {
        tenants: ['scs'],
        isArchived: false,
        fromCurrency: 'CHF',
        toCurrency: row.currency,
        rate: row.rate,
        date: storeDate,
        source: 'snb',
        rateType: 'daily',
      }, { merge: true });
      count++;
      batchCount++;
      if (batchCount === 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    if (batchCount > 0) {
      await batch.commit();
    }
    logger.info(`fetchSnbRates: wrote ${count} rate entries`);
  }
);

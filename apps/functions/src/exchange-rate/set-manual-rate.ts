import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

interface SetManualRateData {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  date: string;   // ISO date "YYYY-MM-DD"
}

export const setManualRate = onCall(
  { region: 'europe-west6', enforceAppCheck: true, memory: '128MiB' },
  async (request: CallableRequest<SetManualRateData>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { fromCurrency, toCurrency, rate, date } = request.data;
    if (!fromCurrency || !toCurrency || typeof rate !== 'number' || rate <= 0 || !date) {
      throw new HttpsError('invalid-argument', 'fromCurrency, toCurrency, rate (positive number), and date are required');
    }
    const storeDate = convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate);
    const bkey = `${fromCurrency}-${toCurrency}-${storeDate}-manual`;
    await admin.firestore().collection('exchange-rates').doc(bkey).set({
      tenants: ['scs'],  // server-controlled, not from client
      isArchived: false,
      fromCurrency,
      toCurrency,
      rate,
      date: storeDate,
      source: 'manual',
      rateType: 'daily',
    }, { merge: true });
    logger.info(`setManualRate: wrote ${bkey} rate=${rate}`);
    return { bkey };
  }
);

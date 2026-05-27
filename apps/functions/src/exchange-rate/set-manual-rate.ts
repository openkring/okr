import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

interface SetManualRateData {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  date: string;   // ISO date "YYYY-MM-DD"
  tenants: string[];
}

export const setManualRate = onCall(
  { region: 'europe-west6', enforceAppCheck: true, memory: '128MiB' },
  async (request: CallableRequest<SetManualRateData>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { fromCurrency, toCurrency, rate, date, tenants } = request.data;
    if (!fromCurrency || !toCurrency || !rate || !date) {
      throw new HttpsError('invalid-argument', 'fromCurrency, toCurrency, rate, date are required');
    }
    const storeDate = convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate);
    const bkey = `${fromCurrency}-${toCurrency}-${storeDate}-manual`;
    await admin.firestore().collection('exchange-rates').doc(bkey).set({
      tenants: tenants ?? ['scs'],
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

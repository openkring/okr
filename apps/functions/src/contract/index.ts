import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { ContractCollection, ContractDocumentCollection, ContractModel } from '@okr/shared-models';
import { getTodayStr } from '@okr/shared-util-core';

import { emitEvent } from '../workflow/emit';
import { planContractScan } from './contract-scan';
import { buildContractDocumentStamp, needsRestamp } from './contract-document.util';

const REGION = 'europe-west6';

/** Daily deadline scan (spec 1.5 §6.2). One tenant's failure never stops the others. */
export const scanContractDeadlines = onSchedule(
  { region: REGION, schedule: 'every day 06:00', timeZone: 'Europe/Zurich' },
  async () => {
    const db = getFirestore();
    const today = getTodayStr();
    const configs = await db.collection('app-config').get();
    for (const cfg of configs.docs) {
      const tenantId = cfg.id;
      try {
        const snap = await db.collection(ContractCollection)
          .where('tenants', 'array-contains', tenantId).where('isArchived', '==', false)
          .where('state', 'in', ['active', 'noticeGiven']).get();
        for (const doc of snap.docs) {
          // Firestore reads skip class defaults: merge over the model defaults so legacy docs are safe.
          const c = { ...new ContractModel(tenantId), ...(doc.data() as Partial<ContractModel>), okey: doc.id } as ContractModel;
          const { patch, events } = planContractScan(c, today);
          if (Object.keys(patch).length > 0) await doc.ref.update(patch);
          for (const e of events) {
            await emitEvent(e.event, tenantId, `contract.${doc.id}`, {
              personKey: c.responsible?.key ?? '', subjectName: c.name, params: e.params,
            });
          }
        }
      } catch (e) {
        logger.error(`scanContractDeadlines: tenant=${tenantId} failed`, e);
      }
    }
  },
);

/** Keeps file access in step with the contract (spec 1.5 §5.3): a removed party loses file access. */
export const onContractWritten = onDocumentWritten({ document: `${ContractCollection}/{id}`, region: REGION }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!needsRestamp(before, after) || !after) return;
  const db = getFirestore();
  const docs = await db.collection(ContractDocumentCollection).where('contractKey', '==', event.params.id).get();
  const stamp = buildContractDocumentStamp(after);
  for (let i = 0; i < docs.docs.length; i += 400) {
    const batch = db.batch();
    docs.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, stamp));
    await batch.commit();
  }
  logger.info(`onContractWritten: restamped ${docs.size} file(s) of contract ${event.params.id}`);
});

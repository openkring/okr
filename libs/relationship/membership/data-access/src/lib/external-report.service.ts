import { inject, Injectable } from '@angular/core';
import { collection, doc, getDocs, query, writeBatch } from 'firebase/firestore';

import { FirestoreService } from '@okr/shared-data-access';
import { ExternalReportCollection, ExternalReportModel } from '@okr/shared-models';
import { getQuery, getSystemQuery, SrvCase } from '@okr/shared-util-core';

/** The only external organisation reported to so far (spec 1.133 §8). */
export const SRV_EXTERNAL_ORG = 'srv';
export const SRV_EXTERNAL_ORG_NAME = 'SRV SwissRowing';

/** Firestore caps a batch at 500 writes. */
const BATCH_SIZE = 500;

/**
 * «Reported on» marks (collection `external-reports`): which cases were already sent to an external
 * organisation, so the next report only holds new ones. The marks hold keys only, no names — the
 * mail text is built at compose time from the SRV index and is never stored.
 */
@Injectable({
  providedIn: 'root'
})
export class ExternalReportService {
  private readonly firestoreService = inject(FirestoreService);

  /**
   * The live marks of one organisation in this tenant, read once. Unlike `searchData` this REJECTS on
   * failure: a failed read must not look like «nothing reported yet», or the next mail would repeat
   * every case.
   */
  public async listReported(tenantId: string, externalOrg: string): Promise<ExternalReportModel[]> {
    const dbQuery = [
      ...getSystemQuery(tenantId),
      { key: 'externalOrg', operator: '==', value: externalOrg },
    ];
    const ref = query(collection(this.firestoreService.firestore, ExternalReportCollection), ...getQuery(dbQuery, 'none'));
    const snapshot = await getDocs(ref);
    return snapshot.docs.map(d => ({ ...d.data(), okey: d.id }) as ExternalReportModel);
  }

  /**
   * Marks the cases as reported to the SRV Sekretariat on `today` (StoreDate). One document per case,
   * id `${tenantId}-srv-${caseKey}`; marking a case twice just overwrites its mark. Rejects when a
   * batch fails.
   */
  public async markReported(tenantId: string, cases: SrvCase[], today: string): Promise<void> {
    const firestore = this.firestoreService.firestore;
    for (let i = 0; i < cases.length; i += BATCH_SIZE) {
      const batch = writeBatch(firestore);
      for (const c of cases.slice(i, i + BATCH_SIZE)) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { okey, ...mark } = {
          ...new ExternalReportModel(tenantId),
          externalOrg: SRV_EXTERNAL_ORG,
          externalOrgName: SRV_EXTERNAL_ORG_NAME,
          caseKey: c.caseKey,
          caseType: c.caseType,
          subjectKey: c.subjectKey,
          externalRef: c.externalRef,
          reportedAt: today,
        };
        batch.set(doc(firestore, ExternalReportCollection, `${tenantId}-${SRV_EXTERNAL_ORG}-${c.caseKey}`), mark);
      }
      await batch.commit();
    }
  }
}

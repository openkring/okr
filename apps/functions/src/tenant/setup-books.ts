import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';

import {
  AccountingConfigCollection, AccountingConfigModel, AppConfigCollection, OrgCollection, OrgModel,
} from '@okr/shared-models';
import { addIndexElement } from '@okr/shared-util-core';
import { booksSetupProblems, type BooksSetupInput } from '@okr/tenant-util';

import type { PendingWrite, VerbResult } from './apply-feature-selection';

/** A class instance as a Firestore payload: no `okey` (it is the doc id), no `undefined` (firebase-admin throws). */
function toDoc(model: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(model).filter(([k, v]) => k !== 'okey' && v !== undefined));
}

/**
 * VERB `setupBooks` — the questions the Buchhaltung needs answered before any of its rows can show
 * (`@BOOKS@` stays empty until then). Creates, in one call:
 *
 *  - `orgs/{booksId}` when it does not exist (books always belong to an org; the books id IS its okey),
 *  - `accounting-configs/{booksId}` with the answered fields, every other field at the model's default,
 *  - `app-config/{tenantId}.defaultAccountingTenantId = booksId` when the tenant has no default books yet.
 *
 * Refuses (failed-precondition) when the books already exist, or when the id belongs to another tenant's
 * books or org — never overwrites, so a second call with the same answers is harmless to retry only before
 * the first one landed. No chart of accounts is created: the Kontoplan starts empty (a starter chart is an
 * idea for later). No `featureEvents` entry: the new documents are the record.
 */
export async function planSetupBooks(db: Firestore, tenantId: string, raw: unknown): Promise<VerbResult> {
  const input = raw as BooksSetupInput;
  const problems = booksSetupProblems(input);
  if (problems.length > 0) {
    throw new HttpsError('invalid-argument', `setupBooks: invalid ${problems.join(', ')}.`, { reason: 'invalid', problems });
  }
  const { booksId } = input;
  const name = input.name.trim();

  const configRef = db.collection(AccountingConfigCollection).doc(booksId);
  const existing = await configRef.get();
  if (existing.exists) {
    const mine = ((existing.data()?.['tenants'] as string[] | undefined) ?? []).includes(tenantId);
    throw new HttpsError('failed-precondition', `setupBooks: books '${booksId}' exist.`,
      { reason: mine ? 'books-exist' : 'books-id-taken' });
  }

  const orgRef = db.collection(OrgCollection).doc(booksId);
  const org = await orgRef.get();
  if (org.exists && !((org.data()?.['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
    throw new HttpsError('failed-precondition', `setupBooks: org '${booksId}' belongs to another tenant.`,
      { reason: 'books-id-taken' });
  }

  const config = new AccountingConfigModel(tenantId, booksId);
  config.accountingBackend = input.backend;
  config.fiscalYearStart = input.fiscalYearStart;
  config.vatMethod = input.vatMethod;
  config.vatMethodYear = new Date().getFullYear();
  config.vatPeriod = input.vatPeriod;
  config.ownerKey = `org.${booksId}`;

  const writes: PendingWrite[] = [];
  const entries: VerbResult['preview']['entries'] = [];
  if (!org.exists) {
    const model = new OrgModel(tenantId);
    model.name = name;
    model.index = addIndexElement(addIndexElement('', 'n', model.name), 'ot', model.type); // as getOrgIndex, without the empty fields
    writes.push({ ref: orgRef as PendingWrite['ref'], data: toDoc(model), merge: false });
    entries.push({ kind: 'seed-created', subject: `${OrgCollection}/${booksId}`, consequenceKey: 'seed_created',
      consequence: 'Die Organisation, der die Buchhaltung gehört, wird angelegt.' });
  }
  writes.push({ ref: configRef as PendingWrite['ref'], data: toDoc(config), merge: false });
  entries.push({ kind: 'seed-created', subject: `${AccountingConfigCollection}/${booksId}`, consequenceKey: 'seed_created',
    consequence: 'Die Buchhaltung wird mit diesen Angaben eingerichtet.' });

  const appConfigRef = db.collection(AppConfigCollection).doc(tenantId);
  const current = ((await appConfigRef.get()).data()?.['defaultAccountingTenantId'] as string | undefined) ?? '';
  if (!current.trim()) {
    writes.push({ ref: appConfigRef as PendingWrite['ref'], data: { defaultAccountingTenantId: booksId }, merge: true });
  }
  return { writes, preview: { entries, alsoEnabled: [], withheld: [] } };
}

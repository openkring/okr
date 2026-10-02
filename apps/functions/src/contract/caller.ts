import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { DocumentReference, getFirestore } from 'firebase-admin/firestore';

import { ContractCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { canWriteContracts, ContractViewer, DocData } from './contract-document.util';

export type ContractCaller = ContractViewer & { tenantId: string };

/** App Check + auth, then one `users/{uid}` read for tenant, roles and personKey (server-side, never client data). */
export async function loadViewer(request: CallableRequest<unknown>, cf: string): Promise<ContractCaller> {
  checkAppCheckToken(request as never, cf);
  checkAuthentication(request as never, cf);
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', `${cf}: not signed in`);
  const user = (await getFirestore().collection('users').doc(uid).get()).data();
  if (!user) throw new HttpsError('permission-denied', `${cf}: unknown user`);
  const tenantIds = Array.isArray(user['tenants']) ? (user['tenants'] as string[]).filter((t) => typeof t === 'string' && t) : [];
  if (!tenantIds[0]) throw new HttpsError('failed-precondition', `${cf}: user has no tenant`);
  const roles = (user['roles'] && typeof user['roles'] === 'object' ? user['roles'] : {}) as Record<string, boolean>;
  return { tenantId: tenantIds[0], tenantIds, roles, personKey: String(user['personKey'] ?? '') };
}

/** Admin ∨ treasurer on a contract of the caller's own tenant; anything else reads as not found. */
export async function loadWritableContract(
  viewer: ContractCaller, contractKey: string, cf: string,
): Promise<{ ref: DocumentReference; data: DocData }> {
  if (!canWriteContracts(viewer)) throw new HttpsError('permission-denied', `${cf}: treasurer or admin only`);
  const key = typeof contractKey === 'string' ? contractKey : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) throw new HttpsError('invalid-argument', `${cf}: contractKey`);
  const ref = getFirestore().collection(ContractCollection).doc(key);
  const data = (await ref.get()).data();
  const tenants = Array.isArray(data?.['tenants']) ? (data['tenants'] as string[]) : [];
  if (!data || !tenants.includes(viewer.tenantId)) throw new HttpsError('not-found', `${cf}: contract not found`);
  return { ref, data };
}

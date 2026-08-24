import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createWriteStream } from 'fs';

import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { AddressCollection, UserCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';
import * as logger from 'firebase-functions/logger';
import PDFDocument from 'pdfkit';
import { SwissQRBill } from 'swissqrbill/pdf';
import type { Data } from 'swissqrbill/types';

export type { Data as QrBillData };

export interface GenerateQrBillRequest {
  /**
   * Kept for wire compatibility with deployed clients, but IGNORED: the tenant is derived
   * from `users/{uid}.tenants[0]`. A client can send any string, and trusting this one made
   * every tenant's bank details reachable from every other tenant's app.
   */
  tenantId?: string;
  addressOkey: string;
  data: Data;
}

export interface GenerateQrBillResponse {
  storagePath: string;
}

/** What the caller is allowed to see, from `users/{uid}` — no Firestore inside the predicate. */
export interface BankAccountCaller {
  /** The caller's own tenant, from `users/{uid}.tenants[0]` — never from `request.data`. */
  tenantId: string;
  /** `users/{uid}.personKey`; '' when the user is not linked to a person. */
  personKey: string;
  /** `users/{uid}.roles`. */
  roles: Record<string, boolean>;
}

export type BankAccountVerdict = 'allow' | 'not-found' | 'wrong-channel' | 'forbidden';

/**
 * Whether `caller` may have the IBAN on `addr` read out of the vault and baked into a PDF.
 *
 * Mirrors the `canReadVault` rule in firestore.rules — owner ∨ privileged ∨ memberAdmin,
 * tenant-scoped — which is exactly the tier that can already read the raw document, so this
 * gate costs no legitimate caller anything. Pure, so the decision is unit-testable without
 * Firestore; the callable maps the verdict onto HttpsError codes.
 *
 * `not-found` (not `forbidden`) for a foreign tenant is deliberate: confirming that an okey
 * exists in another tenant is itself a disclosure.
 */
export function mayReadBankAccount(
  addr: Record<string, unknown>,
  caller: BankAccountCaller
): BankAccountVerdict {
  // A read by document id bypasses the `tenants array-contains` filter that guards every
  // query, so provenance has to be checked here.
  const tenants = (addr['tenants'] as string[] | undefined) ?? [];
  if (!tenants.includes(caller.tenantId)) return 'not-found';

  // Only the bankaccount channel carries an IBAN. Refusing every other channel keeps this
  // from becoming a generic vault reader if a future channel gains an `iban`-shaped field.
  if (addr['addressChannel'] !== 'bankaccount') return 'wrong-channel';

  const isOwner = caller.personKey !== '' && addr['parentKey'] === `person.${caller.personKey}`;
  const elevated = caller.roles['admin'] === true
    || caller.roles['privileged'] === true
    || caller.roles['memberAdmin'] === true;
  return isOwner || elevated ? 'allow' : 'forbidden';
}

const CF = 'generateQrBill';

/**
 * Generates a Swiss QR bill PDF and uploads it to Firebase Storage.
 * The client builds the swissqrbill Data structure (creditor, debtor, amount, currency, reference)
 * and passes it along with the addressOkey.
 * Returns the storagePath; the client calls getDownloadURL to get the actual URL.
 *
 * AUTHORIZATION (added 2026-08-24). The creditor IBAN is resolved server-side out of the
 * `addresses` vault (spec 1.19 Phase 3), so this callable reads a `bankaccount` channel and
 * bakes its value into a PDF it hands back. It previously required nothing but
 * authentication and trusted a client-supplied `tenantId` — i.e. any authenticated user of
 * any tenant could read any IBAN in the database by guessing an address okey. The gate now
 * mirrors the `canReadVault` rule in firestore.rules (owner ∨ privileged ∨ memberAdmin,
 * tenant-scoped), which is exactly the tier that can already read the document directly, so
 * no legitimate caller loses access.
 */
export const generateQrBill = onCall<GenerateQrBillRequest, Promise<GenerateQrBillResponse>>(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
  },
  async (request) => {
    checkAppCheckToken(request, CF);
    checkAuthentication(request, CF);
    const tenantId = await getCallerTenantId(request, CF);

    const { addressOkey, data } = request.data;

    if (!addressOkey) {
      throw new HttpsError('invalid-argument', 'addressOkey is required');
    }
    if (!data?.creditor || !data?.currency) {
      throw new HttpsError('invalid-argument', 'data.creditor and data.currency are required');
    }

    const db = getFirestore();

    // Resolve the creditor IBAN server-side from the stored bankaccount address
    // (spec 1.19 Phase 3): the client no longer sends it. The server value always wins.
    const addrDoc = await db.collection(AddressCollection).doc(addressOkey).get();
    if (!addrDoc.exists) {
      throw new HttpsError('not-found', `Address ${addressOkey} not found.`);
    }
    const addr = addrDoc.data() ?? {};

    const uid = request.auth?.uid ?? '';
    const userSnap = await db.collection(UserCollection).doc(uid).get();
    const verdict = mayReadBankAccount(addr, {
      tenantId,
      personKey: String(userSnap.data()?.['personKey'] ?? ''),
      roles: (userSnap.data()?.['roles'] ?? {}) as Record<string, boolean>,
    });
    if (verdict !== 'allow') {
      logger.error(`${CF}: caller ${uid} refused on address ${addressOkey} (${verdict}, tenant=${tenantId})`);
      if (verdict === 'not-found') throw new HttpsError('not-found', `Address ${addressOkey} not found.`);
      if (verdict === 'wrong-channel') throw new HttpsError('failed-precondition', `Address ${addressOkey} is not a bank account.`);
      throw new HttpsError('permission-denied', 'Reading this bank account requires the owner, privileged or memberAdmin role.');
    }

    const iban = String(addr['iban'] ?? '');
    if (!iban) {
      throw new HttpsError('failed-precondition', `Address ${addressOkey} has no IBAN to generate a QR bill.`);
    }
    data.creditor.account = iban;

    const fileName = `qr-bill-${Date.now()}.pdf`;
    const tempPath = path.join(os.tmpdir(), fileName);

    logger.info('generateQrBill: generating PDF', { tenantId, addressOkey, fileName });

    try {
      await new Promise<void>((resolve, reject) => {
        const doc = new PDFDocument({ autoFirstPage: false });
        const stream = createWriteStream(tempPath);
        doc.pipe(stream);

        const qrBill = new SwissQRBill(data);
        qrBill.attachTo(doc);
        doc.end();

        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      const storagePath = `tenant/${tenantId}/address/${addressOkey}/ezs/${fileName}`;
      const bucket = getStorage().bucket();

      await bucket.upload(tempPath, {
        destination: storagePath,
        metadata: { contentType: 'application/pdf' },
      });

      logger.info('generateQrBill: PDF uploaded', { storagePath });
      return { storagePath };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('generateQrBill: failed', { tenantId, addressOkey, message });
      throw new HttpsError('internal', message);
    } finally {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  }
);

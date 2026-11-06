// apps/functions/src/email/group-mail.ts
//
// A group admin mails the members of their group. The `mailJobs` queue stays closed to them on
// purpose: its rule cannot tell a member from any other address, and opening it would turn every
// group admin into a sender to the whole internet in the tenant's name. This callable is the narrow
// door: it proves the caller is an admin of the group, reads the group's members itself, and writes
// the job with the Admin SDK only when every recipient is a member or the tenant's own address.
//
// Recipients come from `address-directory`, the projection every member may read: a person who
// keeps their email from the other members is not mailed here either (privacy-model skill). The
// sender is always the tenant's, never the caller's input.

import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { getAppEmailConfig } from '../auth/email-templates';
import { AttachmentRef } from '../auth';
import { assertCallerIsGroupAdmin } from '../content/group-content.util';
import { bareAddress, MailJobCollection, MailJobDoc } from './mail-job';

const REGION = 'europe-west6';
const CF_NAME = 'sendGroupEmail';

export interface GroupEmailRequest {
  tenantId: string;
  groupKey: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  attachments: AttachmentRef[];
}

export interface MembershipDoc {
  tenants?: string[];
  isArchived?: boolean;
  memberKey?: string;
  memberModelType?: string;
  dateOfExit?: string;
}

/** The persons currently in the group: not archived, not left, in this tenant. Each once. */
export function activeMemberKeys(memberships: MembershipDoc[], tenantId: string, today: string): string[] {
  const active = memberships.filter((membership) =>
    membership.memberModelType === 'person'
    && !membership.isArchived
    && (membership.tenants ?? []).includes(tenantId)
    && (!membership.dateOfExit || membership.dateOfExit > today));
  return [...new Set(active.map((membership) => membership.memberKey ?? '').filter((key) => key.length > 0))];
}

/** What the caller asked for that is not on the list. Compared without regard to case. */
export function unknownRecipients(requested: string[], allowed: string[]): string[] {
  const known = new Set(allowed.map((address) => address.trim().toLowerCase()));
  return requested.filter((address) => !known.has(address.trim().toLowerCase()));
}

/**
 * Only files the composer attached inline: a storage path is no way out of a bucket for a group
 * admin. Each one is rebuilt from its checked fields, so nothing else of the client's object
 * reaches the job, and anything else refuses the whole mail.
 */
export function inlineAttachments(attachments: unknown): AttachmentRef[] {
  if (attachments === undefined) return [];
  if (!Array.isArray(attachments)) throw new HttpsError('invalid-argument', 'attachments must be a list.');
  return attachments.map((attachment: Record<string, unknown> | null) => {
    if (typeof attachment?.['filename'] !== 'string' || typeof attachment['contentBase64'] !== 'string' || 'storagePath' in attachment) {
      throw new HttpsError('invalid-argument', 'Only inline attachments are allowed.');
    }
    const { filename, contentBase64, contentType } = attachment as { filename: string; contentBase64: string; contentType?: unknown };
    return { filename, contentBase64, ...(typeof contentType === 'string' ? { contentType } : {}) };
  });
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new HttpsError('invalid-argument', `${field} must be a list of strings.`);
  }
  return value as string[];
}

/** The favourite email of each key, from the projection; a key without one is left out. */
async function directoryEmails(db: Firestore, tenantId: string, parentKeys: string[]): Promise<string[]> {
  if (parentKeys.length === 0) return [];
  const refs = parentKeys.map((parentKey) => db.collection('address-directory').doc(`${tenantId}_${parentKey}`));
  const snaps = await db.getAll(...refs);
  return snaps.map((snap) => String(snap.data()?.['favEmail'] ?? '')).filter((email) => email.length > 0);
}

export const sendGroupEmail = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<GroupEmailRequest>): Promise<{ recipients: number }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const { tenantId, groupKey, subject, html } = request.data ?? {};
    if (typeof tenantId !== 'string' || !tenantId || typeof groupKey !== 'string' || !groupKey) {
      throw new HttpsError('invalid-argument', 'tenantId and groupKey are required.');
    }
    if (typeof subject !== 'string' || !subject.trim() || typeof html !== 'string') {
      throw new HttpsError('invalid-argument', 'subject and html are required.');
    }
    const to = stringList(request.data.to, 'to');
    const cc = stringList(request.data.cc ?? [], 'cc');
    const bcc = stringList(request.data.bcc, 'bcc');
    if (to.length === 0 || bcc.length === 0) throw new HttpsError('invalid-argument', 'to and bcc must not be empty.');

    const db = getFirestore();
    await assertCallerIsGroupAdmin(db, request.auth?.uid ?? '', tenantId, groupKey, 'Only an admin of the group may mail its members.');

    const memberships = await db.collection('memberships')
      .where('orgKey', '==', groupKey).where('orgModelType', '==', 'group').get();
    const memberKeys = activeMemberKeys(memberships.docs.map((doc) => doc.data() as MembershipDoc), tenantId, getTodayStr(DateFormat.StoreDate));
    const memberEmails = await directoryEmails(db, tenantId, memberKeys.map((key) => `person.${key}`));
    const orgEmails = await directoryEmails(db, tenantId, [`org.${tenantId}`]);
    const from = (await getAppEmailConfig(tenantId)).from;

    const unknown = unknownRecipients([...to, ...cc, ...bcc], [...memberEmails, ...orgEmails, bareAddress(from)]);
    if (unknown.length > 0) {
      // the count only: addresses are PII (privacy inventory §7.2)
      logger.warn(`${CF_NAME}: refused ${unknown.length} recipient(s) outside group (tenant ${tenantId})`);
      throw new HttpsError('permission-denied', 'Every recipient must be a member of the group.');
    }

    const job: MailJobDoc = { tenants: [tenantId], to, cc, bcc, subject, html, attachments: inlineAttachments(request.data.attachments), state: 'pending' };
    await db.collection(MailJobCollection).add(job);
    logger.info(`${CF_NAME}: queued a mail to ${to.length + cc.length + bcc.length} recipient(s) (tenant ${tenantId})`);
    return { recipients: bcc.length };
  },
);

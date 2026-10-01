// apps/functions/src/calendar/deliver.ts
//
// Calendar notifications over the RECIPIENT'S chosen channels (spec 1.73 §2).
//
// `newsDelivery` holds 'email' and/or 'chat'. For calendar notifications 'chat' — labelled
// «In-App-Benachrichtigung» — means an FCM push that opens the event; the workflow engine keeps
// its bot DM for the same value, because a workflow message has no page to open.
//
// A person is not an account: only the account whose tenants[] holds the event's tenant counts.
// No account there → nothing, the deep link would lead nowhere. The one exception is an
// invitation (`emailWithoutAccount`): its email carries signed answer links that work without
// logging in, so a person without an account still gets it — by email, the only channel they have.
//
// Email is queued on the workflow outbox, which already holds the mail secrets and picks the
// tenant's provider and sender. ruleKey `calevent:<okey>` keeps it out of any workflow rule's count.

import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { DeliveryChannel } from '@okr/shared-models';
import { DateFormat, getTodayStr, toDeliveryChannels } from '@okr/shared-util-core';

import { PushPayload, appNameFor, pushToPersons, selectUserDocs } from '../srv/push';
import { createFirestoreDeps } from '../workflow/firestore-deps';
import { OutboxDoc, WorkflowOutboxCollection } from '../workflow/outbox';
import { caleventDeepLink } from './recipients';

export interface ChannelChoice { push: boolean; email: boolean }

export function pickChannels(raw: unknown): ChannelChoice {
  const channels = toDeliveryChannels(raw);
  return { push: channels.includes(DeliveryChannel.Chat), email: channels.includes(DeliveryChannel.Email) };
}

export interface AccountDoc { uid: string; tenants?: string[]; isArchived?: boolean; newsDelivery?: unknown }

export function accountChannels(accounts: AccountDoc[], tenantId: string): ChannelChoice | undefined {
  const [account] = selectUserDocs(accounts, tenantId) as AccountDoc[];
  return account ? pickChannels(account.newsDelivery) : undefined;
}

/**
 * The channels for one person. With an account in the tenant, the account's own choice. Without
 * one, email only — and only when the caller allows it (invitations, see the header).
 */
export function recipientChannels(accounts: AccountDoc[], tenantId: string, emailWithoutAccount = false): ChannelChoice | undefined {
  return accountChannels(accounts, tenantId) ?? (emailWithoutAccount ? { push: false, email: true } : undefined);
}

export interface TenantLinks { appName: string; appUrl: string }

export async function tenantLinks(tenantId: string): Promise<TenantLinks> {
  const snap = await getFirestore().collection('app-config').doc(tenantId).get();
  const domain = String(snap.data()?.['appDomain'] ?? '').replace(/\/+$/, '');
  return { appName: await appNameFor(tenantId), appUrl: domain ? `https://${domain}` : '' };
}

export function eventUrl(links: TenantLinks, caleventKey: string): string {
  return `${links.appUrl}${caleventDeepLink(caleventKey)}`;
}

export interface NotifyRequest {
  personKeys: string[];
  tenantId: string;
  push: PushPayload;
  /** Built per recipient, because the invitation links are personal. */
  email: (personKey: string) => { subject: string; html: string };
  /** Outbox ruleKey, `calevent:<okey>`. */
  ruleKey: string;
  /** true: a person without an account in the tenant is still emailed (invitations only). */
  emailWithoutAccount?: boolean;
  context: string;
}

export async function notifyPersons(req: NotifyRequest): Promise<{ pushed: number; mailed: number }> {
  const db = getFirestore();
  const deps = createFirestoreDeps();
  const pushKeys: string[] = [];
  let mailed = 0;
  const day = getTodayStr(DateFormat.StoreDate);

  await Promise.all([...new Set(req.personKeys)].filter(Boolean).map(async (personKey) => {
    try {
      const snap = await db.collection('users').where('personKey', '==', personKey).get();
      const choice = recipientChannels(snap.docs.map((d) => ({ uid: d.id, ...d.data() })), req.tenantId, req.emailWithoutAccount);
      if (!choice) return;
      if (choice.push) pushKeys.push(personKey);
      if (!choice.email) return;
      const to = await deps.emailFor(personKey, req.tenantId);
      if (!to) return;
      const { subject, html } = req.email(personKey);
      const doc: OutboxDoc = {
        tenants: [req.tenantId], kind: 'sendEmail', ruleKey: req.ruleKey, day, state: 'pending',
        payload: { to, subject, body: html, template: '' },
      };
      await db.collection(WorkflowOutboxCollection).add(doc);
      mailed += 1;
    } catch (err) {
      // one recipient failing never stops the others; no address in the log
      logger.warn(`${req.context}: delivery to one recipient failed:`, err);
    }
  }));

  if (pushKeys.length > 0) {
    try {
      await pushToPersons(pushKeys, req.push, req.context);
    } catch (err) {
      logger.warn(`${req.context}: push failed:`, err);
    }
  }
  logger.info(`${req.context}: ${pushKeys.length} push recipient(s), ${mailed} email(s) queued (${req.ruleKey})`);
  return { pushed: pushKeys.length, mailed };
}

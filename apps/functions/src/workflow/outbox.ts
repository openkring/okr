// apps/functions/src/workflow/outbox.ts
//
// Side-effect actions of the workflow engine — sendEmail, sendMessage, esign
// (planning/specs/2026-08-15-approval-workflow-spec.md §2).
//
// WHY AN OUTBOX. Every send needs secrets (Mailgun/Mailtrap, MATRIX_BOT_TOKEN, the
// DeepSign set), and a Gen-2 secret is bound to the FUNCTION that uses it. Sending
// straight from the engine would mean binding all of them onto every event producer —
// createExpense, submitForm, the membership sync, every future trigger — where a
// forgotten binding fails at runtime, inside a swallowed rule, i.e. silently.
//
// So the engine writes an intent, and exactly one function (this one) holds the secrets
// and performs it. Firestore trigger retries come for free, and the outbox doubles as the
// per-rule daily send counter.

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { getAppEmailConfig } from '../auth/email-templates';
import { DEFAULT_EMAIL_PROVIDER, sendEmailViaProvider } from '../auth/email-transport';
import { activeGroupMemberKeys, ensurePersonInRoom, MATRIX_HOMESERVER, matrixAdminToken, resolveChatRoomForPerson } from '../matrix-simple/shared';
import { logWorkflowActivity } from './activity';
import { matrixBotToken, postGroupChatMessage, sendBotDirectMessage } from './matrix-bot';
import { ALL_ESIGN_SECRETS } from '../esign/shared';
import { startSignatureRun } from '../esign/esign-send-document';

const REGION = 'europe-west6';
const CF_NAME = 'onWorkflowOutbox';

export const WorkflowOutboxCollection = 'workflow-outbox';

export interface OutboxDoc {
  tenants: string[];
  kind: 'sendEmail' | 'sendMessage' | 'esign' | 'openChat';
  ruleKey: string;
  day: string;                       // StoreDate — the per-rule daily cap counts on this
  state?: 'pending' | 'sent' | 'failed';
  error?: string;
  payload: Record<string, string>;
}

const EMAIL_SECRETS = ['MAILGUN_SMTP_PASSWORD', 'MAILTRAP_APIKEY', 'NETZONE_SMTP_PASSWORD', 'MAILTRAP_TEST_USER', 'MAILTRAP_TEST_PASS'];

/** The tenant's configured provider, same lookup the privacy erasure mails use. */
async function providerFor(tenantId: string): Promise<string> {
  const snap = await getFirestore().collection('app-config').doc(tenantId).get();
  return String(snap.data()?.['emailProvider'] ?? DEFAULT_EMAIL_PROVIDER);
}

/**
 * Refuse rather than invent a room.
 *
 * An `openChat` step is fired by a domain event, not by a person opening a chat tab, and it
 * resolves with `create: true` — so without this gate a report against a dissolved group would
 * conjure a brand-new empty room nobody watches, and a report against an ordinary closed group
 * would drag a stranger into it.
 *
 * The gate lives HERE and not in `resolveChatRoomForPerson`, whose other caller
 * (`requestGroupRoomAccess`) deliberately serves non-members of ordinary shared groups —
 * training-course participants and past members reach their group chat that way.
 */
async function assertOpenChatAllowed(groupId: string, personKey: string): Promise<void> {
  const snap = await getFirestore().collection('groups').doc(groupId).get();
  const group = snap.data();
  if (!group) throw new Error(`openChat: group '${groupId}' does not exist`);
  if (group['isArchived']) throw new Error(`openChat: group '${groupId}' is archived`);

  // 'ask' groups are open by definition — Support and Notfall exist to be written to by
  // people who are not on them.
  const chatMode = (group['chatMode'] as string) ?? 'shared';
  if (chatMode === 'ask') return;

  const localpart = personKey.toLowerCase();
  const memberKeys = await activeGroupMemberKeys(groupId);
  // A group admin without a formal membership counts as a member, same as in resolveChatRoomForPerson.
  const adminKeys = ((group['admins'] ?? []) as Array<{ key?: string }>).map((a) => a.key ?? '');
  const isMember = [...memberKeys, ...adminKeys].some((k) => k.toLowerCase() === localpart);
  if (!isMember) {
    throw new Error(`openChat: ${personKey} is not a member of group '${groupId}' (chatMode '${chatMode}')`);
  }
}

export async function dispatch(doc: OutboxDoc): Promise<void> {
  const tenantId = doc.tenants[0] ?? '';
  const p = doc.payload;

  switch (doc.kind) {
    case 'sendEmail': {
      const from = (await getAppEmailConfig(tenantId)).from;
      await sendEmailViaProvider(await providerFor(tenantId), {
        from,
        to: [p['to']],
        subject: p['subject'],
        html: p['body'],
        template: p['template'] || undefined,
      });
      // Recipient count, not the address — PII (privacy inventory §7.2).
      logger.info(`${CF_NAME}: rule ${doc.ruleKey} mailed 1 recipient (tenant ${tenantId})`);
      return;
    }
    case 'sendMessage': {
      await sendBotDirectMessage(p['matrixUserId'], p['body'], p['txnId']);
      logger.info(`${CF_NAME}: rule ${doc.ruleKey} messaged 1 recipient (tenant ${tenantId})`);
      return;
    }
    case 'esign': {
      await startSignatureRun({
        tenantId,
        storagePath: p['storagePath'],
        documentName: p['documentName'],
        signeePersonKey: p['signeePersonKey'],
        sourceRef: p['relatedKey'],
      });
      logger.info(`${CF_NAME}: rule ${doc.ruleKey} started an esign run for ${p['relatedKey']}`);
      return;
    }
    case 'openChat': {
      // Both tokens live here and nowhere else: a Gen-2 secret binds to the function that uses
      // it, and binding MATRIX_ADMIN_TOKEN onto every event producer is exactly what the
      // outbox exists to avoid.
      const adminToken = matrixAdminToken.value();
      const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
      await assertOpenChatAllowed(p['groupId'], p['personKey']);
      const roomId = await resolveChatRoomForPerson(p['groupId'], p['personKey'], hostname, adminToken, { create: true });
      if (!roomId) throw new Error(`openChat: no room for group '${p['groupId']}'`);
      // The reporter must be IN the room before the report lands in it: resolveAskRoom joins the
      // group's members and postGroupChatMessage joins the bot, so without this the one person the
      // conversation is about never sees it — no room in their list, no push, no reply.
      await ensurePersonInRoom(roomId, p['personKey'], hostname, adminToken);
      await postGroupChatMessage(roomId, p['body'], p['txnId'], adminToken);
      logger.info(`${CF_NAME}: rule ${doc.ruleKey} opened a chat with group ${p['groupId']} (tenant ${tenantId})`);
      return;
    }
  }
}

/**
 * Perform one queued action.
 *
 * A failure is written onto the outbox document and NOT rethrown: a retry storm on a
 * misconfigured provider would re-send every message that did succeed in the same batch.
 * The failed row stays in the collection as the record of what did not happen.
 */
export const onWorkflowOutbox = onDocumentCreated(
  {
    document: `${WorkflowOutboxCollection}/{id}`,
    region: REGION,
    secrets: [...EMAIL_SECRETS, matrixBotToken, matrixAdminToken, ...ALL_ESIGN_SECRETS],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const doc = snap.data() as OutboxDoc;

    try {
      await dispatch(doc);
      await snap.ref.update({ state: 'sent' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`${CF_NAME}: ${doc.kind} failed for rule ${doc.ruleKey}: ${message}`);
      await snap.ref.update({ state: 'failed', error: message });
      // Nothing in the app reads `workflow-outbox`, so the failed row alone is invisible. The
      // engine's own rejections land in the activity log; the ones that depend on live Matrix
      // or mail state fail HERE, and they are exactly the ones an admin has to hear about —
      // the member has already been told their report went through.
      await logWorkflowActivity(doc.tenants[0] ?? '', { rule: doc.ruleKey, kind: doc.kind, error: message });
    }
  },
);

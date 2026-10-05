// apps/functions/src/esign/esign-workflow-events.ts
//
// esignList transitions → workflow events (spec 1.87 §6.5). A trigger on the RECORD rather than code in
// the webhook: the record is the state, so a replayed webhook or a manual status fix produces the same
// events, and the archive trigger's signedPdfPath write is visible here without coupling the two.
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { ApprovalCollection, EsignCollection } from '@okr/shared-models';
import { emitEvent } from '../workflow/emit';
import { approvalSubjectPersonKey } from '../approval/approval-person';
import { REGION } from './shared';

type DocData = Record<string, unknown>;
type Signee = { signeeId?: string; name?: string; email?: string; signStatus?: string };
export interface EsignWorkflowEvent {
  event: 'esign.signeeCompleted' | 'esign.completed' | 'esign.failed';
  relatedKey: string;
  params: Record<string, string>;
}

const FAILED = ['rejected', 'withdrawn'];

export function esignTransitions(before: DocData, after: DocData, esignId: string): EsignWorkflowEvent[] {
  const sourceRef = String(after['sourceRef'] ?? '');
  if (!sourceRef.startsWith('approval.')) return [];
  const approvalKey = sourceRef.slice('approval.'.length);
  const out: EsignWorkflowEvent[] = [];

  const was = new Map(((before['signees'] ?? []) as Signee[]).map((s) => [s.signeeId, s.signStatus]));
  const now = (after['signees'] ?? []) as Signee[];
  const signedCount = now.filter((s) => s.signStatus === 'signed').length;
  for (const s of now) {
    if (s.signStatus === 'signed' && was.get(s.signeeId) !== 'signed') {
      out.push({ event: 'esign.signeeCompleted', relatedKey: `esignSignee.${esignId}-${s.signeeId}`,
        params: { esignId, approvalKey, signeeName: s.name || s.email || '', signedCount: String(signedCount), signeeCount: String(now.length) } });
    }
  }
  const path = String(after['signedPdfPath'] ?? '');
  if (path && !before['signedPdfPath']) {
    out.push({ event: 'esign.completed', relatedKey: sourceRef, params: { esignId, approvalKey, signedPdfPath: path } });
  }
  const status = String(after['documentStatus'] ?? '');
  if (FAILED.includes(status) && before['documentStatus'] !== status) {
    out.push({ event: 'esign.failed', relatedKey: sourceRef, params: { esignId, approvalKey, reason: status } });
  }
  return out;
}

export const esignWorkflowEvents = onDocumentUpdated(
  { document: `${EsignCollection}/{esignId}`, region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    const events = esignTransitions(before, after, event.params['esignId']);
    if (!events.length) return;
    const esignId = event.params['esignId'];
    const approvalKey = events[0].params['approvalKey'];
    const approval = (await getFirestore().collection(ApprovalCollection).doc(approvalKey).get()).data();
    if (!approval) {
      // The run's events are dropped: without the approval there is no member to address.
      logger.warn('esignWorkflowEvents: approval missing, events dropped',
        { esignId, approvalKey, events: events.map((e) => e.event) });
      return;
    }
    const tenantId = String(after['tenantId'] ?? '');
    for (const e of events) {
      await emitEvent(e.event, tenantId, e.relatedKey, {
        personKey: approvalSubjectPersonKey(approval),
        subjectName: String(approval['subjectName'] ?? ''),
        params: { ...e.params, kind: String(approval['kind'] ?? '') },
      });
    }
  },
);

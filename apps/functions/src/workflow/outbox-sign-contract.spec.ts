// The signContract dispatch path, stubbed at its seams: the Chrome renderer, the DeepSign run
// start and the event emitter. What matters is the order (render, then run) and that a failed
// setup is announced as esign.failed before the error propagates.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const rendered: unknown[] = [];
const runs: Record<string, unknown>[] = [];
const emitted: { event: string; relatedKey: string; opts: Record<string, unknown> }[] = [];
let renderFails = false;

vi.mock('../pdf/render-document', () => ({
  renderDocument: async (req: unknown) => {
    if (renderFails) throw new Error('chrome died');
    rendered.push(req);
    return { url: 'u', storagePath: 'generated-docs/scs/system/x.pdf' };
  },
}));
vi.mock('../esign/esign-send-document', () => ({
  startSignatureRun: async (o: Record<string, unknown>) => { runs.push(o); return { esignId: 'e1', documentId: 'd1', signees: [] }; },
}));
vi.mock('./emit', () => ({
  emitEvent: async (event: string, _t: string, relatedKey: string, opts: Record<string, unknown>) => { emitted.push({ event, relatedKey, opts }); },
}));
vi.mock('../matrix-simple/shared', () => ({ MATRIX_HOMESERVER: 'https://matrix.example.org', matrixAdminToken: { value: () => '' },
  activeGroupMemberKeys: async () => [], resolveChatRoomForPerson: async () => '', ensurePersonInRoom: async () => '' }));
vi.mock('./matrix-bot', () => ({ matrixBotToken: { value: () => '' }, postGroupChatMessage: async () => undefined, sendBotDirectMessage: async () => undefined }));

import { dispatch, OutboxDoc } from './outbox';

const doc = (): OutboxDoc => ({
  tenants: ['scs'], kind: 'signContract', ruleKey: 'r1', day: '20261005', payload: {
    templateId: 'skiffplatz-vereinbarung', payloadJson: '{"date":"05.10.2026"}', filename: 'skiffPlatz-ap1.pdf',
    documentName: 'Anna Muster — Skiff-Lagerplatz', sourceRef: 'approval.ap1', personKey: 'anna', kind: 'skiffPlatz',
  },
});

beforeEach(() => { rendered.length = 0; runs.length = 0; emitted.length = 0; renderFails = false; });

describe('outbox signContract', () => {
  it('renders the template, then starts a run with the sourceRef', async () => {
    await dispatch(doc());
    expect(rendered).toHaveLength(1);
    expect(runs[0]).toMatchObject({ tenantId: 'scs', storagePath: 'generated-docs/scs/system/x.pdf', sourceRef: 'approval.ap1', sendMail: 'all' });
  });
  it('emits esign.failed and rethrows when rendering fails', async () => {
    renderFails = true;
    await expect(dispatch(doc())).rejects.toThrow('chrome died');
    expect(emitted[0]).toMatchObject({ event: 'esign.failed', relatedKey: 'approval.ap1' });
    expect(emitted[0].opts).toMatchObject({ personKey: 'anna', params: { kind: 'skiffPlatz', reason: 'setup', approvalKey: 'ap1' } });
    expect(runs).toHaveLength(0);
  });
});

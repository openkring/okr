import { describe, expect, it } from 'vitest';

import { AvatarInfo } from '@okr/shared-models';

import { MAX_RULE_SENDS_PER_DAY, SUBJECT_RECIPIENT, isDelegateActive, isResponsibilityValid, resolveAssignee, runProbe, runWorkflowWith } from './engine';
import { EsignRequest, InvoiceDoc, NewApproval, NewTask, OutgoingChatMessage, OutgoingEmail, OwnershipDoc, ResponsibilityDoc, WorkflowContext, WorkflowDeps, WorkflowRuleDoc } from './types';

const TENANT = 'scs';
const TODAY = '20260813';

function ctx(overrides: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    tenantId: TENANT,
    event: 'membership.ended',
    personKey: 'p1',
    relatedKey: 'membership.m1',
    subjectName: 'Anna Muster',
    today: TODAY,
    // {category}/{fromCategory} are the ABBREVIATIONS used in message text; the raw
    // category the categoryIs probe compares is membershipCategory.
    params: { category: 'P', fromCategory: 'A', membershipCategory: 'a' },
    ...overrides,
  };
}

function avatar(key: string): AvatarInfo {
  return { key, name1: '', name2: '', modelType: 'person', type: '', subType: '', label: '' };
}

function rule(overrides: Partial<WorkflowRuleDoc> = {}): WorkflowRuleDoc {
  return { okey: 'r1', event: 'membership.ended', responsibilityKey: 'treasurer', messageKey: '@x.y', ...overrides };
}

interface Fake extends WorkflowDeps {
  tasks: NewTask[];
  activities: Record<string, unknown>[];
  emails: OutgoingEmail[];
  messages: OutgoingChatMessage[];
  esigns: EsignRequest[];
  approvals: NewApproval[];
}

function fakeDeps(over: Partial<{
  rules: WorkflowRuleDoc[];
  ownerships: OwnershipDoc[];
  invoices: InvoiceDoc[];
  responsibility?: ResponsibilityDoc;
  groupAdmin?: AvatarInfo;
  tenantAdmin?: AvatarInfo;
  openTask: boolean;
  requester?: AvatarInfo;
  email?: string;
  matrixId?: string;
  sendCount?: number;
  pendingApproval?: boolean;
}> = {}): Fake {
  const tasks: NewTask[] = [];
  const activities: Record<string, unknown>[] = [];
  const emails: OutgoingEmail[] = [];
  const messages: OutgoingChatMessage[] = [];
  const esigns: EsignRequest[] = [];
  const approvals: NewApproval[] = [];
  return {
    tasks,
    activities,
    emails,
    messages,
    esigns,
    approvals,
    avatarFor: async () => over.requester,
    emailFor: async () => over.email ?? '',
    matrixIdFor: async () => over.matrixId ?? '',
    sendCount: async () => over.sendCount ?? 0,
    sendEmail: async (m) => { emails.push(m); },
    sendChatMessage: async (m) => { messages.push(m); },
    startEsign: async (r) => { esigns.push(r); },
    hasPendingApproval: async () => over.pendingApproval ?? false,
    createApproval: async (a) => { approvals.push(a); },
    rules: async () => over.rules ?? [],
    ownerships: async () => over.ownerships ?? [],
    invoices: async () => over.invoices ?? [],
    responsibility: async () => over.responsibility,
    groupAdmin: async () => over.groupAdmin,
    tenantAdmin: async () => over.tenantAdmin,
    hasOpenTask: async () => over.openTask ?? false,
    createTask: async (t) => { tasks.push(t); },
    translate: async (_t, key, params) => `${key}|${params['name']}|${params['fromCategory']}->${params['category']}`,
    logActivity: async (_t, payload) => { activities.push(payload); },
  };
}

describe('probes', () => {
  it('an empty probe always fires', async () => {
    await expect(runProbe(rule({ probe: '' }), ctx(), fakeDeps())).resolves.toBe(true);
  });

  it("the category's 'always' item fires like an empty probe", async () => {
    await expect(runProbe(rule({ probe: 'always' }), ctx(), fakeDeps())).resolves.toBe(true);
  });

  it('categoryIs compares against the event, not the database', async () => {
    await expect(runProbe(rule({ probe: 'categoryIs', probeArg: 'passive' }), ctx(), fakeDeps())).resolves.toBe(false);
    const passive = ctx({ params: { membershipCategory: 'passive' } });
    await expect(runProbe(rule({ probe: 'categoryIs', probeArg: 'passive' }), passive, fakeDeps())).resolves.toBe(true);
  });

  it('categoryIs reads membershipCategory, NOT the {category} message placeholder', async () => {
    // the abbreviation 'P' is what a task name renders; a probe matching on it would fire
    // on the wrong members entirely
    const c = ctx({ params: { category: 'passive', membershipCategory: 'a' } });
    await expect(runProbe(rule({ probe: 'categoryIs', probeArg: 'passive' }), c, fakeDeps())).resolves.toBe(false);
  });

  it('decisionIs reads the approval outcome', async () => {
    const approved = ctx({ event: 'approval.decided', params: { decision: 'approved' } });
    await expect(runProbe(rule({ probe: 'decisionIs', probeArg: 'approved' }), approved, fakeDeps())).resolves.toBe(true);
    await expect(runProbe(rule({ probe: 'decisionIs', probeArg: 'rejected' }), approved, fakeDeps())).resolves.toBe(false);
  });

  it('ANDs a comma-separated probe list and honours inline arguments', async () => {
    const owns = fakeDeps({ ownerships: [{ state: 'active' }] });
    const passive = ctx({ params: { membershipCategory: 'passive' } });
    await expect(runProbe(rule({ probe: 'categoryIs:passive,hasActiveOwnerships' }), passive, owns)).resolves.toBe(true);
    // same rule, member owns nothing → the second probe fails the whole list
    await expect(runProbe(rule({ probe: 'categoryIs:passive,hasActiveOwnerships' }), passive, fakeDeps())).resolves.toBe(false);
    // same rule, category did not change to passive → the first probe fails it
    await expect(runProbe(rule({ probe: 'categoryIs:passive,hasActiveOwnerships' }), ctx(), owns)).resolves.toBe(false);
  });

  it('an unknown probe fails closed and logs', async () => {
    const deps = fakeDeps();
    await expect(runProbe(rule({ probe: 'hasHovercraft' }), ctx(), deps)).resolves.toBe(false);
    expect(deps.activities[0]['error']).toContain('hasHovercraft');
  });

  it('hasActiveOwnerships ignores archived and non-active ownerships', async () => {
    const none = fakeDeps({ ownerships: [{ state: 'waiting' }, { state: 'active', isArchived: true }] });
    await expect(runProbe(rule({ probe: 'hasActiveOwnerships' }), ctx(), none)).resolves.toBe(false);
    const some = fakeDeps({ ownerships: [{ state: 'active' }] });
    await expect(runProbe(rule({ probe: 'hasActiveOwnerships' }), ctx(), some)).resolves.toBe(true);
  });

  it('hasOwnershipOfType matches the resource type argument', async () => {
    const deps = fakeDeps({ ownerships: [{ state: 'active', resourceType: 'locker' }] });
    await expect(runProbe(rule({ probe: 'hasOwnershipOfType', probeArg: 'key' }), ctx(), deps)).resolves.toBe(false);
    await expect(runProbe(rule({ probe: 'hasOwnershipOfType', probeArg: 'locker' }), ctx(), deps)).resolves.toBe(true);
  });

  it('hasOpenInvoices counts pending and overdue only', async () => {
    const closed = fakeDeps({ invoices: [{ state: 'draft' }, { state: 'paid' }, { state: 'cancelled' }] });
    await expect(runProbe(rule({ probe: 'hasOpenInvoices' }), ctx(), closed)).resolves.toBe(false);
    for (const state of ['pending', 'overdue']) {
      const open = fakeDeps({ invoices: [{ state }] });
      await expect(runProbe(rule({ probe: 'hasOpenInvoices' }), ctx(), open)).resolves.toBe(true);
    }
  });

  it('hasOpenInvoices ignores an archived open invoice', async () => {
    const deps = fakeDeps({ invoices: [{ state: 'overdue', isArchived: true }] });
    await expect(runProbe(rule({ probe: 'hasOpenInvoices' }), ctx(), deps)).resolves.toBe(false);
  });

  it('authorIsNotAssignee fires only when somebody else finished the task', async () => {
    const probe = rule({ probe: 'authorIsNotAssignee' });
    const run = (params: Record<string, string>) => runProbe(probe, ctx({ params }), fakeDeps());
    await expect(run({ authorKey: 'a1', assigneeKey: 'a2' })).resolves.toBe(true);
    await expect(run({ authorKey: 'a1', assigneeKey: 'a1' })).resolves.toBe(false);
    // no author = nobody to notify: fails closed rather than messaging the assignee
    await expect(run({ authorKey: '', assigneeKey: 'a2' })).resolves.toBe(false);
  });
});

describe('isDelegateActive', () => {
  const withWindow = (from: string, to: string): ResponsibilityDoc =>
    ({ delegateAvatar: avatar('d1'), delegateValidFrom: from, delegateValidTo: to });

  it('is true inside the window', () => expect(isDelegateActive(withWindow('20260801', '20260831'), TODAY)).toBe(true));
  it('is false before the window', () => expect(isDelegateActive(withWindow('20260901', '20260930'), TODAY)).toBe(false));
  it('is false after the window', () => expect(isDelegateActive(withWindow('20260701', '20260731'), TODAY)).toBe(false));
  it('is false without a window', () => expect(isDelegateActive(withWindow('', ''), TODAY)).toBe(false));
  it('is false without a delegate', () => expect(isDelegateActive({ delegateValidFrom: '20260801' }, TODAY)).toBe(false));
});

describe('isResponsibilityValid', () => {
  it('accepts the live shape (a past validFrom and the 9999 sentinel)', () => {
    expect(isResponsibilityValid({ validFrom: '20190627', validTo: '99991231' }, TODAY)).toBe(true);
  });
  it('accepts open bounds', () => expect(isResponsibilityValid({ validFrom: '', validTo: '' }, TODAY)).toBe(true));
  it('rejects a role that has not started yet', () => expect(isResponsibilityValid({ validFrom: '20270101' }, TODAY)).toBe(false));
  it('rejects a role that was handed over', () => expect(isResponsibilityValid({ validTo: '20260101' }, TODAY)).toBe(false));
});

describe('resolveAssignee', () => {
  it('takes the responsible person', async () => {
    const deps = fakeDeps({ responsibility: { responsibleAvatar: avatar('resp') } });
    expect((await resolveAssignee(rule(), ctx(), deps))?.key).toBe('resp');
  });

  it('takes the delegate inside the window', async () => {
    const deps = fakeDeps({ responsibility: {
      responsibleAvatar: avatar('resp'), delegateAvatar: avatar('dele'),
      delegateValidFrom: '20260801', delegateValidTo: '20260831',
    } });
    expect((await resolveAssignee(rule(), ctx(), deps))?.key).toBe('dele');
  });

  it('falls back to the group admin and logs', async () => {
    const deps = fakeDeps({ groupAdmin: avatar('ga') });
    expect((await resolveAssignee(rule(), ctx(), deps))?.key).toBe('ga');
    expect(deps.activities[0]['fallback']).toBe('group');
  });

  it('falls back to the tenant admin when there is no group either', async () => {
    const deps = fakeDeps({ tenantAdmin: avatar('admin') });
    expect((await resolveAssignee(rule(), ctx(), deps))?.key).toBe('admin');
    expect(deps.activities.map((a) => a['fallback'])).toEqual(['group', 'tenantAdmin']);
  });

  it('ignores a responsibility whose validity window has passed', async () => {
    const deps = fakeDeps({
      responsibility: { responsibleAvatar: avatar('resp'), validTo: '20260101' },
      tenantAdmin: avatar('admin'),
    });
    expect((await resolveAssignee(rule(), ctx(), deps))?.key).toBe('admin');
  });

  it('ignores an archived responsibility', async () => {
    const deps = fakeDeps({ responsibility: { responsibleAvatar: avatar('resp'), isArchived: true }, tenantAdmin: avatar('admin') });
    expect((await resolveAssignee(rule(), ctx(), deps))?.key).toBe('admin');
  });

  it("resolves 'subject' to the person the event is about", async () => {
    const deps = fakeDeps({ requester: avatar('author'), tenantAdmin: avatar('admin') });
    expect((await resolveAssignee(rule({ responsibilityKey: SUBJECT_RECIPIENT }), ctx(), deps))?.key).toBe('author');
  });

  it("never falls back to an admin when 'subject' has no avatar", async () => {
    const deps = fakeDeps({ requester: undefined, groupAdmin: avatar('ga'), tenantAdmin: avatar('admin') });
    expect(await resolveAssignee(rule({ responsibilityKey: SUBJECT_RECIPIENT }), ctx(), deps)).toBeUndefined();
    expect(deps.activities[0]['error']).toBe('no subject avatar');
  });
});

describe('runWorkflowWith', () => {
  it('opens a task with the translated message and the related key', async () => {
    const deps = fakeDeps({ rules: [rule()], responsibility: { responsibleAvatar: avatar('resp') } });
    await runWorkflowWith(ctx(), deps);
    expect(deps.tasks).toEqual([{
      tenantId: TENANT, name: '@x.y|Anna Muster|A->P', assignee: avatar('resp'),
      dueInDays: 0, relatedModelType: 'membership', relatedKey: 'membership.m1',
    }]);
  });

  it('skips a rule whose probe does not hold', async () => {
    const deps = fakeDeps({
      rules: [rule({ probe: 'hasActiveOwnerships' })],
      responsibility: { responsibleAvatar: avatar('resp') },
    });
    await runWorkflowWith(ctx(), deps);
    expect(deps.tasks).toHaveLength(0);
  });

  it('skips when an open task for the same relatedKey and assignee exists', async () => {
    const deps = fakeDeps({ rules: [rule()], responsibility: { responsibleAvatar: avatar('resp') }, openTask: true });
    await runWorkflowWith(ctx(), deps);
    expect(deps.tasks).toHaveLength(0);
    expect(deps.activities[0]['skipped']).toBe('duplicate');
  });

  it('ignores an unknown action', async () => {
    const deps = fakeDeps({ rules: [rule({ action: 'sendCarrierPigeon' })], responsibility: { responsibleAvatar: avatar('resp') } });
    await runWorkflowWith(ctx(), deps);
    expect(deps.tasks).toHaveLength(0);
    expect(deps.activities[0]['error']).toContain('sendCarrierPigeon');
  });

  it('lets one failing rule not stop the rest', async () => {
    const deps = fakeDeps({ rules: [rule({ okey: 'b' }), rule({ okey: 'a' })] });
    deps.responsibility = async (key) => {
      if (key === 'boom') throw new Error('nope');
      return { responsibleAvatar: avatar('resp') };
    };
    deps.rules = async () => [
      rule({ okey: 'b', messageKey: '@second' }),
      rule({ okey: 'boom', responsibilityKey: 'boom' }),
    ];
    await runWorkflowWith(ctx(), deps);
    expect(deps.tasks.map((t) => t.name)).toEqual(['@second|Anna Muster|A->P']);
    expect(deps.activities[0]['error']).toBe('nope');
  });

  it('does nothing when the tenant has no rule for the event', async () => {
    const deps = fakeDeps({ rules: [] });
    await runWorkflowWith(ctx({ event: 'membership.created' }), deps);
    expect(deps.tasks).toHaveLength(0);
  });
});

describe('sendEmail / sendMessage', () => {
  const responsible = { responsibility: { responsibleAvatar: avatar('resp') } };

  it('mails the resolved responsible person, subject and body from the message key', async () => {
    const deps = fakeDeps({ ...responsible, rules: [rule({ action: 'sendEmail' })], email: 'r@example.org' });
    await runWorkflowWith(ctx(), deps);
    expect(deps.emails).toHaveLength(1);
    expect(deps.emails[0].to).toBe('r@example.org');
    expect(deps.emails[0].subject).toBe('@x.y|Anna Muster|A->P');
    expect(deps.emails[0].body).toBe('@x.y.body|Anna Muster|A->P');
  });

  it('does not mail a person without an address', async () => {
    const deps = fakeDeps({ ...responsible, rules: [rule({ action: 'sendEmail' })], email: '' });
    await runWorkflowWith(ctx(), deps);
    expect(deps.emails).toHaveLength(0);
    expect(deps.activities[0]['error']).toBe('no email address');
  });

  it('stops at the daily cap', async () => {
    const deps = fakeDeps({ ...responsible, rules: [rule({ action: 'sendEmail' })], email: 'r@example.org', sendCount: MAX_RULE_SENDS_PER_DAY });
    await runWorkflowWith(ctx(), deps);
    expect(deps.emails).toHaveLength(0);
    expect(deps.activities[0]['skipped']).toBe('daily send cap');
  });

  it('messages the responsible person with a deterministic transaction id', async () => {
    const deps = fakeDeps({ ...responsible, rules: [rule({ action: 'sendMessage' })], matrixId: '@resp:s' });
    await runWorkflowWith(ctx(), deps);
    await runWorkflowWith(ctx(), deps);
    expect(deps.messages).toHaveLength(2);
    // same rule + same event + same subject → same txnId, so Synapse drops the retry
    expect(deps.messages[0].txnId).toBe(deps.messages[1].txnId);
    expect(deps.messages[0].txnId).not.toContain('.');
  });

  it('does not message a person without a Matrix account', async () => {
    const deps = fakeDeps({ ...responsible, rules: [rule({ action: 'sendMessage' })], matrixId: '' });
    await runWorkflowWith(ctx(), deps);
    expect(deps.messages).toHaveLength(0);
    expect(deps.activities[0]['error']).toBe('no matrix account');
  });
});

describe('task.completed → message the author', () => {
  // the rule an admin configures for "somebody else finished my task"
  const taskRule = rule({
    event: 'task.completed', probe: 'authorIsNotAssignee',
    action: 'sendMessage', responsibilityKey: SUBJECT_RECIPIENT,
  });
  const taskCtx = (authorKey: string, assigneeKey: string) => ctx({
    event: 'task.completed', personKey: authorKey, relatedKey: 'task.t1', subjectName: 'Boot putzen',
    params: { taskName: 'Boot putzen', authorKey, authorName: 'Anna Muster', assigneeKey, assigneeName: 'Bert Meier' },
  });

  it('messages the author when somebody else completed the task', async () => {
    const deps = fakeDeps({ rules: [taskRule], requester: avatar('author'), matrixId: '@author:s' });
    await runWorkflowWith(taskCtx('author', 'assignee'), deps);
    expect(deps.messages).toHaveLength(1);
    expect(deps.messages[0].matrixUserId).toBe('@author:s');
  });

  it('stays silent when the author completed their own task', async () => {
    const deps = fakeDeps({ rules: [taskRule], requester: avatar('author'), matrixId: '@author:s' });
    await runWorkflowWith(taskCtx('author', 'author'), deps);
    expect(deps.messages).toHaveLength(0);
  });
});

describe('esign', () => {
  it('substitutes {relatedKey} into the storage path', async () => {
    const deps = fakeDeps({
      responsibility: { responsibleAvatar: avatar('resp') },
      rules: [rule({ action: 'esign', actionArg: 'docs/{relatedKey}.pdf' })],
    });
    await runWorkflowWith(ctx(), deps);
    expect(deps.esigns[0].storagePath).toBe('docs/membership.m1.pdf');
  });

  it('refuses to start without a storage path', async () => {
    const deps = fakeDeps({ responsibility: { responsibleAvatar: avatar('resp') }, rules: [rule({ action: 'esign' })] });
    await runWorkflowWith(ctx(), deps);
    expect(deps.esigns).toHaveLength(0);
    expect(deps.activities[0]['error']).toContain('storage path');
  });
});

describe('requestApproval', () => {
  const approvalRule = rule({ action: 'requestApproval', actionArg: 'skiffPlatz', writeBack: 'reservations.state' });

  it('creates the approval for the resolved approver, carrying the rule write-back', async () => {
    const deps = fakeDeps({
      rules: [approvalRule],
      responsibility: { responsibleAvatar: avatar('resp') },
      requester: avatar('p1'),
    });
    await runWorkflowWith(ctx(), deps);
    expect(deps.approvals).toHaveLength(1);
    expect(deps.approvals[0].approver?.key).toBe('resp');
    expect(deps.approvals[0].requestedBy?.key).toBe('p1');
    expect(deps.approvals[0].kind).toBe('skiffPlatz');
    expect(deps.approvals[0].writeBack).toBe('reservations.state');
    expect(deps.approvals[0].subjectModelType).toBe('membership');
  });

  it('escalates when the requester IS the responsible person (four eyes)', async () => {
    const deps = fakeDeps({
      rules: [approvalRule],
      responsibility: { responsibleAvatar: avatar('same') },
      requester: avatar('same'),
      groupAdmin: avatar('ga'),
    });
    await runWorkflowWith(ctx(), deps);
    expect(deps.approvals[0].approver?.key).toBe('ga');
    expect(deps.activities[0]['fourEyes']).toContain('requester is the approver');
  });

  it('stalls unassigned rather than letting anyone approve their own request', async () => {
    const deps = fakeDeps({
      rules: [approvalRule],
      responsibility: { responsibleAvatar: avatar('same') },
      requester: avatar('same'),
      groupAdmin: avatar('same'),
      tenantAdmin: avatar('same'),
    });
    await runWorkflowWith(ctx(), deps);
    expect(deps.approvals).toHaveLength(1);
    expect(deps.approvals[0].approver).toBeUndefined();
    expect(deps.activities.some((a) => String(a['fourEyes'] ?? '').includes('unassigned'))).toBe(true);
  });

  it('skips when an approval for the same subject and kind is already pending', async () => {
    const deps = fakeDeps({
      rules: [approvalRule],
      responsibility: { responsibleAvatar: avatar('resp') },
      pendingApproval: true,
    });
    await runWorkflowWith(ctx(), deps);
    expect(deps.approvals).toHaveLength(0);
    expect(deps.activities[0]['skipped']).toBe('approval pending');
  });
});

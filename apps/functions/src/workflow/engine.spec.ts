import { describe, expect, it } from 'vitest';

import { AvatarInfo } from '@okr/shared-models';

import { isDelegateActive, isResponsibilityValid, resolveAssignee, runProbe, runWorkflowWith } from './engine';
import { InvoiceDoc, NewTask, OwnershipDoc, ResponsibilityDoc, WorkflowContext, WorkflowDeps, WorkflowRuleDoc } from './types';

const TENANT = 'scs';
const TODAY = '20260813';

function ctx(overrides: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    tenantId: TENANT,
    event: 'membership.ended',
    personKey: 'p1',
    relatedKey: 'membership.m1',
    subjectName: 'Anna Muster',
    subjectCategory: 'a',
    categoryAbbr: 'P',
    previousAbbr: 'A',
    today: TODAY,
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
}

function fakeDeps(over: Partial<{
  rules: WorkflowRuleDoc[];
  ownerships: OwnershipDoc[];
  invoices: InvoiceDoc[];
  responsibility?: ResponsibilityDoc;
  groupAdmin?: AvatarInfo;
  tenantAdmin?: AvatarInfo;
  openTask: boolean;
}> = {}): Fake {
  const tasks: NewTask[] = [];
  const activities: Record<string, unknown>[] = [];
  return {
    tasks,
    activities,
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
    await expect(runProbe(rule({ probe: 'categoryIs', probeArg: 'passive' }), ctx({ subjectCategory: 'passive' }), fakeDeps())).resolves.toBe(true);
  });

  it('ANDs a comma-separated probe list and honours inline arguments', async () => {
    const owns = fakeDeps({ ownerships: [{ state: 'active' }] });
    const passive = ctx({ subjectCategory: 'passive' });
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
    const deps = fakeDeps({ rules: [rule({ action: 'sendEmail' })], responsibility: { responsibleAvatar: avatar('resp') } });
    await runWorkflowWith(ctx(), deps);
    expect(deps.tasks).toHaveLength(0);
    expect(deps.activities[0]['error']).toContain('sendEmail');
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

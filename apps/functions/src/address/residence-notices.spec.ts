import { describe, expect, it } from 'vitest';

import { movePushText, moveTaskId, moveTaskName, moveTaskNotes, MoveNotice, noticeRecipients } from './residence-notices';

const base: MoveNotice = {
  kind: 'move', parentKey: 'person.p1', parentName: 'Anna Muster', parentTenants: ['A', 'B'],
  oldText: 'Alte 1, 8000 Zürich', newText: 'Neue 2, 8712 Stäfa', validFrom: '20261201',
  recorder: { personKey: 'p1', isOwner: true, tenantId: 'A' },
};

describe('noticeRecipients', () => {
  it('owner: all tenants, no push', () => {
    expect(noticeRecipients(base)).toEqual({ taskTenants: ['A', 'B'], pushPerson: undefined });
  });

  it('admin of A on a person: push to the person, tasks for tenants except A', () => {
    expect(noticeRecipients({ ...base, recorder: { personKey: 'x', isOwner: false, tenantId: 'A' } })).toEqual({ taskTenants: ['B'], pushPerson: 'p1' });
  });

  it('admin of A on a person in A only: no tasks, push', () => {
    expect(noticeRecipients({ ...base, parentTenants: ['A'], recorder: { personKey: 'x', isOwner: false, tenantId: 'A' } }))
      .toEqual({ taskTenants: [], pushPerson: 'p1' });
  });

  it('org recorded by privileged of B with tenants [A, B]: tasks for A only, no push', () => {
    expect(noticeRecipients({ ...base, parentKey: 'org.o1', recorder: { personKey: 'x', isOwner: false, tenantId: 'B' } }))
      .toEqual({ taskTenants: ['A'], pushPerson: undefined });
  });
});

describe('texts', () => {
  it('names the task per kind', () => {
    expect(moveTaskName(base)).toBe('Umzug: Anna Muster');
    expect(moveTaskName({ ...base, kind: 'correction' })).toBe('Adresse korrigiert: Anna Muster');
    expect(moveTaskName({ ...base, kind: 'cancel' })).toBe('Umzug abgesagt: Anna Muster');
  });

  it('notes carry old to new, date and recorder', () => {
    expect(moveTaskNotes(base, 'Bruno Kaiser')).toBe('Alte 1, 8000 Zürich → Neue 2, 8712 Stäfa\nab 01.12.2026\nerfasst von Bruno Kaiser');
  });

  it('push text never contains the address', () => {
    const t = movePushText(base, 'Bruno Kaiser');
    expect(t.title).toBe('Adresse geändert');
    expect(t.body).toBe('Bruno Kaiser hat deinen Umzug erfasst, gültig ab 01.12.2026.');
    expect(t.body).not.toContain('Neue 2');
  });
});

describe('moveTaskId', () => {
  it('is stable and differs per admin, tenant and kind', () => {
    const id = moveTaskId(base, 'A', 'adm1');
    expect(moveTaskId(base, 'A', 'adm1')).toBe(id);
    expect(moveTaskId(base, 'A', 'adm2')).not.toBe(id);
    expect(moveTaskId(base, 'B', 'adm1')).not.toBe(id);
    expect(moveTaskId({ ...base, kind: 'cancel' }, 'A', 'adm1')).not.toBe(id);
  });
});

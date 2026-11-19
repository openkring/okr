import { describe, expect, it } from 'vitest';

import { SYSTEM_AUTHOR } from '../workflow/activity';
import { movePushText, moveTask, moveTaskId, moveTaskName, moveTaskNotes, MoveNotice, noticeRecipients } from './residence-notices';

const base: MoveNotice = {
  kind: 'move', parentKey: 'person.p1', parentName: 'Anna Muster', parentTenants: ['A', 'B'],
  validFrom: '20261201',
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

  it('notes carry name, kind, «ab <date>» for a move and the recorder — no address', () => {
    expect(moveTaskNotes(base, 'Bruno Kaiser')).toBe('Umzug: Anna Muster\nab 01.12.2026\nerfasst von Bruno Kaiser');
  });

  it('notes of a correction or cancel carry no date', () => {
    expect(moveTaskNotes({ ...base, kind: 'correction' }, 'Bruno Kaiser')).toBe('Adresse korrigiert: Anna Muster\nerfasst von Bruno Kaiser');
    expect(moveTaskNotes({ ...base, kind: 'cancel' }, 'Bruno Kaiser')).toBe('Umzug abgesagt: Anna Muster\nerfasst von Bruno Kaiser');
  });

  it('push text says «ab <date>» and never contains an address', () => {
    const t = movePushText(base, 'Bruno Kaiser');
    expect(t.title).toBe('Adresse geändert');
    expect(t.body).toBe('Bruno Kaiser hat deinen Umzug ab 01.12.2026 erfasst.');
    expect(movePushText({ ...base, validFrom: '' }, 'Bruno Kaiser').body).toBe('Bruno Kaiser hat deinen Umzug erfasst.');
  });
});

describe('moveTask', () => {
  const admin = { key: 'adm1', label: 'Mia Admin', modelType: 'person' } as never;

  it('is authored by the system, not the recorder (an owner cannot archive the admins\' notice)', () => {
    const task = moveTask(base, 'A', admin, 'Anna Muster');
    expect(task.author).toEqual(SYSTEM_AUTHOR);
    expect(task.assignee).toBe(admin);
  });

  it('links the parent and carries no address', () => {
    const task = moveTask(base, 'A', admin, 'Anna Muster');
    expect(task.relatedKey).toBe('person.p1');
    expect(task.relatedModelType).toBe('person');
    expect(task.notes).toBe('Umzug: Anna Muster\nab 01.12.2026\nerfasst von Anna Muster');
    expect(moveTask({ ...base, parentKey: 'org.o1' }, 'A', admin, 'X').relatedModelType).toBe('org');
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

  it('noticeKey tells two corrections of the same row apart, and is stable per key', () => {
    const first = moveTaskId({ ...base, kind: 'correction', noticeKey: 'r1|loc1' }, 'A', 'adm1');
    const second = moveTaskId({ ...base, kind: 'correction', noticeKey: 'r1|loc2' }, 'A', 'adm1');
    expect(second).not.toBe(first);
    expect(moveTaskId({ ...base, kind: 'correction', noticeKey: 'r1|loc1' }, 'A', 'adm1')).toBe(first);
    expect(moveTaskId({ ...base, kind: 'correction' }, 'A', 'adm1')).not.toBe(first);
  });

  it('without noticeKey the id is unchanged from the earlier version', () => {
    expect(moveTaskId({ ...base, noticeKey: '' }, 'A', 'adm1')).toBe(moveTaskId(base, 'A', 'adm1'));
  });
});

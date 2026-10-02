// apps/functions/src/task/task-diary.spec.ts
import { describe, expect, it } from 'vitest';
import { pickSourceUser } from './task-diary';

describe('pickSourceUser', () => {
  it('picks the active user in the task tenant', () => {
    expect(pickSourceUser([{ id: 'u1', tenants: ['scs'] }], 'scs')?.id).toBe('u1');
  });
  it('skips an archived user', () => {
    expect(pickSourceUser([{ id: 'u1', tenants: ['scs'], isArchived: true }], 'scs')).toBeUndefined();
  });
  it('skips a user of another tenant', () => {
    expect(pickSourceUser([{ id: 'u1', tenants: ['gss'] }], 'scs')).toBeUndefined();
  });
  it('returns undefined without a match (also without tenants)', () => {
    expect(pickSourceUser([{ id: 'u1' }], 'scs')).toBeUndefined();
    expect(pickSourceUser([], 'scs')).toBeUndefined();
  });
  it('first match wins with two active users', () => {
    const users = [{ id: 'u0', tenants: ['gss'] }, { id: 'u1', tenants: ['scs'] }, { id: 'u2', tenants: ['scs'] }];
    expect(pickSourceUser(users, 'scs')?.id).toBe('u1');
  });
});

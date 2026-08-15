import { describe, expect, it } from 'vitest';

import { resolveWriteBack } from './write-back';

describe('resolveWriteBack', () => {
  it('maps an allowed pair to the state of the decision', () => {
    expect(resolveWriteBack('reservations.state', 'approved')).toEqual({ collection: 'reservations', field: 'state', value: 'active' });
    expect(resolveWriteBack('reservations.state', 'rejected')).toEqual({ collection: 'reservations', field: 'state', value: 'denied' });
    expect(resolveWriteBack('applications.state', 'approved')).toEqual({ collection: 'applications', field: 'state', value: 'closed.approved' });
  });

  it('refuses a pair that is not in the table', () => {
    // the whole point: a rule is admin-editable data and must never become a write
    // primitive over an arbitrary collection/field
    expect(resolveWriteBack('users.roles', 'approved')).toBeUndefined();
    expect(resolveWriteBack('expenses.status', 'approved')).toBeUndefined();
  });

  it('patches nothing without a writeBack or on a non-deciding outcome', () => {
    expect(resolveWriteBack('', 'approved')).toBeUndefined();
    expect(resolveWriteBack('reservations.state', 'withdrawn')).toBeUndefined();
    expect(resolveWriteBack('reservations.state', 'pending')).toBeUndefined();
  });

  it('splits on the FIRST dot, so a nested field path stays intact', () => {
    expect(resolveWriteBack('applications.state', 'rejected')?.field).toBe('state');
  });
});

import { describe, expect, it } from 'vitest';

import { getResourceActionEntries, ResourceActionLabels, ResourceActionTarget } from './resource-actions';

const labels: ResourceActionLabels = {
  resource: 'Ruderboot', ownership: 'Nutzung', ownerView: 'Nutzer/in anzeigen',
  add: 'hinzufügen', view: 'anzeigen', edit: 'ändern', end: 'beenden', archive: 'archivieren', delete: 'löschen'
};
const registered = { canRead: true, canWrite: false, isAdmin: false };
const resourceAdmin = { canRead: true, canWrite: true, isAdmin: false };
const admin = { canRead: true, canWrite: true, isAdmin: true };
const owned: ResourceActionTarget = { hasResource: true, hasOwnership: true, isOngoing: true };
const free: ResourceActionTarget = { hasResource: true, hasOwnership: false, isOngoing: false };

/** entries as 'Group: action, action' / 'action' strings for compact assertions */
function shape(entries: ReturnType<typeof getResourceActionEntries>): string[] {
  return entries.map(e => 'actions' in e ? `${e.text}: ${e.actions.map(a => a.action).join(', ')}` : e.action);
}

describe('getResourceActionEntries', () => {
  it('offers nothing without the registered role', () => {
    expect(getResourceActionEntries({ canRead: false, canWrite: false, isAdmin: false }, owned, labels)).toEqual([]);
  });

  it('gives a registered user read access only', () => {
    expect(shape(getResourceActionEntries(registered, owned, labels))).toEqual([
      'Ruderboot: resource.view',
      'owner.view',
      'Nutzung: ownership.view',
    ]);
  });

  it('gives a resourceAdmin write access, but no archive/delete', () => {
    expect(shape(getResourceActionEntries(resourceAdmin, owned, labels))).toEqual([
      'Ruderboot: resource.view, resource.edit',
      'owner.view',
      'Nutzung: ownership.add, ownership.view, ownership.edit, ownership.end',
    ]);
  });

  it('gives an admin archive and delete on both groups', () => {
    expect(shape(getResourceActionEntries(admin, owned, labels))).toEqual([
      'Ruderboot: resource.view, resource.edit, resource.archive, resource.delete',
      'owner.view',
      'Nutzung: ownership.add, ownership.view, ownership.edit, ownership.end, ownership.archive, ownership.delete',
    ]);
  });

  it('offers only «hinzufügen» for a resource without a current Nutzung', () => {
    expect(shape(getResourceActionEntries(admin, free, labels))).toEqual([
      'Ruderboot: resource.view, resource.edit, resource.archive, resource.delete',
      'Nutzung: ownership.add',
    ]);
    expect(shape(getResourceActionEntries(registered, free, labels))).toEqual([
      'Ruderboot: resource.view',
      'Nutzung: ',
    ]);
  });

  it('does not offer «beenden» for an ended Nutzung', () => {
    const ended = { ...owned, isOngoing: false };
    expect(shape(getResourceActionEntries(resourceAdmin, ended, labels))[2]).toBe('Nutzung: ownership.add, ownership.view, ownership.edit');
  });

  it('marks delete actions destructive by name', () => {
    const all = getResourceActionEntries(admin, owned, labels).flatMap(e => 'actions' in e ? e.actions : [e]);
    expect(all.filter(a => a.action.endsWith('delete')).map(a => a.action)).toEqual(['resource.delete', 'ownership.delete']);
  });

  it('lets a privileged user lock an unlocked rowing boat', () => {
    const privileged = { ...registered, canLock: true };
    expect(shape(getResourceActionEntries(privileged, { ...free, isLockable: true }, labels))[0]).toBe('Ruderboot: resource.view, resource.lock');
  });

  it('offers «Sperrung aufheben» instead of «sperren» for a locked boat', () => {
    const lockAdmin = { ...resourceAdmin, canLock: true };
    expect(shape(getResourceActionEntries(lockAdmin, { ...free, isLockable: true, isLocked: true }, labels))[0])
      .toBe('Ruderboot: resource.view, resource.edit, resource.unlock');
  });

  it('offers no lock without the permission or for a resource that cannot be locked', () => {
    expect(shape(getResourceActionEntries(resourceAdmin, { ...free, isLockable: true }, labels))[0]).toBe('Ruderboot: resource.view, resource.edit');
    expect(shape(getResourceActionEntries({ ...resourceAdmin, canLock: true }, free, labels))[0]).toBe('Ruderboot: resource.view, resource.edit');
  });
});

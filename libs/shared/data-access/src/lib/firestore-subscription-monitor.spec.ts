import { describe, expect, it } from 'vitest';
import { FirestoreSubscriptionMonitor } from './firestore-subscription-monitor';

describe('FirestoreSubscriptionMonitor', () => {
  it('counts one entry per distinct key', () => {
    const monitor = new FirestoreSubscriptionMonitor();
    monitor.opened('query', 'persons', 'persons|tenant=okr');
    monitor.opened('query', 'persons', 'persons|tenant=okr');
    monitor.opened('doc', 'persons', 'persons/abc');

    expect(monitor.activeCount()).toBe(2);
  });

  it('groups the census by collection', () => {
    const monitor = new FirestoreSubscriptionMonitor();
    monitor.opened('doc', 'persons', 'persons/a');
    monitor.opened('doc', 'persons', 'persons/b');
    monitor.opened('query', 'tasks', 'tasks|open');

    expect(monitor.census()).toEqual([
      { collection: 'persons', doc: 2, query: 0, total: 2 },
      { collection: 'tasks', doc: 0, query: 1, total: 1 },
    ]);
  });

  it('drops a key when it is closed', () => {
    const monitor = new FirestoreSubscriptionMonitor();
    monitor.opened('doc', 'persons', 'persons/a');
    monitor.closed('persons/a');

    expect(monitor.activeCount()).toBe(0);
  });

  it('reports the busiest collection first', () => {
    const monitor = new FirestoreSubscriptionMonitor();
    monitor.opened('query', 'tasks', 'tasks|open');
    monitor.opened('doc', 'persons', 'persons/a');
    monitor.opened('doc', 'persons', 'persons/b');

    expect(monitor.census()[0].collection).toBe('persons');
  });
});

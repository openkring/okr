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

  it('counts subscribes, source emissions and deliveries per key', () => {
    const monitor = new FirestoreSubscriptionMonitor();
    monitor.opened('query', 'pages', 'pages|tenant=okr');
    monitor.subscribed('pages|tenant=okr');
    monitor.subscribed('pages|tenant=okr');
    monitor.sourceEmitted('pages|tenant=okr');
    monitor.deliveredValue('pages|tenant=okr');
    monitor.deliveredValue('pages|tenant=okr');

    const [row] = monitor.stream();
    expect(row).toMatchObject({
      collection: 'pages',
      kind: 'query',
      subscribes: 2,
      sourceEmissions: 1,
      delivered: 2,
      open: true,
    });
  });

  it('keeps the counters after the listener is closed, flagged as no longer open', () => {
    const monitor = new FirestoreSubscriptionMonitor();
    monitor.opened('doc', 'persons', 'persons/a');
    monitor.sourceEmitted('persons/a');
    monitor.closed('persons/a');

    expect(monitor.activeCount()).toBe(0);
    expect(monitor.stream()).toEqual([
      { kind: 'doc', collection: 'persons', key: 'persons/a', subscribes: 0, sourceEmissions: 1, delivered: 0, open: false },
    ]);
  });

  it('ignores counter calls for a key that was never opened', () => {
    const monitor = new FirestoreSubscriptionMonitor();
    monitor.subscribed('unknown');
    monitor.sourceEmitted('unknown');
    monitor.deliveredValue('unknown');

    expect(monitor.stream()).toEqual([]);
  });

  it('carries the counters across a reopen of the same key', () => {
    const monitor = new FirestoreSubscriptionMonitor();
    monitor.opened('query', 'pages', 'pages|tenant=okr');
    monitor.deliveredValue('pages|tenant=okr');
    monitor.closed('pages|tenant=okr');
    monitor.opened('query', 'pages', 'pages|tenant=okr');
    monitor.deliveredValue('pages|tenant=okr');

    expect(monitor.stream()[0]).toMatchObject({ delivered: 2, open: true });
  });

  it('shortens an overlong query key so the console table stays readable', () => {
    const monitor = new FirestoreSubscriptionMonitor();
    const key = 'x'.repeat(200);
    monitor.opened('query', 'pages', key);

    expect(monitor.stream()[0].key).toHaveLength(120);
    expect(monitor.stream()[0].key.endsWith('...')).toBe(true);
  });

  it('clears the counters on reset', () => {
    const monitor = new FirestoreSubscriptionMonitor();
    monitor.opened('query', 'pages', 'pages|tenant=okr');
    monitor.deliveredValue('pages|tenant=okr');
    monitor.reset();

    expect(monitor.stream()).toEqual([]);
    expect(monitor.activeCount()).toBe(0);
  });
});

describe('registerConsoleAccess', () => {
  it('is wired from opened(), so the bundler cannot tree-shake it away', () => {
    const w = globalThis as unknown as Record<string, unknown>;
    delete w['__okrFirestoreCensus'];

    new FirestoreSubscriptionMonitor().opened('query', 'pages', 'pages|tenant=okr');

    expect(typeof w['__okrFirestoreCensus']).toBe('function');
  });
});

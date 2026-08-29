import { describe, expect, it } from 'vitest';
import { describeKey, FirestoreSubscriptionMonitor } from './firestore-subscription-monitor';

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

  it('records counter calls for a key that was never opened, instead of dropping them', () => {
    // Frühere Fassung verwarf sie — genau das machte das Instrument nach einem reset() stumm.
    const monitor = new FirestoreSubscriptionMonitor();
    monitor.subscribed('unknown');
    monitor.sourceEmitted('unknown');
    monitor.deliveredValue('unknown');

    expect(monitor.stream()[0]).toMatchObject({ subscribes: 1, sourceEmissions: 1, delivered: 1, open: false });
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

  it('zeroes the counters on reset but keeps the entries and the open listeners', () => {
    const monitor = new FirestoreSubscriptionMonitor();
    monitor.opened('query', 'pages', 'pages|tenant=okr');
    monitor.deliveredValue('pages|tenant=okr');
    monitor.reset();

    // Entries and census survive: the listeners are still open, and a cached stream never
    // calls opened() again — clearing them silenced the instrument entirely.
    expect(monitor.activeCount()).toBe(1);
    expect(monitor.stream()[0]).toMatchObject({ delivered: 0, subscribes: 0, sourceEmissions: 0, open: true });
  });

  it('still counts a stream whose opened() was missed, deriving kind and collection from the key', () => {
    const monitor = new FirestoreSubscriptionMonitor();
    const queryKey = JSON.stringify({ collectionName: 'pages', dbQuery: [], orderByParam: 'name' });

    monitor.deliveredValue(queryKey);
    monitor.deliveredValue('model:persons/abc');

    expect(monitor.stream()).toEqual([
      { kind: 'query', collection: 'pages', key: queryKey, subscribes: 0, sourceEmissions: 0, delivered: 1, open: false },
      { kind: 'doc', collection: 'persons', key: 'model:persons/abc', subscribes: 0, sourceEmissions: 0, delivered: 1, open: false },
    ]);
  });

  it('keeps counters recorded before opened(), and lets opened() correct kind and collection', () => {
    const monitor = new FirestoreSubscriptionMonitor();
    monitor.deliveredValue('surprise-key');
    monitor.opened('doc', 'persons', 'surprise-key');

    expect(monitor.stream()[0]).toMatchObject({ kind: 'doc', collection: 'persons', delivered: 1 });
  });
});

describe('describeKey', () => {
  it('reads a document key of either prefix', () => {
    expect(describeKey('model:persons/abc')).toEqual({ kind: 'doc', collection: 'persons' });
    expect(describeKey('object:app-config/okr')).toEqual({ kind: 'doc', collection: 'app-config' });
  });

  it('reads the collection out of a serialised query key', () => {
    const key = JSON.stringify({ collectionName: 'memberships', dbQuery: [], orderByParam: 'name', sortOrderParam: 'asc' });
    expect(describeKey(key)).toEqual({ kind: 'query', collection: 'memberships' });
  });

  it('falls back to an unknown collection rather than guessing', () => {
    expect(describeKey('nonsense')).toEqual({ kind: 'query', collection: '?' });
    expect(describeKey('{"noCollectionName":1}')).toEqual({ kind: 'query', collection: '?' });
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

import { describe, expect, it } from 'vitest';
import { JournalChange } from '@okr/shared-models';
import { formatHlc } from './journal-hlc.util';
import { applyChange, materialize, viewOf } from './journal-merge.util';

let nextId = 0;
function change(p: Partial<JournalChange> & Pick<JournalChange, 'entity' | 'entityKey' | 'op'>, wall: number, deviceId = 'dev-a', counter = 0): JournalChange {
  nextId += 1;
  return {
    id: `c${nextId}`,
    journalKey: 'j1',
    deviceId,
    seq: nextId,
    hlc: formatHlc({ wall, counter, deviceId }),
    authorKey: 'bruno',
    fields: {},
    ...p,
  };
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

describe('journal merge', () => {
  it('tie on wall time is broken by deviceId', () => {
    const create = change({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { title: 'start' } }, 100);
    const fromA = change({ entity: 'footprint', entityKey: 'f1', op: 'set', fields: { title: 'from a' } }, 200, 'a');
    const fromB = change({ entity: 'footprint', entityKey: 'f1', op: 'set', fields: { title: 'from b' } }, 200, 'b');
    expect(viewOf(materialize([create, fromA, fromB])['footprint:f1'])?.['title']).toBe('from b');
    expect(viewOf(materialize([create, fromB, fromA])['footprint:f1'])?.['title']).toBe('from b');
  });

  it('materialize is order-independent', () => {
    const records = [
      change({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { title: 'Neko' } }, 100),
      change({ entity: 'footprint', entityKey: 'f1', op: 'set', fields: { title: 'Neko Harbour' } }, 200),
      change({ entity: 'footprint', entityKey: 'f1', op: 'set', fields: { title: 'Neko Hbr' }, authorKey: 'barbara' }, 300, 'dev-b'),
      change({ entity: 'section', entityKey: 's1', op: 'create', fields: { html: '<p>a</p>' } }, 110),
      change({ entity: 'section', entityKey: 's1', op: 'set', fields: { html: '<p>b</p>' } }, 120),
      change({ entity: 'section', entityKey: 's1', op: 'archive' }, 400),
    ];
    const snapshot = (list: JournalChange[]) => {
      const state = materialize(list);
      return JSON.stringify(Object.keys(state).sort().map((key) => [key, viewOf(state[key])]));
    };
    const expected = snapshot(records);
    const orders = permutations(records);
    expect(orders).toHaveLength(720);
    for (const order of orders) {
      expect(snapshot(order)).toBe(expected);
    }
    expect(expected).toContain('Neko Hbr');
    expect(viewOf(materialize(records)['section:s1'])).toBeUndefined();
  });

  it('duplicate delivery is idempotent', () => {
    const create = change({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { title: 'Neko' } }, 100);
    const once = applyChange({}, create);
    const twice = applyChange(once, create);
    expect(twice).toEqual(once);
  });

  it('set before create materialises after create', () => {
    const set = change({ entity: 'section', entityKey: 's1', op: 'set', fields: { html: '<p>later</p>' } }, 200);
    const create = change({ entity: 'section', entityKey: 's1', op: 'create', fields: { html: '<p>first</p>' } }, 100);
    const afterSet = applyChange({}, set);
    expect(viewOf(afterSet['section:s1'])).toBeUndefined();
    expect(viewOf(applyChange(afterSet, create)['section:s1'])?.['html']).toBe('<p>later</p>');
  });

  it('non-owner change to an owned section is ignored', () => {
    const create = change({ entity: 'section', entityKey: 's1', op: 'create', fields: { html: '<p>Bruno</p>' } }, 100);
    const intruder = change({ entity: 'section', entityKey: 's1', op: 'set', authorKey: 'barbara', fields: { html: '<p>Barbara</p>' } }, 500, 'dev-b');
    expect(viewOf(materialize([create, intruder])['section:s1'])?.['html']).toBe('<p>Bruno</p>');
  });

  it('shared footprint fields accept both authors', () => {
    const create = change({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { title: 'Bruno' } }, 100);
    const other = change({ entity: 'footprint', entityKey: 'f1', op: 'set', authorKey: 'barbara', fields: { title: 'Barbara' } }, 500, 'dev-b');
    expect(viewOf(materialize([create, other])['footprint:f1'])?.['title']).toBe('Barbara');
  });

  it('archive hides the entity', () => {
    const create = change({ entity: 'section', entityKey: 's1', op: 'create', fields: { html: '<p>x</p>' } }, 100);
    const archive = change({ entity: 'section', entityKey: 's1', op: 'archive' }, 200);
    expect(viewOf(materialize([create, archive])['section:s1'])).toBeUndefined();
  });

  it('a record whose hlc is malformed or names another device is ignored', () => {
    const create = change({ entity: 'section', entityKey: 's1', op: 'create', fields: { html: '<p>Bruno</p>' } }, 100);
    const forged = { ...change({ entity: 'section', entityKey: 's1', op: 'create', authorKey: 'barbara', fields: { html: '<p>stolen</p>' } }, 1, 'dev-b'), hlc: formatHlc({ wall: 1, counter: 0, deviceId: 'dev-a' }) };
    const garbage = { ...change({ entity: 'section', entityKey: 's1', op: 'set', fields: { html: '<p>garbage</p>' } }, 900), hlc: '9999' };
    const state = materialize([create, forged, garbage]);
    expect(viewOf(state['section:s1'])?.['html']).toBe('<p>Bruno</p>');
    expect(state['section:s1'].ownerKey).toBe('bruno');
  });

  it('a set cannot un-archive an entity', () => {
    const create = change({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { title: 'Neko' } }, 100);
    const archive = change({ entity: 'footprint', entityKey: 'f1', op: 'archive' }, 200);
    const revive = change({ entity: 'footprint', entityKey: 'f1', op: 'set', fields: { archived: false, title: 'back' } }, 300);
    expect(viewOf(materialize([create, archive, revive])['footprint:f1'])).toBeUndefined();
  });

  it('non-owner archive of an owned section is ignored', () => {
    const create = change({ entity: 'section', entityKey: 's1', op: 'create', fields: { html: '<p>x</p>' } }, 100);
    const archive = change({ entity: 'section', entityKey: 's1', op: 'archive', authorKey: 'barbara' }, 200, 'dev-b');
    expect(viewOf(materialize([create, archive])['section:s1'])?.['html']).toBe('<p>x</p>');
  });
});

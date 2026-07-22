import { describe, expect, it } from 'vitest';
import { InstrumentModel } from '@okr/shared-models';
import { createInstrument, createTopic, getInstrumentIndex, getInstrumentIndexInfo, hasSource, isInstrument, topicSourceRef } from './instrument.util';

const TENANT = 'scs';

describe('createInstrument', () => {
  it('creates an empty instrument of the given type for the tenant', () => {
    const instrument = createInstrument(TENANT, 'bmc', 'My Canvas');
    expect(instrument.type).toBe('bmc');
    expect(instrument.name).toBe('My Canvas');
    expect(instrument.tenants).toEqual([TENANT]);
    expect(instrument.topics).toEqual([]);
  });
});

describe('createTopic', () => {
  it('creates a topic in the given cell with a fresh key and empty rank', () => {
    const t = createTopic('strengths', 'Fast team');
    expect(t.cell).toBe('strengths');
    expect(t.label).toBe('Fast team');
    expect(t.rank).toBe('');
    expect(t.key.length).toBeGreaterThan(0);
  });

  it('gives every topic a distinct key', () => {
    expect(createTopic('s').key).not.toBe(createTopic('s').key);
  });
});

describe('isInstrument', () => {
  it('accepts a real instrument model', () => {
    expect(isInstrument(createInstrument(TENANT, 'swot'), TENANT)).toBe(true);
  });

  // Matches the shared `isType` contract (typeof-only, as `isTask` uses): objects pass, nullish/primitives fail.
  it('rejects nullish and primitive values', () => {
    expect(isInstrument(null, TENANT)).toBe(false);
    expect(isInstrument(undefined, TENANT)).toBe(false);
    expect(isInstrument('nope', TENANT)).toBe(false);
    expect(isInstrument(42, TENANT)).toBe(false);
  });
});

describe('getInstrumentIndex', () => {
  it('indexes name, type and topic labels', () => {
    const instrument = new InstrumentModel(TENANT);
    instrument.name = 'Strategy';
    instrument.type = 'swot';
    instrument.topics = [createTopic('strengths', 'Brand'), createTopic('threats', 'Regulation')];
    const index = getInstrumentIndex(instrument);
    expect(index).toContain('n:Strategy');   // addIndexElement preserves case
    expect(index).toContain('t:swot');
    expect(index).toContain('Brand');
    expect(index).toContain('Regulation');
  });

  it('omits the topic segment when there are no labels', () => {
    const instrument = createInstrument(TENANT, 'pestel', 'Env scan');
    expect(getInstrumentIndex(instrument)).not.toContain('tp:');
  });
});

describe('getInstrumentIndexInfo', () => {
  it('describes the index segments', () => {
    expect(getInstrumentIndexInfo()).toContain('n:name');
    expect(getInstrumentIndexInfo()).toContain('t:type');
  });
});

describe('hasSource / topicSourceRef (OQ-3)', () => {
  it('reports an unlinked topic as having no source', () => {
    const t = createTopic('strengths', 'Brand');
    expect(hasSource(t)).toBe(false);
    expect(topicSourceRef(t)).toBeUndefined();
  });

  it('reports a linked topic and returns its polymorphic ref', () => {
    const t = { ...createTopic('threats', 'Regulation'), sourceType: 'risk', sourceKey: 'r-123' };
    expect(hasSource(t)).toBe(true);
    expect(topicSourceRef(t)).toEqual({ type: 'risk', key: 'r-123' });
  });
});

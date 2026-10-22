import { buildRecipients } from './file-transfer-recipients';

describe('buildRecipients', () => {
  it('dedupes persons across groups and picks', () => {
    const r = buildRecipients({
      persons: [
        { personKey: 'a', name: 'A', email: 'a@x.ch', viaGroupKey: 'g1' },
        { personKey: 'a', name: 'A', email: 'a@x.ch', viaGroupKey: 'g2' },
        { personKey: 'a', name: 'A', email: 'a@x.ch' },
      ],
      emails: [],
    });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('p:a');
    expect(r[0].kind).toBe('person');
    expect(r[0].viaGroupKeys).toEqual(['g1', 'g2']);
  });
  it('merges an outside email equal to a member email (case-insensitive)', () => {
    const r = buildRecipients({ persons: [{ personKey: 'a', name: 'A', email: 'a@x.ch' }], emails: ['A@X.ch', 'Bob@y.ch', 'bob@y.ch'] });
    expect(r.map(x => x.id)).toEqual(['p:a', 'e:bob@y.ch']);
    expect(r[1]).toMatchObject({ kind: 'email', personKey: '', email: 'bob@y.ch', name: 'bob@y.ch', viaGroupKeys: [] });
  });
});

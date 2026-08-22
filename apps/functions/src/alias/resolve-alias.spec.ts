import { describe, expect, it, vi } from 'vitest';

import { findExistingAlias } from './resolve-alias';

/**
 * Ein Query-Doppel, das die aufgebauten where()-Klauseln mitschreibt — der Reverse-Lookup
 * muss GENAU den Index aus Teilprojekt 1 treffen (tenants + isArchived + space + original),
 * sonst schlägt er in Produktion mit FAILED_PRECONDITION auf.
 */
const fakeDb = (docs: { id: string; data: Record<string, unknown> }[]) => {
  const wheres: [string, string, unknown][] = [];
  const query = {
    where: (field: string, op: string, value: unknown) => {
      wheres.push([field, op, value]);
      return query;
    },
    limit: () => query,
    get: async () => ({
      empty: docs.length === 0,
      docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
    }),
  };
  return { db: { collection: () => query } as never, wheres };
};

const aliasDoc = (over: Record<string, unknown> = {}) => ({
  id: 'scs__link__ab3x4y',
  data: {
    tenants: ['scs'], isArchived: false, space: 'link', alias: 'Ab3x4y',
    original: 'https://seeclub.org/trip/42', isEnabled: true, ...over,
  },
});

describe('findExistingAlias', () => {
  it('queries on exactly the four indexed fields', async () => {
    const { db, wheres } = fakeDb([aliasDoc()]);

    await findExistingAlias(db, 'scs', 'link', 'https://seeclub.org/trip/42');

    expect(wheres).toEqual([
      ['tenants', 'array-contains', 'scs'],
      ['isArchived', '==', false],
      ['space', '==', 'link'],
      ['original', '==', 'https://seeclub.org/trip/42'],
    ]);
  });

  it('returns the existing alias — this is what makes resolveAlias idempotent', async () => {
    const { db } = fakeDb([aliasDoc()]);
    const found = await findExistingAlias(db, 'scs', 'link', 'https://seeclub.org/trip/42');
    expect(found?.alias).toBe('Ab3x4y');
    expect(found?.okey).toBe('scs__link__ab3x4y');
  });

  it('returns undefined when nothing matches, so the caller mints', async () => {
    const { db } = fakeDb([]);
    expect(await findExistingAlias(db, 'scs', 'link', 'https://seeclub.org/x')).toBeUndefined();
  });

  // Ein widerrufener Alias ist keine gueltige Identitaet des Ziels mehr. Wuerde er als
  // Treffer zaehlen, gaebe resolveAlias einen Kurzlink zurueck, der garantiert 410 liefert.
  it('ignores a revoked alias so a fresh one gets minted', async () => {
    const { db } = fakeDb([aliasDoc({ isEnabled: false })]);
    expect(await findExistingAlias(db, 'scs', 'link', 'https://seeclub.org/trip/42')).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';

import { createdAtPatch } from './finance-created.logic';

describe('createdAtPatch', () => {
  const at = new Date('2026-10-21T08:15:30Z');
  it('stamps the create time in Swiss local time', () => expect(createdAtPatch({ title: 'x' }, at)).toEqual({ createdAt: '20261021101530' }));
  it('stamps when the writer left the model default', () => expect(createdAtPatch({ createdAt: '' }, at)).toEqual({ createdAt: '20261021101530' }));
  it('keeps a value the writer set', () => expect(createdAtPatch({ createdAt: '20261020120000' }, at)).toBeUndefined());
  it('ignores a deleted document', () => expect(createdAtPatch(undefined, at)).toBeUndefined());
});

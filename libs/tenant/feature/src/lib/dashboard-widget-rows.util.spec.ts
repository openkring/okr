import { describe, expect, it } from 'vitest';

import { buildWidgetRows } from './dashboard-widget-rows.util';

const allOn = () => true;
const entry = (pageKey: string, type: string, title = '', state = 'published') => ({ pageKey, section: { type, title, state } });

describe('buildWidgetRows', () => {
  it('keeps the page order and resolves @TID@ in the key', () => {
    const rows = buildWidgetRows([entry('news', 'news'), entry('tasks_@TID@', 'tasks')], 'scs', [], allOn);
    expect(rows.map(r => r.key)).toEqual(['news', 'tasks']);
  });

  it('marks a hidden widget as not visible', () => {
    const rows = buildWidgetRows([entry('news', 'news'), entry('tasks', 'tasks')], 'scs', ['tasks'], allOn);
    expect(rows.map(r => r.visible)).toEqual([true, false]);
  });

  it('matches a hidden key that carries the tenant suffix', () => {
    const rows = buildWidgetRows([entry('tasks', 'tasks')], 'scs', ['tasks_scs'], allOn);
    expect(rows[0].visible).toBe(false);
  });

  it('flags a section whose block is off and names the block', () => {
    const rows = buildWidgetRows([entry('tasks', 'tasks'), entry('news', 'news')], 'scs', [], b => b !== 'task');
    expect(rows[0]).toMatchObject({ block: 'task', blockOn: false });
    expect(rows[1]).toMatchObject({ block: undefined, blockOn: true });
  });

  it('flags a draft, and nothing else', () => {
    const rows = buildWidgetRows([entry('a', 'news', '', 'draft'), entry('b', 'news', '', 'published')], 'scs', [], allOn);
    expect(rows.map(r => r.isDraft)).toEqual([true, false]);
  });

  it('flags the invitations widget as the only place, only while its block is on', () => {
    const on = buildWidgetRows([entry('inv', 'invitations')], 'scs', [], allOn);
    const off = buildWidgetRows([entry('inv', 'invitations')], 'scs', [], () => false);
    expect(on[0].onlyHere).toBe(true);
    expect(off[0].onlyHere).toBe(false);
    expect(buildWidgetRows([entry('t', 'tasks')], 'scs', [], allOn)[0].onlyHere).toBe(false);
  });

  it('carries the title and the type', () => {
    const rows = buildWidgetRows([entry('n', 'news', 'Aktuell')], 'scs', [], allOn);
    expect(rows[0]).toMatchObject({ title: 'Aktuell', type: 'news' });
  });

  it('tolerates a missing hidden list', () => {
    expect(buildWidgetRows([entry('n', 'news')], 'scs', undefined, allOn)[0].visible).toBe(true);
  });
});

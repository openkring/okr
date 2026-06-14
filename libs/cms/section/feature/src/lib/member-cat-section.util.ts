export type CatRow = { label: string; male: number; female: number; total: number };

export function buildCatRows(
  memberships: Array<{ category?: string; memberType?: string; relIsLast?: boolean; dateOfExit?: string }>,
  today: string
): CatRow[] {
  const active = memberships.filter(m => m.relIsLast === true && (m.dateOfExit ?? '') > today);

  const catSet = new Set(active.map(m => m.category ?? '').filter(Boolean));
  const cats = [...catSet].sort();

  const rows: CatRow[] = cats.map(cat => {
    let male = 0;
    let female = 0;
    for (const m of active) {
      if (m.category !== cat) continue;
      if (m.memberType === 'male') male++;
      else if (m.memberType === 'female') female++;
    }
    return { label: cat, male, female, total: male + female };
  });

  const totals = rows.reduce(
    (acc, r) => ({ label: 'Total', male: acc.male + r.male, female: acc.female + r.female, total: acc.total + r.total }),
    { label: 'Total', male: 0, female: 0, total: 0 }
  );
  return [...rows, totals];
}

/**
 * Applies the section config to category rows: optional substring filter on the category
 * label and asc/desc ordering. The trailing `Total` row is always kept last.
 */
export function applyCatRowConfig(rows: CatRow[], categoryFilter: string, sortOrder: 'asc' | 'desc'): CatRow[] {
  if (rows.length === 0) return rows;
  const total = rows[rows.length - 1];
  let body = rows.slice(0, -1);
  const filter = categoryFilter.trim().toLowerCase();
  if (filter) {
    body = body.filter(r => r.label.toLowerCase().includes(filter));
  }
  if (sortOrder === 'desc') {
    body = [...body].reverse();
  }
  return [...body, total];
}

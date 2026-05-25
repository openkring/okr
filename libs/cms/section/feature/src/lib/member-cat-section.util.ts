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

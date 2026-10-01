import { CostCenterLike, isActiveLeafCostCenter } from '@okr/shared-util-core';

type Named = CostCenterLike & { id?: string; name?: string };

/** Free-text Kostenstelle (spec 1.65 §6.4.1) → okey of an active leaf, or '' when nothing matches. */
export function matchCostCenterText(value: string, centers: Named[], accountingTenantId: string): string {
  const text = (value ?? '').trim();
  if (!text) return '';
  if (isActiveLeafCostCenter(text, accountingTenantId, centers)) return text;
  const lower = text.toLowerCase();
  const hit = centers.find(c => isActiveLeafCostCenter(c.okey, accountingTenantId, centers)
    && ((c.id ?? '').trim().toLowerCase() === lower || (c.name ?? '').trim().toLowerCase() === lower));
  return hit?.okey ?? '';
}

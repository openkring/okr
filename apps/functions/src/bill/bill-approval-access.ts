// apps/functions/src/bill/bill-approval-access.ts — who may read the bills of a digest (spec 1.94 §3.5)
import { isDelegateActive, isResponsibilityValid } from '../workflow/engine';
import { ResponsibilityDoc } from '../workflow/types';

export function canReadBillsForApproval(input: { isTreasurer: boolean; personKey: string; responsibilities: ResponsibilityDoc[]; today: string }): boolean {
  if (input.isTreasurer) return true;
  if (!input.personKey) return false;
  return input.responsibilities.some(r => !r.isArchived && isResponsibilityValid(r, input.today) && (
    r.responsibleAvatar?.key === input.personKey ||
    (isDelegateActive(r, input.today) && r.delegateAvatar?.key === input.personKey)));
}

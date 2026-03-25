import { ResponsibilityModel } from '@bk2/shared-models';
import { addIndexElement, isType, isValidAt } from '@bk2/shared-util-core';

export function isResponsibility(obj: unknown, tenantId: string): obj is ResponsibilityModel {
  return isType(obj, new ResponsibilityModel(tenantId));
}

export function getResponsibilityIndex(r: ResponsibilityModel): string {
  let index = '';
  index = addIndexElement(index, 'k', r.bkey);  
  if (r.responsibleAvatar) {
    index = addIndexElement(index, 'rn', `${r.responsibleAvatar.name1} ${r.responsibleAvatar.name2}`);
    index = addIndexElement(index, 'rk', r.responsibleAvatar.key);
  }
  return index;
}

export function getResponsibilityIndexInfo(): string {
  return 'k:key rn:responsibleName rk:responsibleKey';
}

export function isDelegateActive(r: ResponsibilityModel, refDate?: string): boolean {
  if (!r.delegateAvatar) return false;
  return isValidAt(r.delegateValidFrom, r.delegateValidTo, refDate);
}



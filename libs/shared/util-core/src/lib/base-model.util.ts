import { BkModel, MembershipModel, PersonModel } from '@bk2/shared-models';
import { sortAscending, SortCriteria, sortDescending, SortDirection } from './sort.util';

/*-------------------------SORT --------------------------------------------*/
export function sortModels(models: BkModel[], sortCriteria: SortCriteria): BkModel[] {
  switch(sortCriteria.direction) {
    case SortDirection.Ascending: return sortAscending(models, sortCriteria.field, sortCriteria.typeIsString);
    case SortDirection.Descending: return sortDescending(models, sortCriteria.field, sortCriteria.typeIsString);
    default: return models;
  }
}

/* ---------------------- Index operations -------------------------------*/
export function addIndexElement(index: string, key: string, value: string | number | boolean): string {
  if (!key || key.length === 0) {
    return index;
  }
  if (typeof (value) === 'string') {
    if (value.length === 0 || (value.length === 1 && value.startsWith(' '))) {
      return index;
    }
  }
  return `${index} ${key}:${value}`;
}



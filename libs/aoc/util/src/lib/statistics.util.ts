import { GenderType } from '@bk2/shared-models';
import { getAge } from '@bk2/shared-util-core';

// -------------------------------------------------------------------
//        Age by Gender Statistics
// -------------------------------------------------------------------

export interface GenderRow {
  rowTitle: string;
  total: number;
  m: number;
  f: number;
  d: number;
}

export function initializeAgeByGenderStatistics(): GenderRow[] {
  return [
    { rowTitle: '1-9', m: 0, f: 0, d: 0, total: 0 },
    { rowTitle: '10-19', m: 0, f: 0, d: 0, total: 0 },
    { rowTitle: '20-29', m: 0, f: 0, d: 0, total: 0 },
    { rowTitle: '30-39', m: 0, f: 0, d: 0, total: 0 },
    { rowTitle: '40-49', m: 0, f: 0, d: 0, total: 0 },
    { rowTitle: '50-59', m: 0, f: 0, d: 0, total: 0 },
    { rowTitle: '60-69', m: 0, f: 0, d: 0, total: 0 },
    { rowTitle: '70-79', m: 0, f: 0, d: 0, total: 0 },
    { rowTitle: '80-89', m: 0, f: 0, d: 0, total: 0 },
    { rowTitle: '90-99', m: 0, f: 0, d: 0, total: 0 },
    { rowTitle: 'Total', m: 0, f: 0, d: 0, total: 0 },
  ];
}

export function updateAgeByGenderStats(ageByGenderStats: GenderRow[], gender: number, dateOfBirth: string | undefined): void {
  if (dateOfBirth === undefined) return;
  const _index = getAge(dateOfBirth, true);
  if (_index === -1) return;
  switch (gender) {
    case GenderType.Male:
      ageByGenderStats[_index].m++;
      ageByGenderStats[ageByGenderStats.length - 1].m++; // total
      break;
    case GenderType.Female:
      ageByGenderStats[_index].f++;
      ageByGenderStats[ageByGenderStats.length - 1].f++; // total
      break;
    case GenderType.Other:
      ageByGenderStats[_index].d++;
      ageByGenderStats[ageByGenderStats.length - 1].d++; // total
      break;
    default:
      return;
  }
  ageByGenderStats[_index].total++;
  ageByGenderStats[ageByGenderStats.length - 1].total++;
}

// -------------------------------------------------------------------
//        Category by Gender Statistics
// -------------------------------------------------------------------
export function initializeCategoryByGenderStatistics(): GenderRow[] {
  return [
    { rowTitle: 'A', m: 0, f: 0, d: 0, total: 0 },
    { rowTitle: 'F', m: 0, f: 0, d: 0, total: 0 },
    { rowTitle: 'E', m: 0, f: 0, d: 0, total: 0 },
    { rowTitle: 'J', m: 0, f: 0, d: 0, total: 0 },
    { rowTitle: 'K', m: 0, f: 0, d: 0, total: 0 },
    { rowTitle: 'Total', m: 0, f: 0, d: 0, total: 0 },
  ];
}

function updateSingleCategory(categoryByGenderStats: GenderRow[], gender: number, index: number): void {
  if (gender === GenderType.Male) {
    categoryByGenderStats[index].m++;
    categoryByGenderStats[categoryByGenderStats.length - 1].m++; // total
  } else {
    categoryByGenderStats[index].f++;
    categoryByGenderStats[categoryByGenderStats.length - 1].f++; // total
  }
  categoryByGenderStats[index].total++;
  categoryByGenderStats[categoryByGenderStats.length - 1].total++;
}

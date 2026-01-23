import { Pipe, PipeTransform } from '@angular/core';
import { getCategoryAbbreviation } from '@bk2/shared-categories';
import { CategoryListModel, CategoryModel } from '@bk2/shared-models';
import { getCatAbbreviation } from '@bk2/category-util';

@Pipe({
  name: 'categoryAbbreviation',
  standalone: true,
})
export class CategoryAbbreviationPipe implements PipeTransform {
  transform(categoryId: number, categories: CategoryModel[]): string {
    return getCategoryAbbreviation(categories, categoryId);
  }
}


/**
 * This is the second version using CategoryListModel
 */
@Pipe({
  name: 'catAbbreviation',
  standalone: true,
})
export class CatAbbreviationPipe implements PipeTransform {
  transform(categoryId: string, categories: CategoryListModel): string {
    return getCatAbbreviation(categories, categoryId);
  }
}


/**
 * This is the second version using CategoryListModel
 */
@Pipe({
  name: 'catAbbreviationFromRelLog',
  standalone: true,
})
export class CatAbbreviationFromRelLogPipe implements PipeTransform {
  transform(relLog: string): string {
    return getLastAbbreviationFromRelLog(relLog);
  }
}


/**
 * Extracts the last abbreviation from a relLog string like '20160101:J,A1,P'.
 * Returns the last part after the last comma, after the colon.
 * Example: '20160101:J,A1,P' => 'P'
 */
export function getLastAbbreviationFromRelLog(relLog: string): string {
  if (!relLog) return '';
  const colonIdx = relLog.indexOf(':');
  if (colonIdx === -1) return '';
  const abbrPart = relLog.substring(colonIdx + 1); // e.g. 'J,A1,P'
  const abbrs = abbrPart.split(',');
  return abbrs.length > 0 ? abbrs[abbrs.length - 1].trim() : '';
}
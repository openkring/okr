import { Pipe, PipeTransform } from '@angular/core';
import { getCategoryImage } from '@bk2/shared/categories';

/**
 * Returns the translated i18n label for a category.
 */
@Pipe({
  name: 'categoryImage',
})
export class CategoryImagePipe implements PipeTransform {
  transform(categoryName: string | undefined, assetFolderName: string): string {
    if (!categoryName || categoryName.length === 0)  return '';
    if (!assetFolderName || assetFolderName.length === 0)  return '';
    return getCategoryImage(assetFolderName.toLocaleLowerCase(), categoryName.toLowerCase());
  }
}
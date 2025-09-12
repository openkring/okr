import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from '@bk2/shared-i18n';
import { getCountryName } from '@bk2/shared-util-core';

@Pipe({
  name: 'countryName',
  standalone: true
})
export class CountryNamePipe implements PipeTransform {
  private readonly i18nService;

  constructor(i18nService?: I18nService) {
    // Only call inject if no argument is provided
    this.i18nService = i18nService ?? inject(I18nService);
  }

  transform(countryCode: string): string {
      return getCountryName(countryCode, this.i18nService.getActiveLang());
  }
}

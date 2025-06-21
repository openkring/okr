import { Pipe, PipeTransform, inject } from '@angular/core';
import { ENV } from '@bk2/shared/config';
import { I18nService } from '@bk2/shared/i18n';
import { getCountryName } from './country.util';

@Pipe({
  name: 'countryName',
})
export class CountryNamePipe implements PipeTransform {
  private readonly env = inject(ENV);
  private readonly i18nService = inject(I18nService);

  transform(countryCode: string): string {
      return getCountryName(countryCode, this.i18nService.getActiveLang());
  }
}

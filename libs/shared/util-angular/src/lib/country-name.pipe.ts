import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from '@okr/shared-i18n';
import { getCountryName } from '@okr/shared-util-core';

@Pipe({
  name: 'countryName',
  standalone: true
})
export class CountryNamePipe implements PipeTransform {
  private readonly i18nService = inject(I18nService);

  transform(countryCode: string): string {
      return getCountryName(countryCode, this.i18nService.getActiveLang());
  }
}

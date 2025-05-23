import { Pipe, PipeTransform, inject } from "@angular/core";
import { HashMap } from "@jsverse/transloco";
import { Observable } from "rxjs";
import { I18nService } from "./i18n.service";

@Pipe({
  name: 'translate',
})
export class TranslatePipe implements PipeTransform {
  private readonly i18nService = inject(I18nService);

  transform(key: string | undefined | null, argument?: HashMap): Observable<string> {
    return this.i18nService.translate(key, argument);  
  }
}

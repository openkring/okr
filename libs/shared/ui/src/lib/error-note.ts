import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonItem, IonNote } from '@ionic/angular/standalone';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';

import { ColorsIonic } from '@okr/shared-categories';
import { ColorIonic } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';

@Component({
  selector: 'okr-error-note',
  standalone: true,
  imports: [
    IonNote, IonItem
  ],
  template: `
    @if(hasErrors()) {
      <ion-item lines="none">
        <ion-note color="danger">{{error()}}</ion-note>
      </ion-item>
    }
  `
})
export class ErrorNote {
  private readonly translocoService = inject(TranslocoService);
  private readonly i18nService = inject(I18nService);

  // inputs
  public errors = input.required<string[]>();
  public color = input<ColorIonic>(ColorIonic.Danger);

  // computed
  protected hasErrors = computed(() => this.errors().length > 0);
  private readonly errorRef = rxResource({
    params: () => ({
      errors: this.errors()
    }),
    stream: ({params}) => this.translate(params.errors) });
  protected error = computed (() => this.errorRef.value() as string);
  
  // passing constants to the template
  protected colorsIonic = ColorsIonic;

  private translate(keys: string[]): Observable<string> {
    if (!keys || keys.length === 0) return of('');
    const key = keys[0];
    if (key.startsWith('@')) {
      // Delegate to I18nService so lazy-loaded scoped keys (e.g. '@finance/expense/feature.validation.x')
      // are resolved correctly — it loads the scope first, which plain selectTranslate does not.
      return this.i18nService.translate(key);
    } else {
      return this.translocoService.selectTranslate(`validation.${key}`);
    }
  }
}

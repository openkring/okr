import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList } from '@ionic/angular';

import { Header } from '@okr/shared-ui';
import type { FormI18n } from '@okr/forms-util';

/**
 * The (i) next to a form's title, for the person filling it in — in the public form section and
 * in the form modal (spec 1.125 §17.2). It shows only the paragraphs that apply to THIS form:
 * the rules paragraph when the form has any, then the author's own `fillerHelpText`.
 *
 * Public pages are anonymous, so nothing here depends on a signed-in user. `fillerHelpText` is
 * author-written and rendered as plain text (interpolation, never innerHTML); line breaks are kept.
 *
 * Purely informational — read-only, nothing is entered or saved here. It is not a form, so it
 * carries no `okr-change-confirmation` (`MODAL_ALLOWLIST` in `scripts/check-forms.mjs`).
 */
@Component({
  selector: 'okr-form-filler-help-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonItem, IonLabel, IonList, Header],
  styles: [`.author-text { white-space: pre-line; }`],
  template: `
    <okr-header [i18n]="{ title: i18n().help_filler_title() }" [isModal]="true" />
    <ion-content>
      <ion-list>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n().help_filler_required() }}</ion-label></ion-item>
        @if (hasRules()) {
          <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n().help_filler_conditions() }}</ion-label></ion-item>
        }
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n().help_filler_privacy() }}</ion-label></ion-item>
        @if (fillerHelpText().trim()) {
          <ion-item lines="none"><ion-label class="ion-text-wrap author-text">{{ fillerHelpText() }}</ion-label></ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class FormFillerHelpModal {
  public readonly i18n = input.required<FormI18n>();
  /** whether any field of the form has a visibility rule — see `hasVisibilityRules` */
  public readonly hasRules = input(false);
  /** the form author's own paragraph; absent on legacy definitions */
  public readonly fillerHelpText = input('');
}

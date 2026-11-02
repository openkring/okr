import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList } from '@ionic/angular';

import { Header } from '@okr/shared-ui';
import type { FormI18n } from '@okr/forms-util';

/**
 * The (i) in the form builder's canvas toolbar — what a form author needs to know to build a
 * form, one paragraph per feature (spec 1.125 §17.1). Phase A covers fields, conditions and
 * blocks, hidden-means-absent, the ordering rule, calculated values, custom details and the
 * preview; paragraphs for later phases are added with that phase.
 *
 * Purely informational — read-only, nothing is entered or saved here. It is not a form, so it
 * carries no `okr-change-confirmation`; the header's own close button dismisses it
 * (`MODAL_ALLOWLIST` in `scripts/check-forms.mjs`).
 */
@Component({
  selector: 'okr-form-builder-help-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonItem, IonLabel, IonList, Header],
  template: `
    <okr-header [i18n]="{ title: i18n().help_editor_title() }" [isModal]="true" />
    <ion-content>
      <ion-list>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n().help_editor_fields() }}</ion-label></ion-item>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n().help_editor_conditions() }}</ion-label></ion-item>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n().help_editor_several() }}</ion-label></ion-item>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n().help_editor_blocks() }}</ion-label></ion-item>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n().help_editor_hidden() }}</ion-label></ion-item>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n().help_editor_order() }}</ion-label></ion-item>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n().help_editor_derived() }}</ion-label></ion-item>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n().help_editor_properties() }}</ion-label></ion-item>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n().help_editor_preview() }}</ion-label></ion-item>
      </ion-list>
    </ion-content>
  `,
})
export class FormBuilderHelpModal {
  public readonly i18n = input.required<FormI18n>();
}

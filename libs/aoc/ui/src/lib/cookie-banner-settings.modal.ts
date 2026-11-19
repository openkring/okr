import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';

import { AOC_COOKIE_BANNER_I18N_KEYS, AocCookieBannerI18n, CookieBannerSettings } from '@okr/aoc-util';

import { CookieBannerSettingsForm } from './cookie-banner-settings.form';

/**
 * AOC «Datenschutz» → Cookie-Hinweis: header, change-confirmation, one form (building-forms skill).
 *
 * Does NOT save itself: the caller (`AocHubStore.editCookieBanner()`) gets the edited settings
 * back via `dismiss(..., 'confirm')` and calls `AppConfigService.setCookieBanner`. It therefore
 * injects no store — the store's dynamic import of this modal must not become circular.
 */
@Component({
  selector: 'okr-cookie-banner-settings-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, CookieBannerSettingsForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()"
        (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-cookie-banner-settings-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class CookieBannerSettingsModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(AOC_COOKIE_BANNER_I18N_KEYS) as AocCookieBannerI18n;

  // inputs
  public readonly settings = input.required<CookieBannerSettings>();

  // signals
  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  protected readonly showForm = signal(true);
  public formData = linkedSignal(() => safeStructuredClone(this.settings()));

  protected readonly headerTitle = computed(() => this.i18n.title());
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  protected onFormDataChange(formData: CookieBannerSettings): void {
    this.formData.set(formData);
  }

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.settings()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}

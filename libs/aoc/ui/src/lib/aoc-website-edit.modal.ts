import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { WebsiteContentModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';
import { AOC_I18N_KEYS, AocI18n } from '@okr/aoc-util';

import { AocWebsiteForm } from './aoc-website.form';

/** Edits a website text; dismisses with the edited WebsiteContentModel and role 'confirm'. */
@Component({
  selector: 'okr-aoc-website-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, AocWebsiteForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.website_update_label() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-aoc-website-form
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
export class AocWebsiteEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: keeps this modal presentational
  protected readonly i18n = inject(I18nService).translateAll(AOC_I18N_KEYS) as AocI18n;

  public readonly item = input.required<WebsiteContentModel>();

  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => this.cloneItem());
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(this.cloneItem());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }

  protected onFormDataChange(formData: WebsiteContentModel): void {
    this.formData.set(formData);
  }

  /** Firestore reads skip model defaults: legacy docs may lack de/en/isHtml. */
  private cloneItem(): WebsiteContentModel {
    const item = safeStructuredClone(this.item()) ?? ({} as WebsiteContentModel);
    return { ...item, de: item.de ?? '', en: item.en ?? '', isHtml: item.isHtml ?? false };
  }
}

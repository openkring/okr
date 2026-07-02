import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { IconModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { IconEditForm } from '@okr/cms-icon-ui';
import { ICON_I18N_KEYS, IconI18n } from '@okr/cms-icon-util';

@Component({
  selector: 'okr-icon-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, IconEditForm,
    IonContent
  ],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content>
      @if(currentUser(); as currentUser) {
        @if(formData(); as formData) {
          <okr-icon-edit-form
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser"
            [allTags]="tags()"
            [tenants]="tenantId()"
            [readOnly]="isReadOnly()"
            [showForm]="showForm()"
            [i18n]="i18n"
            (dirty)="formDirty.set($event)"
            (valid)="formValid.set($event)"
          />
        }
      }
    </ion-content>
  `
})
export class IconEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(ICON_I18N_KEYS) as IconI18n;
  protected readonly appStore = inject(AppStore);

  // inputs
  public icon = input.required<IconModel>();
  public currentUser = input<UserModel | undefined>();
  public tags = input<string>('');
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showForm = signal(true);
  public formData = linkedSignal(() => safeStructuredClone(this.icon()));

  // derived
  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view();
    return this.icon()?.okey ? this.i18n.update() : this.i18n.create();
  });
  protected tenantId = computed(() => this.appStore.tenantId());
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.icon()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: IconModel): void {
    this.formData.set(formData);
  }
}

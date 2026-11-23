import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { OrgNewForm } from '@okr/subject-org-ui';
import { CategoryListModel, UserModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';

import { ORG_I18N_KEYS, ORG_NEW_FORM_SHAPE, OrgI18n, OrgNewFormModel } from '@okr/subject-org-util';
import { DEFAULT_ORG_TYPE } from '@okr/shared-constants';
import { dismissOverlay } from '@okr/shared-util-angular';
import { defaultItemName } from '@okr/shared-util-core';
import { AppStore } from '@okr/shared-feature';

@Component({
  selector: 'okr-org-new-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, OrgNewForm,
    IonContent
  ],
  template: `
    <okr-header [i18n]="{ title: i18n.create() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(currentUser(); as currentUser) {
        <okr-org-new-form
          [formData]="formData()"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [currentUser]="currentUser"
          [allTags]="allTags()"
          [types]="types()"
          [hiddenFields]="hiddenFields()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class OrgNewModal implements OnInit {
  protected readonly i18n = inject(I18nService).translateAll(ORG_I18N_KEYS) as OrgI18n;
  private readonly modalController = inject(ModalController);

  // inputs
  public currentUser = input.required<UserModel>();
  public tags = input<string>('');
  /** When set, the tag vocabulary is read live, so a value added via «Werte bearbeiten» validates at once. */
  public tagModel = input<string>('');
  private readonly appStore = inject(AppStore);
  protected readonly allTags = computed(() => this.tagModel() ? this.appStore.getTags(this.tagModel()) : this.tags());
  public types = input.required<CategoryListModel>();
  protected readonly hiddenFields = computed(() => this.appStore.hiddenFields('org'));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected formData = signal(ORG_NEW_FORM_SHAPE);
  protected showForm = signal(true);

  // derived
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));

  /** The form starts with a type the tenant offers; `types` is an input, so it is known only from here on. */
  public ngOnInit(): void {
    this.formData.set(this.freshFormData());
  }

  private freshFormData(): OrgNewFormModel {
    return { ...ORG_NEW_FORM_SHAPE, type: defaultItemName(this.types(), DEFAULT_ORG_TYPE) };
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(this.freshFormData());  // reset the form
    // re-mount the form so its field state (touched, error notes) starts fresh
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: OrgNewFormModel): void {
    this.formData.set(formData);
  }
}

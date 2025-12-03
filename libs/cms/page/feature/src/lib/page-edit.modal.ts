import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { PageModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';

import { PageFormComponent } from '@bk2/cms-page-ui';
import { convertFormToPage, convertPageToForm, PageFormModel } from '@bk2/cms-page-util';
import { getTitleLabel } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-page-edit-modal',
  standalone: true,
  imports: [TranslatePipe, AsyncPipe, HeaderComponent, ChangeConfirmationComponent, PageFormComponent, IonContent],
  template: `
    <bk-header title="{{ headerTitle() | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-page-form
        [formData]="formData()"
        [currentUser]="currentUser()"
        [types]="types()"
        [states]="states()"
        [allTags]="tags()"
        [readOnly]="isReadOnly()"
        (formDataChange)="onFormDataChange($event)"
      />
    </ion-content>
  `,
})
export class PageEditModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public page = input.required<PageModel>();
  public currentUser = input.required<UserModel>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => convertPageToForm(this.page()));

  // derived signals
  protected headerTitle = computed(() => getTitleLabel('content.page', this.page()?.bkey, this.isReadOnly()));
  protected readonly tags = computed(() => this.appStore.getTags('page'));
  protected readonly types = computed(() => this.appStore.getCategory('page_type'));
  protected readonly states = computed(() => this.appStore.getCategory('content_state'));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(convertFormToPage(this.formData(), this.page()), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertPageToForm(this.page()));  // reset the form
  }

  protected onFormDataChange(formData: PageFormModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, MenuItemModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { MenuItemFormComponent } from '@bk2/cms-menu-ui';
import { ENV } from '@bk2/shared-config';

@Component({
  selector: 'bk-menu-item-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    MenuItemFormComponent,
    IonContent
  ],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
      } 
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-menu-item-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [showForm]="showForm()"
          [roles]="roles()"
          [types]="types()"
          [tenantId]="env.tenantId"
          [readOnly]="isReadOnly()"
          [allTags]="tags()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class MenuItemModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly env = inject(ENV);

  // inputs
  public menuItem = input.required<MenuItemModel>();
  public currentUser = input.required<UserModel>();
  public tags = input.required<string>();
  public roles = input.required<CategoryListModel>();
  public types = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => structuredClone(this.menuItem()));
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => getTitleLabel('content.menuItem', this.menuItem().bkey, this.isReadOnly()));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(structuredClone(this.menuItem()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: MenuItemModel): void {
    this.formData.set(formData);
  }
}



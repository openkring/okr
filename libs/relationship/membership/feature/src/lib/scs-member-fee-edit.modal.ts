import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, ScsMemberFeesModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { getFullName, safeStructuredClone } from '@bk2/shared-util-core';

import { AvatarToolbarComponent } from '@bk2/avatar-feature';

import { ScsMemberFeeEditForm } from '@bk2/relationship-membership-ui';

@Component({
  selector: 'bk-scs-member-fee-edit-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ScsMemberFeeEditForm, HeaderComponent, ChangeConfirmationComponent, AvatarToolbarComponent,
    IonContent,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if (showConfirmation()) {
      <bk-change-confirmation [showCancel]="true" (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <bk-avatar-toolbar 
        key="{{parentKey()}}" 
        title="{{ memberName() }}" 
        modelType="person" 
        [readOnly]="true" 
      />
      <bk-scs-member-fee-edit-form
        [formData]="formData()"
        [currentUser]="currentUser()"
        [membershipCategories]="mcat()"
        [showForm]="showForm()"
        [readOnly]="readOnly()"
        (dirty)="manualDirty.set($event)"
        (valid)="formValid.set($event)"
        (formDataChange)="formData.set($event)"
      />
    </ion-content>
  `
})
export class ScsMemberFeeEditModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public fee = input.required<ScsMemberFeesModel>();
  public currentUser = input.required<UserModel>();
  public mcat = input<CategoryListModel | undefined>(undefined);
  public readOnly = input(false);

  // signals
  protected formData = linkedSignal(() => safeStructuredClone(this.fee()));
  protected showForm = signal(true);
  protected formValid = signal(false);
  protected manualDirty = signal(false);

  // computed
  protected memberKey = computed(() => this.fee()?.member?.key ?? '');
  protected memberName = computed(() => getFullName(this.fee()?.member?.name1 ?? '', this.fee()?.member?.name2 ?? '', this.currentUser()?.nameDisplay))
  protected parentKey = computed(() => `person.${this.memberKey()}`);

  protected showConfirmation = computed(() => this.formValid() && this.manualDirty());

  protected headerTitle = computed(() =>
    this.readOnly() ? '@finance.scsMemberFee.operation.view.label' : '@finance.scsMemberFee.operation.update.label'
  );

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.manualDirty.set(false);
    this.formData.set(safeStructuredClone(this.fee()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}

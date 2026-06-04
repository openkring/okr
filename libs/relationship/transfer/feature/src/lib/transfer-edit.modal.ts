import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, RoleName, TransferModel, TransferModelName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { hasRole, safeStructuredClone } from '@bk2/shared-util-core';

import { CommentsAccordion } from '@bk2/comment-feature';
import { TransferForm } from '@bk2/relationship-transfer-ui';
import { TransferStore } from './transfer.store';


@Component({
  selector: 'bk-transfer-edit-modal',
  standalone: true,
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  imports: [
    Header, ChangeConfirmation, TransferForm, CommentsAccordion, 
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  providers: [TransferStore],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-transfer-form
          [i18n]="store.i18n"
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [allTags]="tags()"
          [tenantId]="tenantId()"
          [types]="types()"
          [states]="states()"
          [periodicities]="periodicities()"
          [readOnly]="readOnly()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (selectSubject)="selectSubject()"
          (selectObject)="selectObject()"
          (selectResource)="selectResource()"
        />
      }

      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="comments">
              <bk-comments-accordion [parentKey]="parentKey()" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `,
})
export class TransferEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(TransferStore);

  // inputs
  public transfer = input.required<TransferModel>();
  public currentUser = input.required<UserModel>();
  public types = input.required<CategoryListModel>();
  public states = input.required<CategoryListModel>();
  public periodicities = input.required<CategoryListModel>();
  public tags = input.required<string>();
  public tenantId = input.required<string>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected formData = linkedSignal(() => safeStructuredClone(this.transfer()));
  protected showForm = signal(true);

  // derived signals
  protected readonly headerTitle = computed(() => this.store.getTitleLabel(this.readOnly(), this.transfer()?.bkey));
  protected readonly parentKey = computed(() => `${TransferModelName}.${this.transferKey()}`);
  protected readonly transferKey = computed(() => this.transfer().bkey ?? '');
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm')
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.transfer()));  // reset the form
      // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: TransferModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async selectSubject(): Promise<void> {
    const avatar = await this.store.selectPersonAvatar();
    const formData = this.formData();
    if (avatar && formData) {
      const subjects = formData.subjects;
      subjects.push(avatar);
      this.formData.update((vm: TransferModel | undefined) => {
        if (!vm) return vm;
        return { ...vm, subjects };
      });
    }
    this.formDirty.set(true);
  }

  protected async selectObject(): Promise<void> {
    const avatar = await this.store.selectPersonAvatar();
    const formData = this.formData();
    if (avatar && formData) {
      const objects = formData.objects;
      objects.push(avatar);
      this.formData.update((vm: TransferModel | undefined) => {
        if (!vm) return vm;
        return { ...vm, objects };
      });
    }
    this.formDirty.set(true);
  }

  protected async selectResource(): Promise<void> {
    const resource = await this.store.selectResourceAvatar();
    if (resource) {
      this.formData.update((vm: TransferModel | undefined) => {
        if (!vm) return vm;
        return { ...vm, resource };
      });
    }
    this.formDirty.set(true);
  }
}

import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, OrgModel, PersonModel, RoleName, UserModel, WorkrelModel, WorkrelModelName } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, hasRole, safeStructuredClone } from '@bk2/shared-util-core';

import { CommentsAccordion } from '@bk2/comment-feature';
import { WorkrelForm } from '@bk2/relationship-workrel-ui';
import { WorkrelStore } from './workrel.store';

@Component({
  selector: 'bk-workrel-edit-modal',
  standalone: true,
  imports: [
    CommentsAccordion, Header,
    ChangeConfirmation, WorkrelForm,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  providers: [WorkrelStore],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(currentUser(); as currentUser) {
        @if(formData(); as formData) {
          <bk-workrel-form
            [i18n]="store.i18n"
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser"
            [showForm]="showForm()"
            [allTags]="tags()"
            [types]="types()"
            [states]="states()" 
            [tenantId]="tenantId()"
            [readOnly]="isReadOnly()"
            [periodicities]="periodicities()" 
            (selectPerson)="selectPerson()"
            (selectOrg)="selectOrg()"
            (dirty)="formDirty.set($event)"
            (valid)="formValid.set($event)"
          />
        }
      }

      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="comments">
              <bk-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `
})
export class WorkrelEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(WorkrelStore);

  // inputs
  public workrel = input.required<WorkrelModel>();
  public currentUser = input.required<UserModel>();
  public tags = input.required<string>();
  public tenantId = input.required<string>();
  public types = input.required<CategoryListModel>();
  public states = input.required<CategoryListModel>();
  public periodicities = input.required<CategoryListModel>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected formData = linkedSignal(() => safeStructuredClone(this.workrel()));
  protected showForm = signal(true);

  // derived signals
  protected readonly headerTitle = computed(() => this.store.getTitleLabel(this.isReadOnly(), this.workrel().bkey));
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ok: this.store.i18n.ok(), cancel: this.store.i18n.cancel(), confirmation: this.store.i18n.save()} as ChangeConfirmationI18n));
  protected readonly parentKey = computed(() => `${WorkrelModelName}.${this.workrel().bkey}`);

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.workrel()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: WorkrelModel): void {
    this.formData.set(formData);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async selectPerson(): Promise<void> {
    const person = await this.store.selectPerson();
    if (!person) return;
    this.formData.update((vm: WorkrelModel | undefined) => {
      if (!vm) return vm;
      return { 
        ...vm, 
        subjectKey: person.bkey, 
        subjectName1: person.firstName,
        subjectName2: person.lastName,
        subjectType: person.gender
      };
    });
    this.formDirty.set(true);
  }

  protected async selectOrg(): Promise<void> {
    const org = await this.store.selectOrg();
    if (!org) return;
    this.formData.update((vm) => {
      if (!vm) return vm;
      return {
        ...vm,
        bkey: vm.bkey ?? '', // Ensure bkey is always a string
        objectKey: org.bkey,
        objectName: org.name,
        objectType: org.type,
      };
    });
    this.formDirty.set(true);
  }
}

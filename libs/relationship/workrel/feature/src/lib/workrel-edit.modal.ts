import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, OrgModel, PersonModel, RoleName, UserModel, WorkrelModel, WorkrelModelName } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole, isOrg, isPerson } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { CommentsAccordionComponent } from '@bk2/comment-feature';

import { WorkrelFormComponent } from '@bk2/relationship-workrel-ui';
import { OrgSelectModalComponent, PersonSelectModalComponent } from '@bk2/shared-feature';
import { ENV } from '@bk2/shared-config';

@Component({
  selector: 'bk-workrel-edit-modal',
  standalone: true,
  imports: [
    CommentsAccordionComponent, HeaderComponent,
    ChangeConfirmationComponent, WorkrelFormComponent,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(currentUser(); as currentUser) {
        <bk-workrel-form
          [formData]="formData()"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser"
          [showForm]="showForm()"
          [allTags]="tags()"
          [types]="types()"
          [states]="states()" 
          [readOnly]="isReadOnly()"
          [periodicities]="periodicities()" 
          (selectPerson)="selectPerson()"
          (selectOrg)="selectOrg()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
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
export class WorkrelEditModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly env = inject(ENV);

  // inputs
  public workrel = input.required<WorkrelModel>();
  public currentUser = input.required<UserModel>();
  public tags = input.required<string>();
  public types = input.required<CategoryListModel>();
  public states = input.required<CategoryListModel>();
  public periodicities = input.required<CategoryListModel>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => structuredClone(this.workrel()));
  protected showForm = signal(true);

  // derived signals
  protected readonly headerTitle = computed(() => getTitleLabel('workrel', this.workrel().bkey, this.isReadOnly()));
  protected readonly parentKey = computed(() => `${WorkrelModelName}.${this.workrel().bkey}`);

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(structuredClone(this.workrel()));  // reset the form
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
    const person = await this.selectPersonModal();
    if (!person) return;
    this.formData.update((vm) => ({
      ...vm, 
      subjectKey: person.bkey, 
      subjectName1: person.firstName,
      subjectName2: person.lastName,
      subjectType: person.gender,
    }));
  }

  async selectPersonModal(): Promise<PersonModel | undefined> {
    const modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) {
      if (isPerson(data, this.env.tenantId)) {
        return data;
      }
    }
    return undefined;
  }

  protected async selectOrg(): Promise<void> {
    const org = await this.selectOrgModal();
    if (!org) return;
    this.formData.update((vm) => ({
      ...vm, 
      objectKey: org.bkey, 
      objectName: org.name,
      objectType: org.type,
    }));
  }

  async selectOrgModal(): Promise<OrgModel | undefined> {
    const modal = await this.modalController.create({
      component: OrgSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      if (isOrg(data, this.env.tenantId)) {
        return data;
      }
    }
    return undefined;
  }
}

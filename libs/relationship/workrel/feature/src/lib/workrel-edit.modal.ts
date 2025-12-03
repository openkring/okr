import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName, UserModel, WorkrelModel, WorkrelModelName } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { CommentsAccordionComponent } from '@bk2/comment-feature';

import { WorkrelFormComponent } from '@bk2/relationship-workrel-ui';
import { convertFormToWorkrel, convertWorkrelToForm, WorkrelFormModel } from '@bk2/relationship-workrel-util';

import { WorkrelModalsService } from './workrel-modals.service';

@Component({
  selector: 'bk-workrel-edit-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    CommentsAccordionComponent, HeaderComponent,
    ChangeConfirmationComponent, WorkrelFormComponent,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header title="{{ headerTitle() | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-workrel-form
        [formData]="formData()" 
        [currentUser]="currentUser()"
        [allTags]="tags()"
        [types]="types()"
        [states]="states()" 
        [readOnly]="isReadOnly()"
        [periodicities]="periodicities()" 
        (selectPerson)="selectPerson()"
        (selectOrg)="selectOrg()"
        (formDataChange)="onFormDataChange($event)"
      />

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
  private readonly workrelModalsService = inject(WorkrelModalsService);
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public workrel = input.required<WorkrelModel>();
  public currentUser = input<UserModel | undefined>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => convertWorkrelToForm(this.workrel()));

  // derived signals
  protected readonly headerTitle = computed(() => getTitleLabel('workrel', this.workrel().bkey, this.isReadOnly()));
  protected readonly parentKey = computed(() => `${WorkrelModelName}.${this.workrel().bkey}`);
  protected tags = computed(() => this.appStore.getTags('workrel'));
  protected types = computed(() => this.appStore.getCategory('workrel_type'));
  protected states = computed(() => this.appStore.getCategory('workrel_state'));
  protected periodicities = computed(() => this.appStore.getCategory('periodicity'));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(convertFormToWorkrel(this.formData(), this.workrel()), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertWorkrelToForm(this.workrel()));  // reset the form
  }

  protected onFormDataChange(formData: WorkrelFormModel): void {
    this.formData.set(formData);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async selectPerson(): Promise<void> {
    const person = await this.workrelModalsService.selectPerson();
    if (!person) return;
    this.formData.update((vm) => ({
      ...vm, 
      subjectKey: person.bkey, 
      subjectName1: person.firstName,
      subjectName2: person.lastName,
      subjectType: person.gender,
    }));
  }

  protected async selectOrg(): Promise<void> {
    const org = await this.workrelModalsService.selectOrg();
    if (!org) return;
    this.formData.update((vm) => ({
      ...vm, 
      objectKey: org.bkey, 
      objectName: org.name,
      objectType: org.type,
    }));
  }
}

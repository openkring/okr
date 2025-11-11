import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName, UserModel, WorkrelCollection, WorkrelModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { getFullPersonName, hasRole } from '@bk2/shared-util-core';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { WorkrelFormComponent } from '@bk2/relationship-workrel-ui';
import { convertFormToWorkrel, convertWorkrelToForm } from '@bk2/relationship-workrel-util';
import { WorkrelModalsService } from './workrel-modals.service';

@Component({
  selector: 'bk-workrel-edit-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    CommentsAccordionComponent, HeaderComponent,
    ChangeConfirmationComponent, WorkrelFormComponent,
    IonContent, IonAccordionGroup
  ],
  template: `
    <bk-header title="{{ modalTitle() | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-workrel-form [(vm)]="vm" 
        [currentUser]="currentUser()"
        [allTags]="tags()"
        [types]="types()"
        [states]="states()" 
        [periodicities]="periodicities()" 
        (selectPerson)="selectPerson()"
        (selectOrg)="selectOrg()"
        (validChange)="formIsValid.set($event)"
      />

      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <ion-accordion-group value="comments">
          <bk-comments-accordion [collectionName]="workrelCollection" [parentKey]="workrelKey()" />
        </ion-accordion-group>
      }
    </ion-content>
  `
})
export class WorkrelEditModalComponent {
  private readonly workrelModalsService = inject(WorkrelModalsService);
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  public workrel = input.required<WorkrelModel>();
  public currentUser = input<UserModel | undefined>();

  public vm = linkedSignal(() => convertWorkrelToForm(this.workrel()));
  protected tags = computed(() => this.appStore.getTags('workrel'));
  protected types = computed(() => this.appStore.getCategory('workrel_type'));
  protected states = computed(() => this.appStore.getCategory('workrel_state'));
  protected periodicities = computed(() => this.appStore.getCategory('periodicity'));

  protected readonly workrelKey = computed(() => this.workrel().bkey ?? '');
  protected readonly subjectUrl = computed(() => `/person/${this.vm().subjectKey}`);
  protected readonly subjectName = computed(() => getFullPersonName(this.vm().subjectName1 ?? '', this.vm().subjectName2 ?? ''));
  protected readonly objectName = computed(() => this.vm().objectName ?? '');
  protected readonly objectUrl = computed(() => `/org/${this.vm().objectKey}`);

  protected readonly modalTitle = computed(() => `@workrel.operation.${hasRole('memberAdmin', this.currentUser()) ? 'update' : 'view'}.label`);

  protected formIsValid = signal(false);
  public workrelCollection = WorkrelCollection;

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToWorkrel(this.workrel(), this.vm(), this.appStore.env.tenantId), 'confirm');
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async selectPerson(): Promise<void> {
    const person = await this.workrelModalsService.selectPerson();
    if (!person) return;
    this.vm.update((_vm) => ({
      ..._vm, 
      subjectKey: person.bkey, 
      subjectName1: person.firstName,
      subjectName2: person.lastName,
      subjectType: person.gender,
    }));
  }

  protected async selectOrg(): Promise<void> {
    const org = await this.workrelModalsService.selectOrg();
    if (!org) return;
    this.vm.update((_vm) => ({
      ..._vm, 
      objectKey: org.bkey, 
      objectName: org.name,
      objectType: org.type,
    }));
  }
}

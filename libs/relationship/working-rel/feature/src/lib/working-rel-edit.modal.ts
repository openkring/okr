import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { ENV, RoleName } from '@bk2/shared/config';
import { getFullPersonName, hasRole } from '@bk2/shared/util';

import { CommentsAccordionComponent } from '@bk2/comment/feature';
import { AppStore } from '@bk2/auth/feature';
import { ModelType, UserModel, WorkingRelCollection, WorkingRelModel } from '@bk2/shared/models';
import { convertFormToWorkingRel, convertWorkingRelToForm } from '@bk2/working-rel/util';
import { WorkingRelFormComponent } from '@bk2/working-rel/ui';

@Component({
  selector: 'bk-working-rel-edit-modal',
  imports: [
    TranslatePipe, AsyncPipe,
    CommentsAccordionComponent, HeaderComponent,
    ChangeConfirmationComponent, WorkingRelFormComponent,
    IonContent, IonAccordionGroup
  ],
  template: `
    <bk-header title="{{ modalTitle() | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-working-rel-form [(vm)]="vm" [currentUser]="currentUser()" [workingRelTags]="workingRelTags()" (validChange)="formIsValid.set($event)" />

      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <ion-accordion-group value="comments">
          <bk-comments-accordion [collectionName]="workingRelCollection" [parentKey]="workingRelKey()" />
        </ion-accordion-group>
      }
    </ion-content>
  `
})
export class WorkingRelEditModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly env = inject(ENV);
  private readonly appStore = inject(AppStore);

  public workingRel = input.required<WorkingRelModel>();
  public currentUser = input<UserModel | undefined>();

  public vm = linkedSignal(() => convertWorkingRelToForm(this.workingRel()));
  protected workingRelTags = computed(() => this.appStore.getTags(ModelType.WorkingRel));

  protected readonly workingRelKey = computed(() => this.workingRel().bkey ?? '');
  protected readonly subjectUrl = computed(() => `/person/${this.vm().subjectKey}`);
  protected readonly subjectName = computed(() => getFullPersonName(this.vm().subjectName1 ?? '', this.vm().subjectName2 ?? ''));
  protected readonly objectName = computed(() => this.vm().objectName ?? '');
  protected readonly objectUrl = computed(() => `/org/${this.vm().objectKey}`);

  protected readonly modalTitle = computed(() => `@workingRel.operation.${hasRole('memberAdmin', this.currentUser()) ? 'update' : 'view'}.label`);

  protected formIsValid = signal(false);
  public workingRelCollection = WorkingRelCollection;

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToWorkingRel(this.workingRel(), this.vm(), this.env.owner.tenantId), 'confirm');
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}

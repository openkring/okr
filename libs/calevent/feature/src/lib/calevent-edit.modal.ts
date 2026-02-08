import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController, IonCardContent, IonCard, IonAccordionGroup } from '@ionic/angular/standalone';

import { CalEventModel, CalEventModelName, CategoryListModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { CalEventFormComponent } from '@bk2/calevent-ui';
import { InviteesAccordionComponent } from '@bk2/relationship-invitation-feature';
import { DocumentsAccordionComponent } from '@bk2/document-feature';
import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { AttendeesAccordionComponent } from './attendees-accordion';

@Component({
  selector: 'bk-calevent-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    CalEventFormComponent, InviteesAccordionComponent, DocumentsAccordionComponent, 
    CommentsAccordionComponent, AttendeesAccordionComponent,
    IonContent, IonCard, IonCardContent, IonAccordionGroup
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-calevent-form
          [formData]="formData" 
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [showForm]="showForm()"
          [types]="types()"
          [periodicities]="periodicities()"
          [allTags]="tags()" 
          [tenantId]="tenantId()"
          [locale]="locale()"
          [readOnly]="isReadOnly()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }

      @if(!isNew()) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="invitees">
              @if(calevent().isOpen) {
                <bk-attendees-accordion [calevent]="formData()" [readOnly]="isReadOnly()" />
              } 
              @else {
                <bk-invitees-accordion [calevent]="formData()" [readOnly]="isReadOnly()" />
              }
              <bk-documents-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
              <bk-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
    
  `
})
export class CalEventEditModalComponent {
  private modalController = inject(ModalController);

  // inputs
  public calevent = input.required<CalEventModel>();
  public currentUser = input.required<UserModel>();
  public types = input.required<CategoryListModel>();
  public periodicities = input.required<CategoryListModel>();
  public tags = input.required<string>();
  public tenantId = input.required<string>();
  public locale = input.required<string>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => structuredClone(this.calevent()));
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => getTitleLabel('calevent', this.calevent().bkey, this.isReadOnly()));
  protected readonly parentKey = computed(() => `${CalEventModelName}.${this.calevent().bkey}`);
  protected isNew = computed(() => !this.formData().bkey);

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(structuredClone(this.calevent()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: CalEventModel): void {
    this.formData.set(formData);
  }
}

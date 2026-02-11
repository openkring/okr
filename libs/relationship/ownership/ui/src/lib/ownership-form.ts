import { Component, computed, input, linkedSignal, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { OwnershipModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';

import { ownershipValidations } from '@bk2/relationship-ownership-util';

@Component({
  selector: 'bk-ownership-form',
  standalone: true,
  imports: [
    vestForms,
    ChipsComponent, NotesInputComponent, DateInputComponent, TextInputComponent, NumberInputComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
    <form scVestForm 
      [formValue]="formData()"
      (formValueChange)="onFormChange($event)"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (validChange)="valid.emit($event)"
    >
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              @if(hasRole('admin')) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="bkey" [value]="bkey()" label="bkey" [readOnly]="true" [copyable]="true" />
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <!---------------------------------------------------
                OWNER: PERSON or ORGANISATION 
                --------------------------------------------------->
                @if(ownerModelType() === 'person') {
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="ownerName1" [value]="ownerName1()" [readOnly]="true" />                                        
                  </ion-col>
            
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="ownerName2" [value]="ownerName2()" [readOnly]="true" />                                        
                  </ion-col>
                } @else {
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="ownerName2" [value]="ownerName2()" [readOnly]="true" />                                        
                  </ion-col>
                }
              </ion-row>

              <!---------------------------------------------------
              OWNERSHIP
              --------------------------------------------------->
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-date-input name="validFrom" [storeDate]="validFrom()" (storeDateChange)="onFieldChange('validFrom', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
                </ion-col>
          
                <ion-col size="12" size-md="6">
                  <bk-date-input name="validTo" [storeDate]="validTo()" (storeDateChange)="onFieldChange('validTo', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
                </ion-col>

                <ion-col size="12" size-md="6">
                  <bk-number-input name="price" [value]="price()" (valueChange)="onFieldChange('price', $event)" [maxLength]=10 [readOnly]="isReadOnly()" />                                        
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
        <!---------------------------------------------------
        TAG, NOTES 
        --------------------------------------------------->
        @if(hasRole('privileged') || hasRole('resourceAdmin')) {
          <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
        }
    
        @if(hasRole('admin')) {
          <bk-notes name="notes" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `
})
export class OwnershipFormComponent {
  // inputs
  public readonly formData = model.required<OwnershipModel>();
  public readonly currentUser = input<UserModel>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = ownershipValidations;
  private readonly validationResult = computed(() => ownershipValidations(this.formData(), this.tenantId(), this.allTags()));
  protected readonly errors = signal<Record<string, string>>({ });
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected ownerName1 = linkedSignal(() => this.formData().ownerName1 ?? ''); 
  protected ownerName2 = linkedSignal(() => this.formData().ownerName2 ?? ''); 
  protected ownerModelType = linkedSignal(() => this.formData().ownerModelType ?? 'person');
  protected validFrom = linkedSignal(() => this.formData().validFrom ?? '');
  protected validTo = linkedSignal(() => this.formData().validTo ?? '');
  protected price = linkedSignal(() => this.formData().price ?? 0);
  protected tags = linkedSignal(() => this.formData().tags ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? '');
  protected bkey = computed(() => this.formData().bkey ?? '');

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: OwnershipModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('OwnershipForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('OwnershipForm.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

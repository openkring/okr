import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { OWNERSHIP_FORM_SHAPE, OwnershipFormModel, ownershipFormValidations } from '@bk2/relationship-ownership-util';
import { RoleName, UserModel } from '@bk2/shared-models';
import { ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, hasRole } from '@bk2/shared-util-core';

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
  <form scVestForm 
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
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
                <bk-date-input name="validFrom" [storeDate]="validFrom()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('validFrom', $event)" />
              </ion-col>
        
              <ion-col size="12" size-md="6">
                <bk-date-input name="validTo" [storeDate]="validTo()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('validTo', $event)" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-number-input name="price" [value]="price()" [maxLength]=10 [readOnly]="isReadOnly()" (changed)="onFieldChange('price', $event)" />                                        
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <!---------------------------------------------------
      TAG, NOTES 
      --------------------------------------------------->
      @if(hasRole('privileged')) {
        <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />
      }
  
      @if(hasRole('admin')) {
        <bk-notes [value]="notes()" [readOnly]="isReadOnly()" (changed)="onFieldChange('notes', $event)" />
      }
    </form>
  `
})
export class OwnershipFormComponent {
  // inputs
  public formData = model.required<OwnershipFormModel>();
  public currentUser = input<UserModel | undefined>();
  public allTags = input.required<string>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = ownershipFormValidations;
  protected readonly shape = OWNERSHIP_FORM_SHAPE;
  private readonly validationResult = computed(() => ownershipFormValidations(this.formData()));
  protected readonly errors = signal<Record<string, string>>({ });
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected ownerName1 = computed(() => this.formData().ownerName1 ?? ''); 
  protected ownerName2 = computed(() => this.formData().ownerName2 ?? ''); 
  protected ownerModelType = computed(() => this.formData().ownerModelType ?? 'person');
  protected validFrom = computed(() => this.formData().validFrom ?? '');
  protected validTo = computed(() => this.formData().validTo ?? '');
  protected price = computed(() => this.formData().price ?? 0);
  protected tags = computed(() => this.formData().tags ?? '');
  protected notes = computed(() => this.formData().notes ?? '');

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: OwnershipFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('OwnershipForm.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }
  
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('OwnershipForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

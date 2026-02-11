import { Component, computed, effect, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask, ChVatMask } from '@bk2/shared-config';
import { CategoryListModel, OrgModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { orgValidations } from '@bk2/subject-org-util';

@Component({
  selector: 'bk-org-form',
  standalone: true,
  imports: [
    vestForms,
    CategorySelectComponent, DateInputComponent, TextInputComponent, ChipsComponent, NotesInputComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
   styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
    <form scVestForm
      [formValue]="formData()"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (validChange)="valid.emit($event)"
      (formValueChange)="onFormChange($event)">

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
            @if(isOrgTypeVisible()) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [readOnly]="isOrgTypeReadOnly()" />
                </ion-col>
              </ion-row>
            }
            <ion-row> 
              <ion-col size="12">
                <bk-text-input name="name" [value]="name()" (valueChange)="onFieldChange('name', $event)" autocomplete="organization" [maxLength]=50 [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-date-input name="dateOfFoundation" [storeDate]="dateOfFoundation()" (storeDateChange)="onFieldChange('dateOfFoundation', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
      
              <ion-col size="12" size-md="6">
                <bk-date-input name="dateOfLiquidation" [storeDate]="dateOfLiquidation()" (storeDateChange)="onFieldChange('dateOfLiquidation', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input name="taxId" [value]="taxId()" (valueChange)="onFieldChange('taxId', $event)" [mask]="vatMask" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
              @if(hasRole('admin')) { 
                <ion-col size="12" size-md="6">
                  <bk-text-input name="bexioId" [value]="bexioId()" (valueChange)="onFieldChange('bexioId', $event)" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="isReadOnly()" />                                        
                </ion-col>
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }

      @if(hasRole('admin')) { 
        <bk-notes name="notes" [readOnly]="isReadOnly()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" />
      }
    </form>
  }
  `
})
export class OrgFormComponent {
  // inputs
  public readonly formData = model.required<OrgModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly types = input.required<CategoryListModel>();
  public isOrgTypeReadOnly = input(false);
  public isOrgTypeVisible = input(true);
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = orgValidations;
  private readonly validationResult = computed(() => orgValidations(this.formData(), this.tenantId(), this.allTags()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected type = linkedSignal(() => this.formData().type ?? 'association');
  protected name = linkedSignal(() => this.formData().name ?? '');
  protected dateOfFoundation = linkedSignal(() => this.formData().dateOfFoundation ?? '');
  protected dateOfLiquidation = linkedSignal(() => this.formData().dateOfLiquidation ?? '');
  protected taxId = linkedSignal(() => this.formData().taxId ?? '');
  protected bexioId = linkedSignal(() => this.formData().bexioId ?? '');
  protected tags = linkedSignal(() => this.formData().tags ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? '');
  protected bkey = computed(() => this.formData().bkey ?? '');

  // passing constants to template
  protected bexioMask = BexioIdMask;
  protected vatMask = ChVatMask;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: OrgModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('OrgForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('OrgForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

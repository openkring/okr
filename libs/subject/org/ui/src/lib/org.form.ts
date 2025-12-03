import { Component, computed, effect, input, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask, ChVatMask } from '@bk2/shared-config';
import { CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, hasRole } from '@bk2/shared-util-core';
import { ORG_FORM_SHAPE, OrgFormModel, orgFormValidations } from '@bk2/subject-org-util';

@Component({
  selector: 'bk-org-form',
  standalone: true,
  imports: [
    vestForms,
    CategorySelectComponent, DateInputComponent, TextInputComponent, ChipsComponent, NotesInputComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
   styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
  `],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">

    <ion-card>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="types()!" selectedItemName="type()" [readOnly]="isReadOnly()"  (changed)="onFieldChange('type', $event)" />
            </ion-col>
          </ion-row>
          <ion-row> 
            <ion-col size="12">
              <bk-text-input name="name" [value]="name()" autocomplete="organization" [maxLength]=50 [readOnly]="isReadOnly()" (changed)="onFieldChange('name', $event)" />
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-date-input name="dateOfFoundation" [storeDate]="dateOfFoundation()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('dateOfFoundation', $event)" />
            </ion-col>
    
            <ion-col size="12" size-md="6">
              <bk-date-input name="dateOfLiquidation" [storeDate]="dateOfLiquidation()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('dateOfLiquidation', $event)" />
            </ion-col>
          </ion-row>      
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-text-input name="taxId" [value]="taxId()" [mask]="vatMask" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('taxId', $event)" />
            </ion-col>
            @if(hasRole('admin')) { 
              <ion-col size="12" size-md="6">
                <bk-text-input name="bexioId" [value]="bexioId()" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('bexioId', $event)" />                                        
              </ion-col>
            }
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />

    @if(hasRole('admin')) { 
      <bk-notes name="notes" [readOnly]="isReadOnly()" [value]="notes()" />
    }
  </form>
  `
})
export class OrgFormComponent {
  // inputs
  public formData = model.required<OrgFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly allTags = input.required<string>();
  public readonly types = input.required<CategoryListModel>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = orgFormValidations;
  protected readonly shape = ORG_FORM_SHAPE;
  private readonly validationResult = computed(() => orgFormValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected type = computed(() => this.formData().type ?? 'association');
  protected name = computed(() => this.formData().name ?? '');
  protected dateOfFoundation = computed(() => this.formData().dateOfFoundation ?? '');
  protected dateOfLiquidation = computed(() => this.formData().dateOfLiquidation ?? '');
  protected taxId = computed(() => this.formData().taxId ?? '');
  protected bexioId = computed(() => this.formData().bexioId ?? '');
  protected tags = computed(() => this.formData().tags ?? '');
  protected notes = computed(() => this.formData().notes ?? '');

  // passing constants to template
  protected bexioMask = BexioIdMask;
  protected vatMask = ChVatMask;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: OrgFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('OrgForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('OrgForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

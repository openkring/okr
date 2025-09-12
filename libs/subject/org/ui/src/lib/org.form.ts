import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { OrgTypes } from '@bk2/shared-categories';
import { BexioIdMask, ChVatMask } from '@bk2/shared-config';
import { OrgType, RoleName, UserModel } from '@bk2/shared-models';
import { CategoryComponent, ChipsComponent, DateInputComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, hasRole } from '@bk2/shared-util-core';
import { OrgFormModel, orgFormModelShape, orgFormValidations } from '@bk2/subject-org-util';

@Component({
  selector: 'bk-org-form',
  standalone: true,
  imports: [
    vestForms,
    CategoryComponent, DateInputComponent, TextInputComponent, ChipsComponent, NotesInputComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">

    <ion-card>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat name="orgType" [value]="orgType()" [categories]="orgTypes" [readOnly]="true" (changed)="onChange('orgType', $event)" />
            </ion-col>
          </ion-row>
          <ion-row> 
            <ion-col size="12">
              <bk-text-input name="orgName" [value]="orgName()" autocomplete="organization" [maxLength]=50 [readOnly]="readOnly()" (changed)="onChange('orgName', $event)" />
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-date-input name="dateOfFoundation" [storeDate]="dateOfFoundation()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('dateOfFoundation', $event)" />
            </ion-col>
    
            <ion-col size="12" size-md="6">
              <bk-date-input name="dateOfLiquidation" [storeDate]="dateOfLiquidation()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('dateOfLiquidation', $event)" />
            </ion-col>
          </ion-row>      
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-text-input name="taxId" [value]="taxId()" [mask]="vatMask" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('taxId', $event)" />
            </ion-col>
            @if(hasRole('admin')) { 
              <ion-col size="12" size-md="6">
                <bk-text-input name="bexioId" [value]="bexioId()" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('bexioId', $event)" />                                        
              </ion-col>
            }
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="orgTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />

    @if(hasRole('admin')) { 
      <bk-notes name="notes" [value]="notes()" />
    }
  </form>
  `
})
export class OrgFormComponent {
  public vm = model.required<OrgFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly orgTags = input.required<string>();

  // protected orgName = computed(() => getOrgNameByOrgType(this.vm().type)); tbd: typed orgName collides with validations
  public readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));  

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = orgFormValidations;
  protected readonly shape = orgFormModelShape;

  protected orgType = computed(() => this.vm().type ?? OrgType.Association);
  protected orgName = computed(() => this.vm().orgName ?? '');
  protected dateOfFoundation = computed(() => this.vm().dateOfFoundation ?? '');
  protected dateOfLiquidation = computed(() => this.vm().dateOfLiquidation ?? '');
  protected taxId = computed(() => this.vm().taxId ?? '');
  protected bexioId = computed(() => this.vm().bexioId ?? '');
  protected tags = computed(() => this.vm().tags ?? '');
  protected notes = computed(() => this.vm().notes ?? '');

  private readonly validationResult = computed(() => orgFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('orgName'));

  public orgTypeEnum = OrgType;
  public orgTypes = OrgTypes;
  protected bexioMask = BexioIdMask;
  protected vatMask = ChVatMask;

  protected onValueChange(value: OrgFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('OrgForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

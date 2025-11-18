import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { OwnershipFormModel, ownershipFormModelShape, ownershipFormValidations } from '@bk2/relationship-ownership-util';
import { RoleName, UserModel } from '@bk2/shared-models';
import { ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-ownership-form',
  standalone: true,
  imports: [
    vestForms,
    ChipsComponent, NotesInputComponent, DateInputComponent, TextInputComponent, NumberInputComponent,
    IonGrid, IonRow, IonCol
  ],
  template: `
  <form scVestForm 
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">
  
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
            <bk-date-input name="validFrom" [storeDate]="validFrom()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('validFrom', $event)" />
          </ion-col>
    
          <ion-col size="12" size-md="6">
            <bk-date-input name="validTo" [storeDate]="validTo()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('validTo', $event)" />
          </ion-col>

          <ion-col size="12" size-md="6">
            <bk-number-input name="price" [value]="price()" [maxLength]=10 [readOnly]="readOnly()" (changed)="onChange('price', $event)" />                                        
          </ion-col>
        </ion-row>

      <!---------------------------------------------------
        TAG, NOTES 
        --------------------------------------------------->
        @if(hasRole('privileged')) {
          <ion-row>
            <ion-col>
              <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="ownershipTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />
            </ion-col>
          </ion-row>
        }
    
        @if(hasRole('admin')) {
          <ion-row>
            <ion-col>                                           
            <bk-notes [value]="notes()" [readOnly]="readOnly()" (changed)="onChange('notes', $event)" />
            </ion-col>
          </ion-row>
        }
      </ion-grid>
    </form>
  `
})
export class OwnershipFormComponent {
  public vm = model.required<OwnershipFormModel>();
  public currentUser = input<UserModel | undefined>();
  public ownershipTags = input.required<string>();
  public readOnly = input(true);

  protected ownerName1 = computed(() => this.vm().ownerName1 ?? ''); 
  protected ownerName2 = computed(() => this.vm().ownerName2 ?? ''); 
  protected ownerModelType = computed(() => this.vm().ownerModelType ?? 'person');
  protected validFrom = computed(() => this.vm().validFrom ?? '');
  protected validTo = computed(() => this.vm().validTo ?? '');
  protected price = computed(() => this.vm().price ?? 0);
  protected tags = computed(() => this.vm().tags ?? '');
  protected notes = computed(() => this.vm().notes ?? '');

  protected readonly suite = ownershipFormValidations;
  protected readonly formValue = signal<OwnershipFormModel>({});
  protected readonly shape = ownershipFormModelShape;
  protected readonly errors = signal<Record<string, string>>({ });

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  private readonly validationResult = computed(() => ownershipFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  protected onValueChange(value: OwnershipFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }
  
  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

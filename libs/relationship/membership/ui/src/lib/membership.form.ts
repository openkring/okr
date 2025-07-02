import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';
import { ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared/ui';
import { MembershipFormModel, membershipFormModelShape, membershipFormValidations } from '@bk2/membership/util';
import { CategoryListModel, GenderType, ModelType, OrgType, Periodicity, UserModel, RoleName } from '@bk2/shared/models';
import { BexioIdMask } from '@bk2/shared/config';
import { END_FUTURE_DATE_STR } from '@bk2/shared/constants';
import { debugFormErrors, getItemLabel, hasRole } from '@bk2/shared/util-core';
import { OrgTypes } from '@bk2/shared/categories';
import { TranslatePipe } from '@bk2/shared/i18n';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'bk-membership-form',
  imports: [
    vestForms,
    TranslatePipe, AsyncPipe,
    TextInputComponent, DateInputComponent,
    NumberInputComponent, ChipsComponent, NotesInputComponent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonNote
  ],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">
  
      <ion-grid>
        <!---------------------------------------------------
        MEMBERSHIP
        --------------------------------------------------->
        <ion-row>
          <ion-col size="12" size-md="6">
            <bk-date-input name="dateOfEntry" [storeDate]="dateOfEntry()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('dateOfEntry', $event)" />
          </ion-col>
    
          @if(dateOfExit() && dateOfExit().length > 0 && dateOfExit() !== endFutureDate) {
            <ion-col size="12" size-md="6">
              <bk-date-input name="dateOfExit" [storeDate]="dateOfExit()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('dateOfExit', $event)" />
            </ion-col>
          }
        </ion-row>
        <ion-row>
          <ion-col size="12" size-md="6">
            <ion-item lines="none">
              <ion-label>{{ '@membership.category.label' | translate | async }}:</ion-label>
              <ion-label>{{ membershipCategory() | translate | async }}</ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-note>{{ '@membership.category.helper' | translate | async }}</ion-note>
            </ion-item>
          </ion-col>
          <ion-col size="12" size-md="6">
            <ion-item lines="none">
              <ion-label>{{ '@input.memberState.label' | translate | async }}:</ion-label>
              <ion-label>{{ membershipState() }}</ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-note>{{ '@membership.state.helper' | translate | async }}</ion-note>
            </ion-item>
          </ion-col>
          
          <ion-col size="12" size-md="6">
            <bk-number-input name="price" [value]="price()" [maxLength]=6 [readOnly]="readOnly()" (changed)="onChange('price', $event)" />                                        
          </ion-col>
        </ion-row>

      <!---------------------------------------------------
        PROPERTIES 
        --------------------------------------------------->
        <ion-row>
          <ion-col size="12" size-md="6">
            <bk-text-input name="memberBexioId" [value]="memberBexioId()" [maxLength]=6 [mask]="bexioMask" [readOnly]="readOnly()" (changed)="onChange('memberBexioId', $event)" />                                        
          </ion-col>

          <ion-col size="12" size-md="6"> 
            <bk-text-input name="memberAbbreviation" [value]="memberAbbreviation()" [maxLength]=20 [readOnly]="readOnly()" (changed)="onChange('memberAbbreviation', $event)" />                                        
          </ion-col>

          <ion-col size="12" size-md="6"> 
            <bk-text-input name="orgFunction" [value]="orgFunction()" [maxLength]=30 [readOnly]="readOnly()" (changed)="onChange('orgFunction', $event)" />                                        
          </ion-col>

          <ion-col size="12" size-md="6">
            <bk-text-input name="memberNickName" [value]="memberNickName()" [maxLength]=20 [readOnly]="readOnly()" (changed)="onChange('memberNickName', $event)" />                                        
          </ion-col>
        </ion-row>

      <!---------------------------------------------------
        TAG, NOTES 
        --------------------------------------------------->
        @if(hasRole('privileged')) {
          <ion-row>
            <ion-col>
              <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="membershipTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />
            </ion-col>
          </ion-row>
        }
    
        @if(hasRole('admin')) {
          <ion-row> 
            <ion-col>                                           
              <bk-notes [value]="notes()" (changed)="onChange('notes', $event)" />
            </ion-col>
          </ion-row>
        }
      </ion-grid>
    </form>
  `
})
export class MembershipFormComponent {
  public vm = model.required<MembershipFormModel>();
  public currentUser = input<UserModel | undefined>();
  public membershipCategories = input.required<CategoryListModel>();
  public membershipTags = input.required<string>();

  public readOnly = computed(() => !hasRole('memberAdmin', this.currentUser())); 
  protected memberName1 = computed(() => this.vm().memberName1 ?? ''); 
  protected memberName2 = computed(() => this.vm().memberName2 ?? ''); 
  protected memberModelType = computed(() => this.vm().memberModelType ?? ModelType.Person);
  protected memberGender = computed(() => this.vm().memberType as GenderType ?? GenderType.Male);
  protected memberOrgType = computed(() => this.vm().memberType as OrgType ?? OrgType.Association);
  protected memberNickName = computed(() => this.vm().memberNickName ?? '');
  protected memberAbbreviation = computed(() => this.vm().memberAbbreviation ?? '');
  protected memberDateOfBirth = computed(() => this.vm().memberDateOfBirth ?? '');
  protected memberZipCode = computed(() => this.vm().memberZipCode ?? '');
  protected memberBexioId = computed(() => this.vm().memberBexioId ?? '');
  protected orgKey = computed(() => this.vm().orgKey ?? '');
  protected memberId = computed(() => this.vm().memberId ?? '');
  protected dateOfEntry = computed(() => this.vm().dateOfEntry ?? '');
  protected dateOfExit = computed(() => this.vm().dateOfExit ?? '');
  protected membershipCategory = computed(() => getItemLabel(this.membershipCategories(), this.vm().membershipCategory));
  protected orgFunction = computed(() => this.vm().orgFunction ?? '');
  protected priority = computed(() => this.vm().priority ?? 0);
  protected relLog = computed(() => this.vm().relLog ?? '');
  protected relIsLast = computed(() => this.vm().relIsLast ?? true);
  protected price = computed(() => this.vm().price ?? 0);
  protected currency = computed(() => this.vm().currency ?? 'CHF');
  protected periodicity = computed(() => this.vm().periodicity ?? Periodicity.Yearly);
  protected tags = computed(() => this.vm().tags ?? '');
  protected notes = computed(() => this.vm().notes ?? '');
  protected membershipState = computed(() => this.vm().membershipCategory ?? 'active');
  protected i18nBase = computed(() => this.membershipCategories().i18nBase);
  protected name = computed(() => this.membershipCategories().name);
  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = membershipFormValidations;
  protected readonly shape = membershipFormModelShape;
  private readonly validationResult = computed(() => membershipFormValidations(this.vm()));
  
  protected modelType = ModelType;
  protected orgTypes = OrgTypes;
  protected bexioMask = BexioIdMask;
  protected endFutureDate = END_FUTURE_DATE_STR;

  protected onValueChange(value: MembershipFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('MembershipForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, input, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask } from '@bk2/shared-config';
import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_KEY, DEFAULT_MSTATE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORG_TYPE, DEFAULT_TAGS, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, PrivacySettings, RoleName, UserModel } from '@bk2/shared-models';
import { ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, getItemLabel, hasRole, isVisibleToUser } from '@bk2/shared-util-core';

import { MEMBERSHIP_FORM_SHAPE, MembershipFormModel, membershipFormValidations } from '@bk2/relationship-membership-util';

@Component({
  selector: 'bk-membership-form',
  standalone: true,
  imports: [
    vestForms,
    TranslatePipe, AsyncPipe,
    TextInputComponent, DateInputComponent,
    NumberInputComponent, ChipsComponent, NotesInputComponent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonNote, IonCard, IonCardContent
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
            <!---------------------------------------------------
            MEMBERSHIP
            --------------------------------------------------->
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-date-input name="dateOfEntry" [storeDate]="dateOfEntry()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('dateOfEntry', $event)" />
              </ion-col>
        
              @if(dateOfExit() && dateOfExit().length > 0 && dateOfExit() !== endFutureDate) {
                <ion-col size="12" size-md="6">
                  <bk-date-input name="dateOfExit" [storeDate]="dateOfExit()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('dateOfExit', $event)" />
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
                <bk-number-input name="price" [value]="price()" [maxLength]=6 [readOnly]="isReadOnly()" (changed)="onFieldChange('price', $event)" />                                        
              </ion-col>
            </ion-row>

          <!---------------------------------------------------
            PROPERTIES 
            --------------------------------------------------->
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input name="memberBexioId" [value]="memberBexioId()" [maxLength]=6 [mask]="bexioMask" [readOnly]="isReadOnly()" (changed)="onFieldChange('memberBexioId', $event)" />                                        
              </ion-col>

              <ion-col size="12" size-md="6"> 
                <bk-text-input name="memberAbbreviation" [value]="memberAbbreviation()" [maxLength]=20 [readOnly]="isReadOnly()" (changed)="onFieldChange('memberAbbreviation', $event)" />                                        
              </ion-col>

              <ion-col size="12" size-md="6"> 
                <bk-text-input name="orgFunction" [value]="orgFunction()" [maxLength]=30 [readOnly]="isReadOnly()" (changed)="onFieldChange('orgFunction', $event)" />                                        
              </ion-col>

              @if(hasRole('memberAdmin')) {
              <ion-col size="12" size-md="6">
                <bk-text-input name="memberNickName" [value]="memberNickName()" [maxLength]=20 [readOnly]="isReadOnly()" (changed)="onFieldChange('memberNickName', $event)" />                                        
              </ion-col>
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(isTagsVisible()) {
        <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />
      }
      
      @if(isNotesVisible()) {
        <bk-notes [value]="notes()" [readOnly]="isReadOnly()" (changed)="onFieldChange('notes', $event)" />
      }
    </form>
  `
})
export class MembershipFormComponent {
  // inputs
  public formData = model.required<MembershipFormModel>();
  public currentUser = input<UserModel | undefined>();
  public membershipCategories = input.required<CategoryListModel>();
  public allTags = input.required<string>();
  public priv = input.required<PrivacySettings>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = membershipFormValidations;
  protected readonly shape = MEMBERSHIP_FORM_SHAPE;
  private readonly validationResult = computed(() => membershipFormValidations(this.formData()));

  // fields
  protected memberName1 = computed(() => this.formData().memberName1 ?? DEFAULT_NAME); 
  protected memberName2 = computed(() => this.formData().memberName2 ?? DEFAULT_NAME); 
  protected memberModelType = computed(() => this.formData().memberModelType ?? 'person');
  protected memberGender = computed(() => this.formData().memberType ?? DEFAULT_GENDER);
  protected memberOrgType = computed(() => this.formData().memberType ?? DEFAULT_ORG_TYPE);
  protected memberNickName = computed(() => this.formData().memberNickName ?? DEFAULT_NAME);
  protected memberAbbreviation = computed(() => this.formData().memberAbbreviation ?? '');
  protected memberDateOfBirth = computed(() => this.formData().memberDateOfBirth ?? DEFAULT_DATE);
  protected memberZipCode = computed(() => this.formData().memberZipCode ?? '');
  protected memberBexioId = computed(() => this.formData().memberBexioId ?? '');
  protected orgKey = computed(() => this.formData().orgKey ?? DEFAULT_KEY);
  protected memberId = computed(() => this.formData().memberId ?? DEFAULT_ID);
  protected dateOfEntry = computed(() => this.formData().dateOfEntry ?? DEFAULT_DATE);
  protected dateOfExit = computed(() => this.formData().dateOfExit ?? DEFAULT_DATE);
  protected membershipCategory = computed(() => getItemLabel(this.membershipCategories(), this.formData().membershipCategory));
  protected orgFunction = computed(() => this.formData().orgFunction ?? '');
  protected order = computed(() => this.formData().order ?? 0);
  protected relLog = computed(() => this.formData().relLog ?? '');
  protected relIsLast = computed(() => this.formData().relIsLast ?? true);
  protected price = computed(() => this.formData().price ?? 0);
  protected currency = computed(() => this.formData().currency ?? DEFAULT_CURRENCY);
  protected periodicity = computed(() => this.formData().periodicity ?? 'yearly');
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.formData().notes ?? DEFAULT_NOTES);
  protected membershipState = computed(() => this.formData().membershipCategory ?? DEFAULT_MSTATE);
  protected i18nBase = computed(() => this.membershipCategories().i18nBase);
  protected name = computed(() => this.membershipCategories().name);  
  
  // passing constants to template
  protected bexioMask = BexioIdMask;
  protected endFutureDate = END_FUTURE_DATE_STR;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: MembershipFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('MembershipForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('MembershipForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
  protected isTagsVisible(): boolean {
    if (!this.isReadOnly()) return true;
    if (!isVisibleToUser(this.priv().showTags, this.currentUser())) return false;
    return (this.tags() && this.tags().length > 0) ? true : false;
  }
    protected isNotesVisible(): boolean {
    if (!this.isReadOnly()) return true;
    if (!isVisibleToUser(this.priv().showNotes, this.currentUser())) return false;
    return (this.notes() && this.notes().length > 0) ? true : false;
  }
}

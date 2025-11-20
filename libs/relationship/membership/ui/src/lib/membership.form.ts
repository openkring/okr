import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask } from '@bk2/shared-config';
import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_KEY, DEFAULT_MSTATE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORG_TYPE, DEFAULT_TAGS, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, PrivacySettings, RoleName, UserModel } from '@bk2/shared-models';
import { ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, getItemLabel, hasRole, isVisibleToUser } from '@bk2/shared-util-core';

import { MembershipFormModel, membershipFormModelShape, membershipFormValidations } from '@bk2/relationship-membership-util';

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
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">
  
      <ion-card>
        <ion-card-content class="ion-no-padding">
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

              @if(hasRole('memberAdmin')) {
              <ion-col size="12" size-md="6">
                <bk-text-input name="memberNickName" [value]="memberNickName()" [maxLength]=20 [readOnly]="readOnly()" (changed)="onChange('memberNickName', $event)" />                                        
              </ion-col>
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(isTagsVisible()) {
        <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onChange('tags', $event)" />
      }
      
      @if(isNotesVisible()) {
        <bk-notes [value]="notes()" [readOnly]="isReadOnly()" (changed)="onChange('notes', $event)" />
      }
    </form>
  `
})
export class MembershipFormComponent {
  public vm = model.required<MembershipFormModel>();
  public currentUser = input<UserModel | undefined>();
  public membershipCategories = input.required<CategoryListModel>();
  public allTags = input.required<string>();
  public priv = input.required<PrivacySettings>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected memberName1 = computed(() => this.vm().memberName1 ?? DEFAULT_NAME); 
  protected memberName2 = computed(() => this.vm().memberName2 ?? DEFAULT_NAME); 
  protected memberModelType = computed(() => this.vm().memberModelType ?? 'person');
  protected memberGender = computed(() => this.vm().memberType ?? DEFAULT_GENDER);
  protected memberOrgType = computed(() => this.vm().memberType ?? DEFAULT_ORG_TYPE);
  protected memberNickName = computed(() => this.vm().memberNickName ?? DEFAULT_NAME);
  protected memberAbbreviation = computed(() => this.vm().memberAbbreviation ?? '');
  protected memberDateOfBirth = computed(() => this.vm().memberDateOfBirth ?? DEFAULT_DATE);
  protected memberZipCode = computed(() => this.vm().memberZipCode ?? '');
  protected memberBexioId = computed(() => this.vm().memberBexioId ?? '');
  protected orgKey = computed(() => this.vm().orgKey ?? DEFAULT_KEY);
  protected memberId = computed(() => this.vm().memberId ?? DEFAULT_ID);
  protected dateOfEntry = computed(() => this.vm().dateOfEntry ?? DEFAULT_DATE);
  protected dateOfExit = computed(() => this.vm().dateOfExit ?? DEFAULT_DATE);
  protected membershipCategory = computed(() => getItemLabel(this.membershipCategories(), this.vm().membershipCategory));
  protected orgFunction = computed(() => this.vm().orgFunction ?? '');
  protected order = computed(() => this.vm().order ?? 0);
  protected relLog = computed(() => this.vm().relLog ?? '');
  protected relIsLast = computed(() => this.vm().relIsLast ?? true);
  protected price = computed(() => this.vm().price ?? 0);
  protected currency = computed(() => this.vm().currency ?? DEFAULT_CURRENCY);
  protected periodicity = computed(() => this.vm().periodicity ?? 'yearly');
  protected tags = computed(() => this.vm().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.vm().notes ?? DEFAULT_NOTES);
  protected membershipState = computed(() => this.vm().membershipCategory ?? DEFAULT_MSTATE);
  protected i18nBase = computed(() => this.membershipCategories().i18nBase);
  protected name = computed(() => this.membershipCategories().name);
  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = membershipFormValidations;
  protected readonly shape = membershipFormModelShape;
  private readonly validationResult = computed(() => membershipFormValidations(this.vm()));
  
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

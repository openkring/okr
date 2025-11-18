import { Component, computed, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask, ChSsnMask } from '@bk2/shared-config';
import { CategoryListModel, PrivacyAccessor, PrivacySettings, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, isVisibleToUser } from '@bk2/shared-util-core';
import { PersonFormModel, personFormModelShape, personFormValidations } from '@bk2/subject-person-util';
import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';

@Component({
  selector: 'bk-person-form',
  standalone: true,
  imports: [
    vestForms,
    FormsModule,
    TextInputComponent, DateInputComponent, CategorySelectComponent, ChipsComponent, NotesInputComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
  `],
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
              <ion-row> 
                <ion-col size="12" size-md="6">
                  <bk-text-input name="firstName" [value]="firstName()" autocomplete="given-name" [autofocus]="true" [maxLength]=30 [readOnly]="isReadOnly()" (changed)="onChange('firstName', $event)" />                                        
                </ion-col>

                <ion-col size="12" size-md="6">
                  <bk-text-input name="lastName" [value]="lastName()" autocomplete="family-name" [maxLength]=30 [readOnly]="isReadOnly()" (changed)="onChange('lastName', $event)" />                                        
                </ion-col>
              </ion-row>

                <!-- tbd: these role checks are currently only checking against the default
                they need to be extended to consider the settings of this person's user -->
                @if(isVisibleToUser(priv().showDateOfBirth) || isVisibleToUser(priv().showDateOfDeath)) {
                  <ion-row>
                    @if(isVisibleToUser(priv().showDateOfBirth)) {
                      <ion-col size="12" size-md="6"> 
                        <bk-date-input name="dateOfBirth" [storeDate]="dateOfBirth()" autocomplete="bday" [showHelper]=false [showDateSelect]="true" [readOnly]="isReadOnly()" (changed)="onChange('dateOfBirth', $event)" />
                      </ion-col>
                    }

                    @if(isDeathDateVisible()) {
                      <ion-col size="12" size-md="6">
                        <bk-date-input name="dateOfDeath"  [storeDate]="dateOfDeath()" [readOnly]="isReadOnly()" (changed)="onChange('dateOfDeath', $event)" />
                      </ion-col>
                    }
                  </ion-row>
                }

              <ion-row>
                @if(isVisibleToUser(priv().showGender)) {
                  <ion-col size="12" size-md="6">
                    <bk-cat-select [category]="genders()!" [selectedItemName]="gender()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onChange('gender', $event)" />
                  </ion-col>
                }
        
                @if(isVisibleToUser(priv().showTaxId)) {
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="ssnId" [value]="ssnId()" [maxLength]=16 [mask]="ssnMask" [showHelper]=true [copyable]=true [readOnly]="isReadOnly()" (changed)="onChange('ssnId', $event)" />                                        
                  </ion-col>
                }
                @if(isVisibleToUser(priv().showBexioId)) {
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="bexioId" [value]="bexioId()" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onChange('bexioId', $event)" />                                        
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
export class PersonFormComponent {  
  public vm = model.required<PersonFormModel>();
  public currentUser = input<UserModel | undefined>();
  public allTags = input.required<string>();
  public priv = input.required<PrivacySettings>();
  public genders = input.required<CategoryListModel>();
  public readonly readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  protected firstName = computed(() => this.vm().firstName ?? DEFAULT_NAME);
  protected lastName = computed(() => this.vm().lastName ?? DEFAULT_NAME);
  protected dateOfBirth = computed(() => this.vm().dateOfBirth ?? DEFAULT_DATE);
  protected dateOfDeath = computed(() => this.vm().dateOfDeath ?? DEFAULT_DATE);
  protected gender = computed(() => this.vm().gender ?? DEFAULT_GENDER);
  protected ssnId = computed(() => this.vm().ssnId ?? DEFAULT_ID);
  protected bexioId = computed(() => this.vm().bexioId ?? DEFAULT_ID);
  protected tags = computed(() => this.vm().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.vm().notes ?? DEFAULT_NOTES);

  protected readonly suite = personFormValidations;
  protected readonly shape = personFormModelShape;
  private readonly validationResult = computed(() => personFormValidations(this.vm()));
  protected lastNameErrors = computed(() => this.validationResult().getErrors('lastName'));

  protected bexioMask = BexioIdMask;
  protected ssnMask = ChSsnMask;

  protected onValueChange(value: PersonFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('PersonForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected isVisibleToUser(privacyAccessor: PrivacyAccessor): boolean {
    return isVisibleToUser(privacyAccessor, this.currentUser());
  }

  protected isDeathDateVisible(): boolean {
    if (!this.isReadOnly()) return true;
    if (!isVisibleToUser(this.priv().showDateOfDeath, this.currentUser())) return false;
    return this.dateOfDeath().length > 0 ? true : false;
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

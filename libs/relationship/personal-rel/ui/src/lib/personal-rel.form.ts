import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AvatarPipe } from '@bk2/avatar-ui';
import { PersonalRelFormModel, personalRelFormModelShape, personalRelFormValidations } from '@bk2/relationship-personal-rel-util';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { FullNamePipe } from '@bk2/shared-pipes';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERSONAL_REL, DEFAULT_TAGS } from '@bk2/shared-constants';

@Component({
  selector: 'bk-personal-rel-form',
  standalone: true,
  imports: [
    vestForms,
    AvatarPipe, AsyncPipe, FullNamePipe, TranslatePipe,
    DateInputComponent, ChipsComponent, NotesInputComponent, CategorySelectComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonAvatar, IonImg, IonLabel, IonButton,
    TextInputComponent
  ],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">
  
    <ion-card>
      <ion-card-header>
        <ion-card-title>Personen</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="9">
              <ion-item lines="none" (click)="showPerson(subjectKey())">
                <ion-avatar slot="start">
                  <ion-img src="{{ 'person.' + subjectKey() | avatar | async }}" alt="Avatar of first person" />
                </ion-avatar>
                <ion-label>{{ subjectFirstName() | fullName:subjectLastName() }}</ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3">
              <ion-item lines="none">
                <ion-button slot="start" fill="clear" (click)="selectPerson.emit(true)">{{ '@general.operation.select.label' | translate | async }}</ion-button>
              </ion-item>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6"> 
              <bk-cat-select [category]="types()!" selectedItemName="type()" [withAll]="false" [readOnly]="readOnly()" (changed)="onChange('type', $event)" />
            </ion-col>
            @if(type() === 'custom') {
              <ion-col size="12" size-md="6">
                  <bk-text-input name="label" [value]="label()" [readOnly]="readOnly()" (changed)="onChange('label', $event)" />
              </ion-col>
            }
          </ion-row>
          <ion-row>
            <ion-col size="9">
              <ion-item lines="none" (click)="showPerson(objectKey())">
                <ion-avatar slot="start">
                <ion-img src="{{ 'person.' + objectKey() | avatar | async }}" alt="Avatar of second person" />
                </ion-avatar>
                <ion-label>{{ objectFirstName() | fullName:objectLastName() }}</ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3">
              <ion-item lines="none">
              <ion-button slot="start" fill="clear" (click)="selectPerson.emit(false)">{{ '@general.operation.select.label' | translate | async }}</ion-button>
              </ion-item>
            </ion-col>
          </ion-row>        
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-header>
        <ion-card-title>Gültigkeit</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-date-input name="validFrom" [storeDate]="validFrom()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('validFrom', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-date-input name="validTo" [storeDate]="validTo()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('validTo', $event)" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />
    }

    @if(hasRole('admin')) {
      <bk-notes [value]="notes()" [readOnly]="readOnly()" (changed)="onChange('notes', $event)" />
    }
  </form>
  `
})
export class PersonalRelFormComponent {
  private readonly router = inject(Router);
  private readonly modalController = inject(ModalController);

  public selectPerson = output<boolean>();

  public vm = model.required<PersonalRelFormModel>();
  public currentUser = input<UserModel | undefined>();
  public types = input.required<CategoryListModel>();
  public allTags = input.required<string>();
  public readOnly = input(true);

  protected subjectKey = computed(() => this.vm().subjectKey ?? DEFAULT_KEY);
  protected subjectFirstName = computed(() => this.vm().subjectFirstName ?? DEFAULT_NAME);
  protected subjectLastName = computed(() => this.vm().subjectLastName ?? DEFAULT_NAME);
  protected subjectGender = computed(() => this.vm().subjectGender ?? DEFAULT_GENDER);

  protected objectKey = computed(() => this.vm().objectKey ?? DEFAULT_KEY);
  protected objectFirstName = computed(() => this.vm().objectFirstName ?? DEFAULT_NAME);
  protected objectLastName = computed(() => this.vm().objectLastName ?? DEFAULT_NAME);
  protected objectGender = computed(() => this.vm().objectGender ?? DEFAULT_GENDER);

  protected type = computed(() => this.vm().type ?? DEFAULT_PERSONAL_REL);
  protected label = computed(() => this.vm().label ?? DEFAULT_LABEL);
  protected validFrom = computed(() => this.vm().validFrom ?? DEFAULT_DATE);
  protected validTo = computed(() => this.vm().validTo ?? DEFAULT_DATE);
  protected tags = computed(() => this.vm().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.vm().notes ?? DEFAULT_NOTES
);

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  protected readonly suite = personalRelFormValidations;
  protected readonly shape = personalRelFormModelShape;
  private readonly validationResult = computed(() => personalRelFormValidations(this.vm()));

  protected onValueChange(value: PersonalRelFormModel): void {
    this.vm.update((_vm) => ({ ..._vm, ...value }));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('PersonalRelForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async showPerson(personKey: string): Promise<void> {
    if (this.modalController) this.modalController.dismiss(null, 'cancel');
    await this.router.navigateByUrl(`/person/${personKey}`);
  }
}

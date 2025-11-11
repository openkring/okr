import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { FullNamePipe } from '@bk2/shared-pipes';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { WorkrelFormModel, workrelFormModelShape, WorkrelNewFormModel, workrelNewFormValidations } from '@bk2/relationship-workrel-util';
import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORDER, DEFAULT_PRIORITY, DEFAULT_TAGS, DEFAULT_WORKREL_STATE, DEFAULT_WORKREL_TYPE } from '@bk2/shared-constants';

@Component({
  selector: 'bk-workrel-new-form',
  standalone: true,
  imports: [
    vestForms,
    AvatarPipe, AsyncPipe, FullNamePipe, TranslatePipe,
    DateInputComponent, ChipsComponent, NotesInputComponent, CategorySelectComponent, TextInputComponent, NumberInputComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonAvatar, IonImg, IonLabel, IonButton
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
              <ion-item lines="none">
                <ion-avatar slot="start">
                  <ion-img src="{{ 'person.' + subjectKey() | avatar | async }}" alt="Avatar of person" />
                </ion-avatar>
                <ion-label>{{ subjectName1() | fullName:subjectName2() }}</ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3">
              <ion-item lines="none">
                <ion-button slot="start" fill="clear" (click)="selectPerson.emit()">{{ '@general.operation.select.label' | translate | async }}</ion-button>
              </ion-item>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6"> 
              <bk-cat-select [category]="types()!" selectedItemName="type()" [withAll]="false" (changed)="onChange('type', $event)" />
            </ion-col>
            @if(type() === 'custom') {
              <ion-col size="12" size-md="6">
                  <bk-text-input name="label" [value]="label()" (changed)="onChange('label', $event)" />
              </ion-col>
            }
          </ion-row>
          <ion-row>
            <ion-col size="9">
              <ion-item lines="none">
                <ion-avatar slot="start">
                <ion-img src="{{ 'org.' + objectKey() | avatar | async }}" alt="Logo of organization" />
                </ion-avatar>
                <ion-label>{{ objectName() }}</ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3">
              <ion-item lines="none">
              <ion-button slot="start" fill="clear" (click)="selectOrg.emit()">{{ '@general.operation.select.label' | translate | async }}</ion-button>
              </ion-item>
            </ion-col>
          </ion-row>        
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-header>
        <ion-card-title>Arbeitsbeziehung</ion-card-title>
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
            <ion-col size="12" size-md="6">
              <bk-number-input name="order" [value]="order()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('order', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="states()!" selectedItemName="state()" [withAll]="false" (changed)="onChange('state', $event)" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-header>
        <ion-card-title>Kompensation</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
            <bk-number-input name="price" [value]="price()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('price', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
            <bk-text-input name="currency" [value]="currency()" (changed)="onChange('currency', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="periodicities()!" selectedItemName="periodicity()" [withAll]="false" (changed)="onChange('periodicity', $event)" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
      
    @if(hasRole('privileged')) {
          <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />
    }

    @if(hasRole('admin')) {
          <bk-notes [value]="notes()" (changed)="onChange('notes', $event)" />
    }
  </form>
  `
})
export class WorkrelNewFormComponent {
  public vm = model.required<WorkrelNewFormModel>();
  public currentUser = input<UserModel | undefined>();
  public allTags = input.required<string>();
  public readonly types = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly periodicities = input.required<CategoryListModel>();

  public selectPerson = output<void>();
  public selectOrg = output<void>();

  public readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));
  protected subjectKey = computed(() => this.vm().subjectKey ?? DEFAULT_KEY);
  protected subjectName1 = computed(() => this.vm().subjectName1 ?? DEFAULT_NAME);
  protected subjectName2 = computed(() => this.vm().subjectName2 ?? DEFAULT_NAME);
  protected subjectType = computed(() => this.vm().subjectType ?? DEFAULT_GENDER);

  protected objectKey = computed(() => this.vm().objectKey ?? DEFAULT_KEY);
  protected objectName = computed(() => this.vm().objectName ?? DEFAULT_NAME);
  protected objectType = computed(() => this.vm().objectType ?? DEFAULT_GENDER);

  protected type = computed(() => this.vm().type ?? DEFAULT_WORKREL_TYPE);
  protected label = computed(() => this.vm().label ?? DEFAULT_LABEL);
  protected validFrom = computed(() => this.vm().validFrom ?? DEFAULT_DATE);
  protected validTo = computed(() => this.vm().validTo ?? DEFAULT_DATE);
  protected tags = computed(() => this.vm().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.vm().notes ?? DEFAULT_NOTES);
  protected price = computed(() => this.vm().price ?? 6000);
  protected currency = computed(() => this.vm().currency ?? DEFAULT_CURRENCY);
  protected periodicity = computed(() => this.vm().periodicity ?? 'monthly');
  protected order = computed(() => this.vm().order ?? DEFAULT_ORDER);
  protected state = computed(() => this.vm().state ?? DEFAULT_WORKREL_STATE);

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  protected readonly suite = workrelNewFormValidations;
  protected readonly shape = workrelFormModelShape;
  private readonly validationResult = computed(() => workrelNewFormValidations(this.vm()));

  protected onValueChange(value: WorkrelFormModel): void {
    this.vm.update((_vm) => ({ ..._vm, ...value }));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('WorkrelForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

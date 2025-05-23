import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CategoryComponent, ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared/ui';
import { GenderType, ModelType, WorkingRelType, UserModel, OrgType, WorkingRelState, Periodicity } from '@bk2/shared/models';
import { RoleName } from '@bk2/shared/config';
import { debugFormErrors, hasRole } from '@bk2/shared/util';

import { AvatarPipe, FullNamePipe } from '@bk2/shared/pipes';
import { AsyncPipe } from '@angular/common';
import { TranslatePipe } from '@bk2/shared/i18n';
import { WorkingRelFormModel, workingRelFormModelShape, workingRelFormValidations } from '@bk2/working-rel/util';
import { PeriodicityTypes, WorkingRelStates, WorkingRelTypes } from '@bk2/shared/categories';
import { WorkingRelService } from '@bk2/working-rel/data';

@Component({
  selector: 'bk-working-rel-form',
  imports: [
    vestForms,
    AvatarPipe, AsyncPipe, FullNamePipe, TranslatePipe,
    DateInputComponent, ChipsComponent, NotesInputComponent, CategoryComponent, NumberInputComponent,
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
        <ion-card-title>Beschäftigung</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="9">
              <ion-item lines="none">
                <ion-avatar slot="start">
                  <ion-img src="{{ modelType.Person + '.' + subjectKey() | avatar | async }}" alt="Avatar of person" />
                </ion-avatar>
                <ion-label>{{ subjectName1() | fullName:subjectName2() }}</ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3">
              <ion-item lines="none">
                <ion-button slot="start" fill="clear" (click)="selectPerson()">{{ '@general.operation.select.label' | translate | async }}</ion-button>
              </ion-item>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6"> 
              <bk-cat name="type" [value]="type()" [categories]="workingRelTypes" (changed)="onChange('type', $event)" />
            </ion-col>
            @if(type() === workingRelType.Custom) {
              <ion-col size="12" size-md="6">
                  <bk-text-input name="label" [value]="label()" (changed)="onChange('label', $event)" />
              </ion-col>
            }
          </ion-row>
          <ion-row>
            <ion-col size="9">
              <ion-item lines="none">
                <ion-avatar slot="start">
                <ion-img src="{{ modelType.Org + '.' + objectKey() | avatar | async }}" alt="Logo of organization" />
                </ion-avatar>
                <ion-label>{{ objectName() }}</ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3">
              <ion-item lines="none">
              <ion-button slot="start" fill="clear" (click)="selectOrg()">{{ '@general.operation.select.label' | translate | async }}</ion-button>
              </ion-item>
            </ion-col>
          </ion-row>        
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-header>
        <ion-card-title>Gültigkeit und Status</ion-card-title>
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
              <bk-number-input name="priority" [value]="priority()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('priority', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="state" [value]="state()" [categories]="workingRelStates" (changed)="onChange('state', $event)" />
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
            <bk-text-input name="currency" [value]="currency()" [maxLength]="3" (changed)="onChange('currency', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="periodicity" [value]="periodicity()" [categories]="periodicities" (changed)="onChange('periodicity', $event)" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="workingRelTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />
    }

    @if(hasRole('admin')) {
      <bk-notes [value]="notes()" (changed)="onChange('notes', $event)" />
    }
  </form>
  `
})
export class WorkingRelFormComponent {
  private readonly workingRelService = inject(WorkingRelService);

  public vm = model.required<WorkingRelFormModel>();
  public currentUser = input<UserModel | undefined>();
  public workingRelTags = input.required<string>();

  public readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));
  protected subjectKey = computed(() => this.vm().subjectKey ?? '');
  protected subjectName1 = computed(() => this.vm().subjectName1 ?? ''); 
  protected subjectName2 = computed(() => this.vm().subjectName2 ?? ''); 
  protected subjectType = computed(() => this.vm().subjectType ?? GenderType.Male);

  protected objectKey = computed(() => this.vm().objectKey ?? '');
  protected objectName = computed(() => this.vm().objectName ?? ''); 
  protected objectType = computed(() => this.vm().objectType ?? OrgType.LegalEntity);

  protected type = computed(() => this.vm().type ?? WorkingRelType.Employee);
  protected label = computed(() => this.vm().label ?? '');
  protected validFrom = computed(() => this.vm().validFrom ?? '');
  protected validTo = computed(() => this.vm().validTo ?? '');
  protected tags = computed(() => this.vm().tags ?? '');
  protected notes = computed(() => this.vm().notes ?? '');
  protected price = computed(() => this.vm().price ?? 0);
  protected currency = computed(() => this.vm().currency ?? 'CHF');
  protected periodicity = computed(() => this.vm().periodicity ?? Periodicity.Monthly);
  protected priority = computed(() => this.vm().priority ?? 0);
  protected state = computed(() => this.vm().state ?? WorkingRelState.Active);

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = workingRelFormValidations;
  protected readonly shape = workingRelFormModelShape;
  private readonly validationResult = computed(() => workingRelFormValidations(this.vm()));
  
  protected readonly modelType = ModelType;
  protected readonly workingRelTypes = WorkingRelTypes;
  protected readonly workingRelType = WorkingRelType;
  protected readonly workingRelStates = WorkingRelStates;
  protected readonly periodicities = PeriodicityTypes;

  protected onValueChange(value: WorkingRelFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('WorkingRelForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async selectPerson(): Promise<void> {
    const _person = await this.workingRelService.selectPerson();
    if (!_person) return;
    this.vm.update((_vm) => ({
      ..._vm, 
      subjectKey: _person.bkey, 
      subjectName1: _person.firstName,
      subjectName2: _person.lastName,
      subjectType: _person.gender,
    }));
    debugFormErrors('WorkingRel (person)', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected async selectOrg(): Promise<void> {
    const _org = await this.workingRelService.selectOrg();
    if (!_org) return;
    this.vm.update((_vm) => ({
      ..._vm, 
      objectKey: _org.bkey, 
      objectName: _org.name,
      objectType: _org.type,
    }));
    debugFormErrors('WorkingRel (org)', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }
}

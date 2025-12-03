import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CaseInsensitiveWordMask } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { ButtonCopyComponent, CategorySelectComponent, ChipsComponent, ErrorNoteComponent, NotesInputComponent, StringsComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { PAGE_FORM_SHAPE, PageFormModel, pageFormValidations } from '@bk2/cms-page-util';
import { DEFAULT_CONTENT_STATE, DEFAULT_NOTES, DEFAULT_PAGE_TYPE, DEFAULT_TAGS } from '@bk2/shared-constants';


@Component({
  selector: 'bk-page-form',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    vestForms, FormsModule,
    ChipsComponent, NotesInputComponent, TextInputComponent, StringsComponent, ButtonCopyComponent, 
    ErrorNoteComponent, CategorySelectComponent,
    IonLabel, IonIcon, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonGrid, IonRow, IonCol
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <form scVestForm
      [formShape]="shape"
      [formValue]="formData()"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (formValueChange)="onFormChange($event)">
  
        <!---------------------------------------------------
        Sections 
        --------------------------------------------------->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@content.page.forms.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                @if(bkey(); as bkey) {
                  <ion-item lines="none">  
                    <ion-icon src="{{'login_enter' | svgIcon }}" (click)="gotoPage(bkey)" slot="start"/>
                    <ion-label>Page Key: {{ bkey }}</ion-label>
                    <bk-button-copy [value]="bkey" />
                  </ion-item>
                }
              </ion-col>
              <ion-col size="12">
                <bk-text-input name="name" [value]="name()" [readOnly]="isReadOnly()" (changed)="onFieldChange('name', $event)" />
                <bk-error-note [errors]="nameErrors()" />
              </ion-col>
              <ion-col size="12">
                <bk-text-input name="title" [value]="title()" [readOnly]="isReadOnly()" (changed)="onFieldChange('title', $event)" />
                <bk-error-note [errors]="titleErrors()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="types()!" [selectedItemName]="type()" [readOnly]="isReadOnly()" [withAll]="false" (changed)="onFieldChange('type', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="states()!" [selectedItemName]="state()" [readOnly]="isReadOnly()" [withAll]="false" (changed)="onFieldChange('state', $event)" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- sections -->
      <bk-strings (changed)="onFieldChange('sections', $event)"
          [strings]="sections()"
          [mask]="mask"
          [maxLength]="40"
          [readOnly]="isReadOnly()"
          title="@content.page.forms.section.label"
          addLabel="@content.section.operation.add.label" />
          
      @if(hasRole('privileged')) {
        <bk-chips chipName="tag" [storedChips]="tags()" [readOnly]="isReadOnly()" [allChips]="allTags()" (changed)="onFieldChange('tags', $event)" />
      }
      @if(hasRole('admin')) {
        <bk-notes [value]="notes()" [readOnly]="isReadOnly()" (changed)="onFieldChange('notes', $event)" />
      }
    </form>
  `
})
export class PageFormComponent {
  private readonly router = inject(Router);
  private readonly modalController = inject(ModalController);

  // inputs
  public readonly formData = model.required<PageFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly allTags = input.required<string>();
  public readonly types = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = pageFormValidations;
  protected readonly shape = PAGE_FORM_SHAPE;
  private readonly validationResult = computed(() => pageFormValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected titleErrors = computed(() => this.validationResult().getErrors('title'));

  // fields
  protected bkey = computed(() => this.formData().bkey ?? '');
  protected sections = linkedSignal(() => this.formData().sections ?? []);
  protected name = computed(() => this.formData().name ?? '');
  protected title = computed(() => this.formData().title ?? '');
  protected type = computed(() => this.formData().type ?? DEFAULT_PAGE_TYPE);
  protected state = computed(() => this.formData().state ?? DEFAULT_CONTENT_STATE);
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.formData().notes ?? DEFAULT_NOTES);
  
  // passing constants to template
  protected mask = CaseInsensitiveWordMask;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  /************************************** actions *********************************************** */
  protected gotoPage(pageKey?: string): void {
    if (!pageKey)  return;
    this.modalController.dismiss(null, 'cancel');
    this.router.navigateByUrl(`/private/${pageKey}`);
  }

  protected onFormChange(value: PageFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('PageForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, $event: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('PageForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
